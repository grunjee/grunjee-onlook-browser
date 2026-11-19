// Public checkouts omit apps/admin, but Bun 1.3.1 validates its workspace metadata.
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import lock from '../../bun.lock' with { type: 'jsonc' };

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = path.join(root, 'apps/admin/package.json');
const temporary = !existsSync(manifest);
if (temporary) {
  mkdirSync(path.dirname(manifest), { recursive: true });
  writeFileSync(manifest, JSON.stringify({ ...lock.workspaces['apps/admin'], private: true }), { flag: 'wx' });
}
try {
  const result = Bun.spawnSync([process.execPath, 'install', '--frozen-lockfile'], {
    cwd: root, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
  });
  process.exitCode = result.exitCode;
} finally {
  if (temporary) unlinkSync(manifest);
}
