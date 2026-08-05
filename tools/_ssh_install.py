import paramiko, sys, os, time

HOST = os.environ.get('LDWS_HOST', '43.226.38.94')
PORT = int(os.environ.get('LDWS_PORT', '22'))
USER = os.environ.get('LDWS_USER', 'root')
PASS = os.environ.get('LDWS_PASS', '')

def run(ssh, cmd, label='', timeout=120):
    if label:
        print(f'\n>>> {label}')
    print(f'    $ {cmd[:120]}')
    t0 = time.time()
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    elapsed = time.time() - t0
    if out:
        for line in out.split('\n')[-8:]:
            print(f'    {line}')
    if err:
        for line in err.split('\n')[-5:]:
            print(f'    [stderr] {line}')
    status = 'OK' if code == 0 else f'FAIL({code})'
    print(f'    [{status}] {elapsed:.1f}s')
    return code, out, err

def main():
    if not PASS:
        print('ERROR: LDWS_PASS env not set')
        sys.exit(1)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Connecting to {USER}@{HOST}:{PORT} ...')
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15, allow_agent=False, look_for_keys=False)
    print('Connected!\n')

    steps = [
        ('apt update', 'apt-get update -y', 120),
        ('install curl', 'apt-get install -y curl', 60),
        ('NodeSource setup 20.x', 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', 120),
        ('install nodejs', 'apt-get install -y nodejs', 120),
        ('install nginx', 'apt-get install -y nginx', 120),
        ('install pm2 global', 'npm install -g pm2', 120),
        ('open firewall 80', 'ufw allow 80/tcp 2>/dev/null || true', 10),
        ('open firewall 443', 'ufw allow 443/tcp 2>/dev/null || true', 10),
        ('open firewall 22', 'ufw allow 22/tcp 2>/dev/null || true', 10),
    ]

    results = []
    for label, cmd, timeout in steps:
        code, out, err = run(ssh, cmd, label, timeout)
        results.append((label, code))
        if code != 0 and 'firewall' not in label:
            print(f'\n*** STEP FAILED: {label} ***')
            # Continue anyway for non-critical steps

    print('\n=== Verification ===')
    for cmd, label in [
        ('node -v', 'Node.js'),
        ('npm -v', 'npm'),
        ('pm2 -v', 'PM2'),
        ('nginx -v 2>&1', 'Nginx'),
    ]:
        code, out, err = run(ssh, cmd, label, 10)

    ssh.close()

    print('\n=== Summary ===')
    for label, code in results:
        mark = 'OK' if code == 0 else 'FAIL'
        print(f'  [{mark}] {label}')

if __name__ == '__main__':
    main()
