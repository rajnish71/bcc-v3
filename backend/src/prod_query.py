import subprocess

cmd = [
    'ssh',
    '-i', 'C:/Users/rkhar/.ssh/BCCAWS.pem',
    '-o', 'StrictHostKeyChecking=no',
    'ubuntu@52.66.167.85',
    'pm2 logs --lines 100 --nostream'
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("STDOUT:")
print(res.stdout)
print("STDERR:")
print(res.stderr)
