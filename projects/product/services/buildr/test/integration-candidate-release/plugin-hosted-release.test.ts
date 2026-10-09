import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { artifactFromTarball } from '../../tools/release/package-artifact-observation.ts';
import { readHostedPluginCandidate, readHostedPluginJournal, runPluginHostedOperation, validatePluginHostedRun } from '../../tools/release/plugin-hosted-release.ts';
import { createReleaseCandidate, PLUGIN_SERVICE_PATH, SOURCE_SDK_MANIFEST, sourceSdkIdentityFromFiles } from '../../../dsh-plugin/tools/release-candidate.ts';
import { archiveTreeIdentity } from '../../../dsh-plugin/tools/verify-all.ts';
import { identity } from '../../../dsh-plugin/tools/verify-buildr-plugin-pair.ts';

const version = '0.1.0-rc.7', mainSource = 'c'.repeat(40), selectedSource = 'b'.repeat(40), serviceTree = 'e'.repeat(40);
const repository = 'BuildrAI/Buildr';
const peer: any = { origin: 'candidate', packageName: '@buildr-ai/buildr', version: '0.1.0-rc.41', sourceCommit: selectedSource,
  integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64'), artifactSha256: '1'.repeat(64),
  compatibility: { schemaVersion: 'buildr.package-compatibility/v1', provides: ['buildr.entry/v1'], requires: [] } };
function run(operation = 'prepare', id = 22, changes: any = {}): any {
  return { id, repository: { full_name: repository }, path: '.github/workflows/publish-dsh-plugin.yml', event: 'workflow_dispatch',
    head_branch: 'main', head_sha: mainSource, display_title: `DSH ${operation} ${version}`, run_attempt: 1, status: 'completed', conclusion: 'success', ...changes };
}
const row = (id: number, operation = 'prepare') => ({ databaseId: id, displayTitle: `DSH ${operation} ${version}`, headSha: mainSource, status: 'completed', conclusion: 'success' });
const options = (pointer: any, operation = 'prepare') => ({ operation, pointer, version, sourceCommit: mainSource, sourceTree: serviceTree, repo: '/unused-recorded-repo',
  peer, buildrCandidateRunId: 10, candidateRunId: 11, authorized: true, ghCommand: 'recorded-gh' });
function harness(input: any = {}): any {
  const calls: any[] = [], events: any[] = [];
  let lists = 0, dispatches = 0;
  const execute = (command: string, args: string[], config: any): any => {
    calls.push({ command, args: [...args], config }); events.push(args.slice(0, 2).join(' '));
    assert.equal(command, 'recorded-gh');
    if (args[0] === 'run' && args[1] === 'list') return { status: 0, stdout: JSON.stringify(input.lists?.[lists++] ?? input.rows ?? []) };
    if (args[0] === 'workflow' && args[1] === 'run') { dispatches++; return input.lostResponse ? { status: 1, stderr: 'lost dispatch response' } : { status: 0, stdout: '' }; }
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify(input.run ?? run(input.operation ?? 'prepare')) };
    assert.fail('unexpected host call: ' + args.join(' '));
  };
  const dependencies = { execute, onPointer(pointer: any) { events.push('pointer saved'); input.snapshots?.push(structuredClone(pointer)); },
    readCandidate(candidateOptions: any) { input.candidateReads?.push(candidateOptions); return input.owned ?? { artifact: { sourceCommit: candidateOptions.sourceCommit }, candidate: { sourceCommit: candidateOptions.sourceCommit } }; },
    readJournal(journalOptions: any) { input.journalReads?.push(journalOptions); if (input.missingJournal) throw new Error('original journal is unavailable'); return input.journal ?? { status: 'passed', request: { runId: input.run?.id ?? 22 } }; } };
  return { calls, events, dependencies, dispatches: () => dispatches };
}

test('lost dispatch response persists intent before one request and resumes by original run readback', () => {
  const pointer: any = {}, snapshots: any[] = [], reads: any[] = [];
  const hosted = harness({ lostResponse: true, lists: [[], [], [row(22)]], snapshots, candidateReads: reads,
    owned: { artifact: { sourceCommit: mainSource }, candidate: { sourceCommit: mainSource }, tarballBytes: Buffer.from('owned-owner-fixture') } });
  const first = runPluginHostedOperation(options(pointer), hosted.dependencies);
  assert.equal(first.status, 'dispatch-unconfirmed'); assert.equal(first.effects[0].state, 'unknown');
  assert.deepEqual(snapshots[0], { requested: true, version, sourceCommit: mainSource, runId: null });
  assert.ok(hosted.events.indexOf('pointer saved') < hosted.events.indexOf('workflow run'));
  const resumed = runPluginHostedOperation(options(pointer), hosted.dependencies);
  assert.equal(resumed.status, 'passed'); assert.equal(pointer.runId, 22); assert.equal(hosted.dispatches(), 1);
  assert.equal(reads.length, 1); assert.equal(reads[0].runId, 22); assert.equal(reads[0].sourceCommit, mainSource);
  assert.equal(reads[0].peer.sourceCommit, selectedSource); assert.deepEqual(resumed.tarballBytes, Buffer.from('owned-owner-fixture'));
  assert.ok(hosted.calls.every((call: any) => call.command === 'recorded-gh'));
});

test('unknown dispatch remains a single request even when no run is visible on repeated resumes', () => {
  const pointer: any = {}, hosted = harness({ lostResponse: true });
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(runPluginHostedOperation(options(pointer), hosted.dependencies).status, 'dispatch-unconfirmed');
  assert.equal(hosted.dispatches(), 1); assert.equal(pointer.requested, true); assert.equal(pointer.runId, null);
});

test('adopting one matching owner run retains a complete identity for the next resume', () => {
  const pointer: any = {}, hosted = harness({ rows: [row(22)] });
  assert.equal(runPluginHostedOperation(options(pointer), hosted.dependencies).status, 'passed');
  assert.deepEqual(pointer, { requested: true, version, sourceCommit: mainSource, runId: 22 });
  assert.equal(runPluginHostedOperation(options(pointer), hosted.dependencies).status, 'passed');
  assert.equal(hosted.dispatches(), 0);
  const malformed = harness();
  assert.throws(() => runPluginHostedOperation({ ...options({}), peer: null }, malformed.dependencies));
  assert.deepEqual(malformed.calls, []);
});

test('hosted run admission binds first attempt, main branch, workflow path, version, source and request ID', () => {
  const request: any = { operation: 'prepare', version, sourceCommit: mainSource, runId: 22 };
  assert.doesNotThrow(() => validatePluginHostedRun(run(), request));
  assert.doesNotThrow(() => validatePluginHostedRun(run('prepare', 22, { path: '.github/workflows/publish-dsh-plugin.yml@refs/heads/main' }), request));
  for (const changes of [
    { run_attempt: 2 }, { head_branch: 'dev' }, { path: '.github/workflows/publish.yml' }, { head_sha: selectedSource },
    { display_title: 'DSH prepare 0.1.0-rc.8' }, { display_title: `DSH publish ${version}` }, { event: 'push' },
    { repository: { full_name: 'Other/Buildr' } }, { id: 23 }, { id: 0 }, { id: '22' },
  ]) assert.throws(() => validatePluginHostedRun(run('prepare', 22, changes), request), /original request/);
});

test('changed original pointer source or version fails before host calls; missing publication authorization also has no host effect', () => {
  for (const pointer of [{ requested: true, sourceCommit: selectedSource, version, runId: 22 },
    { requested: true, sourceCommit: mainSource, version: '0.1.0-rc.8', runId: 22 }]) {
    const hosted = harness();
    assert.throws(() => runPluginHostedOperation(options(pointer), hosted.dependencies), /pointer identity/); assert.deepEqual(hosted.calls, []);
  }
  for (const change of [{ authorized: false }, { candidateRunId: 0 }]) {
    const hosted = harness();
    assert.equal(runPluginHostedOperation({ ...options({}, 'publish'), ...change }, hosted.dependencies).status, 'authorization-required');
    assert.deepEqual(hosted.calls, []);
  }
});

test('a partially lost original pointer cannot bypass its stored version binding', () => {
  const pointer = { requested: true, version: '0.1.0-rc.8', runId: 22 }, hosted = harness();
  assert.throws(() => runPluginHostedOperation(options(pointer), hosted.dependencies), /pointer identity/);
  assert.deepEqual(hosted.calls, []);
});

test('ambiguous current runs fail before dispatch and running or failed prepare never reads Candidate bytes', () => {
  const ambiguous = harness({ rows: [row(22), row(23)] });
  assert.throws(() => runPluginHostedOperation(options({}), ambiguous.dependencies), /ambiguous/); assert.equal(ambiguous.dispatches(), 0);
  for (const changes of [{ status: 'in_progress', conclusion: null }, { conclusion: 'failure' }]) {
    const reads: any[] = [], hosted = harness({ run: run('prepare', 22, changes), candidateReads: reads });
    const result = runPluginHostedOperation(options({ requested: true, version, sourceCommit: mainSource, runId: 22 }), hosted.dependencies);
    assert.equal(result.status, changes.status ? 'running' : 'blocked'); assert.equal(hosted.dispatches(), 0); assert.deepEqual(reads, []);
  }
});

test('missing original publication journal remains readback-required without another publish request', () => {
  const pointer = { requested: true, version, sourceCommit: mainSource, runId: 22 }, journalReads: any[] = [];
  const hosted = harness({ operation: 'publish', run: run('publish'), missingJournal: true, journalReads });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = runPluginHostedOperation(options(pointer, 'publish'), hosted.dependencies);
    assert.equal(result.status, 'readback-required'); assert.deepEqual(result.effects, []);
  }
  assert.equal(hosted.dispatches(), 0); assert.equal(journalReads.length, 2);
  assert.ok(journalReads.every(value => value.runId === 22)); assert.equal(pointer.runId, 22);
});

test('recovery excludes prior runs and sends original Candidate plus recovery IDs in one new request', () => {
  const pointer: any = { requested: false, version, sourceCommit: mainSource, runId: null, recoveryRunId: 21, previousRunIds: [21] };
  const hosted = harness({ operation: 'publish', run: run('publish', 22), lists: [[row(21, 'publish')], [row(21, 'publish'), row(22, 'publish')]],
    journal: { status: 'passed', request: { runId: 21, runAttempt: 1 } } });
  const first = runPluginHostedOperation(options(pointer, 'publish'), hosted.dependencies);
  assert.equal(first.status, 'passed'); assert.equal(first.journal.request.runId, 21); assert.equal(pointer.runId, 22);
  const request = hosted.calls.find((call: any) => call.args[0] === 'workflow').args;
  assert.ok(request.includes('candidate_run_id=11')); assert.ok(request.includes('recovery_run_id=21')); assert.ok(request.includes('operation=publish'));
  assert.equal(request[request.indexOf('--ref') + 1], 'main');
  assert.equal(runPluginHostedOperation(options(pointer, 'publish'), hosted.dependencies).status, 'passed');
  assert.equal(hosted.dispatches(), 1); assert.deepEqual(pointer.previousRunIds, [21]);
});

function archive(metadata: any): Buffer {
  const body = Buffer.from(JSON.stringify(metadata)), header = Buffer.alloc(512);
  const field = (value: string, start: number, length: number) => header.write(value, start, length, 'utf8');
  field('package/package.json', 0, 100); field('0000644\0', 100, 8); field('0000000\0', 108, 8); field('0000000\0', 116, 8);
  field(body.length.toString(8).padStart(11, '0') + '\0', 124, 12); field('00000000000\0', 136, 12); header.fill(32, 148, 156);
  field('0', 156, 1); field('ustar\0', 257, 6); field('00', 263, 2);
  field(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512 + 1024)]));
}
function pairFixture(consumerArtifact: any, providerArtifact: any): any {
  const consumer = identity(consumerArtifact), provider = identity(providerArtifact);
  const features = [{ feature: 'entry', required: true, status: 'passed' }], contracts = ['buildr.installation-status/v1', 'buildr.web-protocol/v1'], diagnostic = null;
  const evidenceSha256 = crypto.createHash('sha256').update(JSON.stringify({ consumer, provider, features, contracts, diagnostic })).digest('hex');
  return { schemaVersion: 'buildr.dsh-package-pair-verification/v1', status: 'passed', consumer, provider, features, contracts, diagnostic, evidenceSha256,
    legacyPairEvidence: { schemaVersion: 'buildr.package-pair-evidence/v1', consumer, provider, features, evidenceSha256 } };
}
function candidateFixture(changes: any = {}): any {
  const pluginRoot = path.resolve(import.meta.dirname, '../../../dsh-plugin');
  const manifestBytes = fs.readFileSync(path.join(pluginRoot, SOURCE_SDK_MANIFEST));
  const patchBytes = fs.readFileSync(path.join(pluginRoot, 'sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch'));
  const sourceSdk = sourceSdkIdentityFromFiles(manifestBytes, patchBytes);
  const metadata: any = { name: '@buildr-ai/buildr-dsh-plugin', version, repository: 'https://github.com/BuildrAI/Buildr',
    buildrCompatibility: { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [{ packageName: '@buildr-ai/buildr', feature: 'entry', required: true,
      versions: { minInclusive: '0.1.0-rc.0', maxExclusive: '0.2.0', includePrerelease: true }, contracts: ['buildr.entry/v1'] }] },
    buildrDshSourceSdk: { upstream: sourceSdk.baseline, sourceManifestSha256: sourceSdk.manifestSha256, sourcePatchSha256: sourceSdk.patchSha256, compiledContracts: sourceSdk.contracts } };
  const bytes = archive(metadata), candidate = createReleaseCandidate({ version, sourceCommit: mainSource, sourceTree: serviceTree, filename: 'owned-plugin.tgz', bytes, sourceSdk, fileCount: 1 });
  const consumer = { ...artifactFromTarball(bytes, { origin: 'candidate', packageName: candidate.packageName, version, integrity: candidate.integrity, sourceCommit: mainSource }), sourceTree: serviceTree };
  const verificationSource = { observedCommit: mainSource, dirty: false, contentSha256: '4'.repeat(64) };
  const verification: any = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', candidateBound: true, sourceCommit: mainSource, sourceTree: serviceTree,
    consumer, consumerTreeSha256: archiveTreeIdentity(bytes), peer: structuredClone(peer), pair: pairFixture(consumer, peer), sourceSdk, verificationSource,
    sourceBinding: { method: 'git-tree-content-equivalence', testedGitHead: verificationSource.observedCommit, testedWorkingTreeDirty: verificationSource.dirty,
      verifiedContentSha256: verificationSource.contentSha256, candidateSourceCommit: mainSource, candidateSourceTree: serviceTree },
    checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false };
  const calls: any[] = [], downloadRoots: string[] = [];
  const execute = (command: string, args: string[], config: any): any => {
    calls.push({ command, args: [...args], config });
    if (command === 'git') {
      assert.equal(args[0], 'show'); assert.equal(args.at(-1), '--'); assert.ok(args[1].startsWith(mainSource + ':' + PLUGIN_SERVICE_PATH + '/'));
      return { status: 0, stdout: args[1].endsWith('.json') ? manifestBytes.toString('utf8') : patchBytes.toString('utf8') };
    }
    assert.equal(command, 'recorded-gh'); assert.deepEqual(args.slice(0, 2), ['run', 'download']); assert.equal(args[2], '11');
    assert.equal(args[args.indexOf('--repo') + 1], repository);
    const destination = args[args.indexOf('--dir') + 1], name = args[args.indexOf('--name') + 1];
    downloadRoots.push(destination); fs.mkdirSync(destination, { recursive: true });
    if (name === 'plugin-candidate-v' + version) {
      const value = structuredClone(candidate); changes.candidate?.(value);
      fs.writeFileSync(path.join(destination, 'candidate.json'), JSON.stringify(value));
      fs.writeFileSync(path.join(destination, candidate.filename), changes.tarball ?? bytes);
      if (changes.duplicate) { fs.mkdirSync(path.join(destination, 'duplicate')); fs.writeFileSync(path.join(destination, 'duplicate/candidate.json'), JSON.stringify(value)); }
      if (changes.symlink) fs.symlinkSync(path.join(destination, candidate.filename), path.join(destination, 'linked.tgz'));
    } else {
      assert.equal(name, 'plugin-candidate-aggregate');
      const value = structuredClone(verification); changes.verification?.(value);
      fs.writeFileSync(path.join(destination, 'plugin-full-verification.json'), JSON.stringify(value));
    }
    return { status: 0, stdout: '' };
  };
  return { candidate, bytes, verification, calls, downloadRoots, dependencies: { execute } };
}

test('post-main plugin Candidate M is read as the original owned tarball verified against selected peer A', () => {
  const data = candidateFixture();
  const observed = readHostedPluginCandidate({ ...options({}), runId: 11 }, data.dependencies);
  assert.deepEqual(observed.tarballBytes, data.bytes); assert.equal(observed.candidate.integrity, data.candidate.integrity);
  assert.equal(observed.candidate.sourceCommit, mainSource); assert.equal(observed.artifact.sourceCommit, mainSource);
  assert.equal(observed.verification.peer.sourceCommit, selectedSource); assert.notEqual(mainSource, selectedSource);
  assert.equal(data.calls.filter((call: any) => call.command === 'recorded-gh').length, 2);
  assert.equal(data.calls.filter((call: any) => call.command === 'git').length, 2);
  assert.equal(data.calls.find((call: any) => call.args.includes('plugin-candidate-v' + version)).config.timeout, 120_000);
  assert.ok(data.downloadRoots.every((root: string) => !fs.existsSync(root)));
});

test('plugin-only Candidate readback can bind an exact published registry peer without substituting same-version source', () => {
  const registryPeer = { ...structuredClone(peer), origin: 'registry' }; delete registryPeer.sourceCommit;
  const data = candidateFixture({ verification(value: any) {
    value.peer = registryPeer; value.pair = pairFixture(value.consumer, registryPeer);
  } });
  const observed = readHostedPluginCandidate({ ...options({}), peer: registryPeer, runId: 11 }, data.dependencies);
  assert.equal(observed.verification.peer.origin, 'registry'); assert.deepEqual(observed.tarballBytes, data.bytes);
  const wrongOrigin = candidateFixture();
  assert.throws(() => readHostedPluginCandidate({ ...options({}), peer: registryPeer, runId: 11 }, wrongOrigin.dependencies), /different frozen peer/);
});

test('Candidate readback refuses changed tar bytes, source/version, duplicate manifests and symlinks', () => {
  for (const changes of [{ tarball: Buffer.from('not the original owned package') }, { candidate(value: any) { value.sourceCommit = selectedSource; } },
    { candidate(value: any) { value.version = '0.1.0-rc.8'; } }, { duplicate: true }, { symlink: true }]) {
    const data = candidateFixture(changes);
    assert.throws(() => readHostedPluginCandidate({ ...options({}), runId: 11 }, data.dependencies));
    assert.ok(data.downloadRoots.every((root: string) => !fs.existsSync(root)));
  }
});

test('Candidate readback requires final byte-bound full checks and the exact frozen peer without forcing peer A onto main M', () => {
  for (const mutate of [
    (value: any) => { value.candidateBound = false; }, (value: any) => { value.sourceCommit = selectedSource; },
    (value: any) => { value.consumer.integrity = peer.integrity; }, (value: any) => { value.sourceSdk.patchSha256 = '9'.repeat(64); },
    (value: any) => { value.checks.pop(); }, (value: any) => { value.peer.sourceCommit = mainSource; value.pair.provider.sourceCommit = mainSource; },
    (value: any) => { value.peer.artifactSha256 = '9'.repeat(64); value.pair.provider.artifactSha256 = '9'.repeat(64); },
  ]) {
    const data = candidateFixture({ verification: mutate });
    assert.throws(() => readHostedPluginCandidate({ ...options({}), runId: 11 }, data.dependencies));
  }
});

test('publication journal readback downloads only the original owned artifact and removes its temporary projection', () => {
  const calls: any[] = [], roots: string[] = [];
  const observed = readHostedPluginJournal({ ...options({}, 'publish'), runId: 22 }, { execute(command: string, args: string[], config: any) {
    calls.push({ command, args, config }); assert.equal(command, 'recorded-gh'); assert.deepEqual(args.slice(0, 3), ['run', 'download', '22']);
    assert.equal(args[args.indexOf('--name') + 1], 'plugin-publication-v' + version);
    const destination = args[args.indexOf('--dir') + 1]; roots.push(destination); fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, 'publication.json'), JSON.stringify({ status: 'passed', request: { runId: 22 } }));
    return { status: 0, stdout: '' };
  } });
  assert.equal(observed.request.runId, 22); assert.equal(calls.length, 1); assert.equal(calls[0].config.timeout, 60_000);
  assert.ok(roots.every(root => !fs.existsSync(root)));
});
