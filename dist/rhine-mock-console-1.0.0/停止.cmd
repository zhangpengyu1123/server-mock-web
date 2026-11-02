@echo off
taskkill /F /IM rhine-agent.exe >nul 2>&1
taskkill /F /IM "Rhine 业务面.exe" >nul 2>&1
echo 已停止。
pause
