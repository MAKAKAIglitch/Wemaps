@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Wemaps - Build Android APK

set "PROJECT_DIR=%~dp0"
set "WEMAPS_PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
if errorlevel 1 goto :error_project

echo.
echo ============================================================
echo                     WEMAPS APK BUILDER
echo ============================================================
echo.
echo [1/3] Looking for the existing Android SDK...
echo Checking environment variables, Android Studio settings, PATH, and other projects...
set "SDK_ROOT="

rem Find the SDK already configured on this computer.
for /f "usebackq delims=" %%S in (`powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$paths = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'), (Join-Path $env:USERPROFILE 'Android\Sdk')); $lp = Join-Path $env:WEMAPS_PROJECT_DIR 'local.properties'; if (Test-Path $lp) { $l = Get-Content $lp | Where-Object { $_ -match '^\s*sdk\.dir\s*=' } | Select-Object -First 1; if ($l) { $paths += (($l -replace '^\s*sdk\.dir\s*=\s*','') -replace '\\\\','\' -replace '\\:',':') } }; $cfg = Join-Path $env:APPDATA 'Google'; if (Test-Path $cfg) { Get-ChildItem $cfg -Directory -Filter 'AndroidStudio*' -ErrorAction SilentlyContinue | ForEach-Object { $o = Join-Path $_.FullName 'options'; if (Test-Path $o) { Get-ChildItem $o -Filter '*.xml' -File -ErrorAction SilentlyContinue | ForEach-Object { try { [xml]$x = Get-Content $_.FullName -Raw; foreach ($n in $x.SelectNodes('//component/option')) { if ($n.ParentNode.GetAttribute('name') -eq 'AndroidSdk' -and $n.GetAttribute('name') -eq 'sdkPath') { $paths += $n.GetAttribute('value') } } } catch {} } } } }; foreach ($base in @((Join-Path $env:USERPROFILE 'AndroidStudioProjects'), (Join-Path $env:USERPROFILE 'IdeaProjects'), (Join-Path $env:USERPROFILE 'Projects'), (Join-Path $env:USERPROFILE 'source\repos'))) { if (Test-Path $base) { Get-ChildItem $base -Filter 'local.properties' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $l = Get-Content $_.FullName | Where-Object { $_ -match '^\s*sdk\.dir\s*=' } | Select-Object -First 1; if ($l) { $paths += (($l -replace '^\s*sdk\.dir\s*=\s*','') -replace '\\\\','\' -replace '\\:',':') } } } }; foreach ($e in ($env:Path -split ';')) { if ($e -match '(?i)\\platform-tools\\?$') { $paths += (Split-Path $e -Parent) } elseif ($e -match '(?i)\\cmdline-tools\\[^\\]+\\bin\\?$') { $paths += (Split-Path (Split-Path (Split-Path $e -Parent) -Parent) -Parent) } }; foreach ($p in $paths) { if (-not [string]::IsNullOrWhiteSpace($p)) { $p = [Environment]::ExpandEnvironmentVariables($p.Trim()); if ((Test-Path (Join-Path $p 'platforms')) -or (Test-Path (Join-Path $p 'platform-tools\adb.exe'))) { [Console]::WriteLine((Resolve-Path $p).Path); exit 0 } } }"`) do if not defined SDK_ROOT set "SDK_ROOT=%%S"

rem A CI runner has no interactive desktop; fail instead of opening a folder dialog.
if not defined SDK_ROOT if /i "%CI%"=="true" goto :error_sdk

rem If detection did not work, select the SDK folder that is already installed.
if not defined SDK_ROOT (
    echo.
    echo Automatic search did not find the SDK. Select your existing Android SDK folder.
    for /f "usebackq delims=" %%S in (`powershell.exe -STA -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select your existing Android SDK folder'; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($d.SelectedPath) }"`) do if not defined SDK_ROOT set "SDK_ROOT=%%S"
)

if not defined SDK_ROOT goto :error_sdk
if not exist "%SDK_ROOT%\platforms" if not exist "%SDK_ROOT%\platform-tools\adb.exe" if not exist "%SDK_ROOT%\build-tools" goto :error_sdk

set "ANDROID_HOME=%SDK_ROOT%"
set "ANDROID_SDK_ROOT=%SDK_ROOT%"
echo Android SDK: %SDK_ROOT%

echo.
echo [2/3] Starting Gradle and building the debug APK...
echo Java 17+ will be detected automatically by the Wemaps launcher.
echo The first build may download Gradle and project dependencies.
echo.

set "BUILD_LOG=%PROJECT_DIR%build-windows.log"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$log = Join-Path $env:WEMAPS_PROJECT_DIR 'build-windows.log'; & (Join-Path $env:WEMAPS_PROJECT_DIR 'gradlew.bat') --no-daemon --console=plain --stacktrace :app:assembleDebug 2>&1 | Tee-Object -FilePath $log; exit $LASTEXITCODE"
set "BUILD_EXIT=%ERRORLEVEL%"

if not "%BUILD_EXIT%"=="0" goto :error_build

echo.
echo [3/3] Checking APK output...
set "APK_SOURCE=%PROJECT_DIR%app\build\outputs\apk\debug\app-debug.apk"
set "APK_DEST=%PROJECT_DIR%Wemaps-debug.apk"

if not exist "%APK_SOURCE%" goto :error_apk
copy /y "%APK_SOURCE%" "%APK_DEST%" >nul
if errorlevel 1 goto :error_copy

echo.
echo ============================================================
echo                  BUILD COMPLETED SUCCESSFULLY
echo ============================================================
echo.
echo APK: %APK_DEST%
echo Log: %BUILD_LOG%
echo.
set "EXIT_CODE=0"
goto :finish

:error_project
echo ERROR: Could not open the project folder.
set "EXIT_CODE=1"
goto :finish

:error_sdk
echo ERROR: Could not locate a valid Android SDK folder.
echo.
echo No SDK was installed or changed by this script.
echo Open Android Studio - Settings - Android SDK to see the existing SDK location,
echo then run this BAT again and select that folder when prompted.
echo Required packages: Android SDK Platform 37.1 and Build-Tools 36.0.0.
set "EXIT_CODE=1"
goto :finish

:error_build
echo.
echo ============================================================
echo                       BUILD FAILED
echo ============================================================
echo.
echo Gradle exit code: %BUILD_EXIT%
echo Full build output: %BUILD_LOG%
echo.
echo Send build-windows.log to get the exact error diagnosed.
set "EXIT_CODE=%BUILD_EXIT%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
goto :finish

:error_apk
echo ERROR: Gradle reported success, but the APK was not found:
echo %APK_SOURCE%
echo Check the build log: %BUILD_LOG%
set "EXIT_CODE=1"
goto :finish

:error_copy
echo ERROR: Could not copy the APK to:
echo %APK_DEST%
echo The original APK is at:
echo %APK_SOURCE%
set "EXIT_CODE=1"
goto :finish

:finish
echo.
if /i not "%CI%"=="true" pause
exit /b %EXIT_CODE%
