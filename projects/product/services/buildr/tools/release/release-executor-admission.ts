/** Admit publisher-only repairs using the original failed transaction, never as a new Candidate. */
import { execFileSync } from 'node:child_process';
import { createReleaseExecutorRecovery } from './release-executor-recovery.ts';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.ts';

export async function verifyReleaseExecutorPullRequest(event: any, repository: string, repo: string, dependencies: any = {}): Promise<any> {
  const pr = event?.pull_request;
  if (repository !== 'BuildrAI/Buildr' || pr?.base?.ref !== 'main' || pr?.head?.repo?.full_name !== repository
      || !/^codex\/release-executor-[a-z0-9.-]+(?:_[a-z0-9.-]+)*$/u.test(pr?.head?.ref ?? '')
      || !/^[a-f0-9]{40}$/u.test(pr?.head?.sha ?? '') || !/^[a-f0-9]{40}$/u.test(pr?.base?.sha ?? '')) throw new Error('Publisher repair pull request identity is invalid.');
  const ids = [...String(pr.body ?? '').matchAll(/^Original publication run ID: ([1-9]\d*)$/gmu)].map(match => Number(match[1]));
  if (ids.length !== 1 || !Number.isSafeInteger(ids[0])) throw new Error('Publisher repair requires one original publication run.');
  const observed = await (dependencies.inspect ?? inspectHostedReleaseTransaction)({ runId: ids[0], repository }, dependencies.evidenceDependencies);
  const previous = observed.evidence;
  if (observed.status !== 'failed' || previous?.status !== 'failed' || previous.publish?.runId !== ids[0]) throw new Error('Publisher repair requires the authentic failed transaction.');
  const read = dependencies.git ?? ((args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim());
  if (read(['rev-parse', 'HEAD']).trim() !== pr.head.sha || read(['merge-base', pr.base.sha, previous.context.convergence.mainCommit]).trim() !== previous.context.convergence.mainCommit) throw new Error('Publisher repair does not preserve the original protected source.');
  const recovery = createReleaseExecutorRecovery(previous.context, { repo, sourceCommit: pr.head.sha, previousEvidence: previous }, dependencies.recoveryDependencies);
  return { status: 'passed', kind: 'publisher-repair-admission', aggregateEligible: false, originalRunId: ids[0], originalSourceCommit: previous.context.convergence.mainCommit,
    candidateRunId: previous.context.candidate.runId, executionCommit: recovery.sourceCommit };
}
