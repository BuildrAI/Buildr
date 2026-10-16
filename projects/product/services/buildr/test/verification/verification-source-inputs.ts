import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scopedVerificationInputs } from './verification-inputs.ts';
import type { VerificationReuseScope, VerificationReuseStep, ReuseDigest } from './verification-reuse.ts';

type Entry = string[];
type Source = { entries: Entry[]; unavailable: Set<string>; readText: (file: string) => string };
const digest = (value: unknown): ReuseDigest => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const bytesDigest = (value: Buffer) => crypto.createHash('sha256').update(value).digest('hex');

function workingSource(repositoryRoot: string): Source {
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }).split('\0').filter(Boolean))].sort();
  const unavailable = new Set<string>();
  const entries = files.map(file => {
    const absolute = path.join(repositoryRoot, file), stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return [file, 'absent'];
    if (stat.isSymbolicLink()) {
      try {
        const target = fs.realpathSync(absolute), relative = path.relative(repositoryRoot, target);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(target).isFile()) unavailable.add(file);
        return [file, 'link', fs.readlinkSync(absolute), unavailable.has(file) ? 'unknown-target' : bytesDigest(fs.readFileSync(target))];
      } catch { unavailable.add(file); return [file, 'link', 'unknown-target']; }
    }
    return stat.isFile() ? [file, stat.mode & 0o111 ? 'executable' : 'file', bytesDigest(fs.readFileSync(absolute))] : [file, 'other'];
  });
  return { entries, unavailable, readText: file => fs.readFileSync(path.join(repositoryRoot, file), 'utf8') };
}

/** Read immutable Git objects without checkout, index changes, or executing old code. */
function committedSource(repositoryRoot: string, commit: string): Source {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(commit)) throw new Error('Expected an exact source commit.');
  const inventory = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', commit], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\0').filter(Boolean).map(line => {
    const tab = line.indexOf('\t'), [mode, kind, object] = line.slice(0, tab).split(' ');
    if (tab < 0 || !mode || !kind || !object) throw new Error('Invalid Git source inventory.');
    return { file: line.slice(tab + 1), mode, kind, object };
  }).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  const objects = [...new Set(inventory.filter(item => item.kind === 'blob').map(item => item.object))];
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repositoryRoot, input: objects.join('\n') + '\n', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const blobs = new Map<string, Buffer>();
  let offset = 0;
  for (const object of objects) {
    const end = output.indexOf(10, offset), header = output.subarray(offset, end).toString().split(' '), size = Number(header[2]);
    if (end < offset || header[0] !== object || header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end + size + 1 >= output.length) throw new Error('Invalid Git blob stream.');
    blobs.set(object, output.subarray(end + 1, end + 1 + size)); offset = end + size + 2;
  }
  const files = new Map(inventory.map(item => [item.file, item]));
  const resolve = (file: string, visited = new Set<string>()): Buffer => {
    const entry = files.get(file);
    if (!entry || visited.has(file) || entry.kind !== 'blob') throw new Error('Unavailable source file.');
    const content = blobs.get(entry.object)!;
    if (entry.mode !== '120000') return content;
    visited.add(file);
    const target = content.toString();
    if (path.posix.isAbsolute(target)) throw new Error('External source link.');
    return resolve(path.posix.normalize(path.posix.join(path.posix.dirname(file), target)), visited);
  };
  const unavailable = new Set<string>();
  const entries = inventory.map(item => {
    if (item.kind !== 'blob') { unavailable.add(item.file); return [item.file, 'other']; }
    if (item.mode === '120000') {
      try { return [item.file, 'link', blobs.get(item.object)!.toString(), bytesDigest(resolve(item.file))]; }
      catch { unavailable.add(item.file); return [item.file, 'link', 'unknown-target']; }
    }
    return [item.file, item.mode === '100755' ? 'executable' : 'file', bytesDigest(blobs.get(item.object)!)];
  });
  return { entries, unavailable, readText: file => resolve(file).toString('utf8') };
}

export function collectVerificationSourceInputs(repositoryRoot: string, productRoot: string, steps: VerificationReuseStep[], commit?: string) {
  const source = commit ? committedSource(repositoryRoot, commit) : workingSource(repositoryRoot);
  const prefix = 'projects/product/services/', backend = `${prefix}buildr/`, web = `${prefix}buildr-web/`, plugin = `${prefix}dsh-plugin/`;
  const common = (file: string) => ['projects/product/.node-version', 'projects/product/buildr', 'projects/product/preparation.yml', 'projects/product/verification.yml'].includes(file);
  const inBackend = (file: string) => file.startsWith(backend) || common(file);
  const selected: Record<VerificationReuseScope, Entry[]> = {
    backend: source.entries.filter(([file]) => inBackend(file!)),
    web: source.entries.filter(([file]) => inBackend(file!) || file!.startsWith(web)),
    plugin: source.entries.filter(([file]) => inBackend(file!) || file!.startsWith(web) || file!.startsWith(plugin) || file!.startsWith('.github/')),
    product: source.entries.filter(([file]) => file!.startsWith('projects/product/') || file === 'CHANGELOG.md' || file!.startsWith('.github/')),
    repository: source.entries,
    runtime: source.entries.filter(([file]) => !['knowledge', 'openspec', 'tasks'].some(directory => file!.startsWith(`projects/product/${directory}/`))),
  };
  const inputs = (step: VerificationReuseStep, proof: boolean) => {
    const scope = step.reuse && step.reuse.scope;
    if (!scope) throw new Error('Expected a reusable source check.');
    const value = scopedVerificationInputs(selected[scope], repositoryRoot, productRoot, step, { proof, readText: source.readText });
    return { contentIdentity: digest(value.content), recipeIdentity: digest(value.recipe), fallback: value.fallback, unresolved: value.unresolved,
      unavailable: [...value.content, ...value.recipe].some(([file]) => source.unavailable.has(file!)) };
  };
  return {
    contentIdentities: Object.fromEntries(Object.entries(selected).map(([scope, entries]) => [scope, digest(entries)])) as Record<VerificationReuseScope, ReuseDigest>,
    unavailableScopes: Object.entries(selected).filter(([, entries]) => entries.some(([file]) => source.unavailable.has(file!))).map(([scope]) => scope as VerificationReuseScope),
    stepInputs: Object.fromEntries(steps.filter(step => step.reuse && step.reuse.inputMode === 'runtime-check').map(step => [step.id, inputs(step, false)])),
    proofInputs: Object.fromEntries(steps.filter(step => step.reuse).map(step => [step.id, { ...inputs(step, true),
      selectionIdentity: digest({ executor: step.executor, scope: step.reuse && step.reuse.scope }) }])),
  };
}
