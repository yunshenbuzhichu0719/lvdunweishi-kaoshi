@echo off
chcp 65001 >nul
echo ============================================
echo   绿盾卫士云版 - 一键启动 (Windows)
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 没有检测到 Node.js，请先安装：https://nodejs.org
  echo 安装时务必勾选 "Add to PATH"，装完重新运行本脚本。
  echo.
  pause
  exit /b 1
)

echo 正在启动服务，请稍候...
echo 启动成功后，用浏览器打开： http://localhost:3000
echo （关闭本窗口即停止服务）
echo.
echo 首次运行会自动建库并生成管理员账号 admin / ldws2025
echo ============================================
echo.

node server.js

echo.
echo [已停止] 按任意键退出...
pause
