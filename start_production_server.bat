@echo off
setlocal EnableDelayedExpansion
title Cognitara Examination Portal - Production Server (Waitress WSGI)
chcp 65001 >nul
cd /d "%~dp0"
cls

echo ======================================================================
echo    COGNITARA EXAMINATION PORTAL — PRODUCTION WSGI SERVER
echo ======================================================================
echo.
echo [1/3] Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

echo [2/3] Checking Waitress WSGI package...
python -c "import waitress" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing Waitress WSGI server...
    python -m pip install waitress
)

echo [3/3] Identifying Local Network Addresses:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set ip=%%a
    set ip=!ip: =!
    echo    * Student Station Access: http://!ip!:5000
)
echo    * Local Host Access:      http://127.0.0.1:5000
echo.
echo ======================================================================
echo Server is starting under Waitress (16 Worker Threads).
echo Press Ctrl+C in this console to gracefully stop the server.
echo ======================================================================
echo.

python wsgi.py
pause
