import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';

type TaskVerificationOperation = 'inspect' | 'record';
type VerificationSlot = { path: string | null; present: boolean; report: unknown; reportDigest: string | null; applicability: unknown };
type VerificationResult = { taskId: string; status: string; slot: VerificationSlot; diagnostic?: { code: string; message: string; details?: unknown } | null } & Record<string, unknown>;
export type TaskVerificationCliRuntime = {
  inspectTaskVerification(targetRoot: string, taskId: string, input?: unknown): VerificationResult;
  recordTaskVerification(targetRoot: string, taskId: string, input: unknown): VerificationResult;
};
type Parsed = { taskId: string; targetRoot: string; json: boolean; contentIdentity?: string; reportFile?: string; expectedReportDigest?: string; usage: string };
type CliErrorFields = { code: string; message: string; details?: unknown; nextAction?: string; taskVerificationBusiness?: boolean; taskRecordBusiness?: boolean };

function errorFields(error: unknown): CliErrorFields {
  if (!(error instanceof Error)) return { code: 'task_verification_failed', message: String(error) };
  const fields = Object.fromEntries(Object.entries(error));
  return {
    code: typeof fields.code === 'string' ? fields.code : 'task_verification_failed', message: error.message,
    ...(fields.details === undefined ? {} : { details: fields.details }),
    ...(typeof fields.nextAction === 'string' ? { nextAction: fields.nextAction } : {}),
    ...(fields.taskVerificationBusiness === true ? { taskVerificationBusiness: true } : {}),
    ...(fields.taskRecordBusiness === true ? { taskRecordBusiness: true } : {}),
  };
}
function syntax(message: string, usage: string) { const error = new Error(message) as Error & Record<string, unknown>; Object.assign(error, { code: 'task_verification_cli.syntax', status: 400, usage }); return error; }
function parse(operation: TaskVerificationOperation, args: string[]): Parsed {
  const usage = operation === 'inspect' ? 'buildr task verification inspect <task-id> [--content-identity <identity>] [--target <canonical-workspace>] [--json]' : 'buildr task verification record <task-id> --report <json-file> --expected-report <absent|sha256-digest> [--target <canonical-workspace>] [--json]';
  const allowed = operation === 'inspect' ? new Set(['--content-identity', '--target', '--json']) : new Set(['--report', '--expected-report', '--target', '--json']); const values = new Map<string, string | boolean>(); const positions: string[] = [];
  for (let index = 0; index < args.length; index += 1) { const arg = args[index]; if (!arg.startsWith('--')) { positions.push(arg); continue; } if (!allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`, usage); if (arg === '--json') values.set(arg, true); else { const value = args[++index]; if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usage); values.set(arg, value); } }
  if (positions.length !== 1) throw syntax(`task verification ${operation} requires exactly one <task-id>.`, usage);
  const target = values.get('--target');
  return { taskId: positions[0], targetRoot: path.resolve(typeof target === 'string' ? target : process.cwd()), json: values.get('--json') === true,
    ...(typeof values.get('--content-identity') === 'string' ? { contentIdentity: values.get('--content-identity') as string } : {}),
    ...(typeof values.get('--report') === 'string' ? { reportFile: values.get('--report') as string } : {}),
    ...(typeof values.get('--expected-report') === 'string' ? { expectedReportDigest: values.get('--expected-report') as string } : {}), usage };
}
function blocked(runtime: TaskVerificationCliRuntime, operation: TaskVerificationOperation, parsed: Parsed, error: CliErrorFields) { let slot: VerificationSlot = { path: null, present: false, report: null, reportDigest: null, applicability: null }; try { slot = runtime.inspectTaskVerification(parsed.targetRoot, parsed.taskId).slot; } catch {} return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult, { operation, status: 'blocked', taskId: parsed.taskId, slot, diagnostic: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, effects: [], nextActions: [error.nextAction || '检查报告内容、Task 与当前项目测试地图后重试。'] }); }
function print<T extends VerificationResult>(payload: T, json: boolean): T { if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); else if (payload.status === 'blocked' && payload.diagnostic) console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}`); else console.log(`Task ${payload.taskId} verification ${payload.status}.`); return payload; }
export function taskVerificationCommand(runtime: TaskVerificationCliRuntime, operation: TaskVerificationOperation, args: string[]) {
  const parsed = parse(operation, args);
  try {
    const payload = operation === 'inspect' ? runtime.inspectTaskVerification(parsed.targetRoot, parsed.taskId, { ...(parsed.contentIdentity ? { contentIdentity: parsed.contentIdentity } : {}) }) : (() => { if (!parsed.reportFile) throw syntax('--report is required.', parsed.usage); if (!parsed.expectedReportDigest) throw syntax('--expected-report is required.', parsed.usage); const report: unknown = JSON.parse(fs.readFileSync(path.resolve(parsed.reportFile), 'utf8')); if (!report || typeof report !== 'object' || Array.isArray(report)) throw syntax('--report 必须包含JSON对象。', parsed.usage); return runtime.recordTaskVerification(parsed.targetRoot, parsed.taskId, { ...report, expectedReportDigest: parsed.expectedReportDigest }); })();
    return print(payload, parsed.json);
  } catch (error: unknown) { const failure = errorFields(error); if (!failure.taskVerificationBusiness && !failure.taskRecordBusiness && failure.code !== 'task_verification_cli.syntax') throw error; const payload = blocked(runtime, operation, parsed, failure); print(payload, parsed.json); process.exitCode = 1; return payload; }
}
