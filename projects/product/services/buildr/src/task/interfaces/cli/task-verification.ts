import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';

function syntax(message: string, usage: string) { const error = new Error(message) as Error & Record<string, unknown>; Object.assign(error, { code: 'task_verification_cli.syntax', status: 400, usage }); return error; }
function parse(operation: string, args: string[]) {
  const usage = operation === 'inspect' ? 'buildr task verification inspect <task-id> [--content-identity <identity>] [--target <canonical-workspace>] [--json]' : 'buildr task verification record <task-id> --report <json-file> [--target <canonical-workspace>] [--json]';
  const allowed = operation === 'inspect' ? new Set(['--content-identity', '--target', '--json']) : new Set(['--report', '--target', '--json']); const values = new Map<string, any>(); const positions: string[] = [];
  for (let index = 0; index < args.length; index += 1) { const arg = args[index]; if (!arg.startsWith('--')) { positions.push(arg); continue; } if (!allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`, usage); if (arg === '--json') values.set(arg, true); else { const value = args[++index]; if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usage); values.set(arg, value); } }
  if (positions.length !== 1) throw syntax(`task verification ${operation} requires exactly one <task-id>.`, usage);
  return { taskId: positions[0], targetRoot: path.resolve(values.get('--target') || process.cwd()), json: values.get('--json') === true, contentIdentity: values.get('--content-identity'), reportFile: values.get('--report'), usage };
}
function blocked(runtime: any, operation: string, parsed: any, error: any) { let slot = { path: null, present: false, report: null, reportDigest: null, applicability: null }; try { slot = runtime.inspectTaskVerification(parsed.targetRoot, parsed.taskId).slot; } catch {} return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult, { operation, status: 'blocked', taskId: parsed.taskId, slot, diagnostic: { code: error.code || 'task_verification_failed', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, effects: [], nextActions: [error.nextAction || '检查报告内容、Task 与当前项目测试地图后重试。'] }); }
function print(payload: any, json: boolean) { if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); else if (payload.status === 'blocked') console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}`); else console.log(`Task ${payload.taskId} verification ${payload.status}.`); return payload; }
export function taskVerificationCommand(runtime: any, operation: string, args: string[]) {
  const parsed = parse(operation, args);
  try {
    const payload = operation === 'inspect' ? runtime.inspectTaskVerification(parsed.targetRoot, parsed.taskId, { ...(parsed.contentIdentity ? { contentIdentity: parsed.contentIdentity } : {}) }) : (() => { if (!parsed.reportFile) throw syntax('--report is required.', parsed.usage); const input = JSON.parse(fs.readFileSync(path.resolve(parsed.reportFile), 'utf8')); return runtime.recordTaskVerification(parsed.targetRoot, parsed.taskId, input); })();
    return print(payload, parsed.json);
  } catch (error: any) { if (!error.taskVerificationBusiness && !error.taskRecordBusiness && error.code !== 'task_verification_cli.syntax') throw error; const payload = blocked(runtime, operation, parsed, error); print(payload, parsed.json); process.exitCode = 1; return payload; }
}
