/** Inspect and prune only this service's owned build artifacts; never touches sources, receipts or user state. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { ownedBuildRoot, SOURCE_SDK_RECEIPT } from './prepare-source-sdk.ts';

const root = path.resolve(import.meta.dirname, '..');

export const BUILD_KINDS = ['source-sdk', 'release-sdk', 'dependency-store', 'check-output', 'compile-stage'] as const;
export type BuildKind = (typeof BUILD_KINDS)[number] | 'other';

export function buildKind(name: string): BuildKind {
  if (name === 'dsh-release-sdk-pnpm-store') return 'dependency-store';
  if (name.startsWith('dsh-source-sdk-')) return 'source-sdk';
  if (name.startsWith('dsh-release-sdk-')) return 'release-sdk';
  if (name.startsWith('dsh-plugin-checks-')) return 'check-output';
  if (name.startsWith('dsh-plugin-compile-')) return 'compile-stage';
  return 'other';
}

export type BuildEntry = { name: string; kind: BuildKind; mtimeMs: number };

/** Keep the newest entries per kind (keep 0 removes every owned artifact); unknown names are reported but never removed. */
export function planBuildCleanup(entries: readonly BuildEntry[], keep = 1): { keep: string[]; remove: string[]; unattributed: string[] } {
  if (!Number.isInteger(keep) || keep < 0) throw new Error('keep must be a non-negative integer');
  const kept = new Set<string>(), removed = new Set<string>(), unattributed = new Set<string>();
  for (const kind of BUILD_KINDS) {
    entries.filter(entry => entry.kind === kind)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .forEach((entry, index) => (index < keep ? kept : removed).add(entry.name));
  }
  for (const entry of entries) if (entry.kind === 'other') unattributed.add(entry.name);
  return { keep: [...kept].sort(), remove: [...removed].sort(), unattributed: [...unattributed].sort() };
}

function directorySize(directory: string): number {
  let total = 0;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { pending.push(file); continue; }
      if (!entry.isFile()) continue;
      try { total += fs.lstatSync(file).size; } catch { /* a concurrent removal only lowers the estimate */ }
    }
  }
  return total;
}

function sourceIdentity(directory: string): { upstream: string | null; patchSha256: string | null } | null {
  const receipt = path.join(directory, 'sdk', SOURCE_SDK_RECEIPT);
  if (!fs.existsSync(receipt)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    return { upstream: value?.baseline?.commit ?? null, patchSha256: value?.patchSha256 ?? null };
  } catch {
    return null;
  }
}

export function buildStatus(serviceRoot = root, keep = 1) {
  const buildRoot = ownedBuildRoot(serviceRoot);
  const entries = fs.readdirSync(buildRoot, { withFileTypes: true })
    .filter(entry => entry.name.startsWith('dsh-') && entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => {
      const directory = path.join(buildRoot, entry.name);
      const stat = fs.statSync(directory);
      const kind = buildKind(entry.name);
      return { name: entry.name, kind, path: directory, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString(), sizeBytes: directorySize(directory), identity: kind === 'source-sdk' ? sourceIdentity(directory) : null };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const plan = planBuildCleanup(entries, keep);
  const kept = new Set(plan.keep), removed = new Set(plan.remove);
  return {
    buildRoot,
    keep,
    entries: entries.map(entry => ({ ...entry, disposition: kept.has(entry.name) ? 'keep' : removed.has(entry.name) ? 'prune' : 'unattributed' })),
    totalSizeBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  };
}

export function pruneBuild(serviceRoot = root, keep = 1) {
  const status = buildStatus(serviceRoot, keep);
  const buildRoot = ownedBuildRoot(serviceRoot);
  const effects: { type: 'removed'; name: string; sizeBytes: number }[] = [];
  for (const entry of status.entries.filter(item => item.disposition === 'prune')) {
    const directory = path.join(buildRoot, entry.name);
    if (path.dirname(directory) !== buildRoot || path.basename(directory) !== entry.name || !entry.name.startsWith('dsh-')) throw new Error(`refusing to prune outside the owned build root: ${entry.name}`);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(directory); } catch { continue; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`refusing to prune a non-directory: ${entry.name}`);
    fs.rmSync(directory, { recursive: true });
    effects.push({ type: 'removed', name: entry.name, sizeBytes: entry.sizeBytes });
  }
  return { buildRoot, keep, effects, remaining: status.entries.filter(entry => entry.disposition !== 'prune').map(entry => entry.name) };
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const keepIndex = args.indexOf('--keep');
  const keep = keepIndex >= 0 ? Number(args[keepIndex + 1]) : 1;
  const unknown = args.filter((arg, index) => arg !== '--execute' && arg !== '--keep' && (keepIndex < 0 || index !== keepIndex + 1));
  if (unknown.length) throw new Error(`unknown option ${unknown[0]}`);
  if (command === 'status') console.log(JSON.stringify(buildStatus(root, keep), null, 2));
  else if (command === 'clean') {
    if (!args.includes('--execute')) {
      const preview = buildStatus(root, keep);
      const remove = preview.entries.filter(entry => entry.disposition === 'prune');
      console.log(JSON.stringify({ status: 'preview', keep, buildRoot: preview.buildRoot, reclaimableBytes: remove.reduce((sum, entry) => sum + entry.sizeBytes, 0), remove, hint: 're-run with --execute to remove these directories' }, null, 2));
    } else console.log(JSON.stringify({ status: 'cleaned', ...pruneBuild(root, keep) }, null, 2));
  } else throw new Error('Usage: node tools/sdk-build.ts <status|clean> [--keep <n>] [--execute]');
}
