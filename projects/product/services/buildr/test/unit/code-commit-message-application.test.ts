import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodeCommitMessageApplication, COMMIT_MESSAGE_PROMPT, COMMIT_MESSAGE_PROMPT_LIMIT_BYTES } from '../../src/modules/code/application/code-commit-message-application.ts';
import type { AgentGenerationInput, AgentRunView } from '../../src/modules/agent-operations/module.ts';
import type { CodeCommitSnapshot } from '../../src/modules/code/infrastructure/code-commit-snapshot.ts';
import type { CodeCommitGuidance } from '../../src/modules/code/infrastructure/code-commit-guidance.ts';
import type { CodeCommitMaterial } from '../../src/modules/code/infrastructure/code-commit-material.ts';
import { createCodeGenerationHttpContribution } from '../../src/modules/code/interfaces/http/code-generation-http.ts';

const location = { repositoryId: 'repo-1', worktreeId: 'checkout-' + 'a'.repeat(64) };
function snapshot(): CodeCommitSnapshot {
  return {
    source: { ...location, taskId: null, checkoutId: location.worktreeId, worktreeGroupId: null, commitHash: null, location: '/registered/checkout', version: 'current', kind: 'default' },
    revision: 'exact-content-1', head: 'a'.repeat(40), branch: 'dev', branchRef: 'refs/heads/dev', indexPath: '/registered/checkout/.git/index', indexDigest: 'index-1', indexRevision: 'index-1', configDigest: 'config-1',
    paths: ['tracked.ts', 'new.ts'], files: [{ path: 'tracked.ts', kind: 'text', bytes: 6, digest: 'old', mode: 33188, content: 'new();' }, { path: 'new.ts', kind: 'text', bytes: 12, digest: 'new', mode: 33188, content: 'new file();', untracked: true }],
    diff: 'diff --git a/tracked.ts b/tracked.ts\n-old();\n+new();', hasChanges: true,
  };
}
function environment(task: CodeCommitGuidance['task'] = null): CodeCommitGuidance {
  return { scopes: [{ kind: 'repository', path: '/registered/checkout' }], ruleEntrypoints: ['/workspace/AGENTS.md'], readableRoots: ['/registered/checkout', '/registered/git-metadata', '/workspace/AGENTS.md'], task, revision: 'environment-1' };
}
// An in-memory port keeps application tests independent of filesystem/Git reads.
function material(current: CodeCommitSnapshot, guidance: CodeCommitGuidance): CodeCommitMaterial {
  const textFiles = current.files.filter(file => file.kind === 'text');
  const coverage = {totalPaths: current.paths.length, includedPaths: current.files.length, omittedPaths: 0, totalTextFiles: textFiles.length, evidenceFiles: textFiles.length, omittedEvidenceFiles: 0, ruleSources: 1, includedRuleSources: 1, omittedRuleSources: 0, rulesPartial: false, evidencePartial: false};
  return {text: JSON.stringify({scope: 'all-final-uncommitted-changes', branch: current.branch, task: guidance.task, pathSamples: current.files.map(({path, kind, bytes}) => ({path, kind, bytes})), rules: [{text: '使用准确提交标题'}], evidence: textFiles.map(file => ({path: file.path, text: file.content?.slice(0, 100)})), coverage}), revision: 'material-1', coverage};
}
const run: AgentRunView = { id: 'run-1', agentId: 'codex-1', registrationRevision: 'registration-1', status: 'queued', output: null, error: null, executionConfig: null };

test('generation supplies bounded materials once with no tool environment and retains the shared content guard', async () => {
  let current = snapshot(), captured: AgentGenerationInput | undefined;
  const options: unknown[] = [];
  const application = createCodeCommitMessageApplication({
    commitSnapshot(root, input, option) { assert.equal(root, '/workspace'); assert.deepEqual(input, location); options.push(option); return current; },
    commitGuidance: () => environment(), commitMaterial: material, startGeneration(input) { captured = input; return run; },
  });
  assert.deepEqual(await application.generateCommitMessage('/workspace', { ...location, expectedRevision: current.revision, agentId: 'codex-1' }), run);
  assert.equal(captured?.cwd, '/registered/checkout'); assert.equal(captured?.agentId, 'codex-1');
  assert.ok(captured!.prompt.startsWith(COMMIT_MESSAGE_PROMPT + '\n\n<materials>\n'));
  assert.ok(COMMIT_MESSAGE_PROMPT.includes('\n')); assert.ok(!COMMIT_MESSAGE_PROMPT.includes('\\n'));
  assert.match(captured!.prompt, /new file\(\);/);
  assert.doesNotMatch(captured!.prompt, /\.git\/index|"digest"|readableRoots|<environment>|"cwd"/);
  assert.match(captured!.prompt, /all-final-uncommitted-changes/); assert.match(captured!.prompt, /不自行补查，不调用任何工具/);
  assert.equal(captured!.environment, undefined); assert.equal(captured!.execution?.reasoningEffort, 'low');
  assert.ok(captured!.execution!.timeoutMs! > 0 && captured!.execution!.timeoutMs! <= 60_000);
  await captured!.validateResult!({ commitMessage: 'Update actual behavior' }); current = { ...current, revision: 'exact-content-2' };
  await assert.rejects(Promise.resolve(captured!.validateResult!({ commitMessage: 'Update actual behavior' })), { code: 'code_source_changed' });
  assert.ok(options.length >= 3); for (const option of options) assert.deepEqual(option, { includeDiff: false });
});

test('the 16 KiB UTF-8 budget includes instructions and material delimiters without rejecting large source content', async () => {
  let current = snapshot(), calls = 0, captured: AgentGenerationInput | undefined, budget = 0;
  const app = createCodeCommitMessageApplication({ commitSnapshot: () => current, commitGuidance: () => environment(), commitMaterial: (value, guidance, maxBytes) => {budget = maxBytes; return {...material(value, guidance), text: '界'.repeat(Math.floor(maxBytes / 3)) + 'a'.repeat(maxBytes % 3)};}, startGeneration: input => { calls++; captured = input; return run; } });
  const invoke = (revision = current.revision) => app.generateCommitMessage('/workspace', { ...location, expectedRevision: revision });
  await assert.rejects(invoke('stale'), { code: 'code_source_changed' }); current = { ...snapshot(), hasChanges: false };
  await assert.rejects(invoke(), { code: 'code_commit_message_empty' }); assert.equal(calls, 0);
  current = { ...snapshot(), diff: 'DIFF-SENTINEL'.repeat(1024 * 1024), files: [{ ...snapshot().files[1], content: 'BODY-SENTINEL'.repeat(512 * 1024) }] };
  await invoke(); assert.equal(calls, 1); assert.ok(budget > 0 && budget < COMMIT_MESSAGE_PROMPT_LIMIT_BYTES);
  assert.equal(Buffer.byteLength(captured!.prompt), COMMIT_MESSAGE_PROMPT_LIMIT_BYTES); assert.doesNotMatch(captured!.prompt, /DIFF-SENTINEL|BODY-SENTINEL/);
});

test('binary-only sources pass metadata to the same tool-free operation', async () => {
  let captured: AgentGenerationInput | undefined;
  const current = { ...snapshot(), paths: ['image.png'], files: [{ path: 'image.png', kind: 'binary' as const, bytes: 10, digest: 'binary', mode: 33188 }], diff: '' };
  const app = createCodeCommitMessageApplication({ commitSnapshot: () => current, commitGuidance: () => environment(), commitMaterial: material, startGeneration: input => { captured = input; return run; } });
  await app.generateCommitMessage('/workspace', { ...location, expectedRevision: current.revision });
  assert.match(captured!.prompt, /image.png/); assert.match(captured!.prompt, /"kind":"binary"/); assert.doesNotMatch(captured!.prompt, /GIT binary patch/); assert.equal(captured!.environment, undefined);
});

test('verified task background enforces one actual terminal task trailer without forcing a title format', async () => {
  let captured: AgentGenerationInput | undefined;
  const app = createCodeCommitMessageApplication({ commitSnapshot: snapshot, commitGuidance: () => environment({ taskId: 'verified-task', title: 'Task title', intent: 'Target behavior' }), commitMaterial: material, startGeneration: input => { captured = input; return run; } });
  await app.generateCommitMessage('/workspace', { ...location, expectedRevision: snapshot().revision }); assert.match(captured!.prompt, /"taskId":"verified-task"/);
  await captured!.validateResult!({ commitMessage: 'Improve actual behavior\n\nBuildr-Task: verified-task' });
  for (const commitMessage of ['feat: change\n\nBuildr-Task: wrong-task', 'feat: change\n\nBuildr-Task: verified-task\nBuildr-Task: verified-task', 'feat: change\n\nBuildr-Task: verified-task\n\nMore body', 'feat: change', '   ']) await assert.rejects(Promise.resolve(captured!.validateResult!({ commitMessage })), { code: 'code_commit_message_output_invalid' });
});

test('missing task association allows ordinary output and body examples but rejects invented task trailers', async () => {
  let captured: AgentGenerationInput | undefined;
  const app = createCodeCommitMessageApplication({ commitSnapshot: snapshot, commitGuidance: () => environment(), commitMaterial: material, startGeneration: input => { captured = input; return run; } });
  await app.generateCommitMessage('/workspace', { ...location, expectedRevision: snapshot().revision }); await captured!.validateResult!({ commitMessage: 'Adjust behavior' });
  await captured!.validateResult!({ commitMessage: 'Update trailer documentation\n\nExample:\nBuildr-Task: example\n\nExplain the accepted format.' });
  for (const trailer of ['Buildr-Task: guessed', 'buildr-task: guessed']) await assert.rejects(Promise.resolve(captured!.validateResult!({ commitMessage: 'Adjust behavior\n\n' + trailer })), { code: 'code_commit_message_output_invalid' });
});

test('completion rechecks guidance and the actual prepared material revision', async () => {
  let captured: AgentGenerationInput | undefined, current = environment(), materialRevision = 'material-1';
  const app = createCodeCommitMessageApplication({ commitSnapshot: snapshot, commitGuidance: () => current, commitMaterial: (value, guidance) => ({...material(value, guidance), revision: materialRevision}), startGeneration: input => { captured = input; return run; } });
  await app.generateCommitMessage('/workspace', { ...location, expectedRevision: snapshot().revision });
  current = {...current, revision: 'environment-2'};
  await assert.rejects(Promise.resolve(captured!.validateResult!({commitMessage: 'Update behavior'})), error => (error as {code?: string}).code === 'code_source_changed' && /规则入口或任务关联/.test((error as Error).message));
  current = environment(); materialRevision = 'material-2';
  await assert.rejects(Promise.resolve(captured!.validateResult!({commitMessage: 'Update behavior'})), error => (error as {code?: string}).code === 'code_source_changed' && /提交说明材料/.test((error as Error).message));
});

test('content drift while preparing materials rejects before invoking the agent', async () => {
  let current = snapshot(), calls = 0;
  const app = createCodeCommitMessageApplication({commitSnapshot: () => current, commitGuidance: () => environment(), commitMaterial: async (value, guidance) => {current = {...current, revision: 'changed-during-material'}; return material(value, guidance);}, startGeneration: () => {calls++; return run;}});
  await assert.rejects(app.generateCommitMessage('/workspace', {...location, expectedRevision: current.revision}), {code: 'code_source_changed'}); assert.equal(calls, 0);
});

test('content drift during the final material rebuild cannot publish a stale result', async () => {
  let current = snapshot(), captured: AgentGenerationInput | undefined, preparations = 0;
  const app = createCodeCommitMessageApplication({commitSnapshot: () => current, commitGuidance: () => environment(), commitMaterial: async (value, guidance) => {if (++preparations > 1) current = {...current, revision: 'changed-during-final-material'}; return material(value, guidance);}, startGeneration: input => {captured = input; return run;}});
  await app.generateCommitMessage('/workspace', {...location, expectedRevision: current.revision});
  await assert.rejects(Promise.resolve(captured!.validateResult!({commitMessage: 'Update behavior'})), {code: 'code_source_changed'});
});

test('material preparation consumes the same 60-second budget before the unified operation starts', async t => {
  let now = 1000, captured: AgentGenerationInput | undefined;
  t.mock.method(Date, 'now', () => now);
  const app = createCodeCommitMessageApplication({commitSnapshot: snapshot, commitGuidance: () => environment(), commitMaterial: (value, guidance) => {now += 650; return material(value, guidance);}, startGeneration: input => {captured = input; return run;}});
  await app.generateCommitMessage('/workspace', {...location, expectedRevision: snapshot().revision});
  assert.deepEqual(captured!.execution, {reasoningEffort: 'low', timeoutMs: 59_350});
});

test('exhausting the total budget in preparation fails locally without invoking the agent', async t => {
  let now = 1000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const app = createCodeCommitMessageApplication({commitSnapshot: snapshot, commitGuidance: () => environment(), commitMaterial: (value, guidance) => {now += 60_000; return material(value, guidance);}, startGeneration: () => {calls++; return run;}});
  await assert.rejects(app.generateCommitMessage('/workspace', {...location, expectedRevision: snapshot().revision}), {code: 'code_commit_message_timeout', status: 504}); assert.equal(calls, 0);
});

test('generation HTTP requires authorization and cannot accept arbitrary cwd, read scopes or execution policy', async () => {
  let calls = 0;
  const contribution = createCodeGenerationHttpContribution({ async generateCommitMessage() { calls++; return run; } });
  const base = { request: { method: 'POST' }, suffix: '/code/commit-message', searchParams: new URLSearchParams(), root: '/workspace' };
  await assert.rejects(contribution.handle(base), { code: 'code_generation_unauthorized' });
  let authorized = 0;
  const input = { ...base, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ ...location, expectedRevision: 'exact-content-1' }) };
  assert.deepEqual(await contribution.handle(input), { status: 202, body: run }); assert.equal(authorized, 1); assert.equal(calls, 1);
  for (const extra of [{ cwd: '/other' }, { environment: { kind: 'workspace-read-only', readableRoots: ['/'] } }, { execution: { reasoningEffort: 'ultra', timeoutMs: 300_000 } }]) await assert.rejects(contribution.handle({ ...input, readJsonBody: async () => ({ ...location, expectedRevision: 'v1', ...extra }) }), { code: 'code_generation_invalid' });
  await assert.rejects(contribution.handle({ ...input, searchParams: new URLSearchParams('cwd=/other') }), { code: 'code_query_invalid' }); assert.equal(calls, 1);
});
