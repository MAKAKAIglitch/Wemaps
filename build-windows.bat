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
echo [1/3] Checking Android SDK location...

set "SDK_ROOT="
set "USE_LOCAL_PROPERTIES="

if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%" set "SDK_ROOT=%ANDROID_SDK_ROOT%"
if not defined SDK_ROOT if defined ANDROID_HOME if exist "%ANDROID_HOME%" set "SDK_ROOT=%ANDROID_HOME%"

rem Android Studio normally writes a custom SDK path to local.properties.
if not defined SDK_ROOT if exist "%PROJECT_DIR%local.properties" (
    findstr /i /r /c:"^[ ]*sdk\.dir[ ]*=" "%PROJECT_DIR%local.properties" >nul 2>&1
    if not errorlevel 1 set "USE_LOCAL_PROPERTIES=1"
)

rem Default Android Studio SDK location for Windows.
if not defined SDK_ROOT if not defined USE_LOCAL_PROPERTIES (
    if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Android\Sdk" set "SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
)

if not defined SDK_ROOT if not defined USE_LOCAL_PROPERTIES goto :error_sdk

if defined SDK_ROOT (
    set "ANDROID_HOME=%SDK_ROOT%"
    set "ANDROID_SDK_ROOT=%SDK_ROOT%"
    echo Android SDK: %SDK_ROOT%
) else (
    echo Android SDK path will be read from local.properties.
)

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
echo ERROR: Android SDK was not found.
echo.
echo Install Android SDK through Android Studio, or set ANDROID_HOME
echo or ANDROID_SDK_ROOT to your SDK folder.
echo Required packages: Android SDK Platform 37.1 and Build-Tools 36.0.0.
echo The SDK can also be configured in local.properties as sdk.dir=...
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
