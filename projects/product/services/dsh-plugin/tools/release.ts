/** Inspect the independent plugin release or prepare one immutable local candidate. Never publishes. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../../../..');
const servicePath = 'projects/product/services/dsh-plugin';
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const version = metadata.version;
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error(`Invalid plugin version: ${version}`);

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}
function npm(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('npm', args, {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` },
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function registryVersion(): string | null {
  const result = npm(['view', '@buildr-ai/dsh-plugin', 'version', '--json']);
  if (result.status === 0) return String(JSON.parse(result.stdout));
  if (/E404|404 Not Found/.test(result.stderr)) return null;
  throw new Error(`npm registry lookup failed: ${result.stderr.trim()}`);
}

const latestTag = git('tag', '--list', 'dsh-plugin-v*', '--sort=-version:refname').split('\n')[0] || null;
const uncommitted = git('status', '--porcelain', '--', servicePath) !== '';
const changedSinceTag = latestTag === null || git('diff', '--name-only', latestTag, 'HEAD', '--', servicePath) !== '';
const publishedVersion = registryVersion();
const status = {
  package: '@buildr-ai/dsh-plugin', version, latestTag, publishedVersion,
  uncommitted, changedSinceTag,
  releaseState: publishedVersion === null ? 'not-public' : publishedVersion === version && !changedSinceTag && !uncommitted ? 'up-to-date' : 'changes-pending',
};

if (process.argv[2] === 'status') {
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
} else if (process.argv[2] === 'prepare') {
  if (uncommitted) throw new Error('Commit plugin source before preparing a release candidate.');
  if (publishedVersion === version) throw new Error(`Version ${version} is already public; increment the plugin version before preparing changes.`);
  const sdk = resolve(process.argv[3] ?? process.env.BUILDR_DSH_SDK_ROOT ?? join(root, 'build/dsh-0.2.0-rc.1'));
  if (!existsSync(join(sdk, 'package.json'))) throw new Error(`DSH SDK is missing: ${sdk}`);
  const output = join(root, 'build/release-candidates', version);
  if (existsSync(output)) throw new Error(`Release candidate already exists: ${output}`);
  mkdirSync(dirname(output), { recursive: true });
  const stage = mkdtempSync(join(dirname(output), '.candidate-'));
  try {
    execFileSync(process.execPath, [join(root, 'tools/build-plugin.ts'), sdk], { cwd: root, stdio: 'inherit' });
    execFileSync(process.execPath, [join(root, 'tools/verify-plugin.ts'), sdk], { cwd: root, stdio: 'inherit' });
    const packed = npm(['pack', join(root, 'build/dsh-plugin'), '--json', '--pack-destination', stage]);
    if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr.trim()}`);
    const [pack] = JSON.parse(packed.stdout) as Array<{ filename: string; name: string; version: string; files: Array<{ path: string }> }>;
    if (pack.name !== '@buildr-ai/dsh-plugin' || pack.version !== version || pack.files.some(file => /\.(?:ts|tsx|mts)$/.test(file.path) && !file.path.endsWith('.d.ts'))) {
      throw new Error('Packed plugin identity or file inventory is invalid.');
    }
    const tarball = join(output, pack.filename);
    const candidate = {
      package: pack.name, version, sourceCommit: git('rev-parse', 'HEAD'),
      sourceTree: git('rev-parse', `HEAD:${servicePath}`), sdk,
      tarball, sha256: createHash('sha256').update(readFileSync(join(stage, pack.filename))).digest('hex'),
      fileCount: pack.files.length, published: false,
    };
    writeFileSync(join(stage, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
    renameSync(stage, output);
    process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
} else {
  throw new Error('Usage: node tools/release.ts status | prepare [verified-dsh-sdk-dir]');
}
