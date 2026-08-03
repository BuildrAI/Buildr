import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PRODUCT_SOURCE_ENTRIES = ['bin', 'src', 'package', 'package.json', 'package-lock.json'];

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
}

export function materializeCleanProductSource(sourceRoot, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of PRODUCT_SOURCE_ENTRIES) {
    const source = path.join(sourceRoot, entry);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(targetRoot, entry), { recursive: true });
  }
  const sourceModules = path.join(sourceRoot, 'node_modules');
  if (fs.existsSync(sourceModules)) fs.symlinkSync(sourceModules, path.join(targetRoot, 'node_modules'), 'dir');
  git(targetRoot, ['init', '--quiet', '--initial-branch=retained']);
  git(targetRoot, ['config', 'user.name', 'Buildr Test']);
  git(targetRoot, ['config', 'user.email', 'buildr-test@example.com']);
  git(targetRoot, ['add', '--', ...PRODUCT_SOURCE_ENTRIES.filter((entry) => fs.existsSync(path.join(targetRoot, entry)))]);
  git(targetRoot, ['commit', '--quiet', '-m', 'materialize clean retained product source']);
  return { root: fs.realpathSync(targetRoot), cli: path.join(fs.realpathSync(targetRoot), 'bin', 'buildr.mjs') };
}
