import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { readVerifiedReadonlyBytes } from '../../../infrastructure/filesystem/verified-readonly-file.ts';
import { insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { codeRevision } from './source-control-git-reader.ts';
import type { CodeCommitSnapshot, CodeCommitSnapshotFile } from './code-commit-snapshot.ts';
import type { CodeCommitGuidance } from './code-commit-guidance.ts';

export const CODE_COMMIT_MATERIAL_LIMITS = Object.freeze({ rulesBytes: 2048, rangeBytes: 2048, evidenceBytes: 8192, fileBytes: 1536, files: 8, ruleFileBytes: 64 * 1024, ruleReadBytes: 256 * 1024, ruleFiles: 32 });
export type CodeCommitMaterialCoverage = {
  totalPaths: number; includedPaths: number; omittedPaths: number; totalTextFiles: number;
  evidenceFiles: number; omittedEvidenceFiles: number; ruleSources: number;
  includedRuleSources: number; omittedRuleSources: number; rulesPartial: boolean; evidencePartial: boolean;
};
export type CodeCommitMaterial = { text: string; revision: string; coverage: CodeCommitMaterialCoverage };
export type CodeCommitMaterialReaderDependencies = {
  readRules(root: string): Array<{ id?: string; path?: string; description?: string; enabled?: boolean; required?: boolean; state?: string }>;
};
type RuleExcerpt = { source: string; scope: string; text: string; partial: boolean };
type Evidence = { path: string; format: 'diff' | 'new-content'; text: string; partial: boolean };
export type CodeCommitMaterialObservations = { rules: RuleExcerpt[]; ruleSources: number; ruleFacts: unknown[]; rulesPartial?: boolean; evidence: Evidence[] };
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const hash = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
function prefix(value: string, limit: number): string {
  return bufferPrefix(Buffer.from(value.toWellFormed()), limit);
}
function bufferPrefix(buffer: Buffer, limit: number): string {
  let end = Math.min(buffer.length, Math.max(0, limit));
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString('utf8');
}
function fitText<T extends { text: string; partial: boolean }>(record: T, limit: number): T | null {
  if (bytes(record) <= limit) return record;
  if (bytes({ ...record, text: '', partial: true }) > limit) return null;
  let low = 0, high = Buffer.byteLength(record.text);
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (bytes({ ...record, text: prefix(record.text, middle), partial: true }) <= limit) low = middle; else high = middle - 1; }
  return { ...record, text: prefix(record.text, low), partial: true };
}
const generated = (file: CodeCommitSnapshotFile) => /(?:^|\/)(?:dist|build|web-dist|coverage|node_modules)\/|(?:\.min\.(?:js|css)|\.map|(?:package-lock|yarn|pnpm-lock)\.(?:json|lock|yaml))$/i.test(file.path);
function area(file: CodeCommitSnapshotFile): string {
  const parts = file.path.split('/'), marker = parts.findIndex(part => ['src', 'source', 'test', 'tests', 'prototype', 'docs', 'openspec'].includes(part));
  const length = marker < 0 ? 1 : marker + (['modules', 'features'].includes(parts[marker + 1]) ? 3 : 2);
  return parts.slice(0, Math.min(parts.length - 1, length)).join('/') || '(root)';
}
function priority(file: CodeCommitSnapshotFile): number {
  if (/(?:^|\/)(?:prototype|docs|knowledge|openspec)\//i.test(file.path)) return 3;
  if (/(?:^|\/)(?:test|tests|fixtures)\//i.test(file.path)) return 2;
  if (/(?:^|\/)(?:src|source)\//i.test(file.path)) return /\.(?:css|scss|sass|less)$/i.test(file.path) ? 1 : 0;
  return 1;
}
function balancedFiles(files: CodeCommitSnapshotFile[]): CodeCommitSnapshotFile[] {
  const result: CodeCommitSnapshotFile[] = [];
  for (const rank of [0, 1, 2, 3]) {
    const services = new Map<string, Map<string, CodeCommitSnapshotFile[]>>();
    for (const file of files.filter(file => priority(file) === rank).sort((a, b) => a.path.localeCompare(b.path))) {
      const parts = file.path.split('/'), serviceIndex = parts.indexOf('services'), sourceIndex = parts.findIndex(part => ['src', 'source'].includes(part));
      const service = serviceIndex >= 0 ? parts.slice(0, serviceIndex + 2).join('/') : sourceIndex > 0 ? parts.slice(0, sourceIndex).join('/') : '(repository)';
      if (!services.has(service)) services.set(service, new Map());
      const groups = services.get(service)!, key = area(file); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(file);
    }
    const queues = [...services.values()].map(groups => {
      const queue: CodeCommitSnapshotFile[] = [];
      while ([...groups.values()].some(group => group.length)) for (const group of groups.values()) { const next = group.shift(); if (next) queue.push(next); }
      return queue;
    });
    while (queues.some(queue => queue.length)) for (const queue of queues) { const next = queue.shift(); if (next) result.push(next); }
  }
  return result;
}
export function selectCodeCommitEvidenceFiles(snapshot: CodeCommitSnapshot) {
  const eligible = snapshot.files.filter(file => file.kind === 'text' && !generated(file)), balanced = balancedFiles(eligible);
  const firstTracked = balancedFiles(eligible.filter(file => !file.untracked))[0];
  return [...new Map([balanced[0], firstTracked, ...balanced].filter((file): file is CodeCommitSnapshotFile => Boolean(file)).map(file => [file.path, file])).values()].slice(0, CODE_COMMIT_MATERIAL_LIMITS.files);
}

/** Pure byte-budget projection. Counts describe samples, never an allegedly complete file list. */
export function formatCodeCommitMaterial(snapshot: CodeCommitSnapshot, guidance: CodeCommitGuidance, observed: CodeCommitMaterialObservations, maxBytes: number): CodeCommitMaterial {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 512) throw new Error('Commit material requires a byte budget of at least 512.');
  const byKind = { text: 0, binary: 0, symlink: 0, deleted: 0 };
  for (const file of snapshot.files) byKind[file.kind]++;
  const pathSamples: Array<{ path: string; kind: string; bytes: number; untracked?: boolean }> = [];
  for (const file of balancedFiles(snapshot.files)) {
    const sample = { path: file.path, kind: file.kind, bytes: file.bytes, ...(file.untracked ? { untracked: true } : {}) };
    if (bytes([...pathSamples, sample]) <= CODE_COMMIT_MATERIAL_LIMITS.rangeBytes) pathSamples.push(sample);
  }
  const rules: RuleExcerpt[] = [];
  for (const rule of observed.rules) {
    const share = Math.min(768, Math.floor((CODE_COMMIT_MATERIAL_LIMITS.rulesBytes - 2) / Math.max(1, observed.rules.length)) - 1);
    const fitted = fitText(rule, Math.min(share, CODE_COMMIT_MATERIAL_LIMITS.rulesBytes - bytes(rules) - 1));
    if (fitted?.text && bytes([...rules, fitted]) <= CODE_COMMIT_MATERIAL_LIMITS.rulesBytes) rules.push(fitted);
  }
  const evidence: Evidence[] = [];
  for (const item of observed.evidence.slice(0, CODE_COMMIT_MATERIAL_LIMITS.files)) {
    const share = Math.min(CODE_COMMIT_MATERIAL_LIMITS.fileBytes, Math.floor((CODE_COMMIT_MATERIAL_LIMITS.evidenceBytes - 2) / Math.max(1, Math.min(observed.evidence.length, CODE_COMMIT_MATERIAL_LIMITS.files))) - 1);
    const fitted = fitText(item, Math.min(share, CODE_COMMIT_MATERIAL_LIMITS.evidenceBytes - bytes(evidence) - 1));
    const meaningful = fitted?.format !== 'diff' || /(?:^|\n)[+-](?![+-])\S?|(?:old|new) mode |Binary files /.test(fitted.text);
    if (fitted?.text && meaningful && bytes([...evidence, fitted]) <= CODE_COMMIT_MATERIAL_LIMITS.evidenceBytes) evidence.push(fitted);
  }
  const task = guidance.task ? { taskId: guidance.task.taskId, title: prefix(guidance.task.title, 256), intent: prefix(guidance.task.intent, 384) } : null;
  const coverage: CodeCommitMaterialCoverage = { totalPaths: snapshot.paths.length, includedPaths: 0, omittedPaths: 0, totalTextFiles: byKind.text, evidenceFiles: 0, omittedEvidenceFiles: 0, ruleSources: observed.ruleSources, includedRuleSources: 0, omittedRuleSources: 0, rulesPartial: false, evidencePartial: false };
  const areaCounts = new Map<string, number>(); for (const file of snapshot.files) areaCounts.set(area(file), (areaCounts.get(area(file)) || 0) + 1);
  const areas: Array<{ area: string; paths: number }> = [];
  for (const [name, count] of [...areaCounts].sort(([left], [right]) => left.localeCompare(right))) { const entry = { area: name, paths: count }; if (bytes([...areas, entry]) <= 768) areas.push(entry); }
  const material = { scope: 'all-final-uncommitted-changes', branch: snapshot.branch, task, summary: { totalPaths: snapshot.paths.length, byKind, untrackedPaths: snapshot.files.filter(file => file.untracked).length, totalBytes: snapshot.files.reduce((sum, file) => sum + file.bytes, 0), areas, otherAreaPaths: snapshot.files.length - areas.reduce((sum, item) => sum + item.paths, 0), omittedAreas: areaCounts.size - areas.length }, pathSamples, rules, evidence, coverage };
  while (bytes({ summary: material.summary, pathSamples }) > CODE_COMMIT_MATERIAL_LIMITS.rangeBytes && pathSamples.length) pathSamples.pop();
  const update = () => {
    Object.assign(coverage, { includedPaths: pathSamples.length, omittedPaths: snapshot.paths.length - pathSamples.length, evidenceFiles: evidence.length, omittedEvidenceFiles: byKind.text - evidence.length, includedRuleSources: rules.length, omittedRuleSources: observed.ruleSources - rules.length, rulesPartial: observed.rulesPartial === true || rules.length < observed.ruleSources || rules.some(rule => rule.partial), evidencePartial: evidence.length < byKind.text || evidence.some(item => item.partial) });
    return JSON.stringify(material);
  };
  let text = update();
  while (Buffer.byteLength(text) > maxBytes && (evidence.length || pathSamples.length || rules.length || areas.length)) {
    if (evidence.length) evidence.pop(); else if (pathSamples.length) pathSamples.pop(); else if (areas.length) { const removed = areas.pop()!; material.summary.otherAreaPaths += removed.paths; material.summary.omittedAreas++; } else rules.pop();
    text = update();
  }
  if (Buffer.byteLength(text) > maxBytes && material.task) { material.task.title = ''; material.task.intent = ''; text = update(); }
  if (Buffer.byteLength(text) > maxBytes) { material.branch = null; text = update(); }
  if (Buffer.byteLength(text) > maxBytes) text = JSON.stringify({ scope: material.scope, task: material.task ? { taskId: material.task.taskId } : null, summary: { totalPaths: snapshot.paths.length, byKind }, pathSamples, rules, evidence, coverage });
  if (Buffer.byteLength(text) > maxBytes) throw new Error('Commit material identity exceeds its internal byte budget.');
  return { text, revision: codeRevision([snapshot.revision, guidance.revision, observed.ruleFacts, hash(text)]), coverage: { ...coverage } };
}

const relevant = /提交(?:说明|信息|消息|标题)|commit[ -]?(?:message|subject)|conventional.?commits?|Buildr-Task|BREAKING CHANGE|\bsubject\b|语言|language|中文|英文|\b(?:English|Chinese)\b/i;
/** Retain original normative paragraphs; no inferred language, format or development workflow. */
export function commitRuleExcerpt(text: string): string {
  const paragraphs = text.split(/\n[ \t]*\n/); const selected: string[] = [];
  let selectedSection = 0;
  for (const paragraph of paragraphs) {
    const heading = /^(#{1,6})\s+(.+)/.exec(paragraph);
    if (heading) { if (relevant.test(heading[2])) selectedSection = heading[1].length; else if (heading[1].length <= selectedSection) selectedSection = 0; }
    if (selectedSection || relevant.test(paragraph)) selected.push(paragraph);
  }
  const priority = (paragraph: string) => /(?:默认|使用|遵循|write|respond|reply|output).*(?:中文|英文|English|Chinese)|^#{1,6}\s+.*(?:语言|language)/im.test(paragraph) ? 0 : /提交(?:说明|信息|消息|标题)|commit[ -]?(?:message|subject)|conventional.?commits?|\bsubject\b/i.test(paragraph) ? 1 : 2;
  return selected.map((text, index) => ({ text, index })).sort((left, right) => priority(left.text) - priority(right.text) || left.index - right.index).map(item => item.text).join('\n\n');
}

function gitEnvironment() { return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }; }
/** Git worktree conversion can invoke clean/process filters even with external diffs disabled. */
function readFilterOverrides(snapshot: CodeCommitSnapshot): string[] | null {
  let names: string;
  try { names = execFileSync('git', ['--no-pager', '--no-optional-locks', '-C', snapshot.source.location, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'], { env: gitEnvironment(), encoding: 'utf8', timeout: 1000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (error) { return (error as { status?: number }).status === 1 ? [] : null; }
  const filters = new Set<string>();
  for (const name of names.split('\0').filter(Boolean)) {
    const match = /^(filter\..+)\.(?:clean|process|required)$/i.exec(name);
    if (!match || /[\0\r\n]/.test(name) || filters.size >= 128) return null;
    filters.add(match[1]);
  }
  return [...filters].flatMap(filter => ['-c', filter + '.clean=', '-c', filter + '.process=', '-c', filter + '.required=false']);
}

/** A bounded prefix is enough for a sample. Stop and reap our reader after the byte cap. */
function readPatch(snapshot: CodeCommitSnapshot, file: CodeCommitSnapshotFile, filterOverrides: string[] | null): Promise<Evidence | null> {
  if (!snapshot.head || file.untracked) {
    const lines = (file.content || '').split('\n');
    const start = lines.findIndex(line => line.trim() && !/^\s*(?:import\b|from\b|\/\/|\/\*|\*|<!--|<!doctype|<html\b|<head\b|<meta\b|<link\b)/i.test(line));
    const sample = lines.slice(Math.max(0, start - 2)).join('\n');
    return Promise.resolve({ path: file.path, format: 'new-content', text: prefix(sample, CODE_COMMIT_MATERIAL_LIMITS.fileBytes), partial: Buffer.byteLength(sample) > CODE_COMMIT_MATERIAL_LIMITS.fileBytes || start > 2 });
  }
  if (filterOverrides === null) return Promise.resolve(null);
  return new Promise(resolve => {
    const readLimit = CODE_COMMIT_MATERIAL_LIMITS.fileBytes * 4;
    const child = spawn('git', ['--no-pager', '--literal-pathspecs', '--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.fsmonitor=false', ...filterOverrides, '-C', snapshot.source.location, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=2', snapshot.head!, '--', file.path], { env: gitEnvironment(), stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let length = 0, partial = false, failed = false;
    const timer = setTimeout(() => { partial = true; failed = true; child.kill('SIGKILL'); }, 1000);
    child.stdout.on('data', (chunk: Buffer) => {
      const remaining = readLimit + 1 - length;
      if (remaining > 0) { const kept = chunk.subarray(0, remaining); chunks.push(kept); length += kept.length; }
      if (length > readLimit) { partial = true; child.kill('SIGKILL'); }
    });
    child.once('error', () => { failed = true; });
    child.once('close', code => {
      clearTimeout(timer);
      const raw = bufferPrefix(Buffer.concat(chunks), readLimit), lines = raw.split('\n');
      const behavior = (line: string) => Boolean(line.slice(1).trim()) && !/^\s*(?:import\b|from\b|\/\/|\/\*|\*|[{};,]+\s*$)/.test(line.slice(1));
      let meaningful = lines.findIndex(line => /^\+(?!\+)/.test(line) && behavior(line));
      if (meaningful < 0) meaningful = lines.findIndex(line => /^-(?!-)/.test(line) && behavior(line));
      const hunk = lines.findIndex(line => line.startsWith('@@'));
      let selected = raw;
      if (hunk >= 0 && meaningful > hunk + 8) {
        let actualHunk = hunk; for (let index = hunk; index < meaningful; index++) if (lines[index].startsWith('@@')) actualHunk = index;
        const before = lines.slice(actualHunk + 1, Math.max(actualHunk + 1, meaningful - 2)).filter(line => /^-(?!-)/.test(line) && behavior(line)).slice(0, 2);
        selected = [...lines.slice(0, hunk), lines[actualHunk], ...before, ...lines.slice(Math.max(actualHunk + 1, meaningful - 2))].join('\n'); partial = true;
      }
      if (Buffer.byteLength(selected) > CODE_COMMIT_MATERIAL_LIMITS.fileBytes) partial = true;
      const text = prefix(selected, CODE_COMMIT_MATERIAL_LIMITS.fileBytes);
      resolve(!text || failed || code !== 0 && !partial ? null : { path: file.path, format: 'diff', text, partial });
    });
  });
}

export function createCodeCommitMaterialReader(dependencies: CodeCommitMaterialReaderDependencies) {
  return async (snapshot: CodeCommitSnapshot, guidance: CodeCommitGuidance, maxBytes: number): Promise<CodeCommitMaterial> => {
    const rules: RuleExcerpt[] = [], ruleFacts: unknown[] = [], sources = new Map<string, { root: string; relative: string; scope: string; label: string }>();
    const label = (file: string, scope: CodeCommitGuidance['scopes'][number], index: number) => insideFilesystemPath(snapshot.source.location, file) ? path.relative(snapshot.source.location, file).split(path.sep).join('/') : `[external ${scope.kind} ${index + 1}]/${path.relative(scope.path, file).split(path.sep).join('/')}`;
    for (const [scopeIndex, scope] of guidance.scopes.entries()) {
      const override = path.join(scope.path, 'AGENTS.override.md'), normal = path.join(scope.path, 'AGENTS.md');
      const agents = guidance.ruleEntrypoints.includes(override) ? override : guidance.ruleEntrypoints.includes(normal) ? normal : null;
      if (agents) sources.set(agents, { root: scope.path, relative: path.basename(agents), scope: scope.kind, label: label(agents, scope, scopeIndex) });
      if (!guidance.ruleEntrypoints.includes(path.join(scope.path, 'rules/manifest.yml'))) continue;
      try {
        const selected = dependencies.readRules(scope.path).filter(rule => rule.enabled !== false && !['uninstalled', 'missing'].includes(rule.state || '') && (rule.required === true || relevant.test((rule.description || '') + ' ' + (rule.id || ''))));
        ruleFacts.push({ manifest: scope.path, selected });
        for (const rule of selected) {
          if (typeof rule.path !== 'string' || !rule.path.startsWith('rules/') || rule.path.includes('\\') || rule.path.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(rule.path)) { ruleFacts.push({ invalidRulePath: rule.id }); continue; }
          const file = path.join(scope.path, rule.path); if (!insideFilesystemPath(scope.path, file)) continue;
          sources.set(file, { root: scope.path, relative: rule.path, scope: scope.kind, label: label(file, scope, scopeIndex) });
        }
      } catch { ruleFacts.push({ manifest: scope.path, unavailable: true }); }
    }
    let consumed = 0, readFiles = 0;
    for (const [file, source] of sources) {
      let identity: unknown;
      try {
        const stat = fs.lstatSync(file, { bigint: true });
        identity = { file, dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size), mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs) };
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > BigInt(CODE_COMMIT_MATERIAL_LIMITS.ruleFileBytes) || consumed + Number(stat.size) > CODE_COMMIT_MATERIAL_LIMITS.ruleReadBytes || readFiles >= CODE_COMMIT_MATERIAL_LIMITS.ruleFiles) { ruleFacts.push({ identity, unread: true }); continue; }
        const content = readVerifiedReadonlyBytes(source.root, source.relative, CODE_COMMIT_MATERIAL_LIMITS.ruleFileBytes);
        consumed += content.length; readFiles++;
        const full = new TextDecoder('utf-8', { fatal: true }).decode(content), excerpt = commitRuleExcerpt(full);
        ruleFacts.push({ identity, digest: hash(content) });
        if (excerpt) rules.push({ source: source.label, scope: source.scope, text: excerpt, partial: excerpt !== full });
      } catch { ruleFacts.push({ identity, file, unavailable: true }); }
    }
    const candidates = selectCodeCommitEvidenceFiles(snapshot);
    const filterOverrides = snapshot.head && candidates.some(file => !file.untracked) ? readFilterOverrides(snapshot) : [];
    const observations = await Promise.all(candidates.map(file => readPatch(snapshot, file, filterOverrides)));
    const rulesPartial = ruleFacts.some(fact => fact && typeof fact === 'object' && ('unavailable' in fact || 'invalidRulePath' in fact || 'unread' in fact));
    return formatCodeCommitMaterial(snapshot, guidance, { rules, ruleSources: sources.size, ruleFacts, rulesPartial, evidence: observations.filter((item): item is Evidence => item !== null) }, maxBytes);
  };
}
