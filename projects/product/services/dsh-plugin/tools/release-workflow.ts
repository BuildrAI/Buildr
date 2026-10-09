/** Validate manual inputs and remote run facts before consuming release artifacts. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

export const REPOSITORY = 'BuildrAI/Buildr';
export const WORKFLOW = '.github/workflows/publish-dsh-plugin.yml';
export const PUBLISH_STEP = 'Publish immutable plugin';
export interface WorkflowInput { operation: 'prepare' | 'publish'; version: string; candidateRunId?: string; recoveryRunId?: string }
type Run = { id: number; workflow_id: number; path: string; event: string; head_branch: string; head_sha: string; status: string; conclusion: string | null; display_title: string; run_attempt: number; run_number: number; repository: { full_name: string } };
type Job = { name: string; status: string; conclusion: string | null; steps?: Array<{ name: string; status: string; conclusion: string | null }> };
export type GithubRead = (path: string) => Promise<any>;
function fail(code: string): never { throw new Error(`plugin_workflow_invalid: ${code}`); }
function runId(value: string | undefined, required: boolean): string | undefined {
  if (!value && !required) return undefined;
  if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) fail('run-id');
  return value;
}
export function validateWorkflowInput(env: NodeJS.ProcessEnv, source: { commit: string; version: string }): WorkflowInput {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_SERVER_URL !== 'https://github.com' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW}@refs/heads/main` || env.GITHUB_SHA !== source.commit || env.GITHUB_RUN_ATTEMPT !== '1') fail('manual-main-first-attempt-required');
  runId(env.GITHUB_RUN_ID, true);
  const operation = env.PLUGIN_OPERATION;
  if (operation !== 'prepare' && operation !== 'publish') fail('operation');
  const version = env.PLUGIN_VERSION ?? '';
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version) || version !== source.version) fail('version-must-match-source');
  const candidateRunId = runId(env.PLUGIN_CANDIDATE_RUN_ID, operation === 'publish');
  const recoveryRunId = runId(env.PLUGIN_RECOVERY_RUN_ID, false);
  if (operation === 'prepare' && (candidateRunId || recoveryRunId)) fail('prepare-cannot-consume-publication');
  if (candidateRunId === env.GITHUB_RUN_ID || recoveryRunId === env.GITHUB_RUN_ID) fail('current-run-cannot-be-source');
  return { operation, version, candidateRunId, recoveryRunId };
}
function ownRun(run: Run): void {
  if (!run || run.repository?.full_name !== REPOSITORY || run.path !== WORKFLOW || run.event !== 'workflow_dispatch' || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.workflow_id) || !Number.isSafeInteger(run.run_number) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt > 100) fail('remote-workflow-identity');
}
export function validateCandidateRun(run: Run, candidateRunId: string, sourceCommit: string, version: string, workflowId: number): void {
  ownRun(run);
  if (String(run.id) !== candidateRunId || run.workflow_id !== workflowId || run.head_sha !== sourceCommit || run.head_branch !== 'main' || run.status !== 'completed' || run.conclusion !== 'success' || run.display_title !== `DSH prepare ${version}` || run.run_attempt !== 1) fail('candidate-run-mismatch');
}
/** Missing/cancelled steps cannot prove a request was never sent. */
export function publicationMayHaveStarted(jobs: Job[]): boolean {
  const job = jobs.filter(value => value.name === 'publish');
  if (job.length !== 1 || job[0]!.status !== 'completed') return true;
  const steps = job[0]!.steps?.filter(value => value.name === PUBLISH_STEP);
  return steps?.length !== 1 || steps[0]!.status !== 'completed' || steps[0]!.conclusion !== 'skipped';
}
async function pages(api: GithubRead, path: string, key: string): Promise<any[]> {
  const values: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(result?.[key]) || !Number.isSafeInteger(result.total_count) || result.total_count > 1000) fail('history-incomplete');
    values.push(...result[key]);
    if (values.length >= result.total_count) return values;
    if (result[key].length === 0) fail('history-incomplete');
  }
  fail('history-incomplete');
}
export async function verifyPublishRuns(input: WorkflowInput, sourceCommit: string, currentRunId: string, api: GithubRead): Promise<{ candidateRunId: string; recoveryRunId?: string }> {
  if (input.operation !== 'publish' || !input.candidateRunId) fail('publish-input-required');
  const base = `/repos/${REPOSITORY}/actions`;
  const workflow = await api(`${base}/workflows/publish-dsh-plugin.yml`);
  if (workflow.path !== WORKFLOW || !Number.isSafeInteger(workflow.id)) fail('workflow-unavailable');
  const current: Run = await api(`${base}/runs/${currentRunId}`);
  ownRun(current);
  if (current.workflow_id !== workflow.id || current.display_title !== `DSH publish ${input.version}` || current.head_sha !== sourceCommit || current.head_branch !== 'main' || current.run_attempt !== 1) fail('current-run-mismatch');
  const candidate: Run = await api(`${base}/runs/${input.candidateRunId}`);
  validateCandidateRun(candidate, input.candidateRunId, sourceCommit, input.version, workflow.id);
  const history = await pages(api, `${base}/workflows/publish-dsh-plugin.yml/runs`, 'workflow_runs');
  const uncertain: Run[] = [];
  for (const run of history as Run[]) {
    ownRun(run);
    if (run.workflow_id !== workflow.id) fail('history-workflow-mismatch');
    if (run.id === current.id || run.display_title !== `DSH publish ${input.version}`) continue;
    if (run.status !== 'completed') fail('previous-publication-still-active');
    let mayHaveStarted = false;
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const jobs = await pages(api, `${base}/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
      if (publicationMayHaveStarted(jobs)) mayHaveStarted = true;
    }
    if (mayHaveStarted) uncertain.push(run);
  }
  uncertain.sort((a, b) => b.run_number - a.run_number);
  const latest = uncertain[0];
  if (latest && String(latest.id) !== input.recoveryRunId) fail('previous-publication-evidence-required');
  if (!latest && input.recoveryRunId) fail('recovery-run-has-no-publication');
  if (latest && (latest.run_attempt !== 1 || latest.head_sha !== sourceCommit || latest.head_branch !== 'main')) fail('recovery-source-or-attempt-mismatch');
  return { candidateRunId: input.candidateRunId, ...(latest ? { recoveryRunId: String(latest.id) } : {}) };
}
export function githubReader(token: string, fetchImpl: typeof fetch = fetch): GithubRead {
  if (!token) fail('github-read-access-required');
  return async path => {
    if (!path.startsWith(`/repos/${REPOSITORY}/actions/`) || path.includes('..')) fail('github-read-path');
    const response = await fetchImpl(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) fail('github-read-failed');
    const body = await response.text();
    if (Buffer.byteLength(body) > 8 * 1024 * 1024) fail('github-response-too-large');
    return JSON.parse(body);
  };
}
if (import.meta.main) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const input = validateWorkflowInput(process.env, { commit, version });
    if (process.argv[2] === 'publish-check') await verifyPublishRuns(input, commit, process.env.GITHUB_RUN_ID!, githubReader(process.env.GH_TOKEN ?? ''));
    else if (process.argv[2] !== 'input-check') fail('command');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${input.version}\n`);
    console.log(JSON.stringify({ status: 'validated', ...input }));
  } catch { console.error('Plugin workflow refused: check manual main inputs, source identity and complete previous publication evidence.'); process.exitCode = 1; }
}
