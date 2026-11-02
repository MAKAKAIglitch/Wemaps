param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GradleArgs
)

$ErrorActionPreference = 'Stop'
$Runner = Join-Path $PSScriptRoot 'windows-build\gradle-runner.ps1'
if (-not (Test-Path -LiteralPath $Runner -PathType Leaf)) {
    throw "Wemaps Gradle runner not found: $Runner"
}

& $Runner @GradleArgs
exit $LASTEXITCODE
