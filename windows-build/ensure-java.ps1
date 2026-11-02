param(
    [Parameter(Mandatory = $true)]
    [string]$ResultFile
)

$ErrorActionPreference = 'Stop'
$Candidates = New-Object 'System.Collections.Generic.List[object]'
$SeenHomes = @{}

function Add-JavaCandidate {
    param(
        [string]$Path,
        [string]$Source
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $Expanded = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))

    if (Test-Path -LiteralPath $Expanded -PathType Leaf) {
        $Leaf = [IO.Path]::GetFileName($Expanded)
        if ($Leaf -ieq 'java.exe' -or $Leaf -ieq 'javac.exe') {
            $Expanded = Split-Path -Parent (Split-Path -Parent $Expanded)
        }
    }

    if (-not (Test-Path -LiteralPath (Join-Path $Expanded 'bin\java.exe') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $Expanded 'bin\javac.exe') -PathType Leaf)) {
        return
    }

    try {
        $Key = [IO.Path]::GetFullPath($Expanded).TrimEnd('\').ToLowerInvariant()
    } catch {
        $Key = $Expanded.TrimEnd('\').ToLowerInvariant()
    }

    if (-not $script:SeenHomes.ContainsKey($Key)) {
        $script:SeenHomes[$Key] = $true
        $script:Candidates.Add([pscustomobject]@{
            Home = $Expanded
            Source = $Source
        }) | Out-Null
    }
}

function Add-JavaFolder {
    param(
        [string]$Path,
        [string]$Source
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (Test-Path -LiteralPath (Join-Path $Path 'bin\java.exe') -PathType Leaf) {
        Add-JavaCandidate -Path $Path -Source $Source
        return
    }
    if (Test-Path -LiteralPath $Path -PathType Container) {
        Get-ChildItem -LiteralPath $Path -Directory -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            ForEach-Object { Add-JavaCandidate -Path $_.FullName -Source $Source }
    }
}

function Get-JavaMajorVersion {
    param([string]$JavaExe)

    $Info = New-Object System.Diagnostics.ProcessStartInfo
    $Info.FileName = $JavaExe
    $Info.Arguments = '-version'
    $Info.UseShellExecute = $false
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.CreateNoWindow = $true

    $Process = New-Object System.Diagnostics.Process
    $Process.StartInfo = $Info
    try {
        if (-not $Process.Start()) { return $null }
        $StdOut = $Process.StandardOutput.ReadToEnd()
        $StdErr = $Process.StandardError.ReadToEnd()
        $Process.WaitForExit()
        if ($Process.ExitCode -ne 0) { return $null }
        $Output = $StdOut + [Environment]::NewLine + $StdErr
    } finally {
        $Process.Dispose()
    }

    $Match = [regex]::Match($Output, 'version\s+"([^"]+)"')
    if ($Match.Success) {
        $Version = $Match.Groups[1].Value
    } else {
        $Match = [regex]::Match($Output, '(?m)^\s*openjdk\s+(\d+)(?:[.\s]|$)')
        if (-not $Match.Success) { return $null }
        $Version = $Match.Groups[1].Value
    }

    $MajorText = ($Version -split '[._+\-]')[0]
    if ($MajorText -eq '1') { $MajorText = ($Version -split '[._+\-]')[1] }
    $Major = 0
    if (-not [int]::TryParse($MajorText, [ref]$Major)) { return $null }
    if ($Major -lt 17) { return $null }
    return $Major
}

$script:Candidates = $Candidates
$script:SeenHomes = $SeenHomes

Write-Host 'Wemaps: locating an already-installed full JDK (17 or newer)...'

# Explicit environment variables are checked first.
foreach ($Name in @('JAVA_HOME', 'JDK_HOME', 'STUDIO_JDK', 'ANDROID_STUDIO_JDK', 'JBR_HOME')) {
    Add-JavaCandidate -Path ([Environment]::GetEnvironmentVariable($Name)) -Source $Name
}

Get-ChildItem Env: -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'JAVA_HOME_*' } |
    Sort-Object Name |
    ForEach-Object { Add-JavaCandidate -Path $_.Value -Source $_.Name }

# Resolve Java executables directly from PATH.
foreach ($PathEntry in ($env:PATH -split [regex]::Escape([IO.Path]::PathSeparator))) {
    $Entry = $PathEntry.Trim().Trim('"')
    if ([string]::IsNullOrWhiteSpace($Entry)) { continue }
    $JavaExe = Join-Path $Entry 'java.exe'
    if (Test-Path -LiteralPath $JavaExe -PathType Leaf) {
        Add-JavaCandidate -Path (Split-Path -Parent (Split-Path -Parent $JavaExe)) -Source 'PATH'
    }
}

# Android Studio / JetBrains bundled JDK.
$ProgramRoots = @($env:ProgramFiles, $env:ProgramW6432, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -Unique
foreach ($ProgramRoot in $ProgramRoots) {
    foreach ($RelativePath in @(
        'Android\Android Studio\jbr',
        'Android\Android Studio\jre',
        'Java',
        'Eclipse Adoptium',
        'Microsoft',
        'Amazon Corretto',
        'Zulu',
        'BellSoft\LibericaJDK'
    )) {
        Add-JavaFolder -Path (Join-Path $ProgramRoot $RelativePath) -Source 'Program Files'
    }
}

if ($env:LOCALAPPDATA) {
    foreach ($RelativePath in @(
        'Programs\Android Studio\jbr',
        'Programs\Java',
        'Programs\Eclipse Adoptium',
        'Programs\Microsoft',
        'Programs\Zulu',
        'JetBrains\Toolbox\apps\AndroidStudio'
    )) {
        $Root = Join-Path $env:LOCALAPPDATA $RelativePath
        Add-JavaFolder -Path $Root -Source 'per-user JDK folder'
        if ((Test-Path -LiteralPath $Root -PathType Container) -and $RelativePath -like '*AndroidStudio') {
            Get-ChildItem -LiteralPath $Root -Directory -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -eq 'jbr' } |
                ForEach-Object { Add-JavaCandidate -Path $_.FullName -Source 'JetBrains Toolbox Android Studio JBR' }
        }
    }
}

if ($env:USERPROFILE) {
    Add-JavaFolder -Path (Join-Path $env:USERPROFILE '.jdks') -Source 'JetBrains managed JDK'
    Add-JavaFolder -Path (Join-Path $env:USERPROFILE '.gradle\jdks') -Source 'Gradle managed JDK'
}

foreach ($RegistryRoot in @(
    'HKLM:\SOFTWARE\JavaSoft\JDK',
    'HKLM:\SOFTWARE\JavaSoft\Java Development Kit',
    'HKLM:\SOFTWARE\Eclipse Adoptium\JDK',
    'HKCU:\SOFTWARE\JavaSoft\JDK',
    'HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK'
)) {
    if (Test-Path $RegistryRoot) {
        Get-ChildItem -Path $RegistryRoot -ErrorAction SilentlyContinue | ForEach-Object {
            $Item = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
            if ($Item.JavaHome) { Add-JavaCandidate -Path $Item.JavaHome -Source 'Windows registry' }
        }
        $RootItem = Get-ItemProperty -LiteralPath $RegistryRoot -ErrorAction SilentlyContinue
        if ($RootItem.JavaHome) { Add-JavaCandidate -Path $RootItem.JavaHome -Source 'Windows registry' }
    }
}

foreach ($Candidate in $script:Candidates) {
    $JavaExe = Join-Path $Candidate.Home 'bin\java.exe'
    $Major = Get-JavaMajorVersion -JavaExe $JavaExe
    if ($null -ne $Major) {
        Write-Host "Using JDK $Major from $($Candidate.Source): $($Candidate.Home)"
        [IO.Directory]::CreateDirectory((Split-Path -Parent $ResultFile)) | Out-Null
        [IO.File]::WriteAllText($ResultFile, [IO.Path]::GetFullPath($Candidate.Home), [System.Text.UTF8Encoding]::new($false))
        exit 0
    }
    Write-Host "Skipped unusable JDK candidate: $($Candidate.Home)"
}

throw 'No compatible full JDK 17+ was found. The Gradle launcher also requires a full JDK (java.exe and javac.exe).'
