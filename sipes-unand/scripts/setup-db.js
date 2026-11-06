import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const composeArgs = ['compose', '--env-file', 'backend/.env'];
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  ['up', '-d', 'db'],
  [
    'run',
    '--build',
    '--rm',
    '--no-deps',
    '-e',
    'NODE_ENV=development',
    'app',
    'sh',
    '-c',
    './node_modules/.bin/prisma migrate deploy && node src/prisma/seed.js',
  ],
];

for (const args of commands) {
  const result = spawnSync(docker, [...composeArgs, ...args], {
    cwd: projectDirectory,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Gagal menjalankan Docker Compose: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
