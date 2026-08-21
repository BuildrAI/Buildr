import fs from 'node:fs';
import path from 'node:path';

import { TASK_FINISH_RAW_COMMAND_OUTPUT, compactTaskFinishFailure } from './execution-record.mjs';

export const TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA = 'buildr.task-finish-diagnostics-evidence/v1';

const INVOCATION_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const PHASES = new Set(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);

function inside(root, value) {
  const relative = path.relative(root, value);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function writeJson(file, value, writeFile) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function outputSection(phase, operation, value) {
  if (!value) return '';
  const text = String(value);
  return `=== phase: ${phase}; operation: ${operation || 'unknown'} ===\n${text}${text.endsWith('\n') ? '' : '\n'}`;
}

function portableCheck(check) {
  return {
    check: check?.check || check?.id || null,
    severity: check?.severity || null,
    code: check?.code || null,
    status: check?.status || null,
  };
}

function portableOperation(operation) {
  return {
    kind: operation?.kind || 'product',
    id: operation?.id || operation?.operation || null,
    status: operation?.status ?? null,
    signal: operation?.signal || null,
    startedAt: operation?.startedAt || null,
    durationMs: Math.round(operation?.durationMs || 0),
    stdout: operation?.stdout ? { bytes: operation.stdout.bytes, digest: operation.stdout.digest, truncated: operation.stdout.truncated === true } : null,
    stderr: operation?.stderr ? { bytes: operation.stderr.bytes, digest: operation.stderr.digest, truncated: operation.stderr.truncated === true } : null,
  };
}

export function createTaskFinishDiagnosticsEvidence(root, invocationId, options = {}) {
  if (!INVOCATION_PATTERN.test(String(invocationId || ''))) throw new Error('Task Finish diagnostics requires a safe invocation identity.');
  const workspaceRoot = fs.realpathSync(path.resolve(root));
  const ownerRoot = path.join(workspaceRoot, '.buildr', 'transient', 'task-finish', 'diagnostics');
  fs.mkdirSync(ownerRoot, { recursive: true });
  const realOwnerRoot = fs.realpathSync(ownerRoot);
  if (!inside(workspaceRoot, realOwnerRoot) || realOwnerRoot !== ownerRoot) throw new Error('Task Finish diagnostics owner root escapes or aliases the canonical Workspace.');
  const directory = path.join(realOwnerRoot, invocationId);
  fs.mkdirSync(directory, { recursive: false });
  const writeFile = options.writeFile || ((file, content) => fs.writeFileSync(file, content));
  const startedAt = new Date().toISOString();
  const state = {
    schemaVersion: TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA,
    invocationId,
    finishRunId: null,
    invocationOrdinal: null,
    startedAt,
    finishedAt: null,
    phaseResults: [],
    timeline: [{ milestone: 'record-opened', phase: null, status: 'open', at: startedAt }],
    failures: [],
    stdout: [],
    stderr: [],
  };

  function checkpoint() {
    writeJson(path.join(directory, 'summary.json'), {
      schemaVersion: TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA,
      invocationId: state.invocationId,
      finishRunId: state.finishRunId,
      invocationOrdinal: state.invocationOrdinal,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      phaseResults: state.phaseResults,
    }, writeFile);
    writeJson(path.join(directory, 'timeline.json'), { schemaVersion: TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA, invocationId, events: state.timeline }, writeFile);
    writeJson(path.join(directory, 'diagnostics.json'), { schemaVersion: TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA, invocationId, failures: state.failures }, writeFile);
    writeFile(path.join(directory, 'stdout.txt'), state.stdout.join('\n'));
    writeFile(path.join(directory, 'stderr.txt'), state.stderr.join('\n'));
  }

  checkpoint();
  return {
    directory,
    summaryPath: path.join(directory, 'summary.json'),
    lifecycle: {
      schemaVersion: TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA,
      invocationId,
      workspaceRoot,
      evidenceRetention: 'transient',
      cleanupAfter: 'execution-record-retained',
      cleanupStatus: 'retained',
      cleanupReference: directory,
      summaryPath: path.join(directory, 'summary.json'),
    },
    runOpened(run) {
      state.finishRunId = run.runId;
      state.invocationOrdinal = run.invocations;
      state.timeline.push({ milestone: 'run-opened', phase: null, status: run.status, at: new Date().toISOString() });
      checkpoint();
    },
    phaseStarted({ phase, attempt, at }) {
      if (!PHASES.has(phase)) throw new Error(`Unsupported Task Finish diagnostics phase: ${phase}`);
      state.timeline.push({ milestone: 'phase-started', phase, status: `attempt-${attempt}`, at });
      checkpoint();
    },
    phaseFinished({ phase, attempt, result, startedAt: phaseStartedAt, completedAt, durationMs }) {
      if (!PHASES.has(phase)) throw new Error(`Unsupported Task Finish diagnostics phase: ${phase}`);
      const operations = (result.operations || []).map((operation) => {
        const raw = operation?.[TASK_FINISH_RAW_COMMAND_OUTPUT] || null;
        if (raw?.stdout) state.stdout.push(outputSection(phase, operation.id, raw.stdout));
        if (raw?.stderr) state.stderr.push(outputSection(phase, operation.id, raw.stderr));
        return portableOperation(operation);
      });
      const failure = compactTaskFinishFailure(result.failure, phase);
      if (failure) state.failures.push(failure);
      state.phaseResults.push({
        id: phase,
        status: result.status,
        attempt,
        startedAt: phaseStartedAt,
        completedAt,
        durationMs,
        inputIdentity: result.inputIdentity || null,
        outputIdentity: result.outputIdentity || null,
        checks: (result.checks || []).map(portableCheck),
        operations,
        failure,
      });
      state.timeline.push({ milestone: 'phase-finished', phase, status: result.status, at: completedAt });
      checkpoint();
    },
    finishStopped({ status, at }) {
      state.finishedAt = at;
      state.timeline.push({ milestone: 'finish-stopped', phase: null, status, at });
      checkpoint();
    },
    snapshot() {
      return {
        invocationId: state.invocationId,
        finishRunId: state.finishRunId,
        invocationOrdinal: state.invocationOrdinal,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt || new Date().toISOString(),
        timeline: state.timeline.map((item) => ({ ...item })),
        phaseResults: state.phaseResults.map((item) => JSON.parse(JSON.stringify(item))),
        stdout: state.stdout.join('\n'),
        stderr: state.stderr.join('\n'),
        failure: state.failures.at(-1) || null,
      };
    },
  };
}

export function cleanupTaskFinishDiagnosticsEvidence(evidence, options = {}) {
  const lifecycle = evidence?.lifecycle || evidence;
  if (lifecycle?.schemaVersion !== TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA || lifecycle.evidenceRetention !== 'transient') {
    return { ok: false, status: 'retained', code: 'cleanup.schema-invalid', message: 'Task Finish diagnostics lifecycle is invalid.' };
  }
  if (!INVOCATION_PATTERN.test(String(lifecycle.invocationId || ''))) {
    return { ok: false, status: 'retained', code: 'cleanup.identity-invalid', message: 'Task Finish diagnostics invocation identity is invalid.' };
  }
  const directory = path.resolve(lifecycle.cleanupReference || '');
  const summaryPath = path.resolve(lifecycle.summaryPath || '');
  const workspaceRoot = path.resolve(lifecycle.workspaceRoot || '');
  const expectedDirectory = path.join(workspaceRoot, '.buildr', 'transient', 'task-finish', 'diagnostics', lifecycle.invocationId);
  if (directory !== expectedDirectory || path.dirname(summaryPath) !== directory || path.basename(summaryPath) !== 'summary.json') {
    return { ok: false, status: 'retained', code: 'cleanup.boundary-invalid', message: 'Task Finish diagnostics cleanup boundary is invalid.' };
  }
  if (!fs.existsSync(directory)) return { ok: true, status: 'cleaned', code: 'cleanup.already-absent' };
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || !fs.existsSync(summaryPath) || fs.lstatSync(summaryPath).isSymbolicLink()) {
    return { ok: false, status: 'retained', code: 'cleanup.target-invalid', message: 'Task Finish diagnostics cleanup target is not an owned directory.' };
  }
  let summary;
  try { summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')); } catch {
    return { ok: false, status: 'retained', code: 'cleanup.summary-invalid', message: 'Task Finish diagnostics summary is unreadable.' };
  }
  if (summary.schemaVersion !== TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA || summary.invocationId !== lifecycle.invocationId || path.basename(directory) !== lifecycle.invocationId) {
    return { ok: false, status: 'retained', code: 'cleanup.identity-mismatch', message: 'Task Finish diagnostics summary does not match the cleanup identity.' };
  }
  if (typeof options.removePath !== 'function') return { ok: false, status: 'retained', code: 'cleanup.mutation-unavailable', message: 'Task Finish diagnostics cleanup capability is unavailable.' };
  try { options.removePath(directory); }
  catch { return { ok: false, status: 'retained', code: 'cleanup.remove-failed', message: 'Task Finish diagnostics cleanup mutation failed; exact evidence remains retained.' }; }
  if (fs.existsSync(directory)) return { ok: false, status: 'retained', code: 'cleanup.remove-unconfirmed', message: 'Task Finish diagnostics cleanup returned without removing the exact evidence directory.' };
  return { ok: true, status: 'cleaned', code: 'cleanup.removed' };
}
