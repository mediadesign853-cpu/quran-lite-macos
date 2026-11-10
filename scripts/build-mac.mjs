import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform !== 'darwin') {
  console.error('macOS DMG/ZIP packages must be built on a Mac. Run this command from Terminal on macOS.');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build']);
run('npm', ['run', 'prepare:electron']);
run('npx', ['electron-builder', '--config', 'electron-builder.mac.yml', '--mac']);
