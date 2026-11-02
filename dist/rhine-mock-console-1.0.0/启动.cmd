@echo off
setlocal
cd /d "%~dp0"
echo [1/2] 启动后端（9600 需登录 / 9601 免登录）...
set RHINE_UI=ui
set RHINE_DATA=data/agent.json
set RHINE_PORT=9600
set RHINE_AUTH=on
start "" /B rhine-agent.exe
timeout /t 1 /nobreak >nul
set RHINE_DATA=data/local.json
set RHINE_PORT=9601
set RHINE_AUTH=off
start "" /B rhine-agent.exe
timeout /t 2 /nobreak >nul
echo [2/2] 打开桌面业务面...
start "" "Rhine 业务面.exe"
echo.
echo   浏览器入口  http://127.0.0.1:9600/business/plane.html   admin / rhine-admin-2026
echo   免登录入口  http://127.0.0.1:9601/business/plane.html
echo   停止服务    taskkill /F /IM rhine-agent.exe
echo.
endlocal
