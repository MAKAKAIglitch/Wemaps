param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GradleArgs
)

$ErrorActionPreference = "Stop"
$GradleVersion = "9.5.1"
$ExpectedSha256 = "bafc141b619ad6350fd975fc903156dd5c151998cc8b058e8c1044ab5f7b031f"

# Gradle 9.5.1 requires a JDK 17 or newer. Search common locations so users
# do not have to set JAVA_HOME manually when Java is already installed.
$JavaCandidates = New-Object 'System.Collections.Generic.List[object]'

function Add-JavaHomeCandidate {
    param(
        [string]$Path,
        [string]$Source
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    try {
        $CandidateHome = [System.IO.Path]::GetFullPath(
            [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
        )
    }
    catch {
        return
    }

    $JavaExe = Join-Path $CandidateHome "bin\java.exe"
    $JavacExe = Join-Path $CandidateHome "bin\javac.exe"

    # A JRE is not enough for the Android build; require a full JDK.
    if (-not (Test-Path -LiteralPath $JavaExe -PathType Leaf) -or
        -not (Test-Path -LiteralPath $JavacExe -PathType Leaf)) {
        return
    }

    $AlreadyAdded = $JavaCandidates | Where-Object {
        $_.Home -ieq $CandidateHome
    } | Select-Object -First 1

    if (-not $AlreadyAdded) {
        $JavaCandidates.Add([pscustomobject]@{
            Home   = $CandidateHome
            Source = $Source
        }) | Out-Null
    }
}

function Add-JavaSearchRoot {
    param(
        [string]$Root,
        [string]$Source
    )

    if ([string]::IsNullOrWhiteSpace($Root)) {
        return
    }

    if (Test-Path -LiteralPath (Join-Path $Root "bin\java.exe") -PathType Leaf) {
        Add-JavaHomeCandidate -Path $Root -Source $Source
        return
    }

    if (Test-Path -LiteralPath $Root -PathType Container) {
        Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
            Sort-Object -Property FullName -Descending |
            ForEach-Object {
                Add-JavaHomeCandidate -Path $_.FullName -Source $Source
            }
    }
}

Write-Host "Searching for a JDK 17 or newer..."

# Explicit configuration takes priority.
Add-JavaHomeCandidate -Path $env:JAVA_HOME -Source "JAVA_HOME"
foreach ($VariableName in @("JDK_HOME", "STUDIO_JDK", "ANDROID_STUDIO_JDK", "JBR_HOME")) {
    Add-JavaHomeCandidate -Path ([Environment]::GetEnvironmentVariable($VariableName)) -Source $VariableName
}

# setup-java and some IDEs expose version-specific JAVA_HOME variables.
Get-ChildItem Env: -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "JAVA_HOME_*" } |
    Sort-Object -Property Name |
    ForEach-Object {
        Add-JavaHomeCandidate -Path $_.Value -Source $_.Name
    }

# Search PATH entries directly instead of relying on Get-Command metadata,
# which differs between Windows PowerShell 5.1 and PowerShell 7.
foreach ($PathEntry in ($env:PATH -split [regex]::Escape([System.IO.Path]::PathSeparator))) {
    if ([string]::IsNullOrWhiteSpace($PathEntry)) {
        continue
    }

    $PathJavaExe = Join-Path $PathEntry.Trim('"') "java.exe"
    if (Test-Path -LiteralPath $PathJavaExe -PathType Leaf) {
        $JavaBin = Split-Path -Parent $PathJavaExe
        Add-JavaHomeCandidate -Path (Split-Path -Parent $JavaBin) -Source "PATH"
    }
}

# Common machine-wide JDK and Android Studio installation locations.
$ProgramRoots = @(
    $env:ProgramFiles,
    $env:ProgramW6432,
    [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

foreach ($ProgramRoot in $ProgramRoots) {
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "Java") -Source "standard Java folder"
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "Eclipse Adoptium") -Source "Eclipse Adoptium"
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "Microsoft") -Source "Microsoft OpenJDK"
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "Amazon Corretto") -Source "Amazon Corretto"
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "Zulu") -Source "Azul Zulu"
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "BellSoft") -Source "BellSoft Liberica"
    Add-JavaSearchRoot -Root (Join-Path $ProgramRoot "Android\Android Studio\jbr") -Source "Android Studio JBR"
}

# Per-user installations.
if ($env:LOCALAPPDATA) {
    foreach ($RelativePath in @(
        "Programs\Java",
        "Programs\Eclipse Adoptium",
        "Programs\Microsoft",
        "Programs\Zulu",
        "Programs\Android Studio\jbr"
    )) {
        Add-JavaSearchRoot -Root (Join-Path $env:LOCALAPPDATA $RelativePath) -Source "per-user JDK folder"
    }
}

# JetBrains Toolbox Android Studio installations keep the runtime in a versioned folder.
if ($env:LOCALAPPDATA) {
    $ToolboxAndroidStudio = Join-Path $env:LOCALAPPDATA "JetBrains\Toolbox\apps\AndroidStudio"
    if (Test-Path -LiteralPath $ToolboxAndroidStudio -PathType Container) {
        Get-ChildItem -LiteralPath $ToolboxAndroidStudio -Directory -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -eq "jbr" } |
            ForEach-Object {
                Add-JavaHomeCandidate -Path $_.FullName -Source "JetBrains Toolbox Android Studio JBR"
            }
    }
}

# JetBrains IDE-managed JDKs are commonly stored here.
if ($env:USERPROFILE) {
    Add-JavaSearchRoot -Root (Join-Path $env:USERPROFILE ".jdks") -Source "JetBrains managed JDK"
}

$SelectedJava = $null
foreach ($Candidate in $JavaCandidates) {
    $JavaExe = Join-Path $Candidate.Home "bin\java.exe"
    $VersionOutput = (& $JavaExe -version 2>&1 | Out-String)
    Write-Host "Checking JDK candidate: $($Candidate.Home) ($($Candidate.Source))"

    # The standard version banner is consistent across OpenJDK distributions.
    $VersionMatch = [regex]::Match($VersionOutput, 'version\s+"([^"]+)"')
    if (-not $VersionMatch.Success) {
        $VersionMatch = [regex]::Match(
            $VersionOutput,
            'java\.specification\.version\s*=\s*([0-9]+(?:\.[0-9]+)*)'
        )
    }

    if (-not $VersionMatch.Success) {
        Write-Warning "Could not read the Java version in '$($Candidate.Home)'."
        continue
    }

    $JavaVersion = $VersionMatch.Groups[1].Value
    $VersionParts = $JavaVersion.Split(".")
    if ($VersionParts[0] -eq "1" -and $VersionParts.Length -gt 1) {
        $JavaMajor = [int]$VersionParts[1]
    }
    else {
        $JavaMajor = [int]$VersionParts[0]
    }

    if ($JavaMajor -ge 17) {
        $SelectedJava = [pscustomobject]@{
            Home   = $Candidate.Home
            Major  = $JavaMajor
            Source = $Candidate.Source
        }
        break
    }

    Write-Warning "Found Java $JavaVersion in '$($Candidate.Home)', but JDK 17 or newer is required."
}

if (-not $SelectedJava) {
    throw @"
Wemaps requires a JDK 17 or newer to run Gradle $GradleVersion.
The launcher checked JAVA_HOME/JDK_HOME, PATH, Android Studio's bundled JBR,
JetBrains-managed JDKs, and common Windows installation folders.
Install a JDK 17+ (for example Eclipse Temurin) or set JAVA_HOME to its folder,
then run gradlew.bat again.
"@
}

$env:JAVA_HOME = $SelectedJava.Home
$env:PATH = (Join-Path $SelectedJava.Home "bin") + [System.IO.Path]::PathSeparator + $env:PATH
Write-Host "Using JDK $($SelectedJava.Major) from $($SelectedJava.Source): $($SelectedJava.Home)"

$GradleUserHome = if ($env:GRADLE_USER_HOME) {
    $env:GRADLE_USER_HOME
} else {
    Join-Path $HOME ".gradle"
}
$InstallDir = Join-Path $GradleUserHome "wemaps/gradle-$GradleVersion"
$GradleExe = Join-Path $InstallDir "bin/gradle.bat"

if (-not (Test-Path -LiteralPath $GradleExe -PathType Leaf)) {
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
        if (Test-Path -LiteralPath $InstallDir) {
            Remove-Item -LiteralPath $InstallDir -Recurse -Force
        }
        Move-Item -LiteralPath (Join-Path $TempDir "gradle-$GradleVersion") -Destination $InstallDir
    }
    finally {
        if (Test-Path -LiteralPath $TempDir) {
            Remove-Item -LiteralPath $TempDir -Recurse -Force
        }
    }
}

& $GradleExe @GradleArgs
exit $LASTEXITCODE
