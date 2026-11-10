import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import { createOwnedArtifactStaging, inventoryGeneratedArtifact } from './generated-artifacts.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const webRoot = path.resolve(serviceRoot, '../buildr-web');

export function inspectLocalWebToolchain(root = webRoot): {
  status: 'ready' | 'blocked';
  root: string;
  tools: { typescript: string | null; vite: string | null };
  missing: string[];
} {
  const executable = (name: string): string | null => {
    const base = path.join(root, 'node_modules', '.bin', name);
    const candidates = process.platform === 'win32' ? [`${base}.cmd`, base] : [base];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  };
  const tools = { typescript: executable('tsc'), vite: executable('vite') };
  const missing = Object.entries(tools).filter(([, value]) => !value).map(([name]) => name);
  return { status: missing.length ? 'blocked' : 'ready', root, tools, missing };
}

/** An exact Node copy may ship without npm; the host installation still provides one. */
function npmCliOnPath(env: NodeJS.ProcessEnv, platform: string): string | undefined {
  const name = platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const entry of String(env.PATH ?? '').split(path.delimiter)) {
    if (!entry) continue;
    try {
      const resolved = fs.realpathSync(path.join(entry, name));
      if (resolved.endsWith('npm-cli.js') && fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) return resolved;
    } catch { /* keep looking */ }
  }
  return undefined;
}

export function resolveAdjacentNpmCli(
  nodeExecutable = process.execPath,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string {
  const nodeRoot = path.dirname(nodeExecutable);
  const candidates = [
    env.npm_execpath,
    ...(platform === 'win32'
      ? [
          path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
          path.resolve(nodeRoot, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        ]
      : [
          path.resolve(nodeRoot, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
          path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        ]),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const fromPath = npmCliOnPath(env, platform);
  if (fromPath) candidates.push(fromPath);
  const npmCli = candidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
  if (!npmCli) {
    throw Object.assign(new Error(`Exact Node does not provide an npm CLI: ${candidates.join(', ')}`), { code: 'web_dist_npm_missing' });
  }
  return npmCli;
}

const assetInventoryName = '.buildr-web-dist-assets.json';
const immutableAsset = /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+(?:\.(?:br|gz))?$/;

function distError(message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code: 'web_dist_inventory_invalid', details });
}

/** Validate the actual production entry and its local references, not a stale dist. */
export function validateWebDist(root: string): string[] {
  const files = inventoryGeneratedArtifact(root);
  const names = new Set(files.map(file => file.path));
  for (const file of files.filter(file => /\.(?:br|gz)$/.test(file.path))) {
    const original = file.path.replace(/\.(?:br|gz)$/, '');
    if (!names.has(original)) throw distError('Compressed Web asset has no original representation.', { file: file.path });
    const expected = fs.readFileSync(path.join(root, original));
    let actual: Buffer;
    try {
      const decode = file.path.endsWith('.br') ? brotliDecompressSync : gunzipSync;
      actual = decode(fs.readFileSync(path.join(root, file.path)), { maxOutputLength: expected.length + 1 });
    } catch { throw distError('Compressed Web asset is invalid.', { file: file.path }); }
    if (!actual.equals(expected)) throw distError('Compressed Web asset differs from its final original bytes.', { file: file.path });
  }
  if (!names.has('index.html')) throw distError('Buildr Web staging dist is missing index.html.');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  if (!/<[a-z][^>]*\sid\s*=\s*["']root["']/i.test(html)) throw distError('Buildr Web staging entry is missing its root mount.');
  const references: string[] = [];
  let moduleCount = 0;
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(match => [match[1].toLowerCase(), match[2] ?? match[3]]));
    const script = /^<script\b/i.test(tag) && attrs.type?.toLowerCase() === 'module';
    const link = /^<link\b/i.test(tag) && /(?:^|\s)(?:stylesheet|modulepreload)(?:\s|$)/i.test(attrs.rel ?? '');
    if (!script && !link) continue;
    const value = script ? attrs.src : attrs.href;
    if (!value) throw distError('Buildr Web staging entry contains a resource without a URL.');
    const url = new URL(value, 'http://buildr.invalid/');
    const name = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (url.origin !== 'http://buildr.invalid' || !name || name.split('/').some(part => part === '..') || !names.has(name)) {
      throw distError('Buildr Web staging entry references a missing or nonlocal resource.');
    }
    if (!/\.(?:m?js|css)$/i.test(name)) throw distError('Buildr Web staging entry references a resource with an invalid type.');
    if (script) moduleCount++;
    references.push(name);
  }
  if (!moduleCount || !references.some(name => name.endsWith('.js')) || !references.some(name => name.endsWith('.css'))) {
    throw distError('Buildr Web staging entry must reference its module and stylesheet.');
  }
  return files.filter(file => immutableAsset.test(file.path)).map(file => file.path);
}

/** Retain only the preceding build's native hashes, not an unbounded history. */
function retainPreviousAssets(target: string, candidate: string, nativeAssets: string[]): void {
  const previous = fs.lstatSync(target, { throwIfNoEntry: false });
  if (previous) {
    if (!previous.isDirectory() || previous.isSymbolicLink()) throw distError('Buildr Web output must be a real directory.');
    const files = inventoryGeneratedArtifact(target);
    const available = new Set(files.filter(file => immutableAsset.test(file.path)).map(file => file.path));
    let retained = [...available];
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(target, assetInventoryName), 'utf8'));
      if (manifest.schemaVersion === 'buildr.web-dist-assets/v1' && Array.isArray(manifest.files)
        && manifest.files.every((name: unknown) => typeof name === 'string' && available.has(name))) {
        retained = manifest.files;
      }
    } catch { /* Old builds lack the rebuildable inventory; use their actual safe files. */ }
    for (const name of retained) {
      const destination = path.join(candidate, name);
      if (fs.existsSync(destination)) continue; // Never replace a new artifact with an old hash.
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(target, name), destination, fs.constants.COPYFILE_EXCL);
    }
  }
  fs.writeFileSync(path.join(candidate, assetInventoryName), `${JSON.stringify({ schemaVersion: 'buildr.web-dist-assets/v1', files: nativeAssets })}\n`);
}

type BuildExecution = (executable: string, args: string[], options: { cwd: string; encoding: 'utf8'; env: NodeJS.ProcessEnv }) => {
  status: number | null; error?: Error; stdout?: string; stderr?: string; signal?: NodeJS.Signals | null;
};

/** File descriptors keep verbose successful builds independent of maxBuffer. */
function executeWebBuild(executable: string, args: string[], options: Parameters<BuildExecution>[2]): ReturnType<BuildExecution> {
  const candidate = path.resolve(args[args.length - 1]);
  const captureRoot = path.dirname(candidate);
  const stdoutFile = path.join(captureRoot, 'stdout.log');
  const stderrFile = path.join(captureRoot, 'stderr.log');
  const stdout = fs.openSync(stdoutFile, 'wx', 0o600);
  let stderr: number | undefined;
  try {
    stderr = fs.openSync(stderrFile, 'wx', 0o600);
    const result = spawnSync(executable, args, { ...options, stdio: ['ignore', stdout, stderr] });
    return { status: result.status, error: result.error, signal: result.signal,
      stdout: fs.readFileSync(stdoutFile, 'utf8'), stderr: fs.readFileSync(stderrFile, 'utf8') };
  } finally {
    fs.closeSync(stdout);
    if (stderr !== undefined) fs.closeSync(stderr);
  }
}

/** Compile away from the live directory; only publish a complete, verified tree. */
export function buildWebDist(outputRoot: string, root = webRoot, {
  execute = executeWebBuild,
  resolveNpm = resolveAdjacentNpmCli,
  rename = fs.renameSync,
}: { execute?: BuildExecution; resolveNpm?: () => string; rename?: (source: string, destination: string) => void } = {}): string {
  const requestedTarget = path.resolve(outputRoot);
  const parent = path.dirname(requestedTarget);
  const target = fs.existsSync(parent) ? path.join(fs.realpathSync(parent), path.basename(requestedTarget)) : requestedTarget;
  const [service, frontend] = [serviceRoot, root].map(source => fs.existsSync(source) ? fs.realpathSync(source) : path.resolve(source));
  const inside = (child: string, parent: string) => child === parent || child.startsWith(`${parent}${path.sep}`);
  const generatedRoots = [path.join(service, 'build'), path.join(service, 'web-dist')];
  if (target === path.dirname(target) || inside(service, target) || inside(frontend, target)
    || inside(target, frontend) || (inside(target, service) && !generatedRoots.some(generated => inside(target, generated)))) {
    throw distError('Refusing to replace a source directory with generated Web output.');
  }
  const toolchain = inspectLocalWebToolchain(root);
  if (toolchain.status !== 'ready') {
    throw Object.assign(new Error(`Buildr Web local toolchain is not current: ${toolchain.missing.join(', ')}; restore the declared buildr-web preparation recipe before building.`), {
      code: 'web_dist_local_toolchain_missing', details: toolchain,
    });
  }
  // Resolve every prerequisite before touching the live output.
  const npmCli = resolveNpm();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const owned = createOwnedArtifactStaging(path.dirname(target), '.buildr-web-dist-');
  const candidate = path.join(owned.root, 'candidate');
  const backup = path.join(owned.root, 'previous');
  let preserveBackup = false;
  try {
    const args = [npmCli, '--prefix', root, 'run', 'build', '--', '--outDir', candidate];
    const result = execute(process.execPath, args, { cwd: serviceRoot, encoding: 'utf8', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw Object.assign(new Error(`Buildr Web staging build failed with exit code ${result.status ?? 'unknown'}: ${(result.stderr || result.stdout || '').trim()}`), {
        code: 'web_dist_build_failed', details: { exitCode: result.status, signal: result.signal ?? null },
      });
    }
    const nativeAssets = validateWebDist(candidate);
    retainPreviousAssets(target, candidate, nativeAssets);
    // This is a short two-rename publish, not a claim of zero-downtime atomicity.
    const hadPrevious = fs.existsSync(target);
    if (hadPrevious) rename(target, backup);
    try {
      rename(candidate, target);
    } catch (error) {
      if (hadPrevious) {
        try { rename(backup, target); }
        catch (recoveryError) {
          preserveBackup = true;
          throw Object.assign(new Error('Buildr Web publication and restoration failed; the previous output is preserved.'), {
            code: 'web_dist_restore_failed', cause: error,
            details: { backupRoot: backup, recoveryError: String(recoveryError) },
          });
        }
      }
      throw Object.assign(new Error('Buildr Web publication failed; the previous output was preserved.'), { code: 'web_dist_publish_failed', cause: error });
    }
    return target;
  } finally {
    // Never delete the only recoverable tree after a failed restoration.
    if (!preserveBackup) owned.cleanup();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const index = process.argv.indexOf('--output');
  const output = index < 0 ? path.join(serviceRoot, 'web-dist') : process.argv[index + 1];
  if (!output || output.startsWith('--')) throw new Error('--output requires a directory.');
  process.stdout.write(`${JSON.stringify({ status: 'passed', root: buildWebDist(output) })}\n`);
}
