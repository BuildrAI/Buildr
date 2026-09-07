#!/usr/bin/env node
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { releasePublishAuthority } from './release-authority.ts';

const WORKFLOW: any = '.github/workflows/verify.yml';
const SHA: any = /^[a-f0-9]{40,64}$/u;

function execute(command: any, args: any, options: any = {}): any  {
  return spawnCommandSync(command, args, { encoding: 'utf8', ...options });
}

function invoke(run: any, command: any, args: any, cwd: any): any  {
  const result: any = run(command, args, { cwd });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return String(result.stdout || '').trim();
}

function parse(value: any, label: any): any  {
  try { return JSON.parse(value); } catch (error: any) { throw new Error(`${label} returned invalid JSON: ${error.message}`); }
}

function jobDisposition(name: any): any  {
  if (name === 'Candidate gate') return 'aggregate';
  if (name === 'Candidate plan') return 'plan';
  if (name === 'Candidate bootstrap') return 'bootstrap';
  if (/^Candidate (?:source|artifact|core|Windows|Host Node) \(.+\)$/u.test(name)) return 'shard';
  if (/^Development feedback /u.test(name)) return 'not-applicable';
  return 'unknown';
}

export function classifyCandidateFailure(log: string): 'transient' | 'deterministic' | 'diagnosis-required' {
  if (/ERR_ASSERTION|AssertionError|SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|error TS\d+|not ok \d+/iu.test(log)) return 'deterministic';
  if (/ECONNRESET|EAI_AGAIN|HTTP (?:429|502|503|504)|TLS handshake timeout|runner.*lost.*communication|runner.*shutdown/iu.test(log)) return 'transient';
  return 'diagnosis-required';
}

export function inspectCandidateFailedShardRetry(options: any, dependencies: any = {}): any  {
  const run: any = dependencies.execute ?? execute;
  const gh: any = options.ghCommand || 'gh';
  const repo: any = options.repo || process.cwd();
  const runId: any = Number(options.runId);
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Candidate retry requires a positive run id.');
  if (!SHA.test(options.sourceCommit || '')) throw new Error('Candidate retry requires an exact source commit.');
  const current: any = parse(invoke(run, gh, ['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`], repo), 'Candidate run readback');
  const workflowPath: any = typeof current.path === 'string' ? current.path.split('@')[0] : null;
  const actual: any = {
    repository: current?.repository?.full_name ?? null,
    event: current?.event ?? null,
    status: current?.status ?? null,
    conclusion: current?.conclusion ?? null,
    workflowPath,
    sourceCommit: current?.head_sha ?? null,
  };
  const expected: any = {
    repository: releasePublishAuthority.repository,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'failure',
    workflowPath: WORKFLOW,
    sourceCommit: options.sourceCommit,
  };
  const findings: any[] = [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) findings.push({ code: 'candidate-run-not-retryable', expected, actual });
  const runAttempt: any = Number(current.run_attempt);
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) findings.push({ code: 'candidate-run-attempt-invalid', actual: current.run_attempt ?? null });
  if (runAttempt >= 2) findings.push({ code: 'candidate-auto-retry-exhausted', actual: runAttempt, message: '同一运行已自动恢复一次；继续诊断，不再自动重跑。' });
  const view: any = parse(invoke(run, gh, ['run', 'view', String(runId), '--repo', releasePublishAuthority.repository, '--json', 'jobs'], repo), 'Candidate jobs readback');
  const jobs: any = Array.isArray(view.jobs) ? view.jobs : [];
  const bootstrap: any = jobs.find((job: any) => job.name === 'Candidate bootstrap');
  if (!['success', 'failure'].includes(bootstrap?.conclusion)) findings.push({ code: 'candidate-bootstrap-not-terminal', actual: bootstrap?.conclusion ?? null });
  const unknown: any = jobs.filter((job: any) => jobDisposition(job.name) === 'unknown');
  if (unknown.length > 0) findings.push({ code: 'candidate-job-unknown', jobs: unknown.map((job: any) => job.name).sort() });
  const failedShards: any = jobs.filter((job: any) => ['shard', 'bootstrap', 'plan'].includes(jobDisposition(job.name)) && job.conclusion === 'failure').map((job: any) => job.name).sort();
  if (failedShards.length === 0) findings.push({ code: 'candidate-failed-shard-missing' });
  const nonPassedShards: any = jobs.filter((job: any) => jobDisposition(job.name) === 'shard' && !['success', 'failure', ...(bootstrap?.conclusion === 'failure' ? ['skipped'] : [])].includes(job.conclusion));
  if (nonPassedShards.length > 0) findings.push({ code: 'candidate-shard-not-terminal', jobs: nonPassedShards.map((job: any) => ({ name: job.name, conclusion: job.conclusion })) });
  const aggregate: any = jobs.find((job: any) => job.name === 'Candidate gate');
  if (aggregate?.conclusion !== 'failure') findings.push({ code: 'candidate-aggregate-not-failed', actual: aggregate?.conclusion ?? null });
  let failureClass = 'diagnosis-required';
  if (findings.length === 0) {
    const log = invoke(run, gh, ['run', 'view', String(runId), '--repo', releasePublishAuthority.repository, '--log-failed'], repo);
    failureClass = classifyCandidateFailure(log);
    if (failureClass !== 'transient') findings.push({ code: 'candidate-failure-needs-diagnosis', classification: failureClass });
  }
  return {
    schemaVersion: 'buildr.candidate-failed-shard-retry-result/v1',
    operation: 'inspect',
    status: findings.length === 0 ? 'ready' : 'blocked',
    repository: releasePublishAuthority.repository,
    runId,
    runAttempt,
    sourceCommit: options.sourceCommit,
    failedShards,
    failureClass,
    aggregate: aggregate ? { name: aggregate.name, conclusion: aggregate.conclusion } : null,
    findings,
    effects: [],
    nextActions: findings.length === 0 ? [`使用同一run执行一次失败作业重跑：${runId}`] : ['读取对应失败分片与进程/资源诊断，修复确定性原因；不重跑完整候选。'],
  };
}

export function retryCandidateFailedShards(options: any, dependencies: any = {}): any  {
  const inspected: any = inspectCandidateFailedShardRetry(options, dependencies);
  if (inspected.status !== 'ready') return { ...inspected, operation: 'retry' };
  const run: any = dependencies.execute ?? execute;
  const gh: any = options.ghCommand || 'gh';
  const repo: any = options.repo || process.cwd();
  const effect = { type: 'github-candidate-failed-jobs-rerun', runId: inspected.runId, previousAttempt: inspected.runAttempt, failedShards: inspected.failedShards, state: 'unknown' };
  try {
    invoke(run, gh, ['run', 'rerun', String(inspected.runId), '--failed', '--repo', releasePublishAuthority.repository], repo);
    effect.state = 'confirmed';
  } catch (error) {
    return { ...inspected, operation: 'retry', status: 'unknown', effects: [effect], diagnostic: { message: error instanceof Error ? error.message : String(error) }, nextActions: [`回读run ${inspected.runId}的attempt，确认是否已经重跑；不要再次派发。`] };
  }
  return {
    ...inspected,
    operation: 'retry',
    status: 'dispatched',
    effects: [effect],
    nextActions: [`等待run ${inspected.runId}的新attempt终态，再核验Candidate gate与aggregate workflow identity。`],
  };
}

function parseArgs(argv: any): any  {
  const action: any = argv[0];
  const options: any = {};
  for (let index: any = 1; index < argv.length; index += 1) {
    const key: any = argv[index];
    if (key.startsWith('--')) options[key.slice(2).replaceAll('-', '')] = argv[++index];
  }
  return { action, options: { runId: options.runid, sourceCommit: options.sourcecommit, ghCommand: options.gh, repo: options.repo, confirm: options.confirm } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { action, options }: any = parseArgs(process.argv.slice(2));
    const result: any = action === 'inspect' ? inspectCandidateFailedShardRetry(options) : action === 'retry' ? retryCandidateFailedShards(options) : null;
    if (!result) throw new Error('Usage: candidate-failed-shard-retry.ts <inspect|retry> --run-id <id> --source-commit <sha> [--repo <path>] [--gh <command>]');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'blocked') process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
