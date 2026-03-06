@echo off
REM MediMind Lab Middleware — Windows Uninstaller
REM Right-click this file and select "Run as Administrator"

echo.
echo ============================================
echo   MediMind Lab Middleware — Uninstaller
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Please run this script as Administrator.
    pause
    exit /b 1
)

echo Removing Windows Service...
call npm run uninstall-service

echo.
echo Service removed. Files are still in this folder.
echo To fully remove, delete this entire folder.
echo.
pause
