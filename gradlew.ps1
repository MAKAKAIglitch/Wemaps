param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GradleArgs
)

$ErrorActionPreference = "Stop"
$GradleVersion = "9.5.1"
$ExpectedSha256 = "bafc141b619ad6350fd975fc903156dd5c151998cc8b058e8c1044ab5f7b031f"

$GradleUserHome = if ($env:GRADLE_USER_HOME) {
    $env:GRADLE_USER_HOME
} else {
    Join-Path $HOME ".gradle"
}
$InstallDir = Join-Path $GradleUserHome "wemaps/gradle-$GradleVersion"
$GradleExe = Join-Path $InstallDir "bin/gradle.bat"

if (-not (Test-Path $GradleExe)) {
    $CacheDir = Join-Path $GradleUserHome "wemaps"
    New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

    $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("wemaps-gradle-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    $ZipFile = Join-Path $TempDir "gradle-$GradleVersion-bin.zip"
    $Url = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"

    try {
        Write-Host "Downloading Gradle $GradleVersion..."
        Invoke-WebRequest -Uri $Url -OutFile $ZipFile

        $ActualSha256 = (Get-FileHash -LiteralPath $ZipFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($ActualSha256 -ne $ExpectedSha256) {
            throw "Gradle archive SHA-256 mismatch. Downloaded file was not installed."
        }

        Write-Host "Gradle archive verified. Installing..."
        Expand-Archive -LiteralPath $ZipFile -DestinationPath $TempDir -Force
        if (Test-Path $InstallDir) {
            Remove-Item -LiteralPath $InstallDir -Recurse -Force
        }
        Move-Item -LiteralPath (Join-Path $TempDir "gradle-$GradleVersion") -Destination $InstallDir
    }
    finally {
        if (Test-Path $TempDir) {
            Remove-Item -LiteralPath $TempDir -Recurse -Force
        }
    }
}

& $GradleExe @GradleArgs
exit $LASTEXITCODE
