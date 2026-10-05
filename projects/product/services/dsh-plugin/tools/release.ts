/** Inspect the independent plugin release or prepare one immutable local candidate. Never publishes. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newBuildOutput, validatePreparedSourceSdk } from './prepare-source-sdk.ts';

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
  const result = npm(['view', '@buildr-ai/buildr-dsh-plugin', 'version', '--json']);
  if (result.status === 0) return String(JSON.parse(result.stdout));
  if (/E404|404 Not Found/.test(result.stderr)) return null;
  throw new Error(`npm registry lookup failed: ${result.stderr.trim()}`);
}

/** Parse release inputs before registry, Git release checks, compilation or candidate writes. */
export function parseReleaseInput(args: string[], env: NodeJS.ProcessEnv = process.env): { action: 'status'; sourceSdk?: never } | { action: 'prepare'; sourceSdk: string } {
  if (args[0] === 'status' && args.length === 1) return { action: 'status' };
  if (args[0] !== 'prepare' || ![1, 3].includes(args.length) || (args.length === 3 && (args[1] !== '--source-sdk' || !args[2] || args[2].startsWith('--')))) throw new Error('Usage: node tools/release.ts status | prepare --source-sdk <prepared-sdk>');
  const sdk = args[2] ?? env.BUILDR_DSH_SOURCE_SDK_ROOT;
  if (sdk === undefined || sdk === '') throw new Error('发布准备需要显式 --source-sdk 或 BUILDR_DSH_SOURCE_SDK_ROOT；普通版本、旧 SDK 路径和提交标记不能证明增强接口。');
  return { action: 'prepare', sourceSdk: resolve(sdk) };
}
/** Pass one explicit prepared SDK and one unique bundle to the existing builders and verifier. */
export function releasePrepareCommands(sourceSdk: string, bundle: string): { build: string[]; verify: string[]; pack: string[] } {
  return {
    build: [join(root, 'tools/build-plugin.ts'), '--source-sdk', sourceSdk, '--output', bundle],
    verify: [join(root, 'tools/verify-plugin.ts'), '--source-sdk', sourceSdk, '--bundle', bundle],
    pack: ['pack', bundle, '--json'],
  };
}
function main(): void {
  const request = parseReleaseInput(process.argv.slice(2));
  const sourceReceipt = request.action === 'prepare' ? validatePreparedSourceSdk(request.sourceSdk, root) : undefined;
  const latestTag = git('tag', '--list', 'dsh-plugin-v*', '--sort=-version:refname').split('\n')[0] || null;
  const uncommitted = git('status', '--porcelain', '--', servicePath) !== '';
  const changedSinceTag = latestTag === null || git('diff', '--name-only', latestTag, 'HEAD', '--', servicePath) !== '';
  const publishedVersion = registryVersion();
  const status = {
    package: '@buildr-ai/buildr-dsh-plugin', version, latestTag, publishedVersion,
    uncommitted, changedSinceTag,
    releaseState: publishedVersion === null ? 'not-public' : publishedVersion === version && !changedSinceTag && !uncommitted ? 'up-to-date' : 'changes-pending',
  };

  if (request.action === 'status') {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  } else {
    if (uncommitted) throw new Error('Commit plugin source before preparing a release candidate.');
    if (publishedVersion === version) throw new Error(`Version ${version} is already public; increment the plugin version before preparing changes.`);
    const sdk = request.sourceSdk;
    const output = newBuildOutput(root, join(root, 'build/release-candidates', version));
    mkdirSync(dirname(output), { recursive: true });
    const stage = mkdtempSync(join(dirname(output), '.candidate-'));
    const commands = releasePrepareCommands(sdk, join(stage, 'bundle'));
    execFileSync(process.execPath, commands.build, { cwd: root, stdio: 'inherit' });
    execFileSync(process.execPath, commands.verify, { cwd: root, stdio: 'inherit' });
    const packed = npm([...commands.pack, '--pack-destination', stage]);
    if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr.trim()}`);
    const [pack] = JSON.parse(packed.stdout) as Array<{ filename: string; name: string; version: string; files: Array<{ path: string }> }>;
    if (pack.name !== '@buildr-ai/buildr-dsh-plugin' || pack.version !== version || pack.files.some(file => /\.(?:ts|tsx|mts)$/.test(file.path) && !file.path.endsWith('.d.ts'))) {
      throw new Error('Packed plugin identity or file inventory is invalid.');
    }
    const tarball = join(output, pack.filename);
    const candidate = {
      package: pack.name, version, sourceCommit: git('rev-parse', 'HEAD'),
      sourceTree: git('rev-parse', `HEAD:${servicePath}`), sdk,
      sourceSdk: sourceReceipt === undefined ? undefined : { baseline: sourceReceipt.baseline, manifestSha256: sourceReceipt.sourceManifest.sha256, patchSha256: sourceReceipt.patchSha256, contracts: sourceReceipt.contracts },
      tarball, sha256: createHash('sha256').update(readFileSync(join(stage, pack.filename))).digest('hex'),
      fileCount: pack.files.length, published: false,
    };
    writeFileSync(join(stage, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
    if (realpathSync(stage) !== stage || realpathSync(dirname(output)) !== dirname(output) || dirname(stage) !== dirname(output) || !stage.startsWith(join(dirname(output), '.candidate-')) || existsSync(output)) throw new Error('Release candidate publication paths changed or are not owned.');
    renameSync(stage, output);
    process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
