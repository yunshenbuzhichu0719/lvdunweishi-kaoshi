#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "=== [1/6] Wait for apt processes ==="
i=0
while pgrep -f "apt|dpkg|unattended" > /dev/null 2>&1; do
    sleep 5
    i=$((i+1))
    echo "  waiting... ($i)"
    if [ $i -ge 60 ]; then
        echo "  timeout, force killing..."
        kill -9 $(pgrep -f "apt|dpkg|unattended") 2>/dev/null || true
        sleep 2
        break
    fi
done
rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock
dpkg --configure -a 2>/dev/null || true
echo "  done"

echo "=== [2/6] apt update ==="
apt-get update -y 2>&1 | tail -3
echo "  done"

echo "=== [3/6] Install nodejs + npm ==="
apt-get install -y nodejs npm 2>&1 | tail -5
echo "  done"

echo "=== [4/6] Install PM2 ==="
npm install -g pm2 2>&1 | tail -3
echo "  done"

echo "=== [5/6] Install Nginx ==="
apt-get install -y nginx 2>&1 | tail -5
echo "  done"

echo "=== [6/6] PM2 startup ==="
pm2 startup systemd -u root --hp /root 2>&1 | tail -3
echo "  done"

echo ""
echo "=== VERSIONS ==="
echo "Node.js: $(node -v 2>&1)"
echo "npm:     $(npm -v 2>&1)"
echo "PM2:     $(pm2 -v 2>&1)"
echo "Nginx:   $(nginx -v 2>&1)"
echo ""
echo "=== INSTALL COMPLETE ==="
