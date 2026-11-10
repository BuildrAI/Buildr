import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { containsCredentialMaterial } from './release-authority.ts';
import { assertFrozenVerificationRules } from './build-input-policy.ts';

export const LOCAL_PACKAGE_MODEL = 'buildr.local-package/v1';
export const LOCAL_PACKAGE_WORKFLOW = '.github/workflows/verify-package.yml';
export const LOCAL_PACKAGE_DISPATCH_WORKFLOW = '.github/workflows/verify.yml';
export const LOCAL_PACKAGE_HANDOFF_SCHEMA = 'buildr.local-package-handoff/v1';
export const LOCAL_PLATFORM_POLICY = 'buildr.local-required-remote-optional/v1';
export const isCandidateVerificationWorkflow = (value: string): boolean =>
  ['.github/workflows/verify.yml', LOCAL_PACKAGE_WORKFLOW].includes(value?.split('@')[0]);
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 256 * 1024 * 1024;
const sha = (bytes: string | Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = (value: unknown) => `sha256-${sha(JSON.stringify(value))}`;
const exactSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value);
const safeFile = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) && !value.split('/').some(part => !part || part === '.' || part === '..');

export function assertPublicHandoffData(value: unknown): void {
  if (containsCredentialMaterial(value) || /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|https?:\/\/[^/\s:@]+:[^/\s@]+@|\bBearer\s+[A-Za-z0-9._~+/-]{8,})/iu.test(JSON.stringify(value))) {
    throw new Error('Package handoff cannot contain credentials in public data.');
  }
}

/** Execution location is selected once from the real local system, never PATH or a user-agent label. */
export function localPackagePlatform(platform = process.platform): { local: 'macos' | 'windows'; remote: 'macos' | 'windows'; runner: string } {
  if (platform === 'darwin') return { local: 'macos', remote: 'windows', runner: 'windows-2025' };
  if (platform === 'win32') return { local: 'windows', remote: 'macos', runner: 'macos-15' };
  throw new Error(`Local package release supports macOS and Windows, not ${platform}.`);
}

function invokeGit(repo: string, args: string[], options: any = {}): Buffer {
  const result = spawnSync('git', args, { cwd: repo, timeout: 30_000, maxBuffer: MAX_BYTES + 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`Package handoff Git ${args[0]} failed: ${String(result.stderr || result.error?.message || result.status).slice(-2048)}`);
  return Buffer.from(result.stdout);
}

export function validatePackageHandoff(value: any): any {
  assertPublicHandoffData(value);
  const { identity, ...body } = value ?? {};
  if (value?.verificationRules) {
    assertFrozenVerificationRules(value.verificationRules);
    if (value.verificationRules.scopeIdentity !== (value.verificationScope?.identity ?? null)
      || value.verificationRules.platformPolicy !== (value.platformPolicy ?? null)
      || value.verificationRules.kind !== (value.kind === 'plugin' ? 'plugin' : 'buildr')) throw new Error('Frozen verification rules differ from handoff kind, platform or scope.');
  }
  const pluginOnly = value?.kind === 'plugin';
  if (value?.schemaVersion !== LOCAL_PACKAGE_HANDOFF_SCHEMA || identity !== digest(body)
    || value.platformPolicy !== undefined && value.platformPolicy !== LOCAL_PLATFORM_POLICY
    || value.kind !== undefined && !['buildr', 'plugin'].includes(value.kind)
    || !exactSha(value.sourceCommit) || !exactSha(value.sourceTree)
    || !['macos', 'windows'].includes(value.localRunner) || value.remoteRunner !== (value.localRunner === 'macos' ? 'windows' : 'macos')
    || !/^[a-f0-9]{64}$/u.test(value.artifactSha256 ?? '')
    || !Array.isArray(value.files) || value.files.length < (pluginOnly ? 3 : 5) || value.files.length > 128) throw new Error('Invalid local package handoff identity.');
  let total = 0;
  const names = new Set<string>();
  for (const file of value.files) {
    if (!safeFile(file.path) || names.has(file.path) || !Number.isSafeInteger(file.size) || file.size <= 0
      || !/^[a-f0-9]{64}$/u.test(file.sha256 ?? '') || !Array.isArray(file.chunks) || !file.chunks.length) throw new Error('Invalid or duplicate handoff file.');
    names.add(file.path); total += file.size;
    for (const chunk of file.chunks) {
      if (!/^chunks\/[a-f0-9]{64}$/u.test(chunk.name ?? '') || !Number.isSafeInteger(chunk.size)
        || chunk.size <= 0 || chunk.size > CHUNK_BYTES || chunk.name !== `chunks/${chunk.sha256}`) throw new Error('Invalid handoff chunk.');
    }
    if (file.chunks.reduce((sum: number, chunk: any) => sum + chunk.size, 0) !== file.size) throw new Error('Handoff chunk sizes differ.');
  }
  if (pluginOnly) {
    const archives = value.files.filter((file: any) => /^plugin-candidate\/[A-Za-z0-9._-]+\.tgz$/u.test(file.path));
    if (total > MAX_BYTES || value.files.length !== 3 || !names.has('plugin-candidate/candidate.json')
      || !names.has('plugin-candidate/plugin-full-verification.json') || !value.plugin?.plan
      || value.plugin.plan.requirements?.buildr !== false || value.plugin.plan.requirements?.plugin !== true
      || value.plugin.plan.sourceCommit !== value.sourceCommit || value.plugin.plan.sourceTree !== value.sourceTree
      || value.verificationScope !== null || archives.length !== 1 || archives[0].sha256 !== value.artifactSha256) {
      throw new Error('Incomplete independent plugin package handoff.');
    }
    return value;
  }
  if (total > MAX_BYTES || !names.has('candidate-package/release-artifact.json') || !names.has('candidate-package/npm-pack.json')
    || !names.has('source-verification.json') || !names.has('artifact-verification.json')) throw new Error('Incomplete or oversized package handoff.');
  const archives = value.files.filter((file: any) => /^candidate-package\/[A-Za-z0-9._-]+\.tgz$/u.test(file.path));
  if (archives.length !== 1 || archives[0].sha256 !== value.artifactSha256) throw new Error('Package handoff does not bind exactly one original archive.');
  return value;
}

/** Only these explicit ordinary files enter the data ref; no directory sweep, links, credentials or executable code. */
export function createPackageHandoff(options: {
  output: string; sourceCommit: string; sourceTree: string; platform?: NodeJS.Platform;
  artifactSha256: string; files: Array<{ path: string; source: string }>; verificationScope?: any; plugin?: any; kind?: 'buildr' | 'plugin'; platformPolicy?: typeof LOCAL_PLATFORM_POLICY; verificationRules?: any;
}): any {
  const platforms = localPackagePlatform(options.platform);
  if (!exactSha(options.sourceCommit) || !exactSha(options.sourceTree)) throw new Error('Handoff requires exact frozen source.');
  const output = path.resolve(options.output);
  const files = options.files.map(item => {
    if (!safeFile(item.path)) throw new Error('Unsafe handoff path.');
    const stat = fs.lstatSync(item.source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_BYTES) throw new Error('Handoff accepts bounded ordinary files only.');
    const bytes = fs.readFileSync(item.source);
    if (item.path.endsWith('.json')) assertPublicHandoffData(JSON.parse(bytes.toString('utf8')));
    const chunks: any[] = [];
    for (let position = 0; position < bytes.length; position += CHUNK_BYTES) {
      const data = bytes.subarray(position, position + CHUNK_BYTES), hash = sha(data), name = `chunks/${hash}`;
      fs.mkdirSync(path.join(output, 'chunks'), { recursive: true });
      const target = path.join(output, name);
      if (fs.existsSync(target)) {
        if (sha(fs.readFileSync(target)) !== hash) throw new Error('Existing handoff chunk changed.');
      } else fs.writeFileSync(target, data, { flag: 'wx' });
      chunks.push({ name, size: data.length, sha256: hash });
    }
    return { path: item.path, size: bytes.length, sha256: sha(bytes), chunks };
  });
  const body = { schemaVersion: LOCAL_PACKAGE_HANDOFF_SCHEMA, ...(options.kind ? { kind: options.kind } : {}),
    ...(options.platformPolicy ? { platformPolicy: options.platformPolicy } : {}),
    ...(options.verificationRules ? { verificationRules: options.verificationRules } : {}),
    sourceCommit: options.sourceCommit, sourceTree: options.sourceTree,
    localRunner: platforms.local, remoteRunner: platforms.remote, artifactSha256: options.artifactSha256,
    verificationScope: options.verificationScope ?? null, plugin: options.plugin ?? null, files };
  const manifest = validatePackageHandoff({ ...body, identity: digest(body) });
  const target = path.join(output, 'handoff.json'), text = JSON.stringify(manifest) + '\n';
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') !== text) throw new Error('Frozen package handoff cannot be overwritten.');
  fs.mkdirSync(output, { recursive: true });
  if (!fs.existsSync(target)) fs.writeFileSync(target, text, { flag: 'wx' });
  return manifest;
}

/** A separate temporary Git index cannot stage or alter the product checkout. No push occurs here. */
export function createPackageHandoffCommit(repo: string, directory: string): { commit: string; manifest: any } {
  const manifest = validatePackageHandoff(JSON.parse(fs.readFileSync(path.join(directory, 'handoff.json'), 'utf8')));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, 'index') };
  try {
    invokeGit(repo, ['read-tree', '--empty'], { env });
    const files = ['handoff.json', ...new Set<string>(manifest.files.flatMap((file: any) => file.chunks.map((chunk: any) => chunk.name)))];
    for (const file of files) {
      const expected = file === 'handoff.json' ? null : file.slice('chunks/'.length);
      if (expected && sha(fs.readFileSync(path.join(directory, file))) !== expected) throw new Error('Package handoff chunk integrity differs before transport.');
      const hash = invokeGit(repo, ['hash-object', '-w', '--no-filters', '--', path.join(directory, file)], { env }).toString().trim();
      invokeGit(repo, ['update-index', '--add', '--cacheinfo', '100644', hash, file], { env });
    }
    const tree = invokeGit(repo, ['write-tree'], { env }).toString().trim();
    // This is an orphan data object, not a product commit, branch change or merge.
    const commit = invokeGit(repo, ['commit-tree', tree, '-m', `Buildr immutable package handoff ${manifest.identity}`], { env }).toString().trim();
    return { commit, manifest };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

/** Read exact Git objects; never checkout the data ref or execute its files. */
export function restorePackageHandoff(repo: string, commit: string, output: string, expected: {
  sourceCommit: string; sourceTree: string; identity: string; artifactSha256: string; platform?: NodeJS.Platform; preserveOnly?: boolean;
}): any {
  if (!exactSha(commit)) throw new Error('Package handoff requires an exact data commit.');
  const manifestBytes = invokeGit(repo, ['show', `${commit}:handoff.json`]);
  if (manifestBytes.length > 2 * 1024 * 1024) throw new Error('Package handoff manifest exceeds its byte budget.');
  const manifest = validatePackageHandoff(JSON.parse(manifestBytes.toString('utf8')));
  if (expected.preserveOnly && manifest.kind !== 'plugin' && manifest.platformPolicy !== LOCAL_PLATFORM_POLICY) {
    throw new Error('Historical package handoff does not authorize data-only preservation.');
  }
  const actualRunner = expected.preserveOnly ? null : localPackagePlatform(expected.platform).local;
  if (manifest.identity !== expected.identity || manifest.sourceCommit !== expected.sourceCommit || manifest.sourceTree !== expected.sourceTree
    || manifest.artifactSha256 !== expected.artifactSha256 || actualRunner !== null && manifest.remoteRunner !== actualRunner) throw new Error('Package handoff differs from the frozen source, bytes or target platform.');
  const entries = invokeGit(repo, ['ls-tree', '-r', '-z', commit]).toString().split('\0').filter(Boolean);
  const allowed = new Set<string>(['handoff.json', ...manifest.files.flatMap((file: any) => file.chunks.map((chunk: any) => chunk.name))]);
  for (const entry of entries) {
    const match = /^100644 blob [a-f0-9]+\t(.+)$/u.exec(entry);
    if (!match || !allowed.delete(match[1])) throw new Error('Package handoff contains unexpected or non-ordinary Git data.');
  }
  if (allowed.size) throw new Error('Package handoff data is missing.');
  fs.mkdirSync(output, { recursive: true });
  if (fs.readdirSync(output).length) throw new Error('Package handoff destination must be empty.');
  for (const file of manifest.files) {
    const data = Buffer.concat(file.chunks.map((chunk: any) => {
      const bytes = invokeGit(repo, ['show', `${commit}:${chunk.name}`]);
      if (bytes.length !== chunk.size || sha(bytes) !== chunk.sha256) throw new Error('Package handoff chunk integrity differs.');
      return bytes;
    }));
    if (data.length !== file.size || sha(data) !== file.sha256) throw new Error('Package handoff file integrity differs.');
    const target = path.join(output, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(output, 'handoff.json'), JSON.stringify(manifest) + '\n', { flag: 'wx' });
  return manifest;
}

export function assertPublishedPackageData(manifest: any, sourceCommit: string, publishedSha256: string): void {
  validatePackageHandoff(manifest);
  if (manifest.sourceCommit !== sourceCommit || manifest.artifactSha256 !== publishedSha256) {
    throw new Error('Temporary package data is not preserved by the exact published source and npm bytes.');
  }
}
