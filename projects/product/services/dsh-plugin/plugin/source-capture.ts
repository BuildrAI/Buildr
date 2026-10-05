/** Resolve provenance at the actual producer boundary. Never called by a viewer or for old events. */
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import type { EventSourceCaptureRequest, EventSourceHint } from '@deepseek-ai/dsh-tools';
import { objectRecord } from './bridge.ts';
import type { Binding, BuildrChannel } from './process.ts';
import { fileDigest } from './process.ts';
import { inspectSourceInstallation, queryAssetSources } from './source-process.ts';
import type { SourceCommandInstallation, SourceProcessDependencies } from './source-process.ts';
import { describeBoundSourceCommand, simpleCommandWords } from './src/source-command.ts';
import { parseEventSources } from './src/event-sources.ts';
import type { EventSources, EventSourceContentRef, EventSourceMatch, SourceObject, SourceParticipationTarget } from './src/source-types.ts';

export interface CaptureDependencies {
  resolveBinding(): Promise<Readonly<Binding> | null>;
  /** Command identity is independent of the optional candidate metadata reader. */
  resolveCommandBindings?(): Promise<readonly Readonly<Binding>[]>;
  channel: BuildrChannel;
  signal?: AbortSignal;
  processDependencies?: SourceProcessDependencies;
  querySources?: typeof queryAssetSources;
  inspectInstallation?: typeof inspectSourceInstallation;
  digestFile?: typeof fileDigest;
}
const unknown = (code: string): EventSources => ({ schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [], diagnostics: [{ code }] });
const notApplicable = (): EventSources => ({ schemaVersion: 'dsh.event-sources/v1', status: 'not-applicable', matches: [] });
const validDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Preserve independent providers without requiring a new global Tools module export at runtime. */
export function mergeCapturedSources(local: EventSources, other: unknown): EventSources {
  const parsed = parseEventSources(other);
  if (!parsed || (parsed.status === 'unknown' && parsed.diagnostics?.length === 1
    && parsed.diagnostics[0]?.code === 'capture-provider-unavailable')) return local;
  const matches = [...new Map([...local.matches, ...parsed.matches].map(match => [JSON.stringify(match), match])).values()];
  const diagnostics = [...new Set([...(local.diagnostics ?? []), ...(parsed.diagnostics ?? [])].map(item => item.code))].map(code => ({ code }));
  return parseEventSources({ schemaVersion: 'dsh.event-sources/v1',
    status: matches.length ? 'confirmed' : local.status === 'unknown' || parsed.status === 'unknown' ? 'unknown' : 'not-applicable', matches,
    ...(local.mixed || parsed.mixed || new Set(matches.map(match => match.providedBy)).size > 1 ? { mixed: true } : {}),
    ...(diagnostics.length ? { diagnostics } : {}) }) ?? unknown('capture-metadata-limit');
}
function cwdOf(request: EventSourceCaptureRequest): string | undefined {
  const header = objectRecord(objectRecord(request.agent?.session).header);
  const value = request.hint.command?.cwd ?? header.cwd;
  return typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0') ? path.resolve(value) : undefined;
}
function commandTargets(args: readonly string[]): SourceParticipationTarget[] {
  if (args[0] !== 'task') return [];
  const taskTarget = (id: string | undefined): SourceParticipationTarget[] => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,255}$/.test(id) ? [{ kind: 'task', id }] : [];
  const materials = args[1] === 'materials' && ['inspect', 'record', 'write'].includes(args[2] ?? '');
  if (!materials && args[1] !== 'inspect') {
    const offset = ['materials', 'review', 'verification', 'work-context'].includes(args[1] ?? '') ? 3 : 2;
    return taskTarget(args[offset]);
  }
  // These are literal CLI parameters, not material content or a manifest's members.
  const allowed = new Set(['--target', '--json', ...(materials && args[2] === 'write' ? ['--path', '--content', '--expected-document']
    : materials && args[2] === 'record' ? ['--materials', '--expected-current'] : [])]);
  const values = new Map<string, string | true>();
  let id: string | undefined;
  for (let index = materials ? 3 : 2; index < args.length; index++) {
    const flag = args[index]!;
    if (!flag.startsWith('-')) {
      if (id !== undefined) return [];
      id = flag; continue;
    }
    if (!allowed.has(flag) || values.has(flag)) return taskTarget(id);
    if (flag === '--json') { values.set(flag, true); continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) return taskTarget(id);
    values.set(flag, value);
  }
  const targets = taskTarget(id);
  if (targets.length === 0 || !materials || args[2] !== 'write') return targets;
  const materialPath = values.get('--path');
  if (typeof materialPath === 'string' && materialPath.length <= 1024 && !materialPath.includes('\\')
    && !materialPath.includes('\0') && !path.posix.isAbsolute(materialPath) && !/^[A-Za-z]:/.test(materialPath)
    && !materialPath.split('/').some(segment => !segment || segment === '.' || segment === '..') && materialPath.endsWith('.md')) {
    targets.push({ kind: 'material', id: materialPath });
  }
  return targets;
}
function capturedName(object: SourceObject, hint: EventSourceHint): string {
  if (object.selector.managedBlock === 'buildr:required') return 'Buildr 核心规则';
  if (hint.kind === 'skill') return hint.name;
  const method = object.selector.ruleId ?? object.selector.skillId;
  const member = object.selector.relativePath;
  return typeof method === 'string' ? typeof member === 'string' && member !== 'SKILL.md'
    ? method + ' / ' + path.basename(member) : method : hint.name;
}

async function matchesCommandFile(word: string, expected: string, cwd: string, installed: SourceCommandInstallation): Promise<boolean> {
  if (!word.includes('/')) return false;
  const actual = path.resolve(cwd, word);
  return installed.verifyFile ? installed.verifyFile(actual, expected) : actual === expected;
}
const scriptEntry = (word: string | undefined, cwd: string): string | undefined => {
  if (!word || word.startsWith('-')) return undefined;
  const file = path.resolve(cwd, word);
  // Only the actual interpreter's script operand is considered; other arguments are never searched.
  return file.split(path.sep).includes('skills') && /\.(?:[cm]?js|[cm]?ts)$/.test(file) ? file : undefined;
};
const scriptStamp = async (file: string): Promise<string> => {
  const info = await stat(file, { bigint: true });
  if (!info.isFile() || info.size > 512n * 1024n) throw Error('source script is unavailable or exceeds capture bound');
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
};

/** Locate only the actual owned fragment in the original rendered block; no current body is returned. */
function ownedRefs(object: SourceObject, hint: EventSourceHint): { refs: EventSourceContentRef[]; completeness: EventSourceMatch['completeness']; delivered?: false } {
  if (object.selector.managedBlock !== 'buildr:required') return { refs: [...(hint.contentRefs ?? [])], completeness: hint.completeness };
  const rendered = hint.renderedContent;
  if (typeof rendered !== 'string' || !object.selection) return { refs: [], completeness: 'none' };
  const selection = object.selection;
  if (hint.ruleWindow && (hint.ruleWindow.end <= selection.startOffset || hint.ruleWindow.start >= selection.endOffset)) {
    return { refs: [], completeness: 'none', delivered: false };
  }
  if (hint.readWindow) {
    const found: { start: number; end: number; rawStart: number; rawEnd: number }[] = [];
    let cursor = 0;
    for (const line of hint.readWindow.lines) {
      if (!Number.isSafeInteger(line.start) || !Number.isSafeInteger(line.end) || line.end! < line.start!) continue;
      const rawStart = Math.max(selection.startOffset, line.start!), rawEnd = Math.min(selection.endOffset, line.end!);
      if (rawEnd <= rawStart) continue;
      const prefix = line.number + ': ';
      const candidates = [line.text, xml(line.text)];
      let position = -1, escaped = false;
      for (let variant = 0; variant < candidates.length; variant++) {
        const index = rendered.indexOf('\n' + prefix + candidates[variant], cursor);
        if (index >= 0) { position = index + 1 + prefix.length; escaped = variant === 1; break; }
        if (cursor === 0 && rendered.startsWith(prefix + candidates[variant])) { position = prefix.length; escaped = variant === 1; break; }
      }
      if (position < 0) return { refs: [], completeness: 'none' };
      const startText = line.text.slice(0, rawStart - line.start!), endText = line.text.slice(0, rawEnd - line.start!);
      const start = position + (escaped ? xml(startText).length : startText.length), end = position + (escaped ? xml(endText).length : endText.length);
      found.push({ start, end, rawStart, rawEnd }); cursor = end;
    }
    if (!found.length) return { refs: [], completeness: 'none',
      ...(hint.readWindow.lines.length > 0 && hint.readWindow.lines.every(line => Number.isSafeInteger(line.start)
        && Number.isSafeInteger(line.end) && line.end! >= line.start!) ? { delivered: false as const } : {}) };
    const complete = found[0]!.rawStart === selection.startOffset && found.at(-1)!.rawEnd === selection.endOffset
      && found.every((entry, index) => index === 0 || entry.rawStart - found[index - 1]!.rawEnd <= 2);
    return { refs: [{ block: 0, start: found[0]!.start, end: found.at(-1)!.end, unit: 'utf16' }], completeness: complete ? 'complete' : 'partial' };
  }
  const begin = '<!-- buildr:required begin -->', end = '<!-- buildr:required end -->';
  for (const ref of hint.contentRefs ?? []) {
    if (ref.block !== 0 || ref.end > rendered.length) continue;
    const segment = rendered.slice(ref.start, ref.end);
    for (const escaped of [false, true]) {
      const startMarker = escaped ? xml(begin) : begin, endMarker = escaped ? xml(end) : end;
      const first = segment.indexOf(startMarker);
      if (first < 0 || segment.indexOf(startMarker, first + startMarker.length) >= 0) continue;
      const last = segment.indexOf(endMarker, first + startMarker.length);
      return { refs: [{ block: ref.block, start: ref.start + first,
        end: last < 0 ? ref.end : ref.start + last + endMarker.length, unit: 'utf16' }], completeness: last < 0 ? 'partial' : 'complete' };
    }
  }
  return { refs: [], completeness: 'none' };
}

/** Each actual producer frame is independent; raw body text is never retained as a cache key. */
export function createEventSourceCapture(dependencies: CaptureDependencies): (request: EventSourceCaptureRequest) => Promise<EventSources> {
  async function capture(request: EventSourceCaptureRequest): Promise<EventSources> {
    const hint = request.hint;
    if (hint.action === 'remove' && hint.priorSources !== undefined) {
      const prior = parseEventSources(hint.priorSources);
      return prior ? { ...prior, matches: prior.matches.map(match => ({ ...match, action: 'remove', contentRefs: [], completeness: 'none' })) }
        : unknown('capture-prior-source-invalid');
    }
    const cwd = cwdOf(request);
    if (!cwd) return unknown('capture-cwd-unavailable');
    const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, request.signal]) : request.signal;
    signal.throwIfAborted();
    if (hint.kind === 'command' || hint.kind === 'capability') {
      const words = simpleCommandWords(hint.command?.text ?? hint.locator?.entry);
      if (!words) return unknown('capture-command-unresolved');
      const first = words[0]!;
      if (!first.includes('/')) return /^(?:buildr(?:\.[cm]js)?|node)$/.test(first) ? unknown('capture-command-path-unresolved') : notApplicable();
      const bindings = dependencies.resolveCommandBindings ? await dependencies.resolveCommandBindings()
        : [await dependencies.resolveBinding()].filter((binding): binding is Readonly<Binding> => binding !== null);
      if (!bindings.length) return unknown('capture-buildr-unavailable');
      signal.throwIfAborted();
      const resolved = path.resolve(cwd, first), physical = await realpath(resolved).catch(() => resolved);
      const candidatePaths = new Set(bindings.flatMap(binding => [binding.nodeExecutable, binding.cliEntry]));
      let knownPath = candidatePaths.has(resolved);
      if (!knownPath) for (const file of candidatePaths) if (await realpath(file).catch(() => file) === physical) { knownPath = true; break; }
      // Name/path checks schedule proof only. The approved physical file establishes ownership.
      if (!knownPath && !/^(?:buildr(?:\.[cm]js)?|node)$/.test(path.basename(physical))) return notApplicable();
      const script = scriptEntry(words[1], cwd), operand = words[1] === undefined ? undefined : path.resolve(cwd, words[1]);
      const nodeLike = path.basename(physical) === 'node' || bindings.some(binding => binding.nodeExecutable === resolved);
      let knownOperand = operand !== undefined && candidatePaths.has(operand);
      if (!knownOperand && nodeLike && operand !== undefined) {
        const physicalOperand = await realpath(operand).catch(() => operand);
        for (const binding of bindings) if (await realpath(binding.cliEntry).catch(() => binding.cliEntry) === physicalOperand) { knownOperand = true; break; }
      }
      if (nodeLike && script === undefined && (operand === undefined || !candidatePaths.has(operand)
        && !knownOperand && !/^buildr\.[cm]js$/.test(path.basename(operand)))) return notApplicable();
      const digestFile = dependencies.digestFile ?? dependencies.processDependencies?.digest ?? fileDigest;
      const interpreterChecks: (() => Promise<boolean>)[] = [];
      let unavailable = false;
      for (const binding of bindings) {
        try {
          const installed = await (dependencies.inspectInstallation ?? inspectSourceInstallation)(binding, dependencies.channel, signal, dependencies.processDependencies);
          for (const prefix of installed.prefixes) {
            if (prefix.length > words.length) continue;
            let matched = true;
            for (const [index, expected] of prefix.entries()) if (!await matchesCommandFile(words[index]!, expected, cwd, installed)) { matched = false; break; }
            if (!matched) continue;
            const entry = prefix.at(-1)!, digest = (await digestFile(entry)).replace(/^sha256-/, '');
            if (!validDigest(digest)) return unknown('capture-entry-version-invalid');
            for (const [index, expected] of prefix.entries()) if (!await matchesCommandFile(words[index]!, expected, cwd, installed)) return unknown('capture-origin-unverified');
            const args = words.slice(prefix.length), description = describeBoundSourceCommand(args);
            const match: EventSourceMatch = { providedBy: 'buildr', kind: 'capability', identity: 'buildr:cli:' + digest + ':' + description.operation,
              name: 'Buildr ' + description.operation, locator: { entry }, observedVersion: { algorithm: 'sha256', digest, target: 'entry' },
              evidence: [{ authority: 'buildr.installation-status/v1', identity: dependencies.channel + ':' + entry, digest: 'sha256-' + digest }],
              action: 'call', operation: description.operation, targets: commandTargets(args), completeness: 'none' };
            return { schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches: [match] };
          }
          for (const node of installed.nodeExecutables ?? [binding.nodeExecutable]) {
            if (await matchesCommandFile(first, node, cwd, installed)) interpreterChecks.push(() => matchesCommandFile(first, node, cwd, installed));
          }
        } catch { signal.throwIfAborted(); unavailable = true; }
      }
      if (!interpreterChecks.length || script === undefined) return unavailable ? unknown('capture-origin-unverified') : notApplicable();
      const metadataBinding = await dependencies.resolveBinding();
      if (!metadataBinding) return unknown('capture-buildr-unavailable');
      const before = await scriptStamp(script), scriptPhysical = await realpath(script), digest = (await digestFile(script)).replace(/^sha256-/, '');
      if (!validDigest(digest)) return unknown('capture-entry-version-invalid');
      const result = await (dependencies.querySources ?? queryAssetSources)(metadataBinding, dependencies.channel, cwd,
        { schemaVersion: 'buildr.agent-asset-source-observations/v1', mode: 'metadata', observations: [{ id: 'capture', type: 'file', locator: { path: script }, observedDigest: 'sha256-' + digest }] }, signal, dependencies.processDependencies);
      signal.throwIfAborted();
      if (await scriptStamp(script) !== before || await realpath(script) !== scriptPhysical || await digestFile(script) !== 'sha256-' + digest) return unknown('capture-origin-unverified');
      let interpreterStillVerified = false;
      for (const check of interpreterChecks) try { if (await check()) { interpreterStillVerified = true; break; } } catch { signal.throwIfAborted(); }
      if (!interpreterStillVerified) return unknown('capture-origin-unverified');
      const item = result.items[0];
      if (!item || item.status === 'error' || item.status === 'conflict') return unknown('capture-origin-unverified');
      const objects = item.objects.filter(object => object.kind === 'skill' && object.providedBy === 'buildr'
        && object.historical === 'matched-current' && object.observed.digest === 'sha256-' + digest
        && typeof object.selector.skillId === 'string' && typeof object.selector.relativePath === 'string'
        && /\.(?:[cm]?js|[cm]?ts)$/.test(object.selector.relativePath)
        && object.evidence.some(evidence => ['buildr.skill-projection/v2', 'registered-source'].includes(evidence.authority) && evidence.digest === 'sha256-' + digest));
      if (!objects.length) return item.objects.some(object => object.kind === 'skill' && object.providedBy === 'buildr') ? unknown('capture-origin-unverified') : notApplicable();
      return parseEventSources({ schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches: objects.map(object => ({
        providedBy: 'buildr', kind: 'capability', identity: 'buildr:skill-entry:' + object.identity, name: 'Buildr ' + capturedName(object, hint),
        locator: { entry: script, workspaceId: object.workspaceId, scope: object.scope }, observedVersion: { algorithm: 'sha256', digest, target: 'entry' },
        evidence: object.evidence.map(evidence => ({ authority: evidence.authority, identity: evidence.locator, ...(evidence.digest ? { digest: evidence.digest } : {}) })),
        action: 'call', operation: object.selector.skillId + ' ' + describeBoundSourceCommand(words.slice(2)).operation, completeness: 'none',
      })) }) ?? unknown('capture-metadata-invalid');
    }
    const locator = hint.locator?.path;
    if (typeof locator !== 'string' || !path.isAbsolute(locator) || locator.includes('\0')
      || hint.rawDigest?.algorithm !== 'sha256' || !validDigest(hint.rawDigest.digest)) return unknown('capture-actual-version-unavailable');
    const binding = await dependencies.resolveBinding();
    if (!binding) return unknown('capture-buildr-unavailable');
    signal.throwIfAborted();
    // No raw or rendered producer body, including user segments, is sent to the source CLI.
    const result = await (dependencies.querySources ?? queryAssetSources)(binding, dependencies.channel, cwd,
      { schemaVersion: 'buildr.agent-asset-source-observations/v1', mode: 'metadata', observations: [{ id: 'capture', type: 'file',
        locator: { path: locator }, observedDigest: 'sha256-' + hint.rawDigest.digest }] }, signal, dependencies.processDependencies);
    signal.throwIfAborted();
    const item = result.items[0];
    if (!item || item.status === 'error' || item.status === 'conflict') return unknown('capture-origin-unverified');
    if (!item.objects.length || item.objects.every(object => object.providedBy !== 'buildr')) return notApplicable();
    const objects = item.objects.filter(object => object.providedBy === 'buildr' && (object.kind === 'rule' || object.kind === 'skill')
      && object.historical === 'matched-current' && object.observed.digest !== undefined);
    if (!objects.length) return unknown('capture-observed-version-conflict');
    const matches: EventSourceMatch[] = objects.flatMap(object => {
      const body = ownedRefs(object, hint);
      if (body.delivered === false) return [];
      return [{ providedBy: 'buildr', kind: object.kind as 'rule' | 'skill', identity: object.identity, name: capturedName(object, hint),
        locator: { path: locator, workspaceId: object.workspaceId, scope: object.scope },
        observedVersion: { algorithm: 'sha256', digest: hint.rawDigest!.digest, target: 'file' },
        evidence: object.evidence.map(evidence => ({ authority: evidence.authority, identity: evidence.locator,
          ...(evidence.digest ? { digest: evidence.digest } : {}) })), action: hint.action,
        contentRefs: body.refs, completeness: body.completeness }];
    });
    if (!matches.length) return notApplicable();
    return parseEventSources({ schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches, ...(item.mixed ? { mixed: true } : {}) })
      ?? unknown('capture-metadata-invalid');
  }
  return async request => {
    try {
      return await capture(request);
    } catch { return unknown(request.signal.aborted ? 'capture-cancelled' : 'capture-provider-unavailable'); }
  };
}
