export const PUBLIC_JSON_SCHEMAS = Object.freeze({
  builtinList: 'buildr.builtin-list/v1',
  cliError: 'buildr.cli-error/v1',
  commandsCheck: 'buildr.commands-check/v1',
  componentCheck: 'buildr.component-check/v1',
  componentList: 'buildr.component-list/v1',
  doctor: 'buildr.doctor/v1',
  launcherStatus: 'buildr.launcher-status/v1',
  installationStatus: 'buildr.installation-status/v1',
  localAppPreview: 'buildr.local-app-preview/v1',
  openspecConverge: 'buildr.openspec-convergence/v1',
  openspecConvergencePreflight: 'buildr.openspec-convergence-preflight/v1',
  openspecConvergenceInspect: 'buildr.openspec-convergence-inspect/v1',
  releaseAwareness: 'buildr.release-awareness/v1',
  runtimeList: 'buildr.runtime-list/v1',
  update: 'buildr.update/v2',
  updateCheck: 'buildr.update-check/v2',
  version: 'buildr.version/v1',
  gitWorktreeResult: 'buildr.git-worktree-result/v1',
  taskRecordResult: 'buildr.task-record-result/v5',
  taskRecordView: 'buildr.task-record-view/v3',
  taskRecordList: 'buildr.task-record-list/v5',
  parentCoordinationResult: 'buildr.parent-coordination-result/v4',
  parentPlan: 'buildr.parent-plan/v2',
  dailyProgressInputSchema: 'buildr.project-daily-progress-input-schema/v1',
  dailyProgressInputExample: 'buildr.project-daily-progress-input-example/v1',
  dailyProgressRecordResult: 'buildr.project-daily-progress-record-result/v1',
  dailyProgressInspectResult: 'buildr.project-daily-progress-inspect-result/v1',
  dailyProgressListResult: 'buildr.project-daily-progress-list-result/v1',
  dailyProgressTaskView: 'buildr.project-daily-progress-task-view/v1',
  taskReviewOperationResult: 'buildr.task-review-operation-result/v2',
  taskVerificationOperationResult: 'buildr.task-verification-operation-result/v1',
  longRunningOperationSummary: 'buildr.long-running-operation-summary/v1',
  verificationEvidenceCleanup: 'buildr.verification-evidence-cleanup/v1',
});

export function withJsonSchema<T extends Record<string, unknown>>(schemaVersion: string, payload: T): { schemaVersion: string } & T {
  if (!new Set<string>(Object.values(PUBLIC_JSON_SCHEMAS)).has(schemaVersion)) {
    throw new Error(`Unknown public JSON schema: ${schemaVersion}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Public JSON payload must be an object: ${schemaVersion}`);
  }
  return { schemaVersion, ...payload };
}

export const LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES = 16 * 1024;
export const LONG_RUNNING_OPERATION_SUMMARY_MAX_STAGES = 12;

const LONG_RUNNING_STATUSES = new Set(['running', 'passed', 'blocked', 'failed', 'cancelled', 'unknown', 'not-applicable']);
const LONG_RUNNING_STAGE_STATUSES = new Set([...LONG_RUNNING_STATUSES, 'pending', 'skipped']);

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function boundedUtf8(value: unknown, maxBytes: number): string | null {
  const text = nullableString(value);
  if (!text || Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const suffix = '…';
  const budget = maxBytes - Buffer.byteLength(suffix, 'utf8');
  let output = '';
  let bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > budget) break;
    output += character;
    bytes += size;
  }
  return `${output}${suffix}`;
}

function normalizedStatus(value: unknown, allowed: ReadonlySet<string>, fallback = 'unknown'): string {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

function recoveryPointer(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = record(value);
  const owner = nullableString(item.owner);
  const operation = nullableString(item.operation);
  if (!owner || !operation) return null;
  return { owner, operation, taskId: nullableString(item.taskId), runId: nullableString(item.runId), recordId: nullableString(item.recordId) };
}

export function longRunningOperationSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Long-running operation summary input must be an object.');
  const input = record(value);
  const operation = nullableString(input.operation);
  if (!operation) throw new Error('Long-running operation summary requires operation.');
  const stages = (Array.isArray(input.stages) ? input.stages : []).slice(0, LONG_RUNNING_OPERATION_SUMMARY_MAX_STAGES).map((stage) => {
    const item = record(stage);
    return { id: nullableString(item.id) || 'unknown', status: normalizedStatus(item.status, LONG_RUNNING_STAGE_STATUSES) };
  });
  const primaryFailure = record(input.primaryFailure);
  const cleanup = record(input.cleanup);
  const summary = withJsonSchema(PUBLIC_JSON_SCHEMAS.longRunningOperationSummary, {
    operation, detail: 'compact', terminal: input.terminal === true,
    status: normalizedStatus(input.status, LONG_RUNNING_STATUSES),
    taskId: nullableString(input.taskId), runId: nullableString(input.runId), resultIdentity: nullableString(input.resultIdentity), stages,
    primaryFailure: input.primaryFailure && typeof input.primaryFailure === 'object' ? {
      stage: nullableString(primaryFailure.stage), code: nullableString(primaryFailure.code), message: boundedUtf8(primaryFailure.message, 512),
    } : null,
    cleanup: { status: normalizedStatus(cleanup.status, LONG_RUNNING_STAGE_STATUSES) },
    output: {
      maxBytes: LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES, bytes: 0,
      truncated: input.outputTruncated === true || (Array.isArray(input.stages) && input.stages.length > stages.length),
    },
    recovery: recoveryPointer(input.recovery),
  });
  for (let attempt = 0; attempt < 4; attempt += 1) summary.output.bytes = Buffer.byteLength(`${JSON.stringify(summary)}\n`, 'utf8');
  if (summary.output.bytes > LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES) throw new Error('Long-running operation summary exceeded its fixed output boundary.');
  return summary;
}
