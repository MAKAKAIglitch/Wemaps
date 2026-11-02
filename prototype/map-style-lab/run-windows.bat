@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 serve.py
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        python serve.py
    ) else (
        echo Python 3 was not found.
        echo Install Python 3 from https://www.python.org/downloads/windows/
        echo During setup, enable "Add python.exe to PATH".
        pause
        exit /b 1
    )
)
pause
