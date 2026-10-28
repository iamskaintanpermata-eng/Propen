import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(root, 'backend'),
  stdio: 'inherit',
});
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
  cwd: path.join(root, 'frontend'),
  stdio: 'inherit',
});
const processes = [backend, frontend];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error('Gagal menjalankan layanan SIPES:', error.message);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const name = child === backend ? 'Backend' : 'Frontend';
    console.error(`${name} berhenti${signal ? ` (${signal})` : ` dengan kode ${code}`}.`);
    shutdown(code || 1);
  });
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

console.log('SIPES UNAND: http://localhost:5173');
console.log('API backend: http://localhost:5000/api/health');
