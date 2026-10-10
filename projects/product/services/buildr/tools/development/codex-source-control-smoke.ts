import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AgentOperationsApplication } from '../../src/modules/agent-operations/application/agent-operations-application.ts';
import { CodexAppServer } from '../../src/modules/agent-operations/infrastructure/codex-app-server.ts';
import { readCurrentProductIdentity } from '../../src/modules/installation/module.ts';
import { resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { createCodeApplication, type CodeDependencies } from '../../src/modules/code/application/code-application.ts';
import { createCodeCommitMessageApplication, COMMIT_MESSAGE_PROMPT_LIMIT_BYTES } from '../../src/modules/code/application/code-commit-message-application.ts';
import { readCodeCommitGuidance } from '../../src/modules/code/infrastructure/code-commit-guidance.ts';
import { createCodeCommitMaterialReader, type CodeCommitMaterialReaderDependencies } from '../../src/modules/code/infrastructure/code-commit-material.ts';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { AGENT_ASSETS_SOURCE_READ } from '../../src/modules/agent-assets/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import type { AgentRegistryView } from '../../src/modules/agent-operations/domain/agent-operations.ts';

// Explicit opt-in only; the shared runner owns every Buildr data directory and cleanup.
const base = process.env.BUILDR_SMOKE_ROOT;
const executable = process.argv[2];
if (!base || !executable || !path.isAbsolute(executable)) throw new Error('Use run-isolated-workspace-smoke.ts --script <this-file> -- <actual-codex-entry>.');
// This generated-data scenario measures the real model when explicitly run; it
// cannot replace timing and content review on the user's actual source changes.
const generationBudgetMs = 60_000;
const cli = (...args: string[]) => execFileSync(process.execPath, [path.resolve(import.meta.dirname, '../../bin/buildr.mjs'), ...args], { encoding: 'utf8', timeout: 30_000, env: process.env });
assert.match(cli('help', 'agent'), /agent register codex/);
const before = JSON.parse(cli('agent', 'list', '--json')) as AgentRegistryView;
assert.equal(before.agents.length, 0, 'isolated smoke must not read a daily Buildr registration');
const registered = JSON.parse(cli('agent', 'register', 'codex', '--executable', executable, '--expected-revision', before.revision, '--json')) as AgentRegistryView;
assert.equal(registered.agents.length, 1);
assert.ok(registered.defaultAgentId);

const root = path.join(base, 'repository'), remote = path.join(base, 'remote.git');
fs.mkdirSync(root);
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(root, 'init', '--initial-branch=main');
git(root, 'config', 'user.name', 'Buildr smoke'); git(root, 'config', 'user.email', 'smoke@example.invalid'); git(root, 'config', 'commit.gpgSign', 'false');
fs.writeFileSync(path.join(root, 'README.md'), '# Smoke\n');
fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Write Git commit messages in English. Use type(scope): subject; scope is optional.\n');
fs.writeFileSync(path.join(root, 'icon.bin'), Buffer.from([0, 1, 2, 3]));
git(root, 'add', '--', '.'); git(root, 'commit', '-m', 'initial fixture');
fs.mkdirSync(remote); git(remote, 'init', '--bare'); git(root, 'remote', 'add', 'origin', remote); git(root, 'push', '--set-upstream', 'origin', 'main');
fs.writeFileSync(path.join(root, 'README.md'), '# Smoke\n\nDescribe the source-control commit panel.\n');
fs.writeFileSync(path.join(root, 'icon.bin'), Buffer.from([0, 1, 2, 4]));
const largeSentinel = 'FULL_CONTEXT_MUST_NOT_BE_INLINED_7ec6';
fs.writeFileSync(path.join(root, 'large-notes.txt'), largeSentinel + '\n' + 'source-control reference data\n'.repeat(190_000));
for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(root, `prototype-${i}.html`), '<!doctype html><title>Commit panel fixture</title>\n' + '<!-- generated layout fixture -->\n'.repeat(28_000));
for (let i = 0; i < 86; i++) fs.writeFileSync(path.join(root, `change-${i}.txt`), 'Read-only commit message fixture.\n');
const changedPaths = git(root, 'status', '--porcelain').split('\n').length;
const fileBytes = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isFile()).reduce((size, entry) => size + fs.statSync(path.join(root, entry.name)).size, 0);
assert.equal(changedPaths, 93);
assert.ok(fileBytes > 5 * 1024 * 1024 && fileBytes < 16 * 1024 * 1024);
const readonlyState = () => ({ head: git(root, 'rev-parse', 'HEAD'), status: git(root, 'status', '--porcelain'), index: createHash('sha256').update(fs.readFileSync(path.join(root, '.git/index'))).digest('hex'), files: fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isFile()).sort((a, b) => a.name.localeCompare(b.name)).map(entry => [entry.name, createHash('sha256').update(fs.readFileSync(path.join(root, entry.name))).digest('hex')]) });
const unchanged = readonlyState();
const codeDependencies: CodeDependencies = { assetCatalog: () => ({ repositories: [{ id: 'smoke-repository', code: 'smoke', name: 'Smoke', source: { type: 'workspace', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null };
const code = createCodeApplication(codeDependencies);
const location = { repositoryId: 'smoke-repository', worktreeId: code.sourceControl(root).repositories[0].worktrees.find(tree => tree.isMain)!.worktreeId };
const clients: CodexAppServer[] = [];
let nativeCommandCount = 0, inspectionEvents = 0;
const profile = resolveWebProfile(readCurrentProductIdentity());
assert.ok(profile.dataRoot.startsWith(base), 'agent data must stay within the runner-owned profile');
const agents = new AgentOperationsApplication({ dataRoot: profile.dataRoot, providerFactory: registration => { if (registration.kind !== 'codex') throw new Error('This smoke verifies only the Codex provider.'); const client = new CodexAppServer(registration, { onInspection: event => { inspectionEvents++; console.log(JSON.stringify({ inspection: event })); if (event.status === 'completed' && event.exitCode === 0) nativeCommandCount++; }, onProtocolError: (method, error) => console.error(JSON.stringify({ method, protocolError: error })) }); clients.push(client); return client; } });
const assets = runtimeProvide(createRuntime(), AGENT_ASSETS_SOURCE_READ) as Pick<CodeCommitMaterialReaderDependencies, 'readRules'>;
const generation = createCodeCommitMessageApplication({
  commitSnapshot: (workspace, input, options) => code.commitSnapshot(workspace, input, options),
  commitGuidance: (workspace, snapshot) => readCodeCommitGuidance(workspace, snapshot, { ...codeDependencies, taskContext: () => { throw new Error('This main-worktree fixture has no task association.'); } }),
  commitMaterial: createCodeCommitMaterialReader({readRules: scope => assets.readRules(scope)}),
  startGeneration: input => {
    assert.ok(Buffer.byteLength(input.prompt) <= COMMIT_MESSAGE_PROMPT_LIMIT_BYTES, 'fixed instructions and bounded materials must fit the complete 16 KiB budget');
    assert.equal(input.prompt.includes('GIT binary patch'), false);
    assert.ok(input.prompt.includes('Write Git commit messages in English.'), 'Buildr supplies the actual fixture convention');
    assert.ok(input.prompt.includes('Describe the source-control commit panel.'), 'Buildr supplies real changed evidence, not only file names');
    assert.doesNotMatch(input.prompt, /<environment>|"readableRoots"|"cwd"/);
    assert.equal(input.environment, undefined, 'this operation does not grant native workspace tools');
    assert.equal(input.execution?.reasoningEffort, 'low');
    assert.ok(input.execution!.timeoutMs! > 0 && input.execution!.timeoutMs! <= generationBudgetMs, 'local preparation must consume the same total budget before Agent invocation');
    console.log(JSON.stringify({ initialPromptBytes: Buffer.byteLength(input.prompt), changedPaths, fileBytes, requestedExecution: input.execution }));
    return agents.startGeneration(input);
  },
});
async function generate() {
  const previousCommands = nativeCommandCount, startedAt = performance.now();
  const context = code.commitContext(root, location);
  const started = await generation.generateCommitMessage(root, { ...location, expectedRevision: context.revision });
  const deadline = startedAt + generationBudgetMs;
  while (performance.now() < deadline) {
    const run = agents.getRun(started.id);
    if (run.status === 'failed' || run.status === 'cancelled') {
      console.log(JSON.stringify({ phase: 'generation', status: run.status, durationMs: Math.round(performance.now() - startedAt), nativeCommands: nativeCommandCount - previousCommands, budgetMs: generationBudgetMs }));
      throw new Error(JSON.stringify(run.error || { code: run.status }));
    }
    if (run.status === 'succeeded') {
      const durationMs = performance.now() - startedAt;
      const output = run.output as { commitMessage?: unknown };
      assert.equal(typeof output.commitMessage, 'string'); assert.ok((output.commitMessage as string).trim());
      assert.match((output.commitMessage as string).split(/\r?\n/)[0], /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^\r\n)]+\))?!?: \S/, 'the fixture rule requires a conventional English title');
      assert.doesNotMatch(output.commitMessage as string, /\p{Script=Han}/u, 'the fixture rule requires English');
      assert.ok(run.executionConfig, 'real session must confirm its selected configuration');
      assert.equal(typeof run.executionConfig.model, 'string');
      assert.equal(typeof run.executionConfig.modelProvider, 'string');
      assert.equal(run.executionConfig.reasoningEffort, 'low');
      console.log(JSON.stringify({ phase: 'generation', status: run.status, durationMs: Math.round(durationMs), budgetMs: generationBudgetMs, nativeCommands: nativeCommandCount - previousCommands, executionConfig: run.executionConfig, message: output.commitMessage }));
      assert.ok(durationMs <= generationBudgetMs, 'the complete generation, including preparation and result validation, must settle within 60 seconds');
      assert.equal(nativeCommandCount, previousCommands, 'real Agent must generate only from supplied materials without native commands');
      assert.equal(inspectionEvents, 0, 'no native tool attempts are authorized, including failed inspections');
      return { id: run.id, message: output.commitMessage as string, executionConfig: run.executionConfig, durationMs: Math.round(durationMs), nativeCommands: nativeCommandCount - previousCommands };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  agents.cancelRun(started.id);
  console.log(JSON.stringify({ phase: 'generation', status: 'deadline-exceeded', durationMs: Math.round(performance.now() - startedAt), nativeCommands: nativeCommandCount - previousCommands, budgetMs: generationBudgetMs }));
  throw new Error('Real Codex smoke did not settle within the complete 60-second generation budget.');
}
try {
  const first = await generate(), second = await generate();
  assert.notEqual(first.id, second.id); assert.equal(clients.length, 1, 'two ephemeral generations must reuse one owned app-server');
  assert.deepEqual(agents.listRegistry().agents[0].lastExecutionConfig, second.executionConfig);
  assert.deepEqual(agents.getRun(first.id).executionConfig, first.executionConfig);
  assert.deepEqual(readonlyState(), unchanged, 'two generations must preserve files, index, HEAD and change status');
  const context = code.commitContext(root, location);
  const mutation = await code.commitChanges(root, { ...location, expectedRevision: context.revision, message: second.message, mode: 'commit-push' });
  assert.equal(mutation.commit.status, 'succeeded'); assert.equal(mutation.push.status, 'succeeded');
  assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), mutation.commit.hash);
  const host = createLocalWorkspaceServer({}, {
    ensureRegisteredTarget: () => null,
    resolveRegisteredWorkspace: () => { throw new Error('This smoke only uses the app quit route.'); },
    httpContributions: [{ taskIdSource: '[a-z0-9-]+' }],
    readExecutor: { close: async () => {}, run: () => { throw new Error('Unexpected workspace read.'); } },
    beforeShutdown: () => agents.close(),
  });
  try {
    const ready = await host.ready;
    const quit = await fetch(ready.url + '/api/v1/app/quit', { method: 'POST', headers: { origin: ready.url, 'x-buildr-session': ready.sessionToken, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(quit.status, 202);
    await host.shutdown();
    assert.equal(host.server.listening, false);
    assert.equal(clients.every(client => !client.alive), true);
  } finally { await host.shutdown(); }
  console.log(JSON.stringify({ status: 'passed', generations: 2, measurements: [first, second].map(({ durationMs, nativeCommands }) => ({ durationMs, nativeCommands, budgetMs: generationBudgetMs })), ownedInstances: clients.length, ephemeralConfirmed: true, executionConfig: second.executionConfig, providedMaterials: true, nativeCommandCount, changedPaths, fileBytes, gitUnchangedDuringGeneration: true, fixtureKind: 'generated-data-not-actual-task', commit: mutation.commit.hash, push: mutation.push.status, webQuit: true, closed: true }));
} finally { await agents.close(); }
