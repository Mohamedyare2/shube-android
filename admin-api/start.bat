@echo off
:: SHUBE Admin API — Setup & Start Script
:: This script installs Python (if missing) and starts the Flask server

setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Check if Python is installed via winget/direct path
set PYTHON_CMD=
for %%P in (python python3) do (
    %%P --version >nul 2>&1
    if !errorlevel! == 0 (
        set PYTHON_CMD=%%P
        goto :found_python
    )
)

:: Try common install paths
for %%P in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python313\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe"
) do (
    if exist %%P (
        set PYTHON_CMD=%%P
        goto :found_python
    )
)

echo [SHUBE] Python not found. Downloading installer...
powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.0/python-3.13.0-amd64.exe' -OutFile '%TEMP%\python_installer.exe'"
echo [SHUBE] Installing Python 3.13...
"%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
:: Refresh PATH
call RefreshEnv.cmd >nul 2>&1
set PYTHON_CMD=python

:found_python
echo [SHUBE] Using Python: %PYTHON_CMD%
%PYTHON_CMD% --version

:: Check .env
if not exist ".env" (
    echo [ERROR] .env file missing!
    echo        Copy .env.example to .env and set SUPABASE_SERVICE_ROLE_KEY
    pause
    exit /b 1
)

:: Check service role key is set
findstr /C:"YOUR_SERVICE_ROLE_KEY_HERE" .env >nul
if !errorlevel! == 0 (
    echo [ERROR] SUPABASE_SERVICE_ROLE_KEY is not set in .env
    echo         Get it from: https://supabase.com/dashboard/project/eabwhgujwywwiormujrr/settings/api
    echo         Then paste it as SUPABASE_SERVICE_ROLE_KEY=eyJ...
    pause
    exit /b 1
)

:: Create virtualenv if not present
if not exist "venv\Scripts\python.exe" (
    echo [SHUBE] Creating virtual environment...
    %PYTHON_CMD% -m venv venv
)

:: Install deps
echo [SHUBE] Installing dependencies...
venv\Scripts\python.exe -m pip install -r requirements.txt -q

:: Start server
echo.
echo =========================================
echo  SHUBE Admin API running on port 5050
echo  http://localhost:5050/api/health
echo =========================================
echo.
venv\Scripts\python.exe app.py
