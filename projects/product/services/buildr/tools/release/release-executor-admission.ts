/** Admit publisher-only repairs using the original failed transaction, never as a new Candidate. */
import { execFileSync } from 'node:child_process';
import { assertReleaseExecutorSource, createReleaseExecutorRecovery } from './release-executor-recovery.ts';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.ts';
import { containsCredentialMaterial } from './release-authority.ts';
import { readHostedPluginJournal, validatePluginHostedRun } from './plugin-hosted-release.ts';

/** This admits release-tool changes; the publication owner still verifies the frozen prepare and package bytes. */
async function verifyPluginRepair(pr: any, repository: string, repo: string, runId: number, dependencies: any): Promise<any> {
  const read = dependencies.git ?? ((args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }).trim());
  const run = await (dependencies.readRun ?? ((id: number) => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${id}`],
    { cwd: repo, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }))))(runId);
  const version = /^DSH publish (\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?)$/u.exec(run?.display_title ?? '')?.[1];
  if (!version || run.status !== 'completed' || run.conclusion !== 'failure') throw new Error('Plugin publisher repair requires an authentic terminal failed publication.');
  validatePluginHostedRun(run, { operation: 'publish', version, sourceCommit: pr.base.sha, runId });
  if (read(['rev-parse', 'HEAD']).trim() !== pr.head.sha || read(['rev-parse', 'origin/main']).trim() !== pr.base.sha) throw new Error('Plugin publisher repair must bind the current main executor and exact pull request head.');
  const journal = await (dependencies.readPluginJournal ?? readHostedPluginJournal)({ repo, runId, version }, dependencies.pluginDependencies);
  const fields = ['schemaVersion', 'packageName', 'version', 'sourceCommit', 'sourceTree', 'sha256', 'integrity', 'attempted', 'publishedObserved',
    'status', 'action', 'registry', 'observedAt', 'request', 'code'];
  if (!journal || typeof journal !== 'object' || Array.isArray(journal) || Object.keys(journal).some(key => !fields.includes(key))
    || containsCredentialMaterial(journal) || journal.schemaVersion !== 'buildr.dsh-plugin-publication/v1'
    || journal.packageName !== '@buildr-ai/buildr-dsh-plugin' || journal.version !== version
    || ![journal.sourceCommit, journal.sourceTree].every(value => /^[a-f0-9]{40}$/u.test(value ?? ''))
    || !/^[a-f0-9]{64}$/u.test(journal.sha256 ?? '') || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(journal.integrity ?? '')
    || journal.attempted !== false || journal.publishedObserved !== false || journal.registry !== 'absent'
    || journal.status !== 'blocked' || journal.action !== 'blocked' || journal.code !== 'plugin-oidc-authority-mismatch'
    || typeof journal.observedAt !== 'string' || !Number.isFinite(Date.parse(journal.observedAt)) || journal.request?.runId !== runId || journal.request?.runAttempt !== run.run_attempt
    || Object.keys(journal.request ?? {}).length !== 3
    || journal.request?.workflowRef !== 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main') throw new Error('Plugin publisher repair requires the exact unattempted authority-failure journal.');
  const service = 'projects/product/services/dsh-plugin';
  const metadata = JSON.parse(read(['show', `${journal.sourceCommit}:${service}/package.json`]));
  if (metadata.name !== '@buildr-ai/buildr-dsh-plugin-source' || metadata.private !== true || metadata.version !== version
    || read(['rev-parse', `${journal.sourceCommit}:${service}`]).trim() !== journal.sourceTree) throw new Error('Plugin publisher repair journal differs from its original source.');
  // G17 is the package source; the prior protected run head is only its executor.
  // Both comparisons prohibit changing package metadata, locks or runtime payload.
  assertReleaseExecutorSource({ repo, originalCommit: journal.sourceCommit, executionCommit: pr.head.sha }, dependencies.recoveryDependencies);
  const execution = assertReleaseExecutorSource({ repo, originalCommit: run.head_sha, executionCommit: pr.head.sha }, dependencies.recoveryDependencies);
  return { status: 'passed', kind: 'plugin-publisher-repair-admission', aggregateEligible: false, originalRunId: runId,
    originalSourceCommit: journal.sourceCommit, originalExecutionCommit: run.head_sha, executionCommit: execution.sourceCommit, packageVersion: version };
}

export async function verifyReleaseExecutorPullRequest(event: any, repository: string, repo: string, dependencies: any = {}): Promise<any> {
  const pr = event?.pull_request;
  if (repository !== 'BuildrAI/Buildr' || pr?.base?.ref !== 'main' || pr?.head?.repo?.full_name !== repository
      || !/^codex\/release-executor-[a-z0-9.-]+(?:_[a-z0-9.-]+)*$/u.test(pr?.head?.ref ?? '')
      || !/^[a-f0-9]{40}$/u.test(pr?.head?.sha ?? '') || !/^[a-f0-9]{40}$/u.test(pr?.base?.sha ?? '')) throw new Error('Publisher repair pull request identity is invalid.');
  const ids = [...String(pr.body ?? '').matchAll(/^Original publication run ID: ([1-9]\d*)$/gmu)].map(match => Number(match[1]));
  const pluginIds = [...String(pr.body ?? '').matchAll(/^Original plugin publication run ID: ([1-9]\d*)$/gmu)].map(match => Number(match[1]));
  if (ids.length + pluginIds.length !== 1 || !Number.isSafeInteger(ids[0] ?? pluginIds[0])) throw new Error('Publisher repair requires one original publication run.');
  if (pluginIds.length) return verifyPluginRepair(pr, repository, repo, pluginIds[0], dependencies);
  const observed = await (dependencies.inspect ?? inspectHostedReleaseTransaction)({ runId: ids[0], repository }, dependencies.evidenceDependencies);
  const previous = observed.evidence;
  if (observed.status !== 'failed' || previous?.status !== 'failed' || previous.publish?.runId !== ids[0]) throw new Error('Publisher repair requires the authentic failed transaction.');
  const read = dependencies.git ?? ((args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim());
  if (read(['rev-parse', 'HEAD']).trim() !== pr.head.sha || read(['merge-base', pr.base.sha, previous.context.convergence.mainCommit]).trim() !== previous.context.convergence.mainCommit) throw new Error('Publisher repair does not preserve the original protected source.');
  const recovery = createReleaseExecutorRecovery(previous.context, { repo, sourceCommit: pr.head.sha, previousEvidence: previous }, dependencies.recoveryDependencies);
  return { status: 'passed', kind: 'publisher-repair-admission', aggregateEligible: false, originalRunId: ids[0], originalSourceCommit: previous.context.convergence.mainCommit,
    candidateRunId: previous.context.candidate.runId, executionCommit: recovery.sourceCommit };
}
