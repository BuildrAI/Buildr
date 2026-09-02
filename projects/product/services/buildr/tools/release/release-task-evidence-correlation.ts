import crypto from 'node:crypto';

export const RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA = 'buildr.release-task-evidence-correlation/v5';

type TaskProjection = { taskId: string; title: string; status: string; recordDigest: string | null };
type SourceProjection = { sourceCommit: string | null; sourceTree: string | null; remoteRef: string | null };
type Correlation = {
  schemaVersion: typeof RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA;
  status: 'passed';
  releaseTask: TaskProjection;
  supportTasks: TaskProjection[];
  source: SourceProjection | null;
  identity: string;
};
type Runtime = { inspectTaskRecord(root: string, taskId: string): { record?: Partial<TaskProjection>; recordDigest?: string } };

const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const TASK = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const SHA = /^[a-f0-9]{40}$/u;
const digest = (value: unknown): string => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

function closed(value: unknown, fields: string[], label: string): Record<string, unknown> {
  const item = record(value, label);
  for (const field of Object.keys(item)) if (!fields.includes(field)) throw new Error(`${label}.${field} is not supported.`);
  return item;
}

function task(value: unknown, label: string, expectedStatus = 'completed'): TaskProjection {
  const item = closed(value, ['taskId', 'title', 'status', 'recordDigest'], label);
  if (typeof item.taskId !== 'string' || !TASK.test(item.taskId) || item.status !== expectedStatus) throw new Error(`${label} must be ${expectedStatus}.`);
  if (item.recordDigest != null && (typeof item.recordDigest !== 'string' || !DIGEST.test(item.recordDigest))) throw new Error(`${label}.recordDigest must be a sha256 identity.`);
  return { taskId: item.taskId, title: String(item.title || ''), status: item.status, recordDigest: typeof item.recordDigest === 'string' ? item.recordDigest : null };
}

function source(value: unknown): SourceProjection | null {
  if (value == null) return null;
  const item = closed(value, ['sourceCommit', 'sourceTree', 'remoteRef'], 'source');
  const optionalSha = (field: string): string | null => {
    const candidate = item[field];
    if (candidate == null) return null;
    if (typeof candidate !== 'string' || !SHA.test(candidate)) throw new Error(`source.${field} must be a full Git SHA.`);
    return candidate;
  };
  return { sourceCommit: optionalSha('sourceCommit'), sourceTree: optionalSha('sourceTree'), remoteRef: optionalSha('remoteRef') };
}

export function createReleaseTaskEvidenceCorrelation(input: {
  releaseTask: unknown;
  releaseTaskStatus?: 'active' | 'completed';
  supportTasks?: unknown[];
  source?: unknown;
}): Correlation {
  const releaseTaskStatus = input.releaseTaskStatus || 'active';
  const releaseTask = task(input.releaseTask, 'releaseTask', releaseTaskStatus);
  const supportTasks = (input.supportTasks || []).map((item, index) => task(item, `supportTasks[${index}]`)).sort((left, right) => left.taskId.localeCompare(right.taskId));
  const ids = [releaseTask.taskId, ...supportTasks.map((item) => item.taskId)];
  if (new Set(ids).size !== ids.length) throw new Error('Release/support Task IDs must be unique.');
  const unsigned: Omit<Correlation, 'identity'> = { schemaVersion: RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA, status: 'passed', releaseTask, supportTasks, source: source(input.source) };
  return { ...unsigned, identity: digest(unsigned) };
}

export function validateReleaseTaskEvidenceCorrelation(value: unknown): Correlation {
  const item = closed(value, ['schemaVersion', 'status', 'releaseTask', 'supportTasks', 'source', 'identity'], 'release task evidence correlation');
  if (item.schemaVersion !== RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA || item.status !== 'passed' || typeof item.identity !== 'string' || !DIGEST.test(item.identity) || !Array.isArray(item.supportTasks)) throw new Error('Release task evidence correlation schema/identity is invalid.');
  const recreated = createReleaseTaskEvidenceCorrelation({ releaseTask: item.releaseTask, releaseTaskStatus: record(item.releaseTask, 'releaseTask').status === 'active' ? 'active' : 'completed', supportTasks: item.supportTasks, source: item.source });
  if (recreated.identity !== item.identity) throw new Error('Release task evidence correlation identity mismatch.');
  return recreated;
}

export function inspectReleaseTaskEvidenceCorrelation(value: unknown): { schemaVersion: string; status: string; identity: string; releaseTaskId: string; supportTaskIds: string[] } {
  const validated = validateReleaseTaskEvidenceCorrelation(value);
  return { schemaVersion: `${RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA}-inspect`, status: validated.status, identity: validated.identity, releaseTaskId: validated.releaseTask.taskId, supportTaskIds: validated.supportTasks.map((item) => item.taskId) };
}

function runtimeTask(runtime: Runtime, root: string, taskId: string): TaskProjection {
  const observed = runtime.inspectTaskRecord(root, taskId);
  const value = observed.record || {};
  return { taskId: typeof value.taskId === 'string' ? value.taskId : taskId, title: typeof value.title === 'string' ? value.title : '', status: typeof value.status === 'string' ? value.status : 'unknown', recordDigest: observed.recordDigest || null };
}

export function createReleaseTaskEvidenceCorrelationFromRuntime(input: { runtime: Runtime; root: string; releaseTask: string | TaskProjection; releaseTaskStatus?: 'active' | 'completed'; supportTasks?: Array<string | TaskProjection>; source?: SourceProjection | null }): Correlation {
  const projectTask = (value: string | TaskProjection): TaskProjection => typeof value === 'string' ? runtimeTask(input.runtime, input.root, value) : value;
  return createReleaseTaskEvidenceCorrelation({
    releaseTask: projectTask(input.releaseTask),
    releaseTaskStatus: input.releaseTaskStatus,
    supportTasks: (input.supportTasks || []).map(projectTask),
    source: input.source || null,
  });
}
