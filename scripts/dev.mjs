import { spawn } from 'child_process';
import process from 'process';

const isWin = process.platform === 'win32';

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: false
  });

  child.on('exit', (code, signal) => {
    if (signal || code !== 0) {
      process.exitCode = code ?? 1;
      shutdown();
    }
  });

  return child;
}

let shuttingDown = false;
const children = [
  run('api', isWin ? 'node.exe' : 'node', ['server/index.js'], { PORT: '8787' }),
  run('web', isWin ? 'npm.cmd' : 'npm', ['exec', 'vite', '--', '--host', '0.0.0.0', '--port', '3000'])
];

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
