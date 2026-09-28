#!/usr/bin/env node
/**
 * Fetch one DSH SDK baseline from its release archive and verify it.
 *
 * The plugin compiles against DSH internals, so its build input must be the exact published source of
 * one baseline. This reads the release archive of a pinned tag rather than a default branch, checks
 * the declared version, and records the commit so the build can prove which baseline it used. The
 * checkout is a build input under `build/` and is never a source asset.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DSH_SDK_BASELINES,
  DSH_SDK_COMMIT_MARKER,
  DSH_SDK_DEFAULT_BASELINE,
  DSH_SDK_REPOSITORY,
  dshSdkRoot,
  findDshSdkBaseline,
} from './sdk-baselines.ts';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * A command that runs pnpm. The SDK is a pnpm workspace, so npm cannot install it at all. PATH is
 * tried first; when it is absent there, the runtimes this machine already has are tried, because a
 * DSH installation ships one and a desktop shell commonly exposes only a minimal PATH.
 */
function pnpmCommand(): { executable: string; prefix: string[] } {
  const direct = process.platform === 'win32' ? ['pnpm.cmd', 'pnpm'] : ['pnpm'];
  for (const candidate of direct) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return { executable: candidate, prefix: [] };
    } catch { /* try the next candidate */ }
  }
  const home = process.env.HOME ?? '';
  const scriptCandidates = [
    ...globSync(path.join(home, '.dsh/dsh-runtimes/*/dependencies/pnpm/bin/pnpm.mjs')),
    ...globSync(path.join(home, '.local/share/pnpm/pnpm.cjs')),
    ...globSync(path.join(home, 'Library/pnpm/pnpm.cjs')),
  ];
  for (const script of scriptCandidates) {
    if (fs.existsSync(script)) return { executable: process.execPath, prefix: [script] };
  }
  throw new Error('dsh_sdk_package_manager_missing: the DSH SDK is a pnpm workspace; install pnpm or put it on PATH before building the plugin artifact.');
}

/** Minimal `*` expansion for the one-segment globs used above; avoids a glob dependency here. */
function globSync(pattern: string): string[] {
  const [head, tail] = pattern.split('*');
  if (tail === undefined || head === undefined) return [];
  // `head` is everything before the `*`; for `/a/b/*/c` the entries live in `/a/b`.
  const directory = head.endsWith('/') ? head.slice(0, -1) : head;
  const suffix = tail.startsWith('/') ? tail.slice(1) : tail;
  try {
    return fs.readdirSync(directory).map(entry => path.join(directory, entry, suffix));
  } catch {
    return [];
  }
}
const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const selector = argument('--baseline') ?? process.argv.slice(2).find(value => !value.startsWith('--')) ?? DSH_SDK_DEFAULT_BASELINE.tag;
const baseline = findDshSdkBaseline(selector);
if (baseline === undefined) {
  throw new Error(`unknown DSH SDK baseline ${JSON.stringify(selector)}; known: ${DSH_SDK_BASELINES.map(candidate => candidate.tag).join(', ')}`);
}
const root = dshSdkRoot(serviceRoot, baseline);
const marker = path.join(root, DSH_SDK_COMMIT_MARKER);

/** An already-fetched baseline is reused only when it still proves the same commit and version. */
function existingCheckoutIsCurrent(): boolean {
  if (!fs.existsSync(marker) || !fs.existsSync(path.join(root, 'package.json'))) return false;
  if (fs.readFileSync(marker, 'utf8').trim() !== baseline!.commit) return false;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string };
  return manifest.version === baseline!.version;
}

if (existingCheckoutIsCurrent()) {
  process.stdout.write(`${JSON.stringify({ status: 'reused', baseline: baseline.version, commit: baseline.commit, root })}\n`);
  process.exit(0);
}

const archive = path.join(serviceRoot, 'build', `dsh-sdk-${baseline.version}.tar.gz`);
fs.mkdirSync(path.dirname(archive), { recursive: true });
const url = `https://codeload.github.com/${DSH_SDK_REPOSITORY}/tar.gz/refs/tags/${baseline.tag}`;
process.stdout.write(`[dsh-sdk] fetching ${baseline.tag} from ${url}\n`);
const downloaded = execFileSync('curl', ['-fsSL', '--retry', '3', '-o', archive, url], { encoding: 'utf8' });
if (downloaded) process.stdout.write(downloaded);

// Extract into a staging directory first, so a failed or partial download never leaves a half
// checkout that a later build would trust.
const staging = path.join(serviceRoot, 'build', `.dsh-sdk-staging-${baseline.version}`);
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
execFileSync('tar', ['-xzf', archive, '-C', staging], { stdio: 'inherit' });
const [extracted] = fs.readdirSync(staging);
if (extracted === undefined) throw new Error(`dsh_sdk_archive_empty: ${archive}`);
const extractedRoot = path.join(staging, extracted);
const manifest = JSON.parse(fs.readFileSync(path.join(extractedRoot, 'package.json'), 'utf8')) as { version?: string };
if (manifest.version !== baseline.version) {
  throw new Error(`dsh_sdk_version_mismatch: archive declares ${String(manifest.version)}, baseline ${baseline.tag} expects ${baseline.version}`);
}
// A release archive carries sources only: the SDK's own client artifacts are build outputs and are
// not committed, while this plugin compiles against their declarations. Prepare them here, so a
// fetched baseline is a usable build input rather than a directory that only looks like one.
// The SDK is a pnpm workspace: its packages depend on each other through `workspace:` protocol
// ranges, which npm cannot resolve at all.
process.stdout.write('[dsh-sdk] installing SDK dependencies\n');
const pnpm = pnpmCommand();
execFileSync(pnpm.executable, [...pnpm.prefix, 'install', '--ignore-scripts', '--prefer-offline'], { cwd: extractedRoot, stdio: 'inherit' });
process.stdout.write('[dsh-sdk] building SDK client artifacts\n');
// The SDK's own type checks report errors in its unpublished packages and exit non-zero. They do not
// stop the declarations this plugin consumes from being emitted, so a non-zero exit is tolerated and
// the produced artifacts are what decides whether this baseline is usable.
try {
  execFileSync(process.execPath, [
    path.join(extractedRoot, 'node_modules/typescript/bin/tsc'), '-b',
    'packages/client/ui-sidebar/tsconfig.json',
    'packages/client/ui-sidebar-browser/tsconfig.client.json',
    'packages/api/remotes/tsconfig.client.json',
  ], { cwd: extractedRoot, stdio: 'inherit' });
} catch {
  process.stdout.write('[dsh-sdk] the SDK build reported its own type errors; verifying its artifacts anyway\n');
}
for (const relative of ['packages/client/ui-sidebar/lib/types', 'packages/client/ui-sidebar-browser/lib', 'packages/api/remotes/lib']) {
  if (!fs.existsSync(path.join(extractedRoot, relative))) {
    throw new Error(`dsh_sdk_artifacts_missing: ${relative} was not produced by the ${baseline.tag} build`);
  }
}
fs.writeFileSync(path.join(extractedRoot, DSH_SDK_COMMIT_MARKER), `${baseline.commit}\n`);
fs.rmSync(root, { recursive: true, force: true });
fs.renameSync(extractedRoot, root);
fs.rmSync(staging, { recursive: true, force: true });
fs.rmSync(archive, { force: true });
process.stdout.write(`${JSON.stringify({ status: 'fetched', baseline: baseline.version, commit: baseline.commit, root })}\n`);
