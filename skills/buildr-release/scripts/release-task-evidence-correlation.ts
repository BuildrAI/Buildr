import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
type Runtime = { inspectTask(root: string, taskId: string): { record?: Partial<TaskProjection>; recordDigest?: string } };

const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const TASK = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const SHA = /^[a-f0-9]{40}$/u;
const digest = (value: unknown): string => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function candidatePreparationDirectory(workspace: string, key: string, prepared: any, create = false): string {
  if (!SHA.test(prepared.sourceCommit ?? '') || !TASK.test(key) || !Number.isSafeInteger(prepared.generation) || prepared.generation < 0
      || !Number.isSafeInteger(prepared.run?.id) || prepared.run.id < 1 || !Number.isSafeInteger(prepared.run?.attempt) || prepared.run.attempt < 1) throw new Error('Candidate preservation identity is invalid.');
  const relative = path.join('projects/product/services/buildr/build/verification/candidates', prepared.sourceCommit,
    `preparation-${digest({ key, generation: prepared.generation, run: prepared.run }).slice(7, 39)}`);
  let current = workspace;
  if (fs.realpathSync(workspace) !== workspace) throw new Error('Candidate preservation needs the canonical Workspace.');
  for (const name of relative.split(path.sep)) {
    current = path.join(current, name);
    if (create && !fs.lstatSync(current, { throwIfNoEntry: false })) fs.mkdirSync(current);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error('Candidate preservation directory must be independent of worktree aliases.');
  }
  return current;
}

export function readCandidatePreparationSnapshot(workspace: string, key: string, prepared: any): any {
  const directory = candidatePreparationDirectory(workspace, key, prepared);
  if (prepared.directory !== directory) throw new Error('Retained Candidate directory identity changed.');
  const read = (file: string) => {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Retained Candidate evidence must be a regular file.');
    return fs.readFileSync(file);
  };
  const snapshot = JSON.parse(read(path.join(directory, 'preparation-evidence.json')).toString('utf8'));
  if (digest(snapshot) !== prepared.snapshotIdentity || snapshot.selection.identity !== prepared.identity
      || snapshot.selection.sourceCommit !== prepared.sourceCommit || snapshot.selection.sourceTree !== prepared.sourceTree
      || snapshot.selection.generation !== prepared.generation || snapshot.selection.mainCommit !== prepared.mainCommit || JSON.stringify(snapshot.run) !== JSON.stringify(prepared.run)
      || JSON.stringify(snapshot.artifacts) !== JSON.stringify(prepared.artifacts)) throw new Error('Retained Candidate proof identity changed.');
  for (const [name, manifest] of Object.entries(snapshot.artifacts) as Array<[string, any]>) {
    if (!['buildr', 'dsh-plugin'].includes(name) || typeof manifest.filename !== 'string' || path.basename(manifest.filename) !== manifest.filename) throw new Error('Retained Candidate artifact identity is invalid.');
    const folder = fs.lstatSync(path.join(directory, name));
    if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error('Retained Candidate package directory is an alias.');
    const bytes = read(path.join(directory, name, manifest.filename));
    read(path.join(directory, name, name === 'buildr' ? 'release-artifact.json' : 'candidate.json'));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256
        || `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}` !== manifest.integrity) throw new Error('Retained Candidate original bytes changed.');
  }
  return snapshot;
}

/** Read the release owner's completed preparation; caller status alone is not proof. */
export function readCompletedReleasePreparation(input: { workspace: string; taskId: string; candidateRunId: number }): any {
  const workspace = fs.realpathSync(input.workspace), key = input.taskId.replace(/^release-/u, '');
  if (input.taskId !== `release-${key}` || !TASK.test(key)) throw new Error('Completed preparation Task identity is invalid.');
  const git = (args: string[]) => {
    const run = spawnSync('git', args, { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
    if (run.status !== 0) throw new Error('Completed preparation Git identity cannot be read.');
    return run.stdout.trim();
  };
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const state = JSON.parse(fs.readFileSync(path.join(common, 'buildr/release-operations', `${key}.json`), 'utf8'));
  const prepared = state.preparation;
  if (state.workspace !== workspace || (state.targets?.selectionId ?? state.version) !== key || prepared?.status !== 'completed'
      || prepared.taskRegistration !== 'completed' || prepared.report !== 'recorded' || prepared.materials !== 'recorded'
      || prepared.run?.id !== input.candidateRunId || state.candidate?.runId !== input.candidateRunId
      || state.candidate?.sourceCommit !== prepared.sourceCommit || !SHA.test(prepared.sourceCommit ?? '')) {
    throw new Error('Completed Task has no matching completed Candidate preparation.');
  }
  if (git(['rev-parse', `refs/buildr/release/${key}/frozen`]) !== prepared.sourceCommit
      || git(['rev-parse', `${prepared.sourceCommit}^{tree}`]) !== prepared.sourceTree) throw new Error('Completed preparation frozen source changed.');
  readCandidatePreparationSnapshot(workspace, key, prepared);
  return prepared;
}

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

export function releaseTaskAssociationProjection(value: unknown): { identity: string; status: string; sourceCommit: string | null; sourceTree: string | null; remoteRef: string | null } {
  const observed = validateReleaseTaskEvidenceCorrelation(value);
  const association = { releaseTask: observed.releaseTask.taskId, supportTasks: observed.supportTasks.map(task => task.taskId), source: observed.source };
  return { identity: digest(association), status: observed.status, sourceCommit: observed.source?.sourceCommit ?? null, sourceTree: observed.source?.sourceTree ?? null, remoteRef: observed.source?.remoteRef ?? null };
}

function runtimeTask(runtime: Runtime, root: string, taskId: string): TaskProjection {
  const observed = runtime.inspectTask(root, taskId);
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
