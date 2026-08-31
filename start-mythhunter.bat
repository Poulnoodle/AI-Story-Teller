@echo off
chcp 65001 >nul
title 神话猎手 · THE MYTH HUNTER
cd /d "%~dp0"

rem 已在运行则直接打开浏览器
netstat -ano | findstr ":3000.*LISTENING" >nul 2>nul
if %errorlevel%==0 (
    echo 服务已在运行：http://localhost:3000
    start http://localhost:3000
    timeout /t 3 >nul
    exit /b 0
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)

rem 首次运行（或代码更新后删除了 .next）自动构建
if not exist ".next\BUILD_ID" (
    echo 首次启动，正在构建（约 1-2 分钟）...
    call npm run build
    if %errorlevel% neq 0 (
        echo [错误] 构建失败，请检查上方日志
        pause
        exit /b 1
    )
)

echo.
echo ============================================
echo  神话猎手启动中...
echo  本机访问：  http://localhost:3000
echo  局域网访问：http://本机IP:3000
echo  关闭本窗口即停止服务
echo ============================================
echo.

rem 3 秒后自动打开浏览器（在独立小窗口里计时，不阻塞服务）
start /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

call npm run start

echo.
echo 服务已停止。
pause
