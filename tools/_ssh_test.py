import paramiko, sys, os

HOST = os.environ.get('LDWS_HOST', '43.226.38.94')
PORT = int(os.environ.get('LDWS_PORT', '22'))
USER = os.environ.get('LDWS_USER', 'root')
PASS = os.environ.get('LDWS_PASS', '')

def run(ssh, cmd, timeout=30):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    return out, err, code

def main():
    if not PASS:
        print('ERROR: LDWS_PASS env not set')
        sys.exit(1)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Connecting to {USER}@{HOST}:{PORT} ...')
    try:
        ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15, allow_agent=False, look_for_keys=False)
        print('SSH connected!')
    except Exception as e:
        print(f'SSH connection FAILED: {e}')
        sys.exit(1)

    cmds = [
        ('OS', 'cat /etc/os-release 2>/dev/null | head -5'),
        ('Kernel', 'uname -a'),
        ('Disk', 'df -h / 2>/dev/null'),
        ('Memory', 'free -h 2>/dev/null || free -m 2>/dev/null'),
        ('Node', 'node -v 2>/dev/null || echo "not installed"'),
        ('Nginx', 'nginx -v 2>&1 || echo "not installed"'),
        ('PM2', 'pm2 -v 2>/dev/null || echo "not installed"'),
        ('CPU cores', 'nproc'),
        ('Public IP check', 'curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "curl failed"'),
    ]
    for label, cmd in cmds:
        out, err, code = run(ssh, cmd)
        print(f'\n--- {label} ---')
        print(out if out else err if err else '(empty)')

    ssh.close()
    print('\nSSH test complete.')

if __name__ == '__main__':
    main()
