import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { runReleaseOperation } from '../../tools/release/release-orchestration-runner.ts';
import { artifactFromTarball } from '../../tools/release/package-artifact-observation.ts';
import { createPluginSourceAggregate } from '../../tools/release/verify-pr-candidate.ts';
import { createReleaseCandidate, PLUGIN_SERVICE_PATH, SOURCE_SDK_MANIFEST, sourceSdkIdentityFromFiles } from '../../../dsh-plugin/tools/release-candidate.ts';
import { archiveTreeIdentity } from '../../../dsh-plugin/tools/verify-all.ts';
import { identity } from '../../../dsh-plugin/tools/verify-buildr-plugin-pair.ts';

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

function fixture(t: any, changes: { mainRuntime?: boolean; mutateAggregate?: (value: any) => void } = {}): any {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-selection-operation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), remote = path.join(root, 'remote.git');
  const repo = path.join(workspace, '.worktrees', taskId), providerFile = path.join(workspace, '.git/buildr/task-worktrees', taskId + '.json');
  const write = (file: string, bytes: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), bytes); };
  write('projects/product/services/buildr/package.json', JSON.stringify({ name: '@buildr-ai/buildr', version: mainVersion, buildrCompatibility: mainCompatibility }));
  write(PLUGIN_SERVICE_PATH + '/package.json', JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin', version: '0.1.0-rc.6', buildrCompatibility: pluginCompatibility }));
  write(PLUGIN_SERVICE_PATH + '/' + SOURCE_SDK_MANIFEST, manifestBytes); write(PLUGIN_SERVICE_PATH + '/' + sdkPatch, patchBytes);
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
  const events: string[] = [], requests: any[] = [];
  const runtime = {
    inspectTask(target: string, id: string) {
      assert.equal(target, workspace); assert.equal(id, taskId);
      if (!task) throw Object.assign(new Error('Task absent'), { code: 'task_record_not_found' });
      return { record: task, recordDigest: 'sha256-' + '1'.repeat(64) };
    },
    inspectGitWorktrees({ workspaceRoot, taskId: id }: any) {
      assert.equal(workspaceRoot, workspace); assert.equal(id, taskId);
      return worktreeCreated ? { status: 'ready', taskId, evidencePath: providerFile, repositories: [{ selector: 'workspace', checkoutPath: repo, branch,
        head: git(repo, ['rev-parse', 'HEAD']), state: 'ready' }] } : { status: 'absent' };
    },
  };
  const body = (value: any) => ({ status: 0, stdout: JSON.stringify(value) });
  const execute = (command: string, args: string[], config: any): any => {
    if (command !== 'gh') return spawnSync(command, args, { ...config, encoding: 'utf8' });
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
      pr = { ...pr, state: 'MERGED', mergedAt: new Date().toISOString(), mergeCommit: { oid: merged } }; return { status: 0, stdout: '' };
    }
    assert.fail('Unexpected fixture host command ' + args.join(' '));
  };
  const dependencies = { execute, runtime, resolveRetainedController: () => ({ workspaceRoot: workspace }),
    invokeRetainedController(_controller: any, args: string[]) {
      if (args[0] === 'task' && args[1] === 'create') { task = { taskId, status: 'active', title: 'Plugin release' }; return { status: 'created', record: task, effects: [] }; }
      assert.deepEqual(args.slice(0, 2), ['worktree', 'create']); assert.equal(args[args.indexOf('--start-point') + 1], baseline);
      git(workspace, ['worktree', 'add', '-b', branch, repo, baseline]);
      fs.mkdirSync(path.dirname(providerFile), { recursive: true }); fs.writeFileSync(providerFile, JSON.stringify({ schemaVersion: 'buildr.git-worktree-evidence/v1',
        taskId, workspaceRoot: workspace, branch, planDigest: 'sha256-' + '2'.repeat(64), status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: repo, branch }], effects: [] }));
      worktreeCreated = true; return runtime.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
    },
    observeUnpublishedRelease() { unpublishedReads++; assert.fail('plugin-only must not observe a new main publication'); },
    candidateDependencies: { get candidateEvidence(): any { mainReads++; throw new Error('Main QA evidence must be read for the actual main runtime diff'); } },
    pluginSourceDependencies: { readSourceCandidate(input: any) {
      pluginSourceReads++; const owned = pluginCandidate(input.plan.sourceCommit, input.plan.serviceTree, peer);
      const aggregate = createPluginSourceAggregate(input.plan, owned.candidate, owned.verification, { runId: input.runId, runAttempt: input.runAttempt });
      changes.mutateAggregate?.(aggregate); events.push('source-proof'); return { aggregate };
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
  return { workspace, repo, baseline, peer, state, options, dependencies, events, requests,
    revealCandidate() { candidateVisible = true; },
    counts: () => ({ candidateDispatches, pluginDispatches, merges, mainReads, unpublishedReads, pluginSourceReads, postMainReads }),
    remoteRef: (name: string) => git(workspace, ['ls-remote', 'origin', 'refs/heads/' + name]),
  };
}

test('plugin-only prepare recovers one lost source dispatch, admits exact peer proof, and prepares separate main bytes without resurrecting refs', async t => {
  const data = fixture(t);
  const first = await runReleaseOperation(data.options, data.dependencies);
  assert.equal(first.status, 'candidate-dispatch-unconfirmed', JSON.stringify(first)); assert.equal(first.version, null); assert.equal(first.selectionId, selectionId);
  assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.state().candidate.runId, null); assert.equal(data.counts().merges, 0);
  data.revealCandidate();
  const ready = await runReleaseOperation(data.options, data.dependencies);
  assert.equal(ready.status, 'awaiting-publication-authorization', JSON.stringify(ready));
  assert.deepEqual(data.counts(), { candidateDispatches: 1, pluginDispatches: 1, merges: 1, mainReads: 0, unpublishedReads: 0, pluginSourceReads: 1, postMainReads: 1 });
  const record = data.state(); assert.deepEqual(record.candidatePlan.requirements, { buildr: false, plugin: true });
  assert.equal(record.candidate.runId, 700); assert.equal(record.pluginPreparation.runId, 800); assert.equal(record.context.selection.version, null);
  assert.equal(record.context.selection.status, 'frozen'); assert.equal(record.sources.length, 1);
  assert.equal(git(data.repo, ['show', record.context.convergence.mainCommit + ':projects/product/services/buildr/package.json']),
    git(data.workspace, ['show', data.baseline + ':projects/product/services/buildr/package.json']));
  const dispatch = data.requests.find((args: string[]) => args[0] === 'workflow' && args[2] === 'verify.yml');
  for (const field of ['release_packages=dsh-plugin', 'buildr_version=' + mainVersion, 'plugin_version=' + pluginVersion,
    'selection_id=' + selectionId, 'buildr_peer_version=' + mainVersion, 'buildr_peer_integrity=' + data.peer.integrity]) assert.ok(dispatch.includes(field));
  assert.deepEqual(record.context.targets.packages, ['dsh-plugin']); assert.deepEqual(record.context.packages['dsh-plugin'].buildrPeer, data.peer);
  assert.deepEqual(record.context.convergence.mergeParents, [data.baseline, record.sourceCommit]);
  assert.ok(data.events.indexOf('source-proof') < data.events.indexOf('main-merge')); assert.ok(data.events.indexOf('main-merge') < data.events.indexOf('post-main-dispatch'));
  assert.equal(data.remoteRef('release-' + selectionId), ''); assert.equal(data.remoteRef(record.candidate.branch), '');
  const repeated = await runReleaseOperation(data.options, data.dependencies);
  assert.equal(repeated.status, 'awaiting-publication-authorization', JSON.stringify(repeated)); assert.equal(repeated.contextIdentity, ready.contextIdentity);
  assert.equal(data.counts().candidateDispatches, 1); assert.equal(data.counts().pluginDispatches, 1); assert.equal(data.counts().merges, 1);
  assert.equal(data.remoteRef('release-' + selectionId), ''); assert.equal(data.remoteRef(record.candidate.branch), '');
  assert.ok(data.requests.filter((args: string[]) => args[0] === 'workflow').every((args: string[]) => !args.includes('operation=publish')));
});

test('plugin-only target selection cannot waive main QA required by the complete source diff', async t => {
  const data = fixture(t, { mainRuntime: true });
  assert.equal((await runReleaseOperation(data.options, data.dependencies)).status, 'candidate-dispatch-unconfirmed'); data.revealCandidate();
  const result = await runReleaseOperation(data.options, data.dependencies);
  assert.equal(result.status, 'blocked', JSON.stringify(result)); assert.deepEqual(data.state().candidatePlan.requirements, { buildr: true, plugin: true });
  assert.match(result.diagnostic.message, /Main QA evidence must be read/u);
  assert.equal(data.counts().mainReads, 1); assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginSourceReads, 0); assert.equal(data.counts().pluginDispatches, 0);
  assert.equal(data.counts().unpublishedReads, 0); assert.equal(data.counts().candidateDispatches, 1);
});

test('wrong frozen registry peer or source aggregate blocks before any main PR or post-main preparation', async t => {
  for (const [name, mutateAggregate] of [
    ['peer', (value: any) => { value.verification.peer.artifactSha256 = 'f'.repeat(64); }],
    ['source', (value: any) => { value.sourceTree = 'e'.repeat(40); }],
  ] as const) await t.test(name, async (nested: any) => {
    const data = fixture(nested, { mutateAggregate });
    assert.equal((await runReleaseOperation(data.options, data.dependencies)).status, 'candidate-dispatch-unconfirmed'); data.revealCandidate();
    const result = await runReleaseOperation(data.options, data.dependencies);
    assert.equal(result.status, 'blocked', JSON.stringify(result)); assert.equal(data.counts().pluginSourceReads, 1);
    assert.equal(data.counts().merges, 0); assert.equal(data.counts().pluginDispatches, 0); assert.equal(data.counts().mainReads, 0);
    assert.ok(data.requests.every((args: string[]) => args[0] !== 'pr')); assert.equal(data.counts().candidateDispatches, 1);
  });
});
