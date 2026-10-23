import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../../infrastructure/contracts/public-json.ts';
import type { ArtifactError } from '../../domain/artifact.ts';

type ArtifactAction = 'register' | 'list' | 'status' | 'release' | 'clean';
type CliValue = string | true;

export type ArtifactCliRuntime = {
  registerArtifact(targetRoot: string, input: any): any;
  listArtifacts(targetRoot: string, filters?: any): any;
  artifactStatus(targetRoot: string): any;
  releaseArtifact(targetRoot: string, selector: string, input: any): any;
  cleanArtifacts(targetRoot: string, options?: any): any;
};

const USAGES: Record<ArtifactAction, string> = {
  register: 'buildr artifact register <path> --purpose <text> --disposition <ephemeral|retained|evidence> [--task <task-id>] [--by <registrant>] [--retain-reason <text>] [--reference <text> ...] [--reference-check <workspace-path> ...] [--expected-record <absent|sha256-digest>] [--target <canonical-workspace>] [--json]',
  list: 'buildr artifact list [--task <task-id>] [--state <state>] [--target <canonical-workspace>] [--json]',
  status: 'buildr artifact status [--target <canonical-workspace>] [--json]',
  release: 'buildr artifact release <artifact-id|path> --reason <text> --expected-record <sha256-digest> [--target <canonical-workspace>] [--json]',
  clean: 'buildr artifact clean [--execute] [--target <canonical-workspace>] [--json]',
};

const ALLOWED: Record<ArtifactAction, Set<string>> = {
  register: new Set(['--purpose', '--disposition', '--task', '--by', '--retain-reason', '--reference', '--reference-check', '--expected-record', '--target', '--json']),
  list: new Set(['--task', '--state', '--target', '--json']),
  status: new Set(['--target', '--json']),
  release: new Set(['--reason', '--expected-record', '--target', '--json']),
  clean: new Set(['--execute', '--target', '--json']),
};

const REPEATABLE = new Set(['--reference', '--reference-check']);
const BOOLEAN = new Set(['--json', '--execute']);

function syntax(message: string, action: ArtifactAction) {
  return Object.assign(new Error(message), { code: 'artifact_cli.syntax', status: 400, usage: USAGES[action] });
}

function parse(action: ArtifactAction, args: string[]) {
  const values = new Map<string, CliValue[]>();
  const positions: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!ALLOWED[action].has(arg)) throw syntax(`Unknown argument: ${arg}`, action);
    const list = values.get(arg) || [];
    if (!REPEATABLE.has(arg) && list.length) throw syntax(`Argument may only be provided once: ${arg}`, action);
    if (BOOLEAN.has(arg)) list.push(true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, action);
      list.push(value);
      index += 1;
    }
    values.set(arg, list);
  }
  const one = (name: string) => values.get(name)?.[0];
  const many = (name: string): string[] => (values.get(name) || []).filter((value): value is string => typeof value === 'string');
  const target = one('--target');
  return {
    positions,
    one,
    many,
    targetRoot: path.resolve(typeof target === 'string' ? target : process.cwd()),
    json: Boolean(one('--json')),
  };
}

function printResult(payload: any, json: boolean) {
  const wrapped = withJsonSchema(PUBLIC_JSON_SCHEMAS.artifactResult, payload);
  if (json) { process.stdout.write(`${JSON.stringify(wrapped, null, 2)}\n`); return wrapped; }
  if (payload.diagnostic) console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${(payload.nextActions || ['检查产物命令输入后重试。'])[0]}`);
  else if (payload.operation === 'clean' && payload.mode === 'dry-run') {
    console.log(`Artifact clean dry-run: ${payload.totals.candidates} 项可处置，${payload.totals.retained} 项保留，候选 ${payload.totals.bytes} 字节。`);
    for (const item of payload.plan) console.log(`  ${item.action === 'delete' ? 'DELETE' : 'retain'}  ${item.path}  ${item.state}  ${item.reason}`);
    for (const action of payload.nextActions || []) console.log(`Next: ${action}`);
  } else if (payload.operation === 'clean') {
    console.log(`Artifact clean execute: 删除 ${payload.totals.deleted} 项（${payload.totals.bytes} 字节），保留 ${payload.totals.retained}，失败 ${payload.totals.errors}。`);
    for (const item of payload.results) console.log(`  ${item.result}  ${item.path}  ${item.reason || ''}`);
    for (const action of payload.nextActions || []) console.log(`Next: ${action}`);
  } else if (payload.operation === 'list') {
    console.log(`Artifacts: ${payload.artifacts.length} 项`);
    for (const item of payload.artifacts) console.log(`  ${item.state}  ${item.path}  ${item.sizeBytes ?? '-'}B  ${item.reason}`);
  } else if (payload.operation === 'status') {
    console.log(`Artifact status: ${payload.totalArtifacts} 项，共 ${payload.totalSizeBytes} 字节；counts=${JSON.stringify(payload.counts)}`);
    for (const action of payload.nextActions || []) console.log(`Next: ${action}`);
  } else {
    console.log(`Artifact ${payload.artifactId || ''} ${payload.status}: ${payload.path}`);
    for (const action of payload.nextActions || []) console.log(`Next: ${action}`);
  }
  return wrapped;
}

function blocked(operation: ArtifactAction, error: ArtifactError, json: boolean) {
  const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.artifactResult, {
    operation,
    status: 'blocked',
    diagnostic: { code: error.code || 'artifact_failed', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    ...(error.status === 409 && error.details && typeof error.details === 'object' && 'currentRecordDigest' in error.details ? { currentRecordDigest: (error.details as any).currentRecordDigest } : {}),
    effects: [],
    nextActions: [error.nextAction || '检查产物登记/发现事实后重试。'],
  });
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  return payload;
}

export function artifactCommand(runtime: ArtifactCliRuntime, action: ArtifactAction, args: string[]) {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(action, args);
    switch (action) {
      case 'register': {
        if (parsed.positions.length !== 1) throw syntax('register requires exactly one <path>.', action);
        if (!parsed.one('--purpose') || !parsed.one('--disposition')) throw syntax('register requires --purpose and --disposition.', action);
        if (parsed.many('--reference-check').length > parsed.many('--reference').length) throw syntax('--reference-check 按位置与 --reference 配对，数量不能超过 --reference。', action);
        const references = parsed.many('--reference').map((summary, index) => ({ summary, checkPath: parsed.many('--reference-check')[index] ?? null }));
        return printResult({ operation: action, ...runtime.registerArtifact(parsed.targetRoot, {
          path: parsed.positions[0],
          purpose: parsed.one('--purpose'),
          disposition: parsed.one('--disposition'),
          taskId: parsed.one('--task') ?? null,
          registeredBy: parsed.one('--by') || 'agent',
          retainReason: parsed.one('--retain-reason') ?? null,
          references,
          expectedRecord: parsed.one('--expected-record') ?? null,
        }) }, parsed.json);
      }
      case 'list':
        if (parsed.positions.length) throw syntax('list takes no positional argument.', action);
        return printResult({ operation: action, ...runtime.listArtifacts(parsed.targetRoot, { taskId: parsed.one('--task') ?? null, state: parsed.one('--state') ?? null }) }, parsed.json);
      case 'status':
        if (parsed.positions.length) throw syntax('status takes no positional argument.', action);
        return printResult({ operation: action, ...runtime.artifactStatus(parsed.targetRoot) }, parsed.json);
      case 'release': {
        if (parsed.positions.length !== 1) throw syntax('release requires exactly one <artifact-id|path>.', action);
        if (!parsed.one('--reason')) throw syntax('release requires --reason.', action);
        if (!parsed.one('--expected-record')) throw syntax('release requires --expected-record.', action);
        return printResult({ operation: action, ...runtime.releaseArtifact(parsed.targetRoot, parsed.positions[0], {
          reason: parsed.one('--reason') as string,
          expectedRecord: parsed.one('--expected-record') as string,
        }) }, parsed.json);
      }
      case 'clean':
        if (parsed.positions.length) throw syntax('clean takes no positional argument.', action);
        return printResult({ operation: action, ...runtime.cleanArtifacts(parsed.targetRoot, { execute: Boolean(parsed.one('--execute')) }) }, parsed.json);
    }
  } catch (error: any) {
    if (error?.usage) { console.error(`${error.message}\n${error.usage}`); process.exit(error.status || 400); }
    return blocked(action, error, args.includes('--json'));
  }
}
