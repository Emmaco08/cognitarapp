@echo off
title Cognitara Exam System - Server Console
chcp 65001 >nul
cls

:: ============================================================
::  COGNITARA EXAM SYSTEM - PREMIUM SERVER LAUNCHER
:: ============================================================

:: Set console size and colors
mode con: cols=80 lines=40
color 0F

:: Hide cursor
setlocal EnableDelayedExpansion

:: Clear screen with fade effect
call :ClearScreen
cls

:: ============================================================
::  ANIMATED LOGO SEQUENCE
:: ============================================================

:: Frame 1 - Minimal dots
color 0F
cls
echo.
echo.
echo.
echo.
echo                               ⬤
echo.
timeout /t 0 >nul

:: Frame 2 - Spark
cls
echo.
echo.
echo.
echo                           ⬤   ⬤   ⬤
echo.
echo                              ⬤
timeout /t 0 >nul

:: Frame 3 - Orbit
color 0B
cls
echo.
echo.
echo                      ✦         ⬤         ✦
echo                           ⬤   ⬤   ⬤
echo                      ✦         ⬤         ✦
timeout /t 0 >nul

:: Frame 4 - Rings forming
color 09
cls
echo.
echo                  ╔═══════════════════════════╗
echo                  ║     ◉     ◉     ◉     ◉   ║
echo                  ║       ◉     ◉     ◉       ║
echo                  ║         ◉     ◉           ║
echo                  ║           ◉               ║
echo                  ╚═══════════════════════════╝
timeout /t 0 >nul

:: ============================================================
::  MAIN LOGO - COGNITARA
:: ============================================================
color 0E
cls
echo.
echo.
echo      ██████╗  ██████╗   ██████╗  ███╗   ██╗ ██╗ ████████╗  █████╗  ██████╗   █████╗ 
echo     ██╔════╝ ██╔═══██╗ ██╔════╝  ████╗  ██║ ██║ ╚══██╔══╝ ██╔══██╗ ██╔══██╗ ██╔══██╗
echo     ██║      ██║   ██║ ██║  ███╗ ██╔██╗ ██║ ██║    ██║    ███████║ ██████╔╝ ███████║
echo     ██║      ██║   ██║ ██║   ██║ ██║╚██╗██║ ██║    ██║    ██╔══██║ ██╔══██╗ ██╔══██║
echo     ╚██████╗ ╚██████╔╝ ╚██████╔╝ ██║ ╚████║ ██║    ██║    ██║  ██║ ██║  ██║ ██║  ██║
echo      ╚═════╝  ╚═════╝   ╚═════╝  ╚═╝  ╚═══╝ ╚═╝    ╚═╝    ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝
echo.
echo                    ███████╗ ██╗  ██╗  █████╗  ███╗   ███╗
echo                    ██╔════╝ ╚██╗██╔╝ ██╔══██╗ ████╗ ████║
echo                    █████╗    ╚███╔╝  ███████║ ██╔████╔██║
echo                    ██╔══╝    ██╔██╗  ██╔══██║ ██║╚██╔╝██║
echo                    ███████╗ ██╔╝ ██╗ ██║  ██║ ██║ ╚═╝ ██║
echo                    ╚══════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝     ╚═╝
echo.
echo                           ╔══════════════════════╗
echo                           ║   EXAM SYSTEM v1.0   ║
echo                           ╚══════════════════════╝
timeout /t 2 >nul

:: ============================================================
::  LOADING ANIMATION
:: ============================================================
color 0B
cls
echo.
echo                    ╔══════════════════════════════════════╗
echo                    ║     COGNITARA SERVER INITIALIZING    ║
echo                    ╚══════════════════════════════════════╝
echo.
echo.

:: Animated progress bar
setlocal EnableDelayedExpansion
set "bar="
for /L %%i in (1,1,40) do (
    set "bar=!bar!█"
    cls
    echo.
    echo                    ╔══════════════════════════════════════╗
    echo                    ║     COGNITARA SERVER INITIALIZING    ║
    echo                    ╚══════════════════════════════════════╝
    echo.
    echo                         ┌──────────────────────────────────────┐
    echo                         │ !bar! │
    echo                         └──────────────────────────────────────┘
    echo.
    ping -n 1 127.0.0.1 >nul
)
endlocal

:: Loading messages
setlocal EnableDelayedExpansion
set count=0
for %%m in (
    "Mounting secure connection..."
    "Initializing database engine..."
    "Loading exam configurations..."
    "Starting web server threads..."
    "Configuring anti-cheat protocols..."
    "Establishing teacher connections..."
    "Preparing student interfaces..."
    "Loading admin dashboard..."
    "Calibrating timer services..."
    "Starting session manager..."
    "Compiling security rules..."
    "Warming up cache..."
    "Connecting to local network..."
    "Finalizing setup..."
) do (
    cls
    echo.
    echo                    ╔══════════════════════════════════════╗
    echo                    ║     COGNITARA SERVER INITIALIZING    ║
    echo                    ╚══════════════════════════════════════╝
    echo.
    echo                         ┌──────────────────────────────────────┐
    echo                         │ ██████████████████████████████████████ │
    echo                         └──────────────────────────────────────┘
    echo.
    echo                         ✦  %%~m
    echo.
    ping -n 1 127.0.0.1 >nul
)
endlocal

:: ============================================================
::  SERVER INFO DISPLAY
:: ============================================================
color 0A
cls
echo.
echo    ╔════════════════════════════════════════════════════════════════════════════════╗
echo    ║                                                                                ║
echo      ██████╗  ██████╗   ██████╗  ███╗   ██╗ ██╗ ████████╗  █████╗  ██████╗   █████╗ 
echo     ██╔════╝ ██╔═══██╗ ██╔════╝  ████╗  ██║ ██║ ╚══██╔══╝ ██╔══██╗ ██╔══██╗ ██╔══██╗
echo     ██║      ██║   ██║ ██║  ███╗ ██╔██╗ ██║ ██║    ██║    ███████║ ██████╔╝ ███████║
echo     ██║      ██║   ██║ ██║   ██║ ██║╚██╗██║ ██║    ██║    ██╔══██║ ██╔══██╗ ██╔══██║
echo     ╚██████╗ ╚██████╔╝ ╚██████╔╝ ██║ ╚████║ ██║    ██║    ██║  ██║ ██║  ██║ ██║  ██║
echo      ╚═════╝  ╚═════╝   ╚═════╝  ╚═╝  ╚═══╝ ╚═╝    ╚═╝    ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝
echo    ║                                                              
echo    ║                        EXAM SYSTEM - READY FOR OPERATIONS               
echo    ╚════════════════════════════════════════════════════════════════════════════════╝
echo.
echo    ╔══════════════════════════════════════════════════════════════╗
echo    ║  🌐 NETWORK ACCESS POINTS                                    ║
echo    ╠══════════════════════════════════════════════════════════════╣

:: Get network info with better formatting
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set ip=%%a
    set ip=!ip: =!
    echo    ║  📍 Local:    http://!ip!:5000                        ║
)

echo    ║  📍 Computer:  http://%COMPUTERNAME%:5000                 ║
echo    ║  📍 Loopback:  http://127.0.0.1:5000                      ║
echo    ╠══════════════════════════════════════════════════════════════╣
echo    ║  📊 SERVICES ACTIVE                                         ║
echo    ║     • Student Exam Portal                                   ║
echo    ║     • Teacher Dashboard                                     ║
echo    ║     • Admin Control Panel                                   ║
echo    ║     • Database Engine (SQLite)                              ║
echo    ║     • Anti-Cheat Monitor                                    ║
echo    ╠══════════════════════════════════════════════════════════════╣
echo    ║  ⌨️  CONTROLS                                                ║
echo    ║     Press Ctrl+C to stop the server safely                  ║
echo    ╚══════════════════════════════════════════════════════════════╝
echo.
echo    ────────────────────────────────────────────────────────────────
echo      SERVER LOG:
echo    ────────────────────────────────────────────────────────────────
echo.

:: ============================================================
::  LAUNCH PYTHON PRODUCTION SERVER (WAITRESS)
:: ============================================================
python wsgi.py

:: ============================================================
::  SHUTDOWN SEQUENCE
:: ============================================================
color 0C
cls
echo.
echo.
echo                    ╔══════════════════════════════════════╗
echo                    ║     COGNITARA SERVER SHUTTING DOWN   ║
echo                    ╚══════════════════════════════════════╝
echo.
echo                         ┌──────────────────────────────────────┐
echo                         │ ██████████████████████████████████████ │
echo                         └──────────────────────────────────────┘
echo.
echo                         ✦  Saving active sessions...
echo                         ✦  Closing database connections...
echo                         ✦  Server stopped successfully!
echo.
timeout /t 3 >nul
exit /b

:: ============================================================
::  CLEAR SCREEN WITH FADE EFFECT
:: ============================================================
:ClearScreen
for /L %%i in (1,1,5) do (
    cls
    echo.
    echo.
    echo.
    echo.
    ping -n 1 127.0.0.1 >nul
)
goto :EOF