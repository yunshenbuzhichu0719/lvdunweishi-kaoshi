import paramiko, sys, os, time, json, stat

HOST = os.environ.get('LDWS_HOST', '43.226.38.94')
PORT = int(os.environ.get('LDWS_PORT', '22'))
USER = os.environ.get('LDWS_USER', 'root')
PASS = os.environ.get('LDWS_PASS', '')
# 项目根目录 = 本脚本所在 tools/ 的上级（自动识别，跨电脑无需改路径）
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)

# Clean data-store.json (only keep admin, no test users/records)
CLEAN_DATA = json.dumps({
    "users": [],
    "admins": [
        {
            "user": "admin",
            "name": "系统管理员",
            "salt": "ca98b85d251ea7c1290feb2caa8424f4",
            "passHash": "55dc337abaaf157d54c887d8e07ec481673ffc47c6105239aa4fbc0ce81b6fe8827422f71345cdb1a125f9cb34ccd57ef98bf58ebfe1009f66aa2cbb8bc8bef9"
        }
    ],
    "records": [],
    "sessions": {},
    "authReqs": [],
    "authGrants": [],
    "authCfg": {"enabled": True, "days": 30, "bind": True, "autoGrant": False, "secret": "LDWS-DAILY-AUTH-2025", "seq": 0}
}, ensure_ascii=False, indent=2)

# Nginx config
NGINX_CONF = """server {
    listen 80;
    server_name _;

    root /opt/ldws/public;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;

    # API proxy to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Connection "";
    }

    # Static files with caching
    location /assets/ {
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
    location /data/ {
        expires 1d;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
"""

# Files to upload: (local_path, remote_path)
FILES = [
    (f'{PROJECT}/server.js', '/opt/ldws/server.js'),
    (f'{PROJECT}/package.json', '/opt/ldws/package.json'),
    (f'{PROJECT}/public/index.html', '/opt/ldws/public/index.html'),
    (f'{PROJECT}/public/manifest.webmanifest', '/opt/ldws/public/manifest.webmanifest'),
    (f'{PROJECT}/public/sw.js', '/opt/ldws/public/sw.js'),
    (f'{PROJECT}/public/icon-192.png', '/opt/ldws/public/icon-192.png'),
    (f'{PROJECT}/public/icon-512.png', '/opt/ldws/public/icon-512.png'),
    (f'{PROJECT}/public/assets/admin.js', '/opt/ldws/public/assets/admin.js'),
    (f'{PROJECT}/public/assets/app.css', '/opt/ldws/public/assets/app.css'),
    (f'{PROJECT}/public/assets/auth.js', '/opt/ldws/public/assets/auth.js'),
    (f'{PROJECT}/public/assets/cloud-api.js', '/opt/ldws/public/assets/cloud-api.js'),
    (f'{PROJECT}/public/assets/cloud.js', '/opt/ldws/public/assets/cloud.js'),
    (f'{PROJECT}/public/assets/engine.js', '/opt/ldws/public/assets/engine.js'),
    (f'{PROJECT}/public/assets/main.js', '/opt/ldws/public/assets/main.js'),
    (f'{PROJECT}/public/assets/store.js', '/opt/ldws/public/assets/store.js'),
    (f'{PROJECT}/public/assets/ui.js', '/opt/ldws/public/assets/ui.js'),
    (f'{PROJECT}/public/assets/xlsx.full.min.js', '/opt/ldws/public/assets/xlsx.full.min.js'),
    (f'{PROJECT}/public/data/bank-daily.js', '/opt/ldws/public/data/bank-daily.js'),
    (f'{PROJECT}/public/data/bank-keypost.js', '/opt/ldws/public/data/bank-keypost.js'),
    (f'{PROJECT}/public/data/docs-training.js', '/opt/ldws/public/data/docs-training.js'),
]

def run(ssh, cmd, label='', timeout=30):
    if label:
        print(f'  >>> {label}')
    chan = ssh.get_transport().open_session()
    chan.exec_command(cmd)
    t0 = time.time()
    while not chan.exit_status_ready():
        if time.time() - t0 > timeout:
            chan.close()
            print(f'  [TIMEOUT]')
            return -1, ''
        time.sleep(0.2)
    out = chan.recv(65536).decode('utf-8', errors='replace').strip()
    err = chan.recv_stderr(65536).decode('utf-8', errors='replace').strip()
    code = chan.recv_exit_status()
    chan.close()
    if out:
        print(f'  {out}')
    if err and code != 0:
        print(f'  [err] {err}')
    return code, out

def main():
    if not PASS:
        print('ERROR: LDWS_PASS env not set')
        sys.exit(1)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Connecting to {USER}@{HOST}:{PORT} ...')
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15, allow_agent=False, look_for_keys=False)
    print('Connected!\n')

    # Step 1: Create directories
    print('=== Step 1: Create directories ===')
    run(ssh, 'mkdir -p /opt/ldws/public/assets /opt/ldws/public/data && echo "dirs created"', 'mkdir')

    # Step 2: Upload files via SFTP
    print('\n=== Step 2: Upload project files ===')
    sftp = ssh.open_sftp()
    for local_path, remote_path in FILES:
        if not os.path.exists(local_path):
            print(f'  [SKIP] {os.path.basename(local_path)} - not found')
            continue
        size = os.path.getsize(local_path)
        sftp.put(local_path, remote_path)
        print(f'  [OK] {remote_path} ({size:,} bytes)')
    sftp.close()

    # Step 3: Ensure data-store.json exists — PRESERVE server data, NEVER overwrite
    print('\n=== Step 3: Ensure data-store.json (preserve existing data) ===')
    sftp = ssh.open_sftp()
    try:
        sftp.stat('/opt/ldws/data-store.json')  # raises IOError if missing
        # Exists -> back it up ON THE SERVER (rolling safety copy), keep it
        run(ssh, 'cp -f /opt/ldws/data-store.json /opt/ldws/data-store.backup.json 2>/dev/null; echo backup_ok',
            'backup data-store on server')
        print('  [SKIP] server data-store.json preserved (users/records/grants kept)')
    except IOError:
        # First deploy -> write clean seed template
        with sftp.open('/opt/ldws/data-store.json', 'w') as f:
            f.write(CLEAN_DATA)
        print('  [OK] created clean data-store.json (first deploy only)')
    sftp.close()

    # Step 4: Write Nginx config
    print('\n=== Step 4: Configure Nginx ===')
    sftp = ssh.open_sftp()
    with sftp.open('/etc/nginx/sites-available/ldws', 'w') as f:
        f.write(NGINX_CONF)
    sftp.close()
    run(ssh, 'ln -sf /etc/nginx/sites-available/ldws /etc/nginx/sites-enabled/ldws && rm -f /etc/nginx/sites-enabled/default && nginx -t 2>&1', 'nginx config test')
    run(ssh, 'systemctl restart nginx && systemctl enable nginx && echo "nginx restarted"', 'restart nginx')

    # Step 5: Start server with PM2
    print('\n=== Step 5: Start server with PM2 ===')
    run(ssh, 'cd /opt/ldws && pm2 delete ldws 2>/dev/null; PORT=3000 pm2 start server.js --name ldws && echo "pm2 started"', 'pm2 start')
    run(ssh, 'pm2 save && echo "pm2 saved"', 'pm2 save')
    run(ssh, 'pm2 list', 'pm2 list')

    # Step 6: Test
    print('\n=== Step 6: Test ===')
    run(ssh, 'sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/auth/cfg', 'API test (localhost:3000)')
    run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/', 'Web test (localhost:80)')
    run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/api/auth/cfg', 'API via Nginx (80)')

    # Check PM2 logs for errors
    print('\n=== PM2 logs (last 10 lines) ===')
    run(ssh, 'pm2 logs ldws --nostream --lines 10 2>&1', 'pm2 logs')

    ssh.close()
    print('\n=== DEPLOYMENT COMPLETE ===')

if __name__ == '__main__':
    main()
