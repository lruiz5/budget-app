@echo off
:: Budget App Server Stop Script
:: This script stops any running Budget App server instances

echo Stopping Budget App server...

:: Find and kill node processes running server.js
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| find "PID:"') do (
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | find "server.js" >nul
    if not errorlevel 1 (
        echo Stopping process %%a
        taskkill /pid %%a /f >nul 2>nul
    )
)

echo.
echo Budget App server stopped.
timeout /t 2 >nul
