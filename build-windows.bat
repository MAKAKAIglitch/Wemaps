@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0windows-build\build-apk.bat" %*
exit /b %ERRORLEVEL%
