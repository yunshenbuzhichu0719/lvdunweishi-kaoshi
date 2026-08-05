import paramiko, sys, os, time

HOST = os.environ.get('LDWS_HOST', '43.226.38.94')
PORT = int(os.environ.get('LDWS_PORT', '22'))
USER = os.environ.get('LDWS_USER', 'root')
PASS = os.environ.get('LDWS_PASS', '')

def run(ssh, cmd, label='', timeout=180):
    if label:
        print(f'\n>>> {label}')
    print(f'    $ {cmd[:150]}')
    t0 = time.time()
    chan = ssh.get_transport().open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)
    while True:
        if chan.exit_status_ready():
            break
        time.sleep(0.3)
        if time.time() - t0 > timeout:
            print(f'    [TIMEOUT after {timeout}s]')
            chan.close()
            return -1, '', ''
    out = b''
    err = b''
    while chan.recv_ready():
        out += chan.recv(65536)
    while chan.recv_stderr_ready():
        err += chan.recv_stderr(65536)
    code = chan.recv_exit_status()
    chan.close()
    elapsed = time.time() - t0
    out_s = out.decode('utf-8', errors='replace').strip()
    err_s = err.decode('utf-8', errors='replace').strip()
    if out_s:
        for line in out_s.split('\n')[-10:]:
            print(f'    {line}')
    if err_s:
        for line in err_s.split('\n')[-5:]:
            print(f'    [stderr] {line}')
    status = 'OK' if code == 0 else f'FAIL({code})'
    print(f'    [{status}] {elapsed:.1f}s')
    return code, out_s, err_s

def main():
    if not PASS:
        print('ERROR: LDWS_PASS env not set')
        sys.exit(1)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Connecting to {USER}@{HOST}:{PORT} ...')
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15, allow_agent=False, look_for_keys=False)
    print('Connected!\n')

    # Step 1: Kill ALL apt/dpkg processes and clear locks
    print('=== Step 1: Clear all apt locks ===')
    run(ssh, 'kill -9 $(pgrep -f "apt|dpkg|unattended") 2>/dev/null; echo killed', 'kill all apt procs', 10)
    run(ssh, 'rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock; echo cleaned', 'remove locks', 10)
    run(ssh, 'DEBIAN_FRONTEND=noninteractive dpkg --configure -a 2>&1 | tail -3; echo done', 'dpkg configure', 120)
    run(ssh, 'fuser /var/lib/dpkg/lock-frontend 2>/dev/null && echo "LOCK HELD" || echo "LOCK FREE"', 'check lock', 10)

    # Step 2: apt update
    print('\n=== Step 2: apt update ===')
    run(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get update -y 2>&1 | tail -5', 'apt update', 120)

    # Step 3: Install nodejs + npm from default Ubuntu repos (v18 LTS)
    print('\n=== Step 3: Install Node.js + npm ===')
    run(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm 2>&1 | tail -10', 'install nodejs+npm', 180)

    # Step 4: Install PM2
    print('\n=== Step 4: Install PM2 ===')
    run(ssh, 'npm install -g pm2 2>&1 | tail -5', 'install pm2', 120)

    # Step 5: Install Nginx
    print('\n=== Step 5: Install Nginx ===')
    run(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get install -y nginx 2>&1 | tail -10', 'install nginx', 180)

    # Verification
    print('\n=== Verification ===')
    run(ssh, 'node -v', 'Node.js', 10)
    run(ssh, 'npm -v', 'npm', 10)
    run(ssh, 'pm2 -v', 'PM2', 10)
    run(ssh, 'nginx -v 2>&1', 'Nginx', 10)

    ssh.close()
    print('\nDone.')

if __name__ == '__main__':
    main()
