import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { runReleaseOperation } from '../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts';
import { containsCredentialMaterial } from '../../../../../../skills/buildr-release/scripts/release-authority.ts';
import { artifactFromTarball } from '../../../../../../skills/buildr-release/scripts/package-artifact-observation.ts';
import { createPluginSourceAggregate } from '../verification/release/verify-pr-candidate.ts';
import { preservePluginSourceCandidate } from '../verification/candidate-repair-cli.ts';
import { PEER_INPUT_SCHEMA } from '../../../dsh-plugin/tools/buildr-peer.ts';
import { createReleaseCandidate, PLUGIN_SERVICE_PATH, SOURCE_SDK_MANIFEST, sourceSdkIdentityFromFiles } from '../../../../../../skills/buildr-release/scripts/dsh-plugin/release-candidate.ts';
import { archiveTreeIdentity } from '../../../dsh-plugin/tools/verify-all.ts';
import { identity } from '../../../dsh-plugin/tools/verify-buildr-plugin-pair.ts';
import { preparationRecordFixture } from '../helpers/release-artifact-fixture.ts';

const pluginVersion = '0.1.0-rc.7', mainVersion = '0.1.0-rc.41';
const selectionId = 'dsh-plugin-' + pluginVersion;
const taskId = 'release-' + selectionId, branch = 'codex/' + taskId;
const pluginRoot = path.resolve(import.meta.dirname, '../../../dsh-plugin');
const sdkPatch = 'sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch';
const manifestBytes = fs.readFileSync(path.join(pluginRoot, SOURCE_SDK_MANIFEST));
const patchBytes = fs.readFileSync(path.join(pluginRoot, sdkPatch));
const sourceSdk = sourceSdkIdentityFromFiles(manifestBytes, patchBytes);
const mainCompatibility = { schemaVersion: 'buildr.package-compatibility/v1', provides: ['buildr.entry/v1'], requires: [] };
const pluginCompatibility = { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [{ packageName: '@buildr-ai/buildr', feature: 'entry', required: true,
  versions: { minInclusive: '0.1.0-rc.0', maxExclusive: '0.2.0', includePrerelease: true }, contracts: ['buildr.entry/v1'] }] };

function reportUnexpectedReleaseResult(result: any, expected: string): void {
  const diagnostic = { expected, status: result.status, code: result.diagnostic?.code ?? null, message: result.diagnostic?.message ?? null };
  const safe = containsCredentialMaterial(diagnostic)
    ? { expected, message: '[credential-shaped diagnostic omitted]' }
    : { expected, status: String(result.status).slice(0, 64), code: diagnostic.code === null ? null : String(diagnostic.code).slice(0, 128),
      message: diagnostic.message === null ? null : String(diagnostic.message).trim().slice(0, 2048) };
  process.stderr.write(`[package-release-selection-operation] ${JSON.stringify(safe)}\n`);
}
function assertReleaseStatus(result: any, expected: string): void {
  if (result.status !== expected) reportUnexpectedReleaseResult(result, expected);
  assert.equal(result.status, expected);
}
function sourceGitFailure(result: any): any {
  const prefix = 'Candidate source inspection failed: ';
  if (!result.diagnostic?.message?.startsWith(prefix)) {
    reportUnexpectedReleaseResult(result, 'source-git-failure');
    assert.fail('The source Git failure diagnostic is missing.');
  }
  return JSON.parse(result.diagnostic.message.slice(prefix.length));
}
async function captureReleaseSelectionFailure(name: string, body: () => Promise<void>): Promise<void> {
  try { await body(); }
  catch (error: any) {
    reportUnexpectedReleaseResult({ status: 'thrown', diagnostic: { code: error.code ?? error.name ?? null, message: error.message ?? null } }, name);
    throw error;
  }
}
function releaseSelectionTest(name: string, body: (context: any) => Promise<void>): void {
  test(name, context => captureReleaseSelectionFailure(name, () => body(context)));
}

function archive(metadata: any): Buffer {
  const body = Buffer.from(JSON.stringify(metadata)), header = Buffer.alloc(512);
  const field = (value: string, start: number, length: number) => header.write(value, start, length, 'utf8');
  field('package/package.json', 0, 100); field('0000644\0', 100, 8); field('0000000\0', 108, 8); field('0000000\0', 116, 8);
  field(body.length.toString(8).padStart(11, '0') + '\0', 124, 12); field('00000000000\0', 136, 12); header.fill(32, 148, 156);
  field('0', 156, 1); field('ustar\0', 257, 6); field('00', 263, 2);
  field(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512 + 1024)]));
}

function pluginCandidate(sourceCommit: string, sourceTree: string, peer: any): any {
  const bytes = archive({ name: '@buildr-ai/buildr-dsh-plugin', version: pluginVersion, repository: 'https://github.com/BuildrAI/Buildr',
    buildrCompatibility: pluginCompatibility, buildrDshSourceSdk: { upstream: sourceSdk.baseline, sourceManifestSha256: sourceSdk.manifestSha256,
      sourcePatchSha256: sourceSdk.patchSha256, compiledContracts: sourceSdk.contracts } });
  const candidate = createReleaseCandidate({ version: pluginVersion, sourceCommit, sourceTree, filename: 'owned-plugin.tgz', bytes, sourceSdk, fileCount: 1 });
  const artifact = { ...artifactFromTarball(bytes, { origin: 'candidate', packageName: candidate.packageName, version: pluginVersion, integrity: candidate.integrity, sourceCommit }), sourceTree };
  const consumer = identity(artifact), provider = identity(peer), features = [{ feature: 'entry', required: true, status: 'passed' }];
  const contracts = ['buildr.installation-status/v1', 'buildr.web-protocol/v1'], diagnostic = null;
  const evidenceSha256 = crypto.createHash('sha256').update(JSON.stringify({ consumer, provider, features, contracts, diagnostic })).digest('hex');
  const verificationSource = { observedCommit: sourceCommit, dirty: false, contentSha256: '4'.repeat(64) };
  const verification = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', candidateBound: true, sourceCommit, sourceTree,
    consumer: artifact, consumerTreeSha256: archiveTreeIdentity(bytes), peer: structuredClone(peer), sourceSdk, verificationSource,
    sourceBinding: { method: 'git-tree-content-equivalence', testedGitHead: verificationSource.observedCommit, testedWorkingTreeDirty: verificationSource.dirty,
      verifiedContentSha256: verificationSource.contentSha256, candidateSourceCommit: sourceCommit, candidateSourceTree: sourceTree },
    pair: { schemaVersion: 'buildr.dsh-package-pair-verification/v1', status: 'passed', consumer, provider, features, contracts, diagnostic, evidenceSha256,
      legacyPairEvidence: { schemaVersion: 'buildr.package-pair-evidence/v1', consumer, provider, features, evidenceSha256 } },
    checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false };
  return { artifact, candidate, tarballBytes: bytes, verification };
}

function git(repo: string, args: string[]): string {
  const value = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(value.status, 0, value.stderr); return value.stdout.trim();
}

test('formal repair preserves actual plugin bytes and peer proof without rebuilding or installing the SDK', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-repair-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const main = path.join(repo, 'projects/product/services/buildr'); fs.mkdirSync(main, { recursive: true });
  fs.writeFileSync(path.join(main, 'package.json'), '{"name":"@buildr-ai/buildr"}\n');
  git(repo, ['init', '-b', 'dev']); git(repo, ['config', 'user.name', 'Fixture']); git(repo, ['config', 'user.email', 'fixture@example.com']);
  git(repo, ['add', '.']); git(repo, ['commit', '-m', 'source']);
  const sourceCommit = git(repo, ['rev-parse', 'HEAD']), sourceTree = git(repo, ['rev-parse', 'HEAD^{tree}']);
  const peerBytes = archive({ name: '@buildr-ai/buildr', version: mainVersion, buildrCompatibility: mainCompatibility });
  const peer = artifactFromTarball(peerBytes, { origin: 'registry', packageName: '@buildr-ai/buildr', version: mainVersion,
    integrity: 'sha512-' + crypto.createHash('sha512').update(peerBytes).digest('base64') });
  const owned = pluginCandidate(sourceCommit, sourceTree, peer);
  const plan = { legacy: false, requirements: { buildr: false, plugin: true }, sourceCommit, sourceTree, serviceTree: sourceTree,
    pluginVersion, sourceSdk, selection: { packages: ['dsh-plugin'], versions: { 'dsh-plugin': pluginVersion } }, changedPaths: [], workflowSha256: 'a'.repeat(64),
    registryPeer: { version: peer.version, integrity: peer.integrity } };
  const previous = createPluginSourceAggregate(plan, owned.candidate, owned.verification, { runId: 42, runAttempt: 1 });
  const temporaryRoot = path.join(repo, 'temporary'); fs.mkdirSync(temporaryRoot);
  fs.writeFileSync(path.join(temporaryRoot, 'release-candidate-plan.json'), JSON.stringify(plan));
  fs.writeFileSync(path.join(temporaryRoot, 'peer.tgz'), peerBytes);
  fs.writeFileSync(path.join(temporaryRoot, 'plugin-buildr-peer.json'), JSON.stringify({ schemaVersion: PEER_INPUT_SCHEMA, artifact: peer, tarball: 'peer.tgz' }));
  const requests: string[][] = [];
  const call = (args: string[]) => {
    requests.push(args);
    if (args[0] === 'api') return JSON.stringify({ id: 42, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/verify.yml', event: 'workflow_dispatch', status: 'completed', head_sha: sourceCommit, run_attempt: 1 });
    assert.deepEqual(args.slice(0, 3), ['run', 'download', '42']);
    const destination = args[args.indexOf('--dir') + 1]!; fs.mkdirSync(destination, { recursive: true });
    if (args.includes('plugin-candidate-aggregate')) fs.writeFileSync(path.join(destination, 'plugin-candidate-ci-aggregate.json'), JSON.stringify(previous));
    else { fs.writeFileSync(path.join(destination, 'candidate.json'), JSON.stringify(owned.candidate)); fs.writeFileSync(path.join(destination, owned.candidate.filename), owned.tarballBytes); }
    return '';
  };
  const result = preservePluginSourceCandidate({ repo, temporaryRoot, runId: '42', verificationSource: sourceCommit, workflow: { runId: 52, runAttempt: 1 } }, { call });
  assert.equal(result.status, 'passed'); assert.equal(result.candidate.sha256, owned.candidate.sha256);
  const aggregate = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'plugin-candidate-ci-aggregate.json'), 'utf8'));
  assert.deepEqual(aggregate.verification, previous.verification); assert.equal(aggregate.workflow.runId, 52);
  assert.equal(aggregate.reusedFrom.workflow.runId, 42); assert.ok(aggregate.checks.every((check: any) => check.disposition === 'reused'));
  assert.equal(requests.length, 3);
  previous.candidate.sha256 = 'b'.repeat(64);
  assert.throws(() => preservePluginSourceCandidate({ repo, temporaryRoot, runId: '42', verificationSource: sourceCommit, workflow: { runId: 52, runAttempt: 1 } }, { call }), /different bytes|invalid|differs/u);
});

function fixture(t: any, changes: { mainRuntime?: boolean; omitSourcePatch?: boolean; mutateAggregate?: (value: any) => void } = {}): any {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-selection-operation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), remote = path.join(root, 'remote.git');
  const repo = path.join(workspace, '.worktrees', taskId), providerFile = path.join(workspace, '.git/buildr/task-worktrees', taskId + '.json');
  const write = (file: string, bytes: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), bytes); };
  write('projects/product/services/buildr/package.json', JSON.stringify({ name: '@buildr-ai/buildr', version: mainVersion, buildrCompatibility: mainCompatibility }));
  write(PLUGIN_SERVICE_PATH + '/package.json', JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin', version: '0.1.0-rc.6', buildrCompatibility: pluginCompatibility }));
  write(PLUGIN_SERVICE_PATH + '/' + SOURCE_SDK_MANIFEST, manifestBytes);
  if (!changes.omitSourcePatch) write(PLUGIN_SERVICE_PATH + '/' + sdkPatch, patchBytes);
  write('projects/product/.node-version', process.versions.node + '\n');
  write('.github/workflows/verify.yml', 'name: Verify fixture\n'); write('.github/workflows/publish-dsh-plugin.yml', 'name: Plugin fixture\n');
  git(workspace, ['init', '-b', 'dev']); git(workspace, ['config', 'user.name', 'Buildr Test']); git(workspace, ['config', 'user.email', 'buildr@example.com']);
  git(workspace, ['add', '.']); git(workspace, ['commit', '-m', 'base']); git(workspace, ['branch', 'main']);
  const baseline = git(workspace, ['rev-parse', 'HEAD']);
  write(PLUGIN_SERVICE_PATH + '/package.json', JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin', version: pluginVersion, buildrCompatibility: pluginCompatibility }));
  if (changes.mainRuntime) write('projects/product/services/buildr/src/runtime-input.ts', 'export const changed = true;\n');
  git(workspace, ['add', '.']); git(workspace, ['commit', '-m', 'selected plugin materials']);
  const selectedSource = git(workspace, ['rev-parse', 'HEAD']);
  git(workspace, ['init', '--bare', remote]); git(workspace, ['remote', 'add', 'origin', remote]); git(workspace, ['push', '-u', 'origin', 'dev', 'main']);
  const peerBytes = archive({ name: '@buildr-ai/buildr', version: mainVersion, buildrCompatibility: mainCompatibility });
  const peer = artifactFromTarball(peerBytes, { origin: 'registry', packageName: '@buildr-ai/buildr', version: mainVersion,
    integrity: 'sha512-' + crypto.createHash('sha512').update(peerBytes).digest('base64') });
  const file = path.join(workspace, '.git/buildr/release-operations', selectionId + '.json');
  const state = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  let task: any = null, worktreeCreated = false, candidateVisible = false, candidateDispatches = 0, pluginDispatches = 0;
  let merges = 0, mainReads = 0, unpublishedReads = 0, pluginSourceReads = 0, postMainReads = 0, pr: any = null, postMainSource = '';
  let mainGate = 'ready', mainReadbackFailed = false, loseMergeResponse = false, elapsed = 0;
  let closeoutFailure: string | null = null, taskCompletions = 0, cleanupCalls = 0;
  const events: string[] = [], requests: any[] = [];
  const preparationRecords = preparationRecordFixture(workspace, taskId);
  const runtime = {
    inspectTask(target: string, id: string) {
      assert.equal(target, workspace); assert.equal(id, taskId);
      if (!task) throw Object.assign(new Error('Task absent'), { code: 'task_record_not_found' });
      return { record: task, recordDigest: 'sha256-' + '1'.repeat(64) };
    },
    inspectGitWorktrees({ workspaceRoot, taskId: id }: any) {
      assert.equal(workspaceRoot, workspace); assert.equal(id, taskId);
      if (worktreeCreated && !fs.existsSync(repo)) return { status: 'blocked', taskId, evidencePath: providerFile, repositories: [] };
      return worktreeCreated ? { status: 'ready', taskId, evidencePath: providerFile, repositories: [{ selector: 'workspace', checkoutPath: repo, branch,
        head: git(repo, ['rev-parse', 'HEAD']), state: 'ready' }] } : { status: 'absent' };
    },
  };
  const body = (value: any) => ({ status: 0, stdout: JSON.stringify(value) });
  const execute = (command: string, args: string[], config: any): any => {
    if (command !== 'gh') {
      if (command === 'git' && args[0] === 'show' && /^[a-f0-9]{40}:/u.test(args[1] ?? '')) assert.equal(args.at(-1), '--', 'Object reads must disable filename disambiguation.');
      return spawnSync(command, args, { ...config, encoding: 'utf8' });
    }
    requests.push([...args]);
    if (args[0] === 'auth') assert.fail('plugin-only must not read GitHub credentials for main publication observation');
    if (args[0] === 'workflow') {
      if (args[2] === 'verify.yml') { candidateDispatches++; events.push('source-dispatch'); assert.equal(state().candidate.dispatchRequested, true); return { status: 1, stderr: 'lost dispatch response' }; }
      assert.equal(args[2], 'publish-dsh-plugin.yml'); assert.ok(args.includes('operation=prepare')); assert.equal(args[args.indexOf('--ref') + 1], 'main');
      assert.equal(merges, 1); pluginDispatches++; events.push('post-main-dispatch'); postMainSource = git(workspace, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/u)[0];
      assert.ok(args.includes('buildr_peer_origin=registry')); assert.ok(args.includes('buildr_peer_integrity=' + peer.integrity)); return { status: 0, stdout: '' };
    }
    if (args[0] === 'run' && args[1] === 'list') return body(args.includes('verify.yml')
      ? candidateVisible ? [{ databaseId: 700, headSha: state().sourceCommit, status: 'completed', conclusion: 'success' }] : []
      : pluginDispatches ? [{ databaseId: 800, displayTitle: 'DSH prepare ' + pluginVersion, headSha: postMainSource, status: 'completed', conclusion: 'success' }] : []);
    if (args[0] === 'run' && args[1] === 'download') assert.fail('main Candidate artifacts are not part of a pure plugin source diff');
    if (args[0] === 'api') {
      const plugin = args[1].endsWith('/800');
      return body({ id: plugin ? 800 : 700, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/' + (plugin ? 'publish-dsh-plugin.yml' : 'verify.yml'),
        event: 'workflow_dispatch', head_branch: plugin ? 'main' : state().candidate.branch, head_sha: plugin ? postMainSource : state().sourceCommit,
        display_title: plugin ? 'DSH prepare ' + pluginVersion : 'Candidate', run_attempt: 1, status: 'completed', conclusion: 'success' });
    }
    if (args[0] === 'pr' && args[1] === 'list') return body(pr ? [pr] : []);
    if (args[0] === 'pr' && args[1] === 'view') return mainReadbackFailed ? { status: 1, stderr: 'HTTP 503 readback unavailable' }
      : body({ ...pr, mergeStateStatus: mainGate === 'ready' ? 'CLEAN' : 'BLOCKED', mergeable: 'MERGEABLE', isDraft: false });
    if (args[0] === 'pr' && args[1] === 'checks') return body([{ name: 'protected-gate', state: mainGate === 'ready' ? 'SUCCESS' : 'IN_PROGRESS',
      bucket: mainGate === 'ready' ? 'pass' : mainGate === 'failed' ? 'fail' : 'pending' }]);
    if (args[0] === 'pr' && args[1] === 'create') {
      assert.ok(events.includes('source-proof')); events.push('pr-created');
      pr = { number: 1, state: 'OPEN', headRefOid: state().sourceCommit, headRefName: args[args.indexOf('--head') + 1], baseRefName: 'main', url: 'https://github.com/BuildrAI/Buildr/pull/1' };
      return { status: 0, stdout: pr.url };
    }
    if (args[0] === 'pr' && args[1] === 'merge') {
      assert.ok(events.includes('source-proof')); assert.equal(args[args.indexOf('--match-head-commit') + 1], state().sourceCommit);
      merges++; events.push('main-merge'); const merger = path.join(root, 'merge-main');
      git(workspace, ['worktree', 'add', '--detach', merger, 'origin/main']); git(merger, ['merge', '--no-ff', state().sourceCommit, '-m', 'release merge']);
      const merged = git(merger, ['rev-parse', 'HEAD']); git(merger, ['push', 'origin', 'HEAD:main']); git(workspace, ['worktree', 'remove', merger]);
      git(workspace, ['push', 'origin', ':refs/heads/' + pr.headRefName, ':refs/heads/release-' + selectionId]);
      pr = { ...pr, state: 'MERGED', mergedAt: new Date().toISOString(), mergeCommit: { oid: merged } };
      return loseMergeResponse ? { status: 1, stderr: 'lost merge response' } : { status: 0, stdout: '' };
    }
    assert.fail('Unexpected fixture host command ' + args.join(' '));
  };
  const dependencies = { prepareLocalSourceVerification: (input: any) => {
    assert.equal(input.base, baseline, 'source verification receives the immutable release baseline');
    return {status:'ready',transport:null,missingStepIds:[]};
  }, execute, runtime, now: () => elapsed, sleep: async (ms: number) => { elapsed += ms; }, resolveRetainedController: () => ({ workspaceRoot: workspace }),
    invokeRetainedController(_controller: any, args: string[]) {
      const recorded = preparationRecords.invoke(args); if (recorded) return recorded;
      if (args[0] === 'task' && args[1] === 'complete') {
        taskCompletions++; task.status = 'completed';
        if (closeoutFailure === 'task-response') { closeoutFailure = null; return { status: 'blocked', diagnostic: { message: 'lost task completion response' } }; }
        return { status: 'completed', effects: [] };
      }
      if (args[0] === 'worktree' && args[1] === 'cleanup') {
        cleanupCalls++;
        if (closeoutFailure === 'cleanup') { closeoutFailure = null; return { status: 'blocked', diagnostic: { message: 'injected cleanup failure' } }; }
        if (fs.existsSync(repo)) git(workspace, ['worktree', 'remove', repo]);
        if (git(workspace, ['for-each-ref', '--format=%(objectname)', 'refs/heads/' + branch])) git(workspace, ['branch', '-D', branch]);
        if (closeoutFailure === 'cleanup-evidence') { closeoutFailure = null; return { status: 'blocked', diagnostic: { message: 'provider evidence removal failed' } }; }
        fs.rmSync(providerFile); worktreeCreated = false;
        return { status: 'cleaned', effects: [] };
      }
      if (args[0] === 'task' && args[1] === 'create') { task = { taskId, status: 'active', title: 'Plugin release' }; return { status: 'created', record: task, effects: [] }; }
      assert.deepEqual(args.slice(0, 2), ['worktree', 'create']);
      const startPoint = task.status === 'completed' ? state().sourceCommit : baseline;
      assert.equal(args[args.indexOf('--start-point') + 1], startPoint);
      git(workspace, ['worktree', 'add', '-b', branch, repo, startPoint]);
      fs.mkdirSync(path.dirname(providerFile), { recursive: true }); fs.writeFileSync(providerFile, JSON.stringify({ schemaVersion: 'buildr.git-worktree-evidence/v1',
        taskId, workspaceRoot: workspace, branch, planDigest: 'sha256-' + '2'.repeat(64), status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: repo, branch }], effects: [] }));
      worktreeCreated = true; return runtime.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
    },
    observeUnpublishedRelease() { unpublishedReads++; assert.fail('plugin-only must not observe a new main publication'); },
    candidateDependencies: { get candidateEvidence(): any { mainReads++; throw new Error('Main QA evidence must be read for the actual main runtime diff'); } },
    pluginSourceDependencies: { readSourceCandidate(input: any) {
      pluginSourceReads++; const owned = pluginCandidate(input.plan.sourceCommit, input.plan.serviceTree, peer);
      const aggregate = createPluginSourceAggregate(input.plan, owned.candidate, owned.verification, { runId: input.runId, runAttempt: input.runAttempt });
      changes.mutateAggregate?.(aggregate); events.push('source-proof'); return { aggregate, candidate: owned.candidate, tarballBytes: owned.tarballBytes };
    } },
    packageDependencies: {
      observePublishedPackageArtifact(name: string) { return name === 'buildr' ? { observation: { status: 'present', artifact: peer }, bytes: peerBytes }
        : { observation: { status: 'absent', packageName: '@buildr-ai/buildr-dsh-plugin' } }; },
      pluginDependencies: { readCandidate(input: any) {
        postMainReads++; events.push('post-main-proof'); assert.equal(input.runId, 800); assert.equal(input.sourceCommit, postMainSource);
        assert.notEqual(input.sourceCommit, state().sourceCommit); assert.equal(input.sourceTree, git(repo, ['rev-parse', postMainSource + ':' + PLUGIN_SERVICE_PATH]));
        assert.deepEqual(input.peer, peer); return pluginCandidate(input.sourceCommit, input.sourceTree, peer);
      } },
    },
  };
  const options = { action: 'prepare', workspace, packages: 'dsh-plugin', pluginVersion, baseline, sources: [selectedSource], detail: 'full' };
  return { workspace, repo, providerFile, baseline, peer, state, options, dependencies, events, requests, preparationRecords, task: () => task,
    failCloseout(stage: string) { closeoutFailure = stage; }, closeoutCounts: () => ({ taskCompletions, cleanupCalls }),
    revealCandidate() { candidateVisible = true; },
    setMainGate(value: string) { mainGate = value; },
    setMainReadbackFailed(value: boolean) { mainReadbackFailed = value; },
    loseMergeResponse() { loseMergeResponse = true; },
    counts: () => ({ candidateDispatches, pluginDispatches, merges, mainReads, unpublishedReads, pluginSourceReads, postMainReads }),
    remoteRef: (name: string) => git(workspace, ['ls-remote', 'origin', 'refs/heads/' + name]),
  };
}

releaseSelectionTest('protected main waiting, failed checks and unknown reads resume the same PR without rerunning the Candidate', async t => {
  const data = fixture(t);
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  data.setMainGate('pending');
  const pending = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(pending, 'main-merge-pending'); assert.equal(pending.mainPullRequest.durationMs, 30_000);
  assert.equal(pending.recovery.stage, 'adoption-readiness'); assert.equal(pending.recovery.automaticFullRerun, false);
  assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0);
  const frozenSource = data.state().sourceCommit, candidateRunId = data.state().candidate.runId;
  data.setMainGate('failed');
  const failed = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(failed, 'blocked'); assert.equal(failed.diagnostic.code, 'release-main-required-check-failed');
  assert.equal(data.counts().merges, 0);
  data.setMainReadbackFailed(true);
  const unknown = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(unknown, 'main-merge-readback-required'); assert.equal(unknown.recovery.action, 'read-original-request');
  assert.equal(data.counts().merges, 0);
  data.setMainReadbackFailed(false); data.setMainGate('ready');
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'awaiting-publication-authorization');
  assert.equal(data.state().sourceCommit, frozenSource); assert.equal(data.state().candidate.runId, candidateRunId);
  assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.counts().merges, 1); assert.equal(data.counts().pluginDispatches, 1);
  assert.equal(data.requests.filter((args: string[]) => args[0] === 'pr' && args[1] === 'create').length, 1);
  const merge = data.requests.find((args: string[]) => args[0] === 'pr' && args[1] === 'merge');
  assert.ok(merge.includes('--match-head-commit')); assert.ok(merge.includes('--merge'));
  assert.ok(data.requests.every((args: string[]) => !args.includes('--admin') && !args.includes('--auto')));
});

releaseSelectionTest('unknown main merge response is read back before continuation and does not merge or create a PR twice', async t => {
  const data = fixture(t);
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  data.loseMergeResponse();
  const unknown = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(unknown, 'main-merge-readback-required'); assert.equal(data.counts().merges, 1);
  assert.equal(unknown.effects.find((effect: any) => effect.type === 'release-main-merge').state, 'unknown');
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'awaiting-publication-authorization');
  assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.counts().merges, 1); assert.equal(data.counts().pluginDispatches, 1);
  assert.equal(data.requests.filter((args: string[]) => args[0] === 'pr' && args[1] === 'create').length, 1);
});

releaseSelectionTest('candidate-only closeout resumes failed record owners and cleanup without another Candidate read or execution', async t => {
  for (const stage of ['materials-write', 'materials-record', 'verification-record', 'task-response', 'cleanup', 'cleanup-evidence']) await t.test(stage, async () => {
    const data = fixture(t);
    assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
    if (stage.startsWith('materials-') || stage === 'verification-record') data.preparationRecords.fail(stage, stage !== 'verification-record');
    else data.failCloseout(stage);
    const failed = await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies);
    assert.match(failed.status, /^candidate-(?:materials|report|task|cleanup)-closeout-required$/u);
    const reads = data.counts().pluginSourceReads, source = data.state().sourceCommit;
    const recovered = await runReleaseOperation({ ...data.options, action: 'resume' }, data.dependencies);
    assertReleaseStatus(recovered, 'candidate-verified'); assert.equal(data.task().status, 'completed');
    assert.equal(data.state().sourceCommit, source); assert.equal(data.counts().pluginSourceReads, reads);
    assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0);
    assert.equal(data.closeoutCounts().taskCompletions, 1); assert.equal(fs.existsSync(data.repo), false);
    assert.equal(data.state().preparation.cleanup, 'cleaned');
    assert.equal(fs.existsSync(data.providerFile), false);
    if (stage === 'cleanup-evidence') assert.equal(data.closeoutCounts().cleanupCalls, 2, 'orphaned provider evidence must be cleaned by its owner');
    assert.equal(data.preparationRecords.calls.filter((args: string[]) => args[1] === 'verification' && args[2] === 'record').length, stage === 'verification-record' ? 2 : 1);
    assert.equal(data.preparationRecords.calls.filter((args: string[]) => args[1] === 'materials' && args[2] === 'write').length, 1);
    assert.equal(data.preparationRecords.calls.filter((args: string[]) => args[1] === 'materials' && args[2] === 'record').length, 1);
    const inspected = await runReleaseOperation({ ...data.options, action: 'inspect' }, data.dependencies);
    assertReleaseStatus(inspected, 'inspected'); assert.equal(data.counts().candidateDispatches, 1);
  });
});

releaseSelectionTest('candidate closeout refuses an aliased controller input without changing the outside document', async t => {
  const data = fixture(t);
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  data.preparationRecords.fail('materials-write');
  assertReleaseStatus(await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies), 'candidate-materials-closeout-required');
  const directory = data.state().preparation.directory;
  const input = path.join(directory, fs.readdirSync(directory).find(name => name.startsWith('preparation-material.md-'))!);
  const outside = path.join(data.workspace, 'outside.md'); fs.writeFileSync(outside, 'user document'); fs.unlinkSync(input); fs.symlinkSync(outside, input);
  const rejected = await runReleaseOperation({ ...data.options, action: 'resume' }, data.dependencies);
  assertReleaseStatus(rejected, 'candidate-materials-closeout-required'); assert.match(rejected.diagnostic.message, /alias/u);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'user document'); assert.equal(data.task().status, 'active'); assert.equal(data.closeoutCounts().cleanupCalls, 0);
  fs.unlinkSync(input);
  assertReleaseStatus(await runReleaseOperation({ ...data.options, action: 'resume' }, data.dependencies), 'candidate-verified');
  assert.equal(data.counts().candidateDispatches, 1);
});

releaseSelectionTest('candidate preservation refuses worktree aliases before records or cleanup and detects retained byte drift', async t => {
  const data = fixture(t);
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  const alias = path.join(data.workspace, 'projects/product/services/buildr/build/verification/candidates');
  const target = path.join(data.repo, 'build/unsafe-preservation'); fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.dirname(alias), { recursive: true }); fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const unsafe = await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies);
  assertReleaseStatus(unsafe, 'blocked'); assert.match(unsafe.diagnostic.message, /independent|aliases/u);
  assert.equal(data.task().status, 'active'); assert.equal(data.preparationRecords.calls.length, 0); assert.equal(data.closeoutCounts().cleanupCalls, 0);
  fs.unlinkSync(alias);
  const completed = await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies);
  assertReleaseStatus(completed, 'candidate-verified');
  const prepared = data.state().preparation, manifest = prepared.artifacts['dsh-plugin'];
  fs.appendFileSync(path.join(prepared.directory, 'dsh-plugin', manifest.filename), 'different');
  const drifted = await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies);
  assertReleaseStatus(drifted, 'blocked'); assert.match(drifted.diagnostic.message, /bytes changed/u);
  assert.equal(data.task().status, 'completed'); assert.equal(data.counts().candidateDispatches, 1);
});

releaseSelectionTest('completed candidate preparation resumes the same pending main adoption and never derives public authorization', async t => {
  const data = fixture(t);
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  assertReleaseStatus(await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies), 'candidate-verified');
  assert.equal(data.task().status, 'completed'); assert.equal(fs.existsSync(data.repo), false);
  data.setMainGate('pending');
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'main-merge-pending');
  data.setMainGate('ready');
  assertReleaseStatus(await runReleaseOperation({ ...data.options, action: 'resume' }, data.dependencies), 'awaiting-publication-authorization');
  assert.equal(data.task().status, 'completed'); assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.counts().merges, 1);
  const publicRequest = await runReleaseOperation({ ...data.options, action: 'publish' }, data.dependencies);
  assertReleaseStatus(publicRequest, 'authorization-required');
  assert.ok(data.requests.every((args: string[]) => !args.includes('operation=publish')));
});

releaseSelectionTest('plugin-only prepare recovers one lost source dispatch, admits exact peer proof, and prepares separate main bytes without resurrecting refs', async t => {
  const data = fixture(t);
  const first = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(first, 'candidate-dispatch-unconfirmed'); assert.equal(first.version, null); assert.equal(first.selectionId, selectionId);
  assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.state().candidate.runId, null); assert.equal(data.counts().merges, 0);
  data.revealCandidate();
  const ready = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(ready, 'awaiting-publication-authorization');
  assert.deepEqual(data.counts(), { candidateDispatches: 1, pluginDispatches: 1, merges: 1, mainReads: 0, unpublishedReads: 0, pluginSourceReads: 1, postMainReads: 1 });
  const record = data.state(); assert.deepEqual(record.candidatePlan.requirements, { buildr: false, plugin: true });
  assert.equal(record.candidate.runId, 700); assert.equal(record.pluginPreparation.runId, 800); assert.equal(record.context.selection.version, null);
  assert.equal(record.context.selection.status, 'frozen'); assert.equal(record.sources.length, 1);
  assert.equal(git(data.repo, ['show', record.context.convergence.mainCommit + ':projects/product/services/buildr/package.json', '--']),
    git(data.workspace, ['show', data.baseline + ':projects/product/services/buildr/package.json', '--']));
  const dispatch = data.requests.find((args: string[]) => args[0] === 'workflow' && args[2] === 'verify.yml');
  for (const field of ['release_packages=dsh-plugin', 'buildr_version=' + mainVersion, 'plugin_version=' + pluginVersion,
    'selection_id=' + selectionId, 'buildr_peer_version=' + mainVersion, 'buildr_peer_integrity=' + data.peer.integrity]) assert.ok(dispatch.includes(field));
  assert.deepEqual(record.context.targets.packages, ['dsh-plugin']); assert.deepEqual(record.context.packages['dsh-plugin'].buildrPeer, data.peer);
  assert.deepEqual(record.context.convergence.mergeParents, [data.baseline, record.sourceCommit]);
  assert.ok(data.events.indexOf('source-proof') < data.events.indexOf('main-merge')); assert.ok(data.events.indexOf('main-merge') < data.events.indexOf('post-main-dispatch'));
  assert.equal(data.remoteRef('release-' + selectionId), ''); assert.equal(data.remoteRef(record.candidate.branch), '');
  const repeated = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(repeated, 'awaiting-publication-authorization'); assert.equal(repeated.contextIdentity, ready.contextIdentity);
  assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.counts().pluginDispatches, 1); assert.equal(data.counts().merges, 1);
  assert.equal(data.remoteRef('release-' + selectionId), ''); assert.equal(data.remoteRef(record.candidate.branch), '');
  assert.ok(data.requests.filter((args: string[]) => args[0] === 'workflow').every((args: string[]) => !args.includes('operation=publish')));
});

releaseSelectionTest('plugin-only target selection cannot waive main QA required by the complete source diff', async t => {
  const data = fixture(t, { mainRuntime: true });
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  const result = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(result, 'blocked'); assert.deepEqual(data.state().candidatePlan.requirements, { buildr: true, plugin: true });
  assert.match(result.diagnostic.message, /Main QA evidence must be read/u);
  assert.equal(data.counts().mainReads, 1); assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginSourceReads, 0); assert.equal(data.counts().pluginDispatches, 0);
  assert.equal(data.counts().unpublishedReads, 0); assert.equal(data.counts().candidateDispatches, 1);
});

releaseSelectionTest('failed source Git read preserves its bounded cause and freezes without any Candidate dispatch', async t => {
  const data = fixture(t, { omitSourcePatch: true });
  const result = await runReleaseOperation(data.options, data.dependencies);
  assertReleaseStatus(result, 'blocked');
  const failure = sourceGitFailure(result);
  assert.equal(failure.command, 'git');
  assert.deepEqual(failure.args, ['show', `${data.state().sourceCommit}:${PLUGIN_SERVICE_PATH}/${sdkPatch}`, '--']);
  assert.equal(failure.status, 128); assert.equal(failure.errorCode, null); assert.equal(failure.signal, null);
  assert.equal(failure.stdoutBytes, 0); assert.ok(failure.stderr.length > 0 && failure.stderr.length <= 2048);
  assert.equal(data.counts().candidateDispatches, 0); assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0);
  assert.ok(data.state().sourceCommit); assert.ok(data.requests.every((args: string[]) => args[0] !== 'workflow' && args[0] !== 'pr'));
  const frozenSource = data.state().sourceCommit, originalExecute = data.dependencies.execute;
  const cases = [
    ['npm', () => String.fromCharCode(110, 112, 109, 95) + 'a'.repeat(36)],
    ['JWT', () => ['eyJ' + 'a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.')],
  ] as const;
  for (const [label, material] of cases) await t.test(label, () => captureReleaseSelectionFailure(label, async () => {
    const privateDiagnostic = 'x'.repeat(2045) + ' ' + material();
    assert.ok(containsCredentialMaterial(privateDiagnostic), 'The controlled case must be credential-shaped.');
    assert.ok(!containsCredentialMaterial(privateDiagnostic.trim().slice(0, 2048)), 'The controlled case must span the previous truncation boundary.');
    let failedGitReads = 0;
    data.dependencies.execute = (command: string, args: string[], config: any) => {
      const result = originalExecute(command, args, config);
      if (command === 'git' && args[0] === 'show' && args[1]?.endsWith(`:${PLUGIN_SERVICE_PATH}/${sdkPatch}`) && result.status !== 0) {
        failedGitReads++;
        return { ...result, stderr: privateDiagnostic };
      }
      return result;
    };
    let result: any;
    try { result = await runReleaseOperation(data.options, data.dependencies); }
    finally { data.dependencies.execute = originalExecute; }
    assertReleaseStatus(result, 'blocked');
    const failure = sourceGitFailure(result);
    assert.ok(failure.stderr === '[credential-shaped diagnostic omitted]', 'The entire private diagnostic must be omitted.');
    assert.equal(failure.status, 128); assert.equal(failedGitReads, 1);
    assert.equal(data.state().sourceCommit, frozenSource);
    assert.equal(git(data.repo, ['rev-parse', `refs/buildr/release/${selectionId}/frozen`]), frozenSource);
    assert.equal(data.counts().candidateDispatches, 0); assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0);
    assert.ok(data.requests.every((args: string[]) => args[0] !== 'workflow' && args[0] !== 'pr'));
  }));
});

releaseSelectionTest('wrong frozen registry peer or source aggregate blocks before any main PR or post-main preparation', async t => {
  let mutateAggregate: (value: any) => void = () => {};
  const data = fixture(t, { mutateAggregate: value => mutateAggregate(value) });
  assertReleaseStatus(await runReleaseOperation(data.options, data.dependencies), 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  const frozenSource = data.state().sourceCommit, frozenRef = `refs/buildr/release/${selectionId}/frozen`;
  const frozenTree = git(data.repo, ['rev-parse', frozenSource + '^{tree}']);
  assert.equal(git(data.repo, ['rev-parse', frozenRef]), frozenSource);
  for (const [name, mutate] of [
    ['peer', (value: any) => { value.verification.peer.artifactSha256 = 'f'.repeat(64); }],
    ['source', (value: any) => { value.sourceTree = 'e'.repeat(40); }],
  ] as const) await t.test(name, () => captureReleaseSelectionFailure(name, async () => {
    const previousReads = data.counts().pluginSourceReads;
    mutateAggregate = value => {
      assert.equal(value.sourceTree, frozenTree);
      assert.deepEqual(value.verification.peer, data.peer);
      mutate(value);
    };
    const result = await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies);
    assertReleaseStatus(result, 'blocked'); assert.equal(data.counts().pluginSourceReads, previousReads + 1);
    assert.equal(data.state().sourceCommit, frozenSource);
    assert.equal(git(data.repo, ['rev-parse', frozenRef]), frozenSource);
    assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0); assert.equal(data.counts().mainReads, 0);
    assert.ok(data.requests.every((args: string[]) => args[0] !== 'pr')); assert.equal(data.counts().candidateDispatches, 1);
  }));
  mutateAggregate = () => {};
  const verified = await runReleaseOperation({ ...data.options, stopAfter: 'candidate' }, data.dependencies);
  assertReleaseStatus(verified, 'candidate-verified'); assert.equal(verified.sourceCommit, frozenSource); assert.equal(verified.sourceTree, frozenTree);
  assert.deepEqual(verified.artifacts['dsh-plugin'], data.state().pluginSourceAggregate.candidate);
  assert.deepEqual(data.state().pluginSourceAggregate.verification.peer, data.peer);
  assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0); assert.equal(data.counts().postMainReads, 0);
  assert.equal(data.state().context, undefined, 'candidate-only proof does not manufacture protected-main readiness');
  assert.ok(data.requests.every((args: string[]) => args[0] !== 'pr'));
});
