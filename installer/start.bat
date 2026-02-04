@echo off
setlocal enabledelayedexpansion

:: Budget App Server Startup Script
:: This script starts the Budget App server and opens your browser

title Budget App Server

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Set default environment variables
set "NODE_ENV=production"
set "PORT=3000"
set "HOSTNAME=localhost"

:: Load .env file if it exists (override defaults)
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        :: Skip comments and empty lines
        set "line=%%a"
        if not "!line:~0,1!"=="#" (
            if "%%a"=="SERVER_PORT" set "PORT=%%b"
            if "%%a"=="PGLITE_DB_LOCATION" set "PGLITE_DB_LOCATION=%%b"
        )
    )
)

:: Use local data directory for PGlite
if not exist "data" mkdir data
set "PGLITE_DB_LOCATION=%SCRIPT_DIR%data\budget-local"

:: Check if Node.js is available (either bundled or system)
if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        echo Please install Node.js from https://nodejs.org
        echo Or ensure node.exe is in the same directory as this script.
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

:: Check if server.js exists
if not exist "server.js" (
    echo ERROR: server.js not found!
    echo This may indicate an incomplete installation.
    echo Please reinstall Budget App.
    pause
    exit /b 1
)

echo.
echo ========================================
echo        Budget App Server
echo ========================================
echo.
echo Starting server at http://localhost:%PORT%
echo Press Ctrl+C to stop the server
echo.
echo Data stored in: %PGLITE_DB_LOCATION%
echo.

:: Wait a moment then open browser
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%"

:: Start the server
"%NODE_CMD%" server.js

:: If we get here, the server stopped
echo.
echo Server stopped.
pause
