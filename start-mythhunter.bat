@echo off
chcp 65001 >nul
title 神话猎手 · THE MYTH HUNTER
cd /d "%~dp0"

rem 已在运行则直接打开浏览器
netstat -ano | findstr ":3000.*LISTENING" >nul 2>nul
if %errorlevel%==0 (
    echo 服务已在运行：http://localhost:3000/AI-Story-Teller/
    start http://localhost:3000/AI-Story-Teller/
    timeout /t 3 >nul
    exit /b 0
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)

echo.
echo ============================================
echo  神话猎手启动中...
echo  本机访问：  http://localhost:3000/AI-Story-Teller/
echo  局域网访问：http://本机IP:3000/AI-Story-Teller/
echo  关闭本窗口即停止服务
echo ============================================
echo.

rem 3 秒后自动打开浏览器（在独立小窗口里计时，不阻塞服务）
start /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000/AI-Story-Teller/"

rem 静态版无服务端路由，开发模式即完整功能（-H 0.0.0.0 允许局域网访问）
call npm run dev -- -H 0.0.0.0

echo.
echo 服务已停止。
pause
