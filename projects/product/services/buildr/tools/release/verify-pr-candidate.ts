#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function requireFact(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyReleasePullRequestCandidate(
  event: any,
  repository: string,
  requestJson: (endpoint: string) => Promise<any>,
): Promise<any> {
  const pullRequest = event?.pull_request;
  const branch = pullRequest?.head?.ref;
  const sourceCommit = pullRequest?.head?.sha;
  requireFact(pullRequest?.base?.ref === 'main' && /^codex\/release-main-.+-g\d+$/u.test(branch), 'Expected a release carrier pull request into main.');
  requireFact(/^[0-9a-f]{40}$/u.test(sourceCommit), 'Release pull request has no exact source commit.');
  const runIds = [...String(pullRequest.body ?? '').matchAll(/^Candidate run ID: ([1-9]\d*)$/gmu)].map(match => Number(match[1]));
  requireFact(runIds.length === 1 && Number.isSafeInteger(runIds[0]), 'Release pull request must identify one Candidate run.');
  const runId = runIds[0];

  const run = await requestJson(`repos/${repository}/actions/runs/${runId}`);
  requireFact(run?.id === runId && run?.repository?.full_name === repository, 'Candidate run repository or ID differs from the pull request.');
  requireFact(run.event === 'workflow_dispatch' && run.path?.split('@')[0] === '.github/workflows/verify.yml', 'Referenced run is not a dispatched Candidate verification.');
  requireFact(run.head_sha === sourceCommit && run.head_branch === branch, 'Candidate run source differs from the release pull request.');
  requireFact(run.status === 'completed' && run.conclusion === 'success', 'Matching Candidate verification has not passed.');

  const jobs = await requestJson(`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`);
  requireFact(jobs?.total_count < 100, 'Candidate job list is incomplete.');
  requireFact(jobs?.jobs?.filter((job: any) => job.name === 'Candidate gate' && job.conclusion === 'success').length === 1, 'Matching Candidate gate did not pass.');
  const artifacts = await requestJson(`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`);
  requireFact(artifacts?.total_count < 100, 'Candidate artifact list is incomplete.');
  for (const name of ['candidate-package', 'candidate-aggregate']) {
    requireFact(artifacts?.artifacts?.filter((artifact: any) => artifact.name === name && artifact.expired === false && artifact.size_in_bytes > 0).length === 1, `Matching Candidate ${name} is unavailable or not unique.`);
  }
  return { status: 'passed', runId, sourceCommit, branch };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
    const repository = process.env.GITHUB_REPOSITORY ?? '';
    requireFact(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository), 'GitHub repository is unavailable.');
    const result = await verifyReleasePullRequestCandidate(event, repository, async endpoint =>
      JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 30_000 })),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error: any) {
    process.stderr.write(`Release pull request Candidate check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
