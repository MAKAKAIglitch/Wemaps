param(
    [Parameter(Mandatory = $true)]
    [string]$ResultFile
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$RequiredPlatform = 'android-37.1'
$RequiredBuildTools = '36.0.0'
$script:SdkRoots = New-Object 'System.Collections.Generic.List[string]'
$script:SeenSdkRoots = @{}

function Add-SdkRoot {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $Expanded = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
    $Expanded = $Expanded.Replace('$USER_HOME$', $env:USERPROFILE).Replace('/', '\')
    if (-not (Test-Path -LiteralPath $Expanded -PathType Container)) { return }

    try {
        $Key = [IO.Path]::GetFullPath($Expanded).TrimEnd('\').ToLowerInvariant()
    } catch {
        $Key = $Expanded.TrimEnd('\').ToLowerInvariant()
    }

    if (-not $script:SeenSdkRoots.ContainsKey($Key)) {
        $script:SeenSdkRoots[$Key] = $true
        $script:SdkRoots.Add($Expanded) | Out-Null
    }
}

function Read-SdkDirFromProperties {
    param([string]$FilePath)

    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { return }
    $Line = Get-Content -LiteralPath $FilePath -ErrorAction SilentlyContinue |
        Where-Object { $_ -match '^\s*sdk\.dir\s*=' } |
        Select-Object -First 1
    if (-not $Line) { return }

    $Value = $Line -replace '^\s*sdk\.dir\s*=\s*', ''
    # local.properties follows Java-properties escaping (for example C\:\\Android\\Sdk).
    $Value = [regex]::Replace($Value, '\\(.)', '$1')
    Add-SdkRoot -Path $Value
}

function Find-SdkManager {
    param([string]$Root)

    $Preferred = Join-Path $Root 'cmdline-tools\latest\bin\sdkmanager.bat'
    if (Test-Path -LiteralPath $Preferred -PathType Leaf) { return $Preferred }

    $ToolsRoot = Join-Path $Root 'cmdline-tools'
    if (Test-Path -LiteralPath $ToolsRoot -PathType Container) {
        $ToolDirs = Get-ChildItem -LiteralPath $ToolsRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
        foreach ($ToolDir in $ToolDirs) {
            $Possible = Join-Path $ToolDir.FullName 'bin\sdkmanager.bat'
            if (Test-Path -LiteralPath $Possible -PathType Leaf) { return $Possible }
        }
    }

    $Legacy = Join-Path $Root 'tools\bin\sdkmanager.bat'
    if (Test-Path -LiteralPath $Legacy -PathType Leaf) { return $Legacy }
    return $null
}

function Test-SdkComplete {
    param([string]$Root)

    $PlatformJar = Join-Path $Root "platforms\$RequiredPlatform\android.jar"
    $BuildToolsRoot = Join-Path $Root "build-tools\$RequiredBuildTools"
    return (
        (Test-Path -LiteralPath $PlatformJar -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $BuildToolsRoot 'aapt2.exe') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $BuildToolsRoot 'zipalign.exe') -PathType Leaf)
    )
}

function Write-SdkResult {
    param([string]$Root)

    [IO.Directory]::CreateDirectory((Split-Path -Parent $ResultFile)) | Out-Null
    [IO.File]::WriteAllText(
        $ResultFile,
        [IO.Path]::GetFullPath($Root),
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Test-SdkInstallWritable {
    param([string]$Root)

    try {
        $Root = [IO.Path]::GetFullPath($Root)
        [IO.Directory]::CreateDirectory($Root) | Out-Null

        $Directories = @(
            $Root,
            (Join-Path $Root 'platforms'),
            (Join-Path $Root "platforms\$RequiredPlatform"),
            (Join-Path $Root 'build-tools'),
            (Join-Path $Root "build-tools\$RequiredBuildTools")
        )

        foreach ($Directory in $Directories) {
            if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { continue }

            $ProbePath = Join-Path $Directory ('.wemaps-write-test-' + [guid]::NewGuid().ToString('N'))
            $Stream = $null
            try {
                $Stream = [IO.File]::Open(
                    $ProbePath,
                    [IO.FileMode]::CreateNew,
                    [IO.FileAccess]::Write,
                    [IO.FileShare]::None
                )
            } finally {
                if ($null -ne $Stream) { $Stream.Dispose() }
                if (Test-Path -LiteralPath $ProbePath -PathType Leaf) {
                    Remove-Item -LiteralPath $ProbePath -Force -ErrorAction SilentlyContinue
                }
            }
        }

        return $true
    } catch {
        return $false
    }
}

function Get-FileSha256 {
    param([string]$FilePath)

    $Algorithm = [System.Security.Cryptography.SHA256]::Create()
    $Stream = $null
    try {
        $Stream = [IO.File]::OpenRead($FilePath)
        return [BitConverter]::ToString($Algorithm.ComputeHash($Stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        if ($null -ne $Stream) { $Stream.Dispose() }
        if ($null -ne $Algorithm) { $Algorithm.Dispose() }
    }
}

Write-Host 'Wemaps: searching for the Android SDK already installed on this computer...'

# Explicit Android SDK environment variables have the highest priority.
Add-SdkRoot -Path $env:ANDROID_SDK_ROOT
Add-SdkRoot -Path $env:ANDROID_HOME
Add-SdkRoot -Path (Join-Path $env:LOCALAPPDATA 'Wemaps\AndroidSdk')

# Read the current project's local.properties.
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Read-SdkDirFromProperties -FilePath (Join-Path $ProjectRoot 'local.properties')

# Standard SDK locations, including the usual Android Studio installation paths.
@(
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
    (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk'),
    (Join-Path $env:ProgramFiles 'Android\Sdk'),
    (Join-Path $env:ProgramFiles 'Android\Android Studio\sdk'),
    (Join-Path $env:USERPROFILE 'Android\Sdk'),
    'C:\Android\Sdk'
) | ForEach-Object { Add-SdkRoot -Path $_ }

# Android Studio stores SDK/JDK configuration in versioned IDE option XML files.
foreach ($ConfigRoot in @(
    (Join-Path $env:APPDATA 'Google'),
    (Join-Path $env:LOCALAPPDATA 'Google')
)) {
    if (-not (Test-Path -LiteralPath $ConfigRoot -PathType Container)) { continue }

    Get-ChildItem -LiteralPath $ConfigRoot -Directory -Filter 'AndroidStudio*' -ErrorAction SilentlyContinue |
        ForEach-Object {
            $OptionsRoot = Join-Path $_.FullName 'options'
            if (-not (Test-Path -LiteralPath $OptionsRoot -PathType Container)) { return }

            Get-ChildItem -LiteralPath $OptionsRoot -Filter '*.xml' -File -ErrorAction SilentlyContinue |
                ForEach-Object {
                    try {
                        [xml]$Document = Get-Content -LiteralPath $_.FullName -Raw
                        foreach ($Attribute in $Document.SelectNodes('//@*')) {
                            $Value = [string]$Attribute.Value
                            if ($Value -match '^(?:[A-Za-z]:[\\/]|\\\\|\$USER_HOME\$|%USERPROFILE%)') {
                                Add-SdkRoot -Path $Value
                            }
                        }
                    } catch {
                        # An unrelated or malformed IDE settings file is not an SDK candidate.
                    }
                }
        }
}

# Reuse SDK paths saved by other Android/IntelliJ projects under common project directories.
$ProjectSearchRoots = @(
    (Join-Path $env:USERPROFILE 'AndroidStudioProjects'),
    (Join-Path $env:USERPROFILE 'IdeaProjects'),
    (Join-Path $env:USERPROFILE 'Projects'),
    (Join-Path $env:USERPROFILE 'source\repos'),
    (Join-Path $env:USERPROFILE 'Documents\AndroidStudioProjects'),
    (Join-Path $env:USERPROFILE 'Documents\GitHub')
)
foreach ($SearchRoot in $ProjectSearchRoots) {
    if (Test-Path -LiteralPath $SearchRoot -PathType Container) {
        Get-ChildItem -LiteralPath $SearchRoot -Filter 'local.properties' -File -Recurse -ErrorAction SilentlyContinue |
            ForEach-Object { Read-SdkDirFromProperties -FilePath $_.FullName }
    }
}

# PATH may contain platform-tools or Android command-line tools rather than the SDK root itself.
foreach ($PathEntry in ($env:PATH -split [regex]::Escape([IO.Path]::PathSeparator))) {
    $Entry = $PathEntry.Trim().Trim('"')
    if ([string]::IsNullOrWhiteSpace($Entry)) { continue }

    if ($Entry -match '(?i)\\platform-tools\\?$') {
        Add-SdkRoot -Path (Split-Path -Parent $Entry)
    } elseif ($Entry -match '(?i)\\cmdline-tools\\[^\\]+\\bin\\?$') {
        $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Entry))
        Add-SdkRoot -Path $Root
    } elseif ($Entry -match '(?i)\\tools\\bin\\?$') {
        Add-SdkRoot -Path (Split-Path -Parent (Split-Path -Parent $Entry))
    }
}

# Legacy SDK Manager registry entries are still present on some Windows installations.
foreach ($RegistryPath in @(
    'HKCU:\Software\Android SDK Tools',
    'HKLM:\SOFTWARE\Android SDK Tools',
    'HKLM:\SOFTWARE\WOW6432Node\Android SDK Tools'
)) {
    if (Test-Path $RegistryPath) {
        $RegistrySettings = Get-ItemProperty -LiteralPath $RegistryPath -ErrorAction SilentlyContinue
        if ($RegistrySettings.Path) { Add-SdkRoot -Path $RegistrySettings.Path }
    }
}

# A complete SDK is reused immediately. No SDK packages are downloaded in this case.
foreach ($Root in $script:SdkRoots) {
    if (Test-SdkComplete -Root $Root) {
        Write-Host "Using existing Android SDK: $Root"
        Write-SdkResult -Root $Root
        exit 0
    }
}

# Keep only paths that actually look like Android SDK roots.
$SdkCandidates = @($script:SdkRoots | Where-Object {
    (Test-Path -LiteralPath (Join-Path $_ 'platforms') -PathType Container) -or
    (Test-Path -LiteralPath (Join-Path $_ 'platform-tools') -PathType Container) -or
    (Test-Path -LiteralPath (Join-Path $_ 'build-tools') -PathType Container) -or
    (Test-Path -LiteralPath (Join-Path $_ 'cmdline-tools') -PathType Container) -or
    (Test-Path -LiteralPath (Join-Path $_ 'tools\bin\sdkmanager.bat') -PathType Leaf)
})

# If no SDK path was discovered, or IDE settings only exposed unrelated folders,
# let the user point to the SDK that Android Studio already uses.
if ($SdkCandidates.Count -eq 0) {
    if ($env:CI -eq 'true') {
        throw 'Android SDK was not found in CI. Set ANDROID_HOME/ANDROID_SDK_ROOT or provide local.properties.'
    }

    Write-Host 'Automatic search did not find an Android SDK root. Select the existing SDK folder.'
    Add-Type -AssemblyName System.Windows.Forms
    $Dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $Dialog.Description = 'Select the existing Android SDK folder (the folder containing platforms, build-tools, or cmdline-tools)'
    $Dialog.ShowNewFolderButton = $false
    try {
        if ($Dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            throw 'Android SDK folder selection was cancelled.'
        }
        $SdkCandidates = @($Dialog.SelectedPath)
    } finally {
        $Dialog.Dispose()
    }
}

# Keep candidates ordered, deduplicated, and limited to actual SDK roots.
$script:SdkRoots.Clear()
$script:SeenSdkRoots = @{}
foreach ($Candidate in $SdkCandidates) {
    Add-SdkRoot -Path $Candidate
}
if ($script:SdkRoots.Count -eq 0) {
    throw 'No existing Android SDK folder was selected or detected.'
}

# Pick an SDK root that already has sdkmanager, so only the missing Wemaps packages need installation.
$SdkRoot = $null
$SdkManager = $null
foreach ($Root in $script:SdkRoots) {
    $Manager = Find-SdkManager -Root $Root
    if ($Manager) {
        $SdkRoot = $Root
        $SdkManager = $Manager
        break
    }
}

if (-not $SdkRoot) {
    # Keep using the first detected SDK root; the official command-line tools can be added there.
    $SdkRoot = $script:SdkRoots[0]
    Write-Host "No sdkmanager was found in the existing SDK at: $SdkRoot"
    Write-Host 'Wemaps needs Android SDK Platform 37.1 and Build-Tools 36.0.0.'
    Write-Host 'The existing SDK will be kept. The official Android command-line tools will be added alongside it.'
    Write-Host 'You will be asked before any download, package installation, or SDK license acceptance.'

    if ($env:CI -eq 'true') {
        throw 'The CI SDK is missing required packages or sdkmanager. Install Platform 37.1 and Build-Tools 36.0.0 in the CI image.'
    }

    $Answer = Read-Host 'Download the official command-line tools and install only the missing Wemaps SDK packages? [Y/N]'
    if ($Answer -notmatch '^(?i)y(es)?$') {
        throw 'Android SDK package installation was declined.'
    }

    $ToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip'
    $ExpectedToolsHash = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    $ZipPath = Join-Path $env:TEMP ('wemaps-android-tools-' + [guid]::NewGuid().ToString('N') + '.zip')
    $ExtractRoot = Join-Path $env:TEMP ('wemaps-android-tools-' + [guid]::NewGuid().ToString('N'))

    try {
        Write-Host 'Downloading official Android command-line tools...'
        Invoke-WebRequest -Uri $ToolsUrl -OutFile $ZipPath -UseBasicParsing
        $ActualHash = Get-FileSha256 -FilePath $ZipPath
        if ($ActualHash -ne $ExpectedToolsHash) {
            throw "Android command-line tools SHA-256 mismatch. Expected $ExpectedToolsHash, got $ActualHash. Archive rejected."
        }

        New-Item -ItemType Directory -Path $ExtractRoot -Force | Out-Null
        Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractRoot -Force
        $ExtractedTools = Join-Path $ExtractRoot 'cmdline-tools'
        if (-not (Test-Path -LiteralPath (Join-Path $ExtractedTools 'bin\sdkmanager.bat') -PathType Leaf)) {
            throw 'The official archive did not contain cmdline-tools\bin\sdkmanager.bat.'
        }

        $ToolsParent = Join-Path $SdkRoot 'cmdline-tools'
        New-Item -ItemType Directory -Path $ToolsParent -Force | Out-Null
        $InstallToolsDir = Join-Path $ToolsParent 'wemaps-bootstrap'
        $Suffix = 1
        while (Test-Path -LiteralPath $InstallToolsDir) {
            $Suffix++
            $InstallToolsDir = Join-Path $ToolsParent "wemaps-bootstrap-$Suffix"
        }
        Move-Item -LiteralPath $ExtractedTools -Destination $InstallToolsDir
        $SdkManager = Join-Path $InstallToolsDir 'bin\sdkmanager.bat'
    } finally {
        if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $ExtractRoot) { Remove-Item -LiteralPath $ExtractRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
} else {
    Write-Host "Found SDK manager: $SdkManager"
    Write-Host "SDK root: $SdkRoot"
}

# Normalize the selected SDK root and verify that sdkmanager can write into the
# SDK and its existing package directories. Keep a protected/shared SDK intact
# by falling back to a user-local Wemaps SDK when those directories are read-only.
$SdkRoot = [IO.Path]::GetFullPath($SdkRoot)
$ManagedSdkRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Wemaps\AndroidSdk'))
if (-not (Test-SdkInstallWritable -Root $SdkRoot)) {
    Write-Host ''
    Write-Host "The existing SDK folder is not writable: $SdkRoot"
    Write-Host 'The existing SDK will be left unchanged. Wemaps will install its required components into a user-local SDK.'
    if (-not (Test-SdkInstallWritable -Root $ManagedSdkRoot)) {
        throw "Neither the existing SDK nor the user-local SDK folder is writable. Check permissions for: $ManagedSdkRoot"
    }
    $SdkRoot = $ManagedSdkRoot
    Add-SdkRoot -Path $SdkRoot
    Write-Host "Using user-local Android SDK: $SdkRoot"
}

Write-Host ''
Write-Host "Wemaps requires Platform $RequiredPlatform and Build-Tools $RequiredBuildTools."
Write-Host 'Any already installed SDK packages will be reused.'
Write-Host 'sdkmanager will ask separately for licenses required by these packages.'
$Consent = Read-Host 'Install the missing packages? [Y/N]'
if ($Consent -notmatch '^(?i)y(es)?$') {
    throw 'Android SDK package installation was declined.'
}

$PreviousPreference = $ErrorActionPreference
try {
    # Native sdkmanager diagnostics can appear on stderr in Windows PowerShell 5.1.
    # Do not pipe automatic "y" answers to --licenses: that command lists every
    # pending SDK repository license, including packages Wemaps does not use.
    # Installing the two requested packages directly makes sdkmanager prompt
    # only for the licenses actually required by those packages.
    $ErrorActionPreference = 'Continue'
    Write-Host "Installing missing SDK packages: platforms;$RequiredPlatform and build-tools;$RequiredBuildTools"
    Write-Host 'Review each license prompt from sdkmanager and answer it individually.'
    $InstallMessages = @()
    & $SdkManager "--sdk_root=$SdkRoot" "platforms;$RequiredPlatform" "build-tools;$RequiredBuildTools" 2>&1 |
        Tee-Object -Variable InstallMessages | Out-Host
    $InstallExitCode = $LASTEXITCODE

    # Some SDK folders pass a basic existence check but still reject package
    # installation. Retry this specific permissions/metadata failure in a
    # private, user-writable SDK instead of requiring an administrator shell.
    $InstallText = $InstallMessages -join [Environment]::NewLine
    if ($InstallExitCode -ne 0 -and
        $InstallText -match '(?i)Failed to read or create install properties file' -and
        $SdkRoot -ne $ManagedSdkRoot) {

        Write-Host ''
        Write-Host 'sdkmanager could not create its install properties in the selected SDK.'
        Write-Host "Retrying in the user-local SDK: $ManagedSdkRoot"
        if (-not (Test-SdkInstallWritable -Root $ManagedSdkRoot)) {
            throw "The user-local Android SDK folder is not writable: $ManagedSdkRoot"
        }

        $SdkRoot = $ManagedSdkRoot
        Add-SdkRoot -Path $SdkRoot

        Write-Host "Retrying SDK package installation in: $SdkRoot"
        Write-Host 'Review each required license prompt and answer it individually.'
        $InstallMessages = @()
        & $SdkManager "--sdk_root=$SdkRoot" "platforms;$RequiredPlatform" "build-tools;$RequiredBuildTools" 2>&1 |
            Tee-Object -Variable InstallMessages | Out-Host
        $InstallExitCode = $LASTEXITCODE
    }

    if ($InstallExitCode -ne 0) {
        throw "sdkmanager package installation failed with exit code $InstallExitCode."
    }
} finally {
    $ErrorActionPreference = $PreviousPreference
}

if (-not (Test-SdkComplete -Root $SdkRoot)) {
    throw "sdkmanager finished, but Platform $RequiredPlatform or Build-Tools $RequiredBuildTools are still missing under $SdkRoot."
}

Write-Host "Android SDK is ready: $SdkRoot"
Write-SdkResult -Root $SdkRoot
exit 0
