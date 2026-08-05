import paramiko, sys, os, time

HOST = os.environ.get('LDWS_HOST', '43.226.38.94')
PORT = int(os.environ.get('LDWS_PORT', '22'))
USER = os.environ.get('LDWS_USER', 'root')
PASS = os.environ.get('LDWS_PASS', '')
LOCAL_SCRIPT = os.path.join(os.path.dirname(__file__), '_remote_install.sh')

def main():
    if not PASS:
        print('ERROR: LDWS_PASS env not set')
        sys.exit(1)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Connecting to {USER}@{HOST}:{PORT} ...')
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15, allow_agent=False, look_for_keys=False)
    print('Connected!\n')

    # Upload the install script
    print(f'Uploading install script...')
    sftp = ssh.open_sftp()
    sftp.put(LOCAL_SCRIPT, '/tmp/_remote_install.sh')
    sftp.chmod('/tmp/_remote_install.sh', 0o755)
    sftp.close()
    print('Uploaded.\n')

    # Run the script with continuous output reading (prevent buffer deadlock)
    print('Running installation (this may take several minutes)...\n')
    chan = ssh.get_transport().open_session()
    chan.exec_command('bash /tmp/_remote_install.sh 2>&1')

    t0 = time.time()
    timeout = 600  # 10 minutes
    all_output = b''

    while True:
        # Continuously read to prevent buffer deadlock
        if chan.recv_ready():
            data = chan.recv(65536)
            all_output += data
            text = data.decode('utf-8', errors='replace')
            for line in text.split('\n'):
                if line.strip():
                    print(f'  {line}')
        if chan.exit_status_ready():
            # Read any remaining data
            while chan.recv_ready():
                data = chan.recv(65536)
                all_output += data
                text = data.decode('utf-8', errors='replace')
                for line in text.split('\n'):
                    if line.strip():
                        print(f'  {line}')
            break
        elapsed = time.time() - t0
        if elapsed > timeout:
            print(f'\n  [TIMEOUT after {timeout}s]')
            chan.close()
            break
        time.sleep(0.1)

    code = chan.recv_exit_status() if chan.exit_status_ready() else -1
    chan.close()
    elapsed = time.time() - t0
    print(f'\nExit code: {code}  Time: {elapsed:.1f}s')

    # Check if install was successful by checking versions
    print('\n=== Final Verification ===')
    chan2 = ssh.get_transport().open_session()
    chan2.exec_command('echo "Node: $(node -v 2>&1)"; echo "npm: $(npm -v 2>&1)"; echo "PM2: $(pm2 -v 2>&1)"; echo "Nginx: $(nginx -v 2>&1)"')
    while not chan2.exit_status_ready():
        time.sleep(0.3)
    out = chan2.recv(65536).decode('utf-8', errors='replace')
    print(out)
    chan2.close()

    ssh.close()
    print('Done.')

if __name__ == '__main__':
    main()
