import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PRODUCT_SOURCE_ENTRIES = ['bin', 'src', 'resources', 'web-dist', 'tools', 'package', 'docs', 'package.json', 'package-lock.json'];

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout;
}

function sourceExecutablePaths(sourceRoot) {
  const output = spawnSync('git', ['-C', sourceRoot, 'ls-files', '--stage', '-z', '--', ...PRODUCT_SOURCE_ENTRIES], { encoding: 'buffer' });
  if (output.status !== 0) return [];
  return output.stdout.toString('utf8').split('\0').filter(Boolean).flatMap((record) => {
    const match = /^(\d{6}) [0-9a-f]+ \d\t([\s\S]+)$/u.exec(record);
    return match?.[1] === '100755' ? [match[2]] : [];
  });
}

export function materializeCleanProductSource(sourceRoot, targetRoot) {
  const executablePaths = sourceExecutablePaths(sourceRoot);
  const repositoryRoot = path.resolve(targetRoot);
  const productRoot = path.join(repositoryRoot, 'projects', 'product', 'services', 'buildr');
  const gitProductRoot = 'projects/product/services/buildr';
  fs.mkdirSync(productRoot, { recursive: true });
  for (const entry of PRODUCT_SOURCE_ENTRIES) {
    const source = path.join(sourceRoot, entry);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(productRoot, entry), { recursive: true });
  }
  const sourceModules = path.join(sourceRoot, 'node_modules');
  if (fs.existsSync(sourceModules)) fs.symlinkSync(sourceModules, path.join(productRoot, 'node_modules'), 'dir');
  git(repositoryRoot, ['init', '--quiet', '--initial-branch=retained']);
  git(repositoryRoot, ['config', 'user.name', 'Buildr Test']);
  git(repositoryRoot, ['config', 'user.email', 'buildr-test@example.com']);
  const trackedEntries = PRODUCT_SOURCE_ENTRIES
    .filter((entry) => fs.existsSync(path.join(productRoot, entry)))
    .map((entry) => `${gitProductRoot}/${entry}`);
  git(repositoryRoot, ['add', '--', ...trackedEntries]);
  for (const file of executablePaths) git(repositoryRoot, ['update-index', '--chmod=+x', '--', `${gitProductRoot}/${file}`]);
  git(repositoryRoot, ['commit', '--quiet', '-m', 'materialize clean retained product source']);
  fs.appendFileSync(path.join(repositoryRoot, '.git', 'info', 'exclude'), `/${gitProductRoot}/node_modules\n`);
  const root = fs.realpathSync(productRoot);
  return { root, cli: path.join(root, 'bin', 'buildr.mjs') };
}
