import { createHash } from 'node:crypto';
import type { ParticipationMatch, ParticipationMeasure, ParticipationObservation, ParticipationOutcome, ParticipationSource, ParticipationSourceResult } from '../participation-contracts.ts';

export const PARTICIPATION_LIMITS = Object.freeze({ matches: 32, toolBytes: 8192, snapshotBytes: 128 * 1024, timeoutMs: 250 });
const digest = (text: string) => 'sha256-' + createHash('sha256').update(text).digest('hex');
export function measureParticipation(text: string, boundary: ParticipationMeasure['boundary'] = 'native-observed', completeness: ParticipationMeasure['completeness'] = 'complete'): ParticipationMeasure {
  return { utf8Bytes: Buffer.byteLength(text), utf16Units: text.length, boundary, completeness, upstreamCompleteness:boundary==='native-observed'?'unknown':'complete' };
}
export function instructionParticipation(name: string, text: string): ParticipationMatch {
  return { identity: 'buildr:instruction:' + name, name, kind: 'instruction', providedBy: 'buildr', managedBy:'buildr', status: 'confirmed', observedVersion: digest(text), action: 'submitted', input: measureParticipation(text, 'submitted') };
}
/** Measure before nativePreview; an ordinary completed envelope is not an exit receipt. */
export function nativeParticipation(input?: string, output?: string, outcome: ParticipationOutcome = 'unknown', exitCode?: number): ParticipationObservation {
  return { version: 1, parserVersion: 1, matches: [], ...(input === undefined ? {} : { input: measureParticipation(input) }), ...(output === undefined ? {} : { output: measureParticipation(output) }),
    outcome, ...(Number.isSafeInteger(exitCode) ? { exitCode } : {}), coverage: 'complete', gaps: [] };
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
const kinds = ['instruction', 'rule', 'skill-catalog', 'skill', 'capability', 'cli', 'script'];
export function validParticipationSource(value: unknown): value is ParticipationSource {
  if (!record(value)) return false;
  return typeof value.identity === 'string' && value.identity.length > 0 && value.identity.length <= 1024
    && typeof value.name === 'string' && value.name.length <= 512 && kinds.includes(String(value.kind))
    && ['buildr', 'workspace', 'external', 'unknown'].includes(String(value.providedBy))
    && ['confirmed', 'candidate', 'unknown'].includes(String(value.status))
    && (value.managedBy===undefined||value.managedBy===null||value.managedBy==='buildr') && (value.contentScope===undefined||['whole','fragment'].includes(String(value.contentScope)))
    && ['locator', 'offeredVersion', 'observedVersion'].every(key => value[key] === undefined || typeof value[key] === 'string' && (value[key] as string).length <= 2048);
}
function validMeasure(value: unknown): value is ParticipationMeasure {
  return record(value) && Number.isSafeInteger(value.utf8Bytes) && Number(value.utf8Bytes) >= 0 && Number.isSafeInteger(value.utf16Units) && Number(value.utf16Units) >= 0
    && (value.upstreamCompleteness===undefined||['complete','partial','unknown'].includes(String(value.upstreamCompleteness))) && ['native-observed', 'stored-visible', 'submitted'].includes(String(value.boundary)) && ['complete', 'partial', 'unknown'].includes(String(value.completeness));
}
function closedMeasure(value: ParticipationMeasure): ParticipationMeasure { return { utf8Bytes: value.utf8Bytes, utf16Units: value.utf16Units, boundary: value.boundary, completeness: value.completeness, ...(value.upstreamCompleteness?{upstreamCompleteness:value.upstreamCompleteness}:{}) }; }
/** Closed projection drops unknown fields, including accidental body/credential fields. */
export function participationSource(value: ParticipationSource): ParticipationSource {
  return { identity: value.identity, name: value.name, kind: value.kind, providedBy: value.providedBy, status: value.status, ...(value.managedBy===undefined?{}:{managedBy:value.managedBy}), ...(value.contentScope?{contentScope:value.contentScope}:{}),
    ...(value.locator ? { locator: value.locator } : {}), ...(value.offeredVersion ? { offeredVersion: value.offeredVersion } : {}), ...(value.observedVersion ? { observedVersion: value.observedVersion } : {}) };
}
export function participationGaps(value:unknown):string[] { return Array.isArray(value) ? [...new Set(value.filter((item):item is string=>typeof item==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(item)))].slice(0,16) : ['invalid-observation-gaps']; }
export function normalizeParticipation(value: unknown): ParticipationObservation | undefined {
  if (!record(value) || value.version !== 1 || value.parserVersion !== 1 || !Array.isArray(value.matches) || !['pending', 'succeeded', 'failed', 'unknown'].includes(String(value.outcome))) return undefined;
  const matches: ParticipationMatch[] = [];
  let partial = value.coverage !== 'complete';
  for (const raw of value.matches) {
    if (matches.length >= PARTICIPATION_LIMITS.matches) { partial = true; break; }
    if (!validParticipationSource(raw) || !record(raw) || !['available', 'submitted', 'requested', 'observed'].includes(String(raw.action))) { partial = true; continue; }
    const match: ParticipationMatch = { ...participationSource(raw), action: raw.action as ParticipationMatch['action'],
      ...(validMeasure(raw.input) ? { input: closedMeasure(raw.input) } : {}), ...(validMeasure(raw.output) ? { output: closedMeasure(raw.output) } : {}) };
    matches.push(match);
  }
  const result: ParticipationObservation = { version: 1, parserVersion: 1, matches,
    ...(validMeasure(value.input) ? { input: closedMeasure(value.input) } : {}), ...(validMeasure(value.output) ? { output: closedMeasure(value.output) } : {}),
    outcome: value.outcome as ParticipationOutcome, ...(Number.isSafeInteger(value.exitCode) ? { exitCode: value.exitCode as number } : {}),
    coverage: partial ? 'partial' : 'complete', gaps: participationGaps(value.gaps) };
  if (Buffer.byteLength(JSON.stringify(result)) > PARTICIPATION_LIMITS.toolBytes - 256) return { ...result, matches: [], coverage: 'partial', gaps: ['metadata-limit'] };
  return result;
}
/** Deliberately small grammar: compound/dynamic shells never become confirmed executions. */
export function participationRequests(name: string | undefined, input: string | undefined): ParticipationMatch[] {
  if (!input || input.length > 16000) return [];
  let args: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(input); if (record(parsed)) args = parsed; } catch { /* Native command may be a plain string. */ }
  const skill = name?.toLowerCase() === 'skill' ? args.skill ?? args.name : undefined;
  if (typeof skill === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(skill)) return [{ identity: 'unproven:skill:' + skill, name: skill, kind: 'skill', providedBy: 'unknown', status: 'candidate', action: 'requested' }];
  const path = args.file_path ?? args.filePath ?? args.path;
  if (name && /^(read|read_file|readfile)$/i.test(name) && typeof path === 'string' && path.length <= 2048) {
    const kind = /(?:^|[/\\])AGENTS\.md$/.test(path) ? 'rule' : /(?:^|[/\\])contracts[/\\]/.test(path) ? 'capability' : /(?:^|[/\\])(?:skills|references)[/\\]/.test(path) ? 'skill' : undefined;
    return kind ? [{ identity: 'unproven:file:' + digest(path), name: path.split(/[/\\]/).at(-1)!, locator: path, kind, providedBy: 'unknown', status: 'candidate', action: 'requested' }] : [];
  }
  let command = typeof args.command === 'string' ? args.command : typeof args.cmd === 'string' ? args.cmd : input;
  // Native Codex exposes one literal login-shell wrapper. Unwrap only this
  // closed shape; never evaluate shell text or accept nested/compound commands.
  const wrapped = /^(?:\/bin\/)?(?:zsh|bash|sh) -lc '([^']*)'$/.exec(command);
  if (wrapped) command = wrapped[1]!;
  if (command.includes('\\')) return [];
  if (!name || !/^(command|bash|functions.exec_command|exec_command|shell)$/i.test(name) || /[;&|<>`$\n\r]/.test(command)) return [];
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map(t => t.replace(/^(['"])(.*)\1$/, '$2')) ?? [];
  if (!tokens.length) return [];
  const first = tokens[0]!;
  if (/(?:^|[/\\])buildr(?:\.mjs)?$/.test(first)) { const category=tokens.includes('--help')?'help':tokens.includes('--version')?'version':'invocation';return [{ identity:'unproven:cli:'+category,name:category==='help'?'Buildr CLI 帮助':category==='version'?'Buildr CLI 版本':'Buildr CLI',locator:first,kind:'cli',providedBy:'unknown',status:'candidate',action:'requested' }]; }
  if (/^(?:.*[/\\])?node$/.test(first) && tokens[1] && /(?:^|[/\\])buildr(?:\.mjs)?$/.test(tokens[1])) return participationRequests('command',tokens.slice(1).map(t=>JSON.stringify(t)).join(' '));
  if (first === 'cat' && tokens.length === 2 && !tokens[1]!.startsWith('-')) return participationRequests('Read', JSON.stringify({ path: tokens[1] }));
  if (/^(?:.*[/\\])?(node|python3?|bash|sh)$/.test(first) && tokens[1] && /[/\\](?:scripts|assets)[/\\]/.test(tokens[1])) return [{ identity: 'unproven:script:' + digest(tokens[1]), name: tokens[1].split(/[/\\]/).at(-1)!, locator: tokens[1], kind: 'script', providedBy: 'unknown', status: 'candidate', action: 'requested' }];
  return [];
}
export function mergeParticipation(prior: ParticipationObservation | undefined, incoming: ParticipationObservation | undefined, name?: string, input?: string): ParticipationObservation | undefined {
  prior=normalizeParticipation(prior);
  if (!prior && !incoming && !name) return undefined;
  const value = incoming ? normalizeParticipation(incoming) : prior;
  if (!value) return prior;
  const matches = prior?.matches.length ? prior.matches : value.matches.length ? value.matches : participationRequests(name, input);
  return normalizeParticipation({ ...prior, ...value, input: value.input ?? prior?.input, output: value.output ?? prior?.output, matches,
    outcome: incoming?.outcome === 'pending' && prior && prior.outcome !== 'pending' ? prior.outcome : value.outcome });
}
export function applyParticipationSources(observation: ParticipationObservation, result: ParticipationSourceResult): ParticipationObservation {
  const matches = observation.matches.map((match, i) => {
    const source = result.sources.find(s => s.observationId === String(i));
    return source && validParticipationSource(source) ? { ...participationSource(source), action: match.action } : match;
  });
  return normalizeParticipation({ ...observation, matches, coverage: result.coverage === 'complete' ? observation.coverage : 'partial', gaps: [...observation.gaps, ...participationGaps(result.gaps)] })!;
}
