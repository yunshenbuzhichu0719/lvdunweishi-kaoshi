#!/bin/bash
echo "============================================"
echo "  绿盾卫士云版 - 一键启动 (Mac / Linux)"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 没有检测到 Node.js，请先安装：https://nodejs.org"
  echo "安装后重新运行本脚本（bash start.sh）"
  exit 1
fi

echo "正在启动服务，请稍候..."
echo "启动成功后，用浏览器打开： http://localhost:3000"
echo "（按 Ctrl+C 停止服务）"
echo
echo "首次运行会自动建库并生成管理员账号 admin / ldws2025"
echo "============================================"
echo

node server.js
