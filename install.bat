@echo off
REM MediMind Lab Middleware — Windows Installer
REM Right-click this file and select "Run as Administrator"

echo.
echo ============================================
echo   MediMind Lab Middleware — Installer
echo ============================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Please run this script as Administrator.
    echo Right-click install.bat and select "Run as Administrator".
    pause
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Download Node.js 20 LTS from https://nodejs.org
    echo After installing Node.js, run this script again.
    pause
    exit /b 1
)

REM Show Node.js version
for /f "tokens=*" %%v in ('node --version') do echo Found Node.js %%v

REM Install production dependencies
echo.
echo [1/5] Installing dependencies...
call npm install --production
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Check the output above.
    pause
    exit /b 1
)

REM Copy default config if no config exists
echo.
echo [2/5] Setting up configuration...
if not exist "config\analyzers.json" (
    copy "config\bc7600-default.json" "config\analyzers.json" >nul
    echo Created config\analyzers.json (BC-7600 only)
) else (
    echo config\analyzers.json already exists — skipping.
)

REM Copy .env if it doesn't exist
echo.
echo [3/5] Setting up environment...
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created .env from template.
    echo.
    echo *** IMPORTANT: You must edit .env and paste your Medplum client secret. ***
    echo Open .env in Notepad and replace PASTE_YOUR_SECRET_HERE with the real secret.
    echo.
) else (
    echo .env already exists — skipping.
)

REM Create data and logs directories
if not exist "data" mkdir data
if not exist "logs" mkdir logs

REM Build TypeScript
echo.
echo [4/5] Compiling TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed. Check the output above.
    pause
    exit /b 1
)

REM Install Windows Service
echo.
echo [5/5] Installing Windows Service...
call npm run install-service
if %errorlevel% neq 0 (
    echo WARNING: Service installation failed. You can still run manually with: npm start
)

echo.
echo ============================================
echo   Installation complete!
echo ============================================
echo.
echo Next steps:
echo   1. Edit .env and paste your Medplum client secret
echo   2. Configure LabXpert: TcpClient, Remote IP = this PC's IP, Port = 5001
echo   3. Check health: http://localhost:3001/health
echo   4. View service: services.msc, look for "MediMind Lab Middleware"
echo.
pause
