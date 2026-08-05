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
    # Wait for command to finish
    while True:
        if chan.exit_status_ready():
            break
        time.sleep(0.5)
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

    # Step 1: Stop unattended-upgrades and wait for dpkg lock
    print('=== Step 1: Release dpkg lock ===')
    run(ssh, 'systemctl stop unattended-upgrades 2>/dev/null; killall unattended-upgrades 2>/dev/null; echo done', 'stop unattended-upgrades', 30)
    run(ssh, 'systemctl disable unattended-upgrades 2>/dev/null; echo done', 'disable auto-updates', 15)

    # Wait for lock to be released
    run(ssh, 'i=0; while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do echo "waiting... $i"; sleep 3; i=$((i+1)); if [ $i -ge 20 ]; then echo "TIMEOUT"; break; fi; done; echo "lock released"', 'wait for dpkg lock', 90)
    run(ssh, 'dpkg --configure -a 2>/dev/null; echo done', 'dpkg configure', 60)

    # Step 2: Install Node.js 20 LTS
    print('\n=== Step 2: Install Node.js 20 LTS ===')
    run(ssh, 'apt-get install -y curl', 'install curl', 60)
    run(ssh, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', 'NodeSource setup', 120)
    run(ssh, 'apt-get install -y nodejs', 'install nodejs', 120)

    # Step 3: Install PM2
    print('\n=== Step 3: Install PM2 ===')
    run(ssh, 'npm install -g pm2', 'install pm2', 120)

    # Step 4: Install Nginx
    print('\n=== Step 4: Install Nginx ===')
    run(ssh, 'apt-get install -y nginx', 'install nginx', 120)

    # Verification
    print('\n=== Verification ===')
    run(ssh, 'node -v', 'Node.js version', 10)
    run(ssh, 'npm -v', 'npm version', 10)
    run(ssh, 'pm2 -v', 'PM2 version', 10)
    run(ssh, 'nginx -v 2>&1', 'Nginx version', 10)

    ssh.close()
    print('\nDone.')

if __name__ == '__main__':
    main()
