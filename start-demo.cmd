@echo off
rem ============================================================================
rem  RhineLab Mock Console · 一键启动（L 端 9600 / W 端 9601）
rem  - 已在跑就先跳过；没跑就后台拉起
rem  - 启动后自动打开业务面
rem ============================================================================
setlocal
set ROOT=%~dp0
set CONSOLE=%ROOT%console
set EXE=%CONSOLE%\target\debug\rhine-agent.exe

if not exist "%EXE%" (
  echo [x] 找不到 %EXE%
  echo     先编译： cd /d "%CONSOLE%" ^&^& cargo build --offline
  pause
  exit /b 1
)

echo [1/3] 检查端口 9600 / 9601 ...
netstat -ano | findstr /R /C:":9600 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo     启动 L 端 ^(9600^) · 需要登录
  set RHINE_PORT=9600
  set RHINE_AUTH=on
  set RHINE_UI=ui
  set RHINE_DATA=data/agent.json
  start "" /B "%EXE%"
) else (
  echo     L 端已在运行
)

netstat -ano | findstr /R /C:":9601 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo     启动 W 端 ^(9601^) · 免登录
  set RHINE_PORT=9601
  set RHINE_AUTH=off
  set RHINE_UI=ui
  set RHINE_DATA=data/local.json
  start "" /B "%EXE%"
) else (
  echo     W 端已在运行
)

echo [2/3] 等待端口就绪 ...
set /a TRY=0
:wait
set /a TRY+=1
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":9600 .*LISTENING" >nul 2>&1
if errorlevel 1 if %TRY% LSS 15 goto wait

echo [3/3] 打开业务面 ...
start "" "http://127.0.0.1:9600/business/plane.html"

echo.
echo   L 端    http://127.0.0.1:9600/business/plane.html   admin / rhine-admin-2026
echo   W 端    http://127.0.0.1:9601/business/plane.html   免登录
echo   看板    http://127.0.0.1:9600/business/index.html
echo.
echo 关闭服务： taskkill /F /IM rhine-agent.exe
endlocal
