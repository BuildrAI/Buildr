import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCandidateDispatchBudget, continueCandidateRepair } from '../../../../../../skills/buildr-release/scripts/candidate-repair-operation.ts';

test('combined source and package evidence is bounded before any remote request', () => {
  assert.doesNotThrow(() => assertCandidateDispatchBudget(['source_verification=small', 'artifact_verification=small']));
  assert.throws(() => assertCandidateDispatchBudget(['source_verification=' + 'a'.repeat(35_000), 'artifact_verification=' + 'b'.repeat(35_000)]), /no remote request/u);
});

test('same-source repair accepts new evidence only after the previous request completes', () => {
  const source = 'a'.repeat(40), binding = { productSource: source, verificationSource: source };
  const candidate: any = { sourceCommit: source, branch: 'frozen', runId: 40 };
  let dispatched = 0, running = false;
  const runs: any[] = [];
  const scope = {
    git: (args: string[]) => { assert.notEqual(args[0], 'merge-base', 'same frozen source introduces no unreviewed dev code'); return source; },
    save: () => {}, ensureCarrier: () => {},
    gh: (args: string[]) => {
      if (args[0] === 'api') return JSON.stringify({ id: Number(args[1]!.split('/').at(-1)), head_sha: source, repository: { full_name: 'BuildrAI/Buildr' },
        event: 'workflow_dispatch', path: '.github/workflows/verify.yml', status: running ? 'in_progress' : 'completed' });
      if (args[0] === 'run') return JSON.stringify(runs);
      assert.equal(args[0], 'workflow');
      const original = args.find(value => value.startsWith('repair_candidate_run_id='))!.split('=')[1];
      runs.push({ databaseId: 41 + dispatched++, headSha: source, displayTitle: `Candidate repair ${original} ${source}` });
      return '';
    },
  };
  const base = { repo: '/owned', candidate, verificationSource: source, fields: [] as string[] };
  assert.equal(continueCandidateRepair({ ...base, artifactTransport: 'first' }, scope, { bind: () => binding }).status, 'adopted');
  assert.equal(dispatched, 1);
  assert.equal(continueCandidateRepair(base, scope, { bind: () => binding }).status, 'adopted', 'ordinary readback retains the prior inputs');
  assert.equal(dispatched, 1);
  running = true;
  assert.equal(continueCandidateRepair({ ...base, artifactTransport: 'second' }, scope, { bind: () => binding }).status, 'candidate-running');
  assert.equal(dispatched, 1, 'never replace an active request');
  running = false;
  assert.equal(continueCandidateRepair({ ...base, artifactTransport: 'second' }, scope, { bind: () => binding }).status, 'adopted');
  assert.equal(dispatched, 2, 'terminal same-source repair must consume the new evidence instead of silently ignoring it');
  assert.equal(candidate.repairHistory.length, 1);
  assert.equal(candidate.repair.originalRunId, 41);
});
