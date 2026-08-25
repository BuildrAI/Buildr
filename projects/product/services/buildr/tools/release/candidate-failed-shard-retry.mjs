#!/usr/bin/env node
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.mjs';
import { releasePublishAuthority } from './release-authority.mjs';

const WORKFLOW = '.github/workflows/verify.yml';
const SHA = /^[a-f0-9]{40,64}$/u;

function execute(command, args, options = {}) {
  return spawnCommandSync(command, args, { encoding: 'utf8', ...options });
}

function invoke(run, command, args, cwd) {
  const result = run(command, args, { cwd });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return String(result.stdout || '').trim();
}

function parse(value, label) {
  try { return JSON.parse(value); } catch (error) { throw new Error(`${label} returned invalid JSON: ${error.message}`); }
}

function jobDisposition(name) {
  if (name === 'Candidate gate') return 'aggregate';
  if (name === 'Candidate bootstrap') return 'bootstrap';
  if (/^Candidate (?:core|Windows|Host Node) \(.+\)$/u.test(name)) return 'shard';
  if (/^Development feedback /u.test(name)) return 'not-applicable';
  return 'unknown';
}

export function inspectCandidateFailedShardRetry(options, dependencies = {}) {
  const run = dependencies.execute ?? execute;
  const gh = options.ghCommand || 'gh';
  const repo = options.repo || process.cwd();
  const runId = Number(options.runId);
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Candidate retry requires a positive run id.');
  if (!SHA.test(options.sourceCommit || '')) throw new Error('Candidate retry requires an exact source commit.');
  const current = parse(invoke(run, gh, ['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`], repo), 'Candidate run readback');
  const workflowPath = typeof current.path === 'string' ? current.path.split('@')[0] : null;
  const actual = {
    repository: current?.repository?.full_name ?? null,
    event: current?.event ?? null,
    status: current?.status ?? null,
    conclusion: current?.conclusion ?? null,
    workflowPath,
    sourceCommit: current?.head_sha ?? null,
  };
  const expected = {
    repository: releasePublishAuthority.repository,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'failure',
    workflowPath: WORKFLOW,
    sourceCommit: options.sourceCommit,
  };
  const findings = [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) findings.push({ code: 'candidate-run-not-retryable', expected, actual });
  const runAttempt = Number(current.run_attempt);
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) findings.push({ code: 'candidate-run-attempt-invalid', actual: current.run_attempt ?? null });
  const view = parse(invoke(run, gh, ['run', 'view', String(runId), '--repo', releasePublishAuthority.repository, '--json', 'jobs'], repo), 'Candidate jobs readback');
  const jobs = Array.isArray(view.jobs) ? view.jobs : [];
  const bootstrap = jobs.find((job) => job.name === 'Candidate bootstrap');
  if (bootstrap?.conclusion !== 'success') findings.push({ code: 'candidate-bootstrap-not-passed', actual: bootstrap?.conclusion ?? null });
  const unknown = jobs.filter((job) => jobDisposition(job.name) === 'unknown');
  if (unknown.length > 0) findings.push({ code: 'candidate-job-unknown', jobs: unknown.map((job) => job.name).sort() });
  const failedShards = jobs.filter((job) => jobDisposition(job.name) === 'shard' && job.conclusion === 'failure').map((job) => job.name).sort();
  if (failedShards.length === 0) findings.push({ code: 'candidate-failed-shard-missing' });
  const nonPassedShards = jobs.filter((job) => jobDisposition(job.name) === 'shard' && !['success', 'failure'].includes(job.conclusion));
  if (nonPassedShards.length > 0) findings.push({ code: 'candidate-shard-not-terminal', jobs: nonPassedShards.map((job) => ({ name: job.name, conclusion: job.conclusion })) });
  const aggregate = jobs.find((job) => job.name === 'Candidate gate');
  if (aggregate?.conclusion !== 'failure') findings.push({ code: 'candidate-aggregate-not-failed', actual: aggregate?.conclusion ?? null });
  return {
    schemaVersion: 'buildr.candidate-failed-shard-retry-result/v1',
    operation: 'inspect',
    status: findings.length === 0 ? 'ready' : 'blocked',
    repository: releasePublishAuthority.repository,
    runId,
    runAttempt,
    sourceCommit: options.sourceCommit,
    failedShards,
    aggregate: aggregate ? { name: aggregate.name, conclusion: aggregate.conclusion } : null,
    findings,
    effects: [],
    nextActions: findings.length === 0 ? [`使用同一run执行失败作业重跑：${runId}`] : ['修复Candidate run identity或job终态后重新inspect。'],
  };
}

export function retryCandidateFailedShards(options, dependencies = {}) {
  const inspected = inspectCandidateFailedShardRetry(options, dependencies);
  if (inspected.status !== 'ready') return { ...inspected, operation: 'retry' };
  if (options.confirm !== true) return {
    ...inspected,
    operation: 'retry',
    status: 'blocked',
    findings: [{ code: 'candidate-retry-confirmation-required' }],
    nextActions: ['确认对matching Candidate run执行GitHub失败作业重跑。'],
  };
  const run = dependencies.execute ?? execute;
  const gh = options.ghCommand || 'gh';
  const repo = options.repo || process.cwd();
  invoke(run, gh, ['run', 'rerun', String(inspected.runId), '--failed', '--repo', releasePublishAuthority.repository], repo);
  return {
    ...inspected,
    operation: 'retry',
    status: 'dispatched',
    effects: [{ type: 'github-candidate-failed-jobs-rerun', runId: inspected.runId, previousAttempt: inspected.runAttempt, failedShards: inspected.failedShards }],
    nextActions: [`等待run ${inspected.runId}的新attempt终态，再核验Candidate gate与aggregate workflow identity。`],
  };
}

function parseArgs(argv) {
  const action = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--confirm') options.confirm = true;
    else if (key.startsWith('--')) options[key.slice(2).replaceAll('-', '')] = argv[++index];
  }
  return { action, options: { runId: options.runid, sourceCommit: options.sourcecommit, ghCommand: options.gh, repo: options.repo, confirm: options.confirm } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { action, options } = parseArgs(process.argv.slice(2));
    const result = action === 'inspect' ? inspectCandidateFailedShardRetry(options) : action === 'retry' ? retryCandidateFailedShards(options) : null;
    if (!result) throw new Error('Usage: candidate-failed-shard-retry.mjs <inspect|retry> --run-id <id> --source-commit <sha> [--repo <path>] [--gh <command>] [--confirm]');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
