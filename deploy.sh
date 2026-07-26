#!/bin/bash
# 考试系统云服务器一键部署脚本
# 使用方法: bash deploy.sh

set -e

echo "=========================================="
echo "  考试系统 - 云服务器部署脚本"
echo "=========================================="

# 检查是否以root用户运行
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 用户运行此脚本: sudo bash deploy.sh"
  exit 1
fi

# 安装 Node.js 22
echo ""
echo "[1/6] 检查 Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -ge 18 ]; then
    echo "  Node.js $(node -v) 已安装，跳过"
  else
    echo "  Node.js 版本过低，安装 Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
else
  echo "  安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# 安装 PM2
echo ""
echo "[2/6] 检查 PM2..."
if command -v pm2 &> /dev/null; then
  echo "  PM2 已安装，跳过"
else
  echo "  安装 PM2..."
  npm install -g pm2
fi

# 安装 Git
echo ""
echo "[3/6] 检查 Git..."
if command -v git &> /dev/null; then
  echo "  Git 已安装，跳过"
else
  echo "  安装 Git..."
  apt-get update && apt-get install -y git
fi

# 克隆/更新代码
DEPLOY_DIR="/opt/exam-system"
echo ""
echo "[4/6] 部署代码..."
if [ -d "$DEPLOY_DIR" ]; then
  echo "  目录已存在，拉取最新代码..."
  cd "$DEPLOY_DIR"
  git pull origin master
else
  echo "  克隆代码到 $DEPLOY_DIR ..."
  git clone https://gitee.com/xizhi1119/exam-system.git "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# 安装依赖
echo ""
echo "[5/6] 安装依赖..."
npm install --production

# 创建必要目录
mkdir -p data materials uploads

# 设置权限
chown -R www-data:www-data "$DEPLOY_DIR" 2>/dev/null || true
chmod -R 755 "$DEPLOY_DIR"

# 启动服务
echo ""
echo "[6/6] 启动服务..."
pm2 delete exam-system 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 设置开机自启
pm2 startup systemd 2>/dev/null || true

echo ""
echo "=========================================="
echo "  部署完成!"
echo "=========================================="
echo ""
echo "  访问地址: http://$(curl -s ifconfig.me):3000"
echo ""
echo "  常用命令:"
echo "    pm2 status          # 查看状态"
echo "    pm2 logs exam-system # 查看日志"
echo "    pm2 restart exam-system # 重启服务"
echo "    pm2 stop exam-system    # 停止服务"
echo ""
echo "  注意: 请在云服务器安全组中放行 3000 端口"
echo "=========================================="
