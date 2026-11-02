$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Invoke-SetupHelper {
    param([string]$ScriptPath)

    $ResultFile = Join-Path $env:TEMP ('wemaps-sdk-' + [guid]::NewGuid().ToString('N') + '.txt')
    try {
        & (Join-Path $PSHOME 'powershell.exe') -NoLogo -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -ResultFile $ResultFile | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Setup helper failed: $([IO.Path]::GetFileName($ScriptPath)) (exit code $LASTEXITCODE)."
        }
        if (-not (Test-Path -LiteralPath $ResultFile -PathType Leaf)) {
            throw "Setup helper did not return a path: $([IO.Path]::GetFileName($ScriptPath))."
        }
        return [IO.File]::ReadAllText($ResultFile, [System.Text.Encoding]::UTF8).Trim()
    } finally {
        if (Test-Path -LiteralPath $ResultFile) {
            Remove-Item -LiteralPath $ResultFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function Set-ProjectSdkDirectory {
    param([string]$SdkRoot)

    # Android Gradle Plugin reads sdk.dir from local.properties before relying
    # on ANDROID_HOME/ANDROID_SDK_ROOT. Keep that file aligned with the SDK
    # resolved by this builder, especially when a user-local fallback is used.
    $LocalPropertiesPath = Join-Path $ProjectRoot 'local.properties'
    $ExistingLines = @()
    if (Test-Path -LiteralPath $LocalPropertiesPath -PathType Leaf) {
        $ExistingLines = @(Get-Content -LiteralPath $LocalPropertiesPath -ErrorAction Stop)
    }

    $EscapedSdkRoot = $SdkRoot.Replace('\', '\\')
    $NewLines = New-Object 'System.Collections.Generic.List[string]'
    $SdkLineWritten = $false
    foreach ($Line in $ExistingLines) {
        if ([string]$Line -match '^\s*sdk\.dir\s*=') {
            if (-not $SdkLineWritten) {
                $NewLines.Add("sdk.dir=$EscapedSdkRoot")
                $SdkLineWritten = $true
            }
        } else {
            $NewLines.Add([string]$Line)
        }
    }
    if (-not $SdkLineWritten) {
        $NewLines.Add("sdk.dir=$EscapedSdkRoot")
    }

    [IO.File]::WriteAllLines(
        $LocalPropertiesPath,
        $NewLines.ToArray(),
        [System.Text.UTF8Encoding]::new($false)
    )
}

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $ProjectRoot

try {
    Write-Host ''
    Write-Host '========== Wemaps Android APK builder =========='
    Write-Host "Project: $ProjectRoot"
    Write-Host ''

    $JavaResolver = Join-Path $PSScriptRoot 'ensure-java.ps1'
    $ResolvedJava = Invoke-SetupHelper -ScriptPath $JavaResolver
    if (-not (Test-Path -LiteralPath (Join-Path $ResolvedJava 'bin\java.exe') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $ResolvedJava 'bin\javac.exe') -PathType Leaf)) {
        throw "JDK resolver returned an invalid JDK path: $ResolvedJava"
    }
    $env:JAVA_HOME = $ResolvedJava
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
    Write-Host "Using JDK: $ResolvedJava"

    $SdkResolver = Join-Path $PSScriptRoot 'ensure-android-sdk.ps1'
    $ResolvedSdk = Invoke-SetupHelper -ScriptPath $SdkResolver

    $RequiredPlatform = Join-Path $ResolvedSdk 'platforms\android-37.1\android.jar'
    $RequiredAapt2 = Join-Path $ResolvedSdk 'build-tools\36.0.0\aapt2.exe'
    $RequiredZipalign = Join-Path $ResolvedSdk 'build-tools\36.0.0\zipalign.exe'
    foreach ($RequiredFile in @($RequiredPlatform, $RequiredAapt2, $RequiredZipalign)) {
        if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
            throw "Required Android SDK file is missing: $RequiredFile"
        }
    }

    $env:ANDROID_SDK_ROOT = $ResolvedSdk
    $env:ANDROID_HOME = $ResolvedSdk
    Set-ProjectSdkDirectory -SdkRoot $ResolvedSdk
    Write-Host "Using Android SDK: $ResolvedSdk"
    Write-Host 'Updated project local.properties to use the resolved SDK.'
    Write-Host ''

    $GradleWrapper = Join-Path $ProjectRoot 'gradlew.bat'
    if (-not (Test-Path -LiteralPath $GradleWrapper -PathType Leaf)) {
        throw "Gradle launcher not found: $GradleWrapper"
    }

    $BuildLog = Join-Path $ProjectRoot 'build-windows.log'
    Write-Host "Build log: $BuildLog"

    function Invoke-LoggedGradle {
        param(
            [string[]]$GradleArguments,
            [string]$LogPath
        )

        $PreviousPreference = $ErrorActionPreference
        try {
            # The Windows Gradle launcher is a .bat file; preserve diagnostics from stderr.
            $ErrorActionPreference = 'Continue'
            & $GradleWrapper @GradleArguments 2>&1 |
                Tee-Object -FilePath $LogPath | Out-Host
            return [int]$LASTEXITCODE
        } finally {
            $ErrorActionPreference = $PreviousPreference
        }
    }

    Write-Host 'Building the Wemaps debug APK...'
    $GradleExitCode = Invoke-LoggedGradle -GradleArguments @(
        '--no-daemon',
        '--console=plain',
        '--stacktrace',
        ':app:assembleDebug'
    ) -LogPath $BuildLog

    if ($GradleExitCode -ne 0) {
        $LogText = Get-Content -LiteralPath $BuildLog -Raw -ErrorAction SilentlyContinue
        $RetryPattern = '(?i)(UnknownHostException|Unknown host|Could not resolve host|Could not GET|Could not HEAD|Connection timed out|Read timed out|Connection reset|Connection refused|TLS handshake|PKIX path building failed|503 Service Unavailable|502 Bad Gateway|429 Too Many Requests|Temporary failure in name resolution|Network is unreachable|No route to host)'
        if ($LogText -match $RetryPattern) {
            $RetryLog = Join-Path $ProjectRoot 'build-windows-retry.log'
            Write-Host ''
            Write-Host 'A network/dependency-server error was detected. Retrying once with --refresh-dependencies...'
            Write-Host "Retry log: $RetryLog"
            $GradleExitCode = Invoke-LoggedGradle -GradleArguments @(
                '--no-daemon',
                '--console=plain',
                '--stacktrace',
                '--refresh-dependencies',
                ':app:assembleDebug'
            ) -LogPath $RetryLog

            if ($GradleExitCode -ne 0) {
                throw "Gradle retry also failed (exit code $GradleExitCode). Logs: $BuildLog and $RetryLog"
            }
            $BuildLog = $RetryLog
        } else {
            throw "Gradle failed with exit code $GradleExitCode. Detailed log: $BuildLog"
        }
    }

    $ApkSource = Join-Path $ProjectRoot 'app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path -LiteralPath $ApkSource -PathType Leaf)) {
        throw "Gradle reported success, but the APK was not found at: $ApkSource"
    }

    $ApkDestination = Join-Path $ProjectRoot 'Wemaps-debug.apk'
    Copy-Item -LiteralPath $ApkSource -Destination $ApkDestination -Force

    Write-Host ''
    Write-Host '============================================================'
    Write-Host '             BUILD COMPLETED SUCCESSFULLY'
    Write-Host '============================================================'
    Write-Host "APK: $ApkDestination"
    Write-Host "Size: $([math]::Round((Get-Item -LiteralPath $ApkDestination).Length / 1MB, 2)) MiB"
    Write-Host "Log: $BuildLog"
    exit 0
} catch {
    Write-Host ''
    Write-Host '============================================================'
    Write-Host '                    BUILD FAILED'
    Write-Host '============================================================'
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host 'See build-windows.log in the project root for Gradle diagnostics, if the build started.'
    exit 1
}
