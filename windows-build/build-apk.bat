@echo off
setlocal EnableExtensions DisableDelayedExpansion
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1" %*
set "BUILD_EXIT=%ERRORLEVEL%"
if /i not "%CI%"=="true" pause
exit /b %BUILD_EXIT%
