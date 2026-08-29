@echo off
color 0b
echo ===================================================
echo        SHUBE ADMIN DASHBOARD - STARTUP
echo ===================================================
echo.
echo Hubinta in Node.js uu ku jiro kombiyuutarka...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [KHALAD] Node.js kuma jiro kombiyuutarkaaga ama wuxuu u baahan yahay in PowerShell la damiyo lana shido! 
    echo Fadlan fur PowerShell cusub ama kombiyuutarka dib u dami/shid.
    pause
    exit /b
)

echo.
echo [1/3] Kicinta Flask Admin API (port 5050)...
start "SHUBE Admin API" cmd /k "cd /d %~dp0admin-api && start.bat"

echo.
echo [2/3] Tagida galka barnaamijka...
cd /d "%~dp0admin-dashboard"

echo.
echo [3/3] Ku-rakibida xirmooyinka (Dependencies)... Tani way yara qaadanaysaa markii ugu horraysa...
call npm install

echo.
echo Kicinta Dashboard-ka...
echo.
echo Fadlan ha xirin daaqadahan madow (CMD)!
echo Browser-kaaga ayaa hadda toos u furmaya...

start http://localhost:5173
call npm run dev

pause
