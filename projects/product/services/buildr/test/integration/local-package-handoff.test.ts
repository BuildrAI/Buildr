import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { createPackageHandoff, createPackageHandoffCommit, restorePackageHandoff, LOCAL_PLATFORM_POLICY } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';
import { continueLocalPackageCandidate } from '../../../../../../skills/buildr-release/scripts/local-package-operation.ts';
import { prepareLocalMainPackage } from '../../../../../../skills/buildr-release/scripts/local-package-preparation.ts';
import { restorePriorPlatformEvidence } from '../../../../../../skills/buildr-release/scripts/local-package-remote.ts';
import { prepareLocalPluginPackage, prepareLocalPlugin } from '../../../../../../skills/buildr-release/scripts/local-plugin-preparation.ts';
import { candidateArtifactImportFromEnvironment } from '../verification/candidate-artifact-reuse.ts';
import { candidateSourceImportFromEnvironment, encodeCandidateSourceImport } from '../verification/candidate-source-reuse.ts';
import { freezeVerificationRules } from '../../../../../../skills/buildr-release/scripts/build-input-policy.ts';
import { currentVerificationRules, retainVerificationRules } from '../verification/release/verification-rules.ts';
import { preflightLocalConsumption } from '../../../../../../skills/buildr-release/scripts/local-consumption-preflight.ts';
import { RELEASE_CHECKS } from '../verification/release/release-consumption-contract.ts';
import { LOCAL_PACKAGE_MODEL } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';
import { localPackageCoverage } from '../verification/local-package-coverage.ts';
import { localPackageVerifierBinding } from '../../../../../../skills/buildr-release/scripts/local-package-verifier-binding.ts';

const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-handoff-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 10_000 }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Package transfer fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'frozen product\n'); git('add', '.'); git('commit', '--quiet', '-m', 'frozen source');
  const sourceCommit = git('rev-parse', 'HEAD'), sourceTree = git('rev-parse', 'HEAD^{tree}');
  const data = Buffer.alloc(8 * 1024 * 1024 + 17, 42);
  const paths = ['candidate-package/package.tgz', 'candidate-package/release-artifact.json', 'candidate-package/npm-pack.json', 'source-verification.json', 'artifact-verification.json'];
  const files = paths.map((name, index) => {
    const file = path.join(root, `input-${index}`);
    fs.writeFileSync(file, index === 0 ? data : JSON.stringify({ index, passed: true }));
    return { path: name, source: file };
  });
  const output = path.join(root, 'data');
  const manifest = createPackageHandoff({ output, sourceCommit, sourceTree, platform: 'darwin', artifactSha256: hash(data), files });
  const expected = { sourceCommit, sourceTree, identity: manifest.identity, artifactSha256: hash(data), platform: 'win32' as const };
  return { root, repo, git, sourceCommit, sourceTree, data, files, output, manifest, expected };
}

test('immutable package transfer roundtrips chunks without touching the product index or HEAD', t => {
  const f = fixture(t);
  const original = createPackageHandoffCommit(f.repo, f.output);
  const destination = path.join(f.root, 'received');
  restorePackageHandoff(f.repo, original.commit, destination, f.expected);
  assert.deepEqual(fs.readFileSync(path.join(destination, 'candidate-package/package.tgz')), f.data);
  assert.equal(f.git('rev-parse', 'HEAD'), f.sourceCommit);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.throws(() => restorePackageHandoff(f.repo, original.commit, destination, f.expected), /destination must be empty/);
  assert.throws(() => restorePackageHandoff(f.repo, original.commit, path.join(f.root, 'wrong-platform'), { ...f.expected, platform: 'darwin' }), /target platform/);
  assert.throws(() => restorePackageHandoff(f.repo, original.commit, path.join(f.root, 'wrong-package'), { ...f.expected, artifactSha256: '0'.repeat(64) }), /frozen source/);
});

test('independent consumption binds clean verifier-only Git inputs without replacing product or handoff', t => {
  const f = fixture(t);
  const service = path.join(f.repo, 'projects/product/services/buildr');
  fs.mkdirSync(service, { recursive: true });
  fs.writeFileSync(path.join(service, 'package.json'), '{"name":"product"}\n');
  f.git('add', '.'); f.git('commit', '--quiet', '-m', 'package identity');
  const productSource = f.git('rev-parse', 'HEAD');
  const productTree = f.git('rev-parse', 'HEAD^{tree}');
  const verifier = path.join(f.root, 'verifier');
  f.git('worktree', 'add', '--detach', verifier, productSource);
  const verifierRoot = path.join(verifier, 'projects/product/services/buildr');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: verifier, encoding: 'utf8' }).trim();
  fs.mkdirSync(path.join(verifierRoot, 'test'), { recursive: true });
  fs.writeFileSync(path.join(verifierRoot, 'test/repair.ts'), 'export const repaired = true;\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'verifier only');
  const verificationSource = git('rev-parse', 'HEAD');
  const output = path.join(f.root, 'bound-handoff');
  const rules = freezeVerificationRules({ kind: 'buildr', recipeIdentity: `sha256-${'1'.repeat(64)}`,
    consumptionIdentity: `sha256-${'2'.repeat(64)}`, scopeIdentity: null, platformPolicy: LOCAL_PLATFORM_POLICY });
  const handoff = createPackageHandoff({ output, sourceCommit: productSource, sourceTree: productTree,
    platform: 'darwin', artifactSha256: hash(f.data), files: f.files, platformPolicy: LOCAL_PLATFORM_POLICY, verificationRules: rules });
  const env = { BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT: service, BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE: verificationSource,
    BUILDR_CANDIDATE_SOURCE_SHA: productSource, BUILDR_LOCAL_PACKAGE_HANDOFF: path.join(output, 'handoff.json') };
  const resolve = (action = 'plan', selected: NodeJS.ProcessEnv = env) => localPackageVerifierBinding({ verifierRoot, action, env: selected });
  const adopted = resolve();
  assert.equal(adopted.productRoot, fs.realpathSync(service));
  assert.equal(adopted.binding.productSource, productSource);
  assert.equal(adopted.binding.verificationSource, verificationSource);
  assert.equal(adopted.binding.productTree, productTree);
  assert.equal(JSON.parse(fs.readFileSync(env.BUILDR_LOCAL_PACKAGE_HANDOFF, 'utf8')).identity, handoff.identity);
  assert.equal(f.git('rev-parse', 'HEAD'), productSource);
  assert.equal(resolve('aggregate').binding.identity, adopted.binding.identity);
  assert.throws(() => resolve('run'), /read-only/);
  assert.throws(() => resolve('plan', { ...env, GITHUB_EVENT_NAME: 'pull_request' }), /controlled/);
  assert.throws(() => resolve('plan', { ...env, BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE: productSource }), /exact frozen/);
  assert.throws(() => resolve('plan', { ...env, BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT: verifierRoot }), /replace/);
  fs.writeFileSync(path.join(service, 'dirty.txt'), 'dirty\n');
  assert.throws(() => resolve(), /clean frozen/);
  fs.rmSync(path.join(service, 'dirty.txt'));
  fs.writeFileSync(path.join(verifierRoot, 'package.json'), '{"name":"changed-product"}\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'changed product input');
  assert.throws(() => resolve('plan', { ...env, BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE: git('rev-parse', 'HEAD') }), /build inputs changed/);
});

test('new-policy preservation accepts a neutral host but never weakens historical platform requirements', t => {
  const f = fixture(t);
  const previous = createPackageHandoffCommit(f.repo, f.output);
  assert.throws(() => restorePackageHandoff(f.repo, previous.commit, path.join(f.root, 'historical'), {
    ...f.expected, platform: 'linux', preserveOnly: true,
  }), /Historical package handoff/);
  const output = path.join(f.root, 'optional-data');
  const manifest = createPackageHandoff({ output, sourceCommit: f.sourceCommit, sourceTree: f.sourceTree,
    platform: 'darwin', platformPolicy: LOCAL_PLATFORM_POLICY, artifactSha256: hash(f.data), files: f.files });
  const next = createPackageHandoffCommit(f.repo, output);
  const destination = path.join(f.root, 'neutral-preservation');
  const received = restorePackageHandoff(f.repo, next.commit, destination, {
    ...f.expected, identity: manifest.identity, platform: 'linux', preserveOnly: true,
  });
  assert.equal(received.platformPolicy, LOCAL_PLATFORM_POLICY);
  assert.deepEqual(fs.readFileSync(path.join(destination, 'candidate-package/package.tgz')), f.data);
  assert.throws(() => restorePackageHandoff(f.repo, next.commit, path.join(f.root, 'same-platform-test'), {
    ...f.expected, identity: manifest.identity, platform: 'darwin',
  }), /target platform/);
});

test('independent plugin handoff preserves only the original plugin and proof, without a main package', t => {
  const f = fixture(t);
  const files = ['candidate.json', 'plugin.tgz', 'plugin-full-verification.json'].map(name => {
    const source = path.join(f.root, `independent-${name}`);
    fs.writeFileSync(source, name.endsWith('.json') ? '{}' : f.data);
    return { path: `plugin-candidate/${name}`, source };
  });
  const plugin = { version: '1.0.0', plan: { sourceCommit: f.sourceCommit, sourceTree: f.sourceTree,
    requirements: { buildr: false, plugin: true } } };
  const directory = path.join(f.root, 'plugin-data');
  const manifest = createPackageHandoff({ output: directory, kind: 'plugin', sourceCommit: f.sourceCommit,
    sourceTree: f.sourceTree, platform: 'darwin', artifactSha256: hash(f.data), files, plugin });
  const data = createPackageHandoffCommit(f.repo, directory);
  const received = path.join(f.root, 'plugin-received');
  restorePackageHandoff(f.repo, data.commit, received, { ...f.expected, identity: manifest.identity });
  assert.deepEqual(fs.readFileSync(path.join(received, 'plugin-candidate/plugin.tgz')), f.data);
  assert.equal(fs.existsSync(path.join(received, 'candidate-package')), false);
  assert.throws(() => createPackageHandoff({ output: path.join(f.root, 'bad-plugin'), kind: 'plugin',
    sourceCommit: f.sourceCommit, sourceTree: f.sourceTree, platform: 'darwin', artifactSha256: hash(f.data),
    files, plugin: { ...plugin, plan: { ...plugin.plan, sourceCommit: 'f'.repeat(40) } } }), /Incomplete independent plugin/);
});

test('independent local preparation never builds a main package and keeps the frozen registry peer', async t => {
  const f = fixture(t);
  const directory = path.join(f.repo, 'projects/product/services/buildr/build/verification/candidates', f.sourceCommit, 'local-plugin');
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'buildr-peer.tgz'), 'retained registry bytes');
  const plan = { sourceCommit: f.sourceCommit, sourceTree: f.sourceTree, requirements: { buildr: false, plugin: true } };
  const peer = { origin: 'registry', version: '1.0.0' };
  const pluginDirectory = path.join(f.root, 'plugin'); fs.mkdirSync(pluginDirectory);
  const files = ['candidate.json', 'plugin.tgz', 'plugin-full-verification.json'].map(name => {
    const source = path.join(pluginDirectory, name); fs.writeFileSync(source, name.endsWith('.json') ? '{}' : f.data);
    return { path: `plugin-candidate/${name}`, source };
  });
  let calls = 0;
  const prepared = await prepareLocalPluginPackage({ repo: f.repo, sourceCommit: f.sourceCommit, sourceTree: f.sourceTree,
    roundId: 'plugin', platform: 'darwin', plan, peer }, {
    assertCheckout() {}, observePeer() { assert.fail('retained peer is not downloaded again'); },
    currentRules: () => freezeVerificationRules({ kind: 'plugin', recipeIdentity: `sha256-${'a'.repeat(64)}`,
      consumptionIdentity: `sha256-${'b'.repeat(64)}`, scopeIdentity: null, platformPolicy: null }),
    preflight(input: any) { assert.equal(input.pluginDirectory, pluginDirectory); assert.equal(input.expectedPeer, peer); },
    async preparePlugin(input: any) {
      calls++; assert.deepEqual(input.peer, peer);
      assert.equal(JSON.parse(fs.readFileSync(input.peerFile, 'utf8')).tarball, path.join(directory, 'buildr-peer.tgz'));
      return { status: 'ready', directory: pluginDirectory, artifactSha256: hash(f.data), files, plugin: { version: '1.0.0', plan } };
    },
  });
  assert.equal(calls, 1); assert.equal(prepared.kind, 'plugin');
  assert.equal(fs.existsSync(path.join(path.dirname(directory), 'candidate-package')), false);
});

test('plugin preparation honors declared exclusions before SDK preparation or packing', async t => {
  const f = fixture(t);
  const result = await prepareLocalPlugin({ repo: f.repo, sourceCommit: f.sourceCommit, roundId: 'scope',
    peer: {}, peerFile: '/not-consumed', plan: {}, scope: { excludedBoundaries: ['E2E'] } }, {
    execute() { assert.fail('excluded plugin verification cannot prepare SDK or pack'); },
  });
  assert.equal(result.status, 'local-plugin-verification-required');
});

test('a corrupt data object or linked input cannot become a new successful package', t => {
  const f = fixture(t);
  const first = f.manifest.files[0].chunks[0];
  fs.writeFileSync(path.join(f.output, first.name), 'corrupted');
  assert.throws(() => createPackageHandoffCommit(f.repo, f.output), /chunk integrity/);
  const linked = path.join(f.root, 'linked');
  fs.symlinkSync(f.files[0].source, linked);
  assert.throws(() => createPackageHandoff({ output: path.join(f.root, 'linked-data'), sourceCommit: f.sourceCommit,
    sourceTree: f.sourceTree, platform: 'darwin', artifactSha256: hash(f.data), files: [{ path: 'package.tgz', source: linked }] }), /ordinary files/);
});

test('remote transfer rejects executable Git entries before materializing any output', t => {
  const f = fixture(t), original = createPackageHandoffCommit(f.repo, f.output);
  f.git('read-tree', original.commit);
  const name = f.manifest.files[0].chunks[0].name, object = f.git('rev-parse', `${original.commit}:${name}`);
  f.git('update-index', '--cacheinfo', '100755', object, name);
  const tree = f.git('write-tree'), malicious = f.git('commit-tree', tree, '-m', 'malformed fixture data');
  const destination = path.join(f.root, 'received');
  assert.throws(() => restorePackageHandoff(f.repo, malicious, destination, f.expected), /non-ordinary Git data/);
  assert.equal(fs.existsSync(destination), false);
});

test('package data Git objects bypass text filters and preserve original CRLF bytes on Windows', t => {
  const f = fixture(t);
  f.git('config', 'core.autocrlf', 'true');
  const text = '{"proof":"unchanged"}\r\n';
  fs.writeFileSync(f.files[3].source, text);
  const output = path.join(f.root, 'crlf-data');
  const manifest = createPackageHandoff({ output, sourceCommit: f.sourceCommit, sourceTree: f.sourceTree,
    platform: 'darwin', artifactSha256: hash(f.data), files: f.files });
  const original = createPackageHandoffCommit(f.repo, output), destination = path.join(f.root, 'crlf-received');
  restorePackageHandoff(f.repo, original.commit, destination, { ...f.expected, identity: manifest.identity });
  assert.equal(fs.readFileSync(path.join(destination, 'source-verification.json'), 'utf8'), text);
});

test('hosted workflow only verifies the original on the opposite system and has no publication authority', () => {
  const root = path.resolve(import.meta.dirname, '../../../../../..');
  const workflow = parseYaml(fs.readFileSync(path.join(root, '.github/workflows/verify-package.yml'), 'utf8'));
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.remote_runner.options, ['windows-2025', 'macos-15']);
  assert.deepEqual(Object.keys(workflow.jobs), ['package']);
  assert.match(workflow.jobs.package.name, /'Package diagnostic'.*'Candidate gate'/);
  assert.equal(workflow.jobs.package.environment, undefined);
  assert.equal(workflow.permissions['id-token'], undefined);
  const commands = workflow.jobs.package.steps.map((step: any) => step.run ?? '').join('\n');
  assert.match(commands, /artifact\.ts.*--scope platform/u);
  assert.doesNotMatch(commands, /(?:local-package-build|npm\s+(?:pack|publish)|candidate-ci\.ts run artifact-macos)/u);
  assert.ok(workflow.jobs.package.steps.filter((step: any) => step.uses?.startsWith('actions/upload-artifact@'))
    .every((step: any) => step.with.overwrite === true), 'late upload failure must resume without a duplicate artifact-name conflict');
  const names = workflow.jobs.package.steps.map((step: any) => step.name);
  assert.ok(names.indexOf('Validate independent verifier dispatch') < names.indexOf('Checkout independent proof verifier'),
    'authenticate unchanged build inputs before executing any independent verifier code');
  assert.match(commands, /createCandidateSourceBinding/);
  assert.match(commands, /PRESERVE_ONLY!=="true"/);
  assert.match(commands, /BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT/);
  assert.match(commands, /BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE/);
  const caller = parseYaml(fs.readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8'));
  assert.match(caller.jobs['local-package'].with.product_source, /local_package/);
  assert.match(caller.jobs['local-package'].with.verification_source, /local_package/);
  assert.ok(names.indexOf('Restore completed platform checks from the same run') < names.indexOf('Validate and adopt local proofs without executing source checks'));
  const pluginAggregate = workflow.jobs.package.steps.find((step: any) => step.with?.name === 'plugin-candidate-aggregate');
  const publication = parseYaml(fs.readFileSync(path.join(root, '.github/workflows/publish-dsh-plugin.yml'), 'utf8'));
  const consumer = publication.jobs.prepare.steps.find((step: any) => step.run?.includes('--aggregate '));
  const filename = path.posix.basename(pluginAggregate.with.path);
  assert.equal(filename, 'plugin-candidate-ci-aggregate.json');
  assert.ok(consumer.run.includes(`/verification/${filename}`), 'uploaded plugin proof must be readable by the actual publication consumer');
  const producer = fs.readFileSync(path.join(root, 'skills/buildr-release/scripts/local-package-remote.ts'), 'utf8');
  assert.ok(producer.includes(`path.join(directory, '${filename}')`), 'exported proof must use the uploaded filename');
  for (const name of ['Verify only the other system against the same package', 'Aggregate existing local and actual platform results']) {
    assert.match(workflow.jobs.package.steps.find((step: any) => step.name === name).if, /BUILDR_LOCAL_PACKAGE_KIND != 'plugin'/);
  }
  assert.doesNotMatch(commands, /prepare-release-sdk|ensure-release-sdk|verify-all\.ts/);
  const entry = parseYaml(fs.readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8'));
  assert.equal(entry.jobs['local-package'].uses, './.github/workflows/verify-package.yml');
  assert.ok(entry.jobs['local-package'].if.includes("inputs.purpose == 'local-package'"));
  assert.ok(entry.jobs['candidate-plan'].if.includes("inputs.purpose != 'local-package'"));
  assert.ok(entry.jobs['candidate-gate'].if.includes("inputs.purpose != 'local-package'"));
  assert.deepEqual(Object.keys(workflow.on.workflow_call.inputs).sort(), Object.keys(workflow.on.workflow_dispatch.inputs).sort());
  assert.ok(workflow.jobs.package.steps.find((step: any) => step.with?.name === 'candidate-aggregate').if.includes('!inputs.diagnostic_only'));
  assert.ok(workflow.jobs.package.steps.find((step: any) => step.name === 'Adopt already verified local plugin bytes').if.includes('!inputs.diagnostic_only'));
  assert.ok(Object.values(workflow.jobs.package.env).every((value: any) => !String(value).includes('runner.')),
    'job env cannot use runner context; GitHub rejects the workflow before scheduling');
  assert.match(workflow.jobs.package.steps.find((step: any) => step.name === 'Initialize isolated runtime paths').run, /RUNNER_TEMP.*local-package/);
  assert.ok(workflow.jobs.package.env.CANDIDATE_SOURCE_SHA.includes('inputs.diagnostic_only && inputs.diagnostic_source_commit'),
    'only a non-candidate diagnostic can consume the original package after a workflow-only fix');
  const platformConsumer = workflow.jobs.package.steps.find((step: any) => step.name === 'Verify only the other system against the same package');
  assert.match(platformConsumer.run, /unset BUILDR_SOURCE_VERIFICATION BUILDR_SOURCE_VERIFICATION_FILE/);
  assert.match(platformConsumer.run, /export PATH=.*System32/);
  assert.ok(platformConsumer.run.indexOf('export PATH=') < platformConsumer.run.lastIndexOf('node test/verification/artifact.ts'));
  assert.match(platformConsumer.if, /!inputs.preserve_only && !inputs.diagnostic_only/);
  assert.match(workflow.jobs.package['runs-on'], /preserve_only.*ubuntu-24\.04/);
  assert.equal(entry.jobs['local-package'].with.preserve_only, "${{ fromJSON(inputs.local_package || '{}').preserve_only == true }}");
  const smoke = workflow.jobs.package.steps.find((step: any) => step.name === 'Independent package smoke without Candidate qualification');
  assert.match(smoke.if, /inputs.diagnostic_only/);
  assert.match(smoke.run, /run-isolated-workspace-check\.ts.*package-smoke\.ts/);
  assert.doesNotMatch(smoke.run, /artifact\.ts|candidate-ci\.ts|ensure-release-sdk/);
});

test('platform retry cannot collide with local adopted files or adopt another run, future attempt or package', t => {
  const f = fixture(t), previous = path.join(f.root, 'previous'), output = path.join(f.root, 'evidence');
  fs.mkdirSync(previous); fs.mkdirSync(output);
  const local = 'candidate-ci-evidence-runtime-macos.json';
  fs.writeFileSync(path.join(previous, local), 'obsolete adopted local proof');
  fs.writeFileSync(path.join(output, local), 'current adopted local proof');
  const name = 'candidate-ci-evidence-runtime-windows.json';
  const proof = { id: 'runtime-windows', sourceCommit: f.sourceCommit, sourceTree: f.sourceTree,
    artifact: { sha256: f.manifest.artifactSha256 }, runner: { os: 'windows' }, workflow: { runId: '123', runAttempt: '1' } };
  fs.writeFileSync(path.join(previous, name), JSON.stringify(proof));
  const options = { handoff: f.manifest, directory: previous, output, runId: '123', runAttempt: 2, platform: 'win32' as const };
  assert.deepEqual(restorePriorPlatformEvidence(options), ['runtime-windows']);
  assert.equal(fs.readFileSync(path.join(output, local), 'utf8'), 'current adopted local proof');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, name), 'utf8')), proof);
  for (const change of [
    { workflow: { runId: '124', runAttempt: '1' } }, { workflow: { runId: '123', runAttempt: '2' } },
    { artifact: { sha256: '0'.repeat(64) } },
  ]) {
    fs.writeFileSync(path.join(previous, name), JSON.stringify({ ...proof, ...change }));
    assert.throws(() => restorePriorPlatformEvidence({ ...options, output: path.join(f.root, 'invalid') }), /same package run or attempt/);
  }
});

test('file proof imports avoid Windows environment size limits and keep legacy dispatch input readable', t => {
  const f = fixture(t);
  const bundle = { schemaVersion: 'buildr.verification-source-bundle/v1', records: [] };
  const transport = encodeCandidateSourceImport(bundle), file = path.join(f.root, 'source.json');
  fs.writeFileSync(file, JSON.stringify({ transport }));
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', BUILDR_SOURCE_VERIFICATION_FILE: file };
  assert.deepEqual(candidateSourceImportFromEnvironment(env), bundle);
  assert.deepEqual(candidateSourceImportFromEnvironment({ BUILDR_SOURCE_VERIFICATION: transport }), bundle);
  assert.throws(() => candidateSourceImportFromEnvironment({ ...env, BUILDR_SOURCE_VERIFICATION: transport }), /one explicit input/);
  const artifact = path.join(f.root, 'artifact.json');
  fs.writeFileSync(artifact, JSON.stringify({ evidence: [] }));
  assert.deepEqual(candidateArtifactImportFromEnvironment({ BUILDR_ARTIFACT_VERIFICATION_FILE: artifact }), []);
  assert.throws(() => candidateArtifactImportFromEnvironment({ BUILDR_ARTIFACT_VERIFICATION_FILE: artifact, GITHUB_EVENT_NAME: 'pull_request' }), /controlled manual/);
  fs.writeFileSync(artifact, JSON.stringify({ evidence: [{ status: 'passed' }] }));
  assert.throws(() => candidateArtifactImportFromEnvironment({ BUILDR_ARTIFACT_VERIFICATION_FILE: artifact }), /original Candidate evidence/);
});

test('new candidate dispatch sends an existing local package, and polling never prepares it again', async () => {
  const state: any = { candidate: { branch: 'codex/release-main-fixture-g1', sourceCommit: 'a'.repeat(40), runId: null, dispatchRequested: false } };
  const calls: string[][] = [];
  let preparations = 0, uploads = 0;
  const ready = { status: 'ready', sourceCommit: 'a'.repeat(40), handoffIdentity: 'frozen', artifactSha256: 'b'.repeat(64),
    platformPolicy: LOCAL_PLATFORM_POLICY,
    runner: 'windows-2025', handoffDirectory: '/owned/data', artifactDirectory: '/owned/package' };
  const dependencies = { state, save() {}, effects: [], platform: 'darwin', execute() {}, ensureCarrier() {},
    preparePackage: async () => { preparations++; return ready; },
    createDataCommit: () => ({ commit: 'c'.repeat(40), manifest: { identity: 'frozen' } }),
    git: () => '', pushData: () => { uploads++; },
    gh: (args: string[]) => {
      calls.push(args);
      return args[0] === 'run' ? JSON.stringify(state.candidate.dispatchRequested ? [{ databaseId: 123, headSha: 'a'.repeat(40) }] : []) : '';
    },
    readArtifact: () => ({ manifest: { sha256: ready.artifactSha256 } }),
    readHandoff: () => ({ identity: ready.handoffIdentity, verificationScope: null }),
  };
  const input = { options: {}, repo: '/owned/source', workspace: '/owned/workspace', key: 'fixture', sourceCommit: 'a'.repeat(40), sourceTree: 'd'.repeat(40) };
  assert.equal((await continueLocalPackageCandidate(input, dependencies)).status, 'ready');
  assert.equal((await continueLocalPackageCandidate(input, dependencies)).status, 'ready');
  assert.equal(preparations, 1); assert.equal(uploads, 1);
  const dispatches = calls.filter(args => args[0] === 'workflow');
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0][2], 'verify.yml');
  const data = JSON.parse(dispatches[0].find(arg => arg.startsWith('local_package='))!.slice('local_package='.length));
  assert.equal(data.package_commit, 'c'.repeat(40));
  assert.equal(data.preserve_only, true, 'new preparation dispatches data preservation, not opposite-system tests');
  assert.ok(dispatches[0].includes('purpose=local-package'));
  assert.ok(!dispatches[0].some(arg => arg.includes('repair_candidate_run_id')));
});

test('a failed local package check cannot push data or dispatch GitHub work', async () => {
  for (const status of ['local-artifact-verification-required', 'local-consumption-preflight-required']) {
    let writes = 0;
    const result = await continueLocalPackageCandidate({ options: {}, sourceCommit: 'a'.repeat(40) }, {
      state: { candidate: {} }, save() {}, effects: [], preparePackage: async () => ({ status }),
      git: () => { writes++; }, gh: () => { writes++; },
    });
    assert.equal(result.status, status);
    assert.equal(writes, 0);
  }
});

test('rules are frozen before transport and cannot be silently replaced on scope or recipe drift', t => {
  const f = fixture(t), file = path.join(f.root, 'rules.json');
  const rules = currentVerificationRules(f.repo, null, 'buildr', LOCAL_PLATFORM_POLICY);
  assert.deepEqual(retainVerificationRules(file, rules), rules);
  assert.deepEqual(retainVerificationRules(file, rules), rules);
  const changed = freezeVerificationRules({ ...rules, kind: 'buildr', recipeIdentity: `sha256-${'b'.repeat(64)}` });
  assert.throws(() => retainVerificationRules(file, changed), /changed/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), rules);
});

test('preflight adopts existing proof through plan/aggregate then the formal consumer; stale success cannot hide a later failure', t => {
  const f = fixture(t), directory = path.join(f.root, 'preflight'), commands: string[] = [];
  const rules = currentVerificationRules(f.repo, null, 'buildr', LOCAL_PLATFORM_POLICY);
  const handoff = createPackageHandoff({ output: path.join(f.root, 'preflight-handoff'), sourceCommit: f.sourceCommit,
    sourceTree: f.sourceTree, platform: 'darwin', artifactSha256: hash(f.data), files: f.files,
    platformPolicy: LOCAL_PLATFORM_POLICY, verificationRules: rules });
  const artifact = { sourceCommit: f.sourceCommit, filename: 'package.tgz', size: f.data.length,
    sha256: hash(f.data), integrity: 'sha512-YQ==', applicationPayloadDigest: `sha256-${'e'.repeat(64)}` };
  const platformVerification = localPackageCoverage(handoff, [], []).platformVerification;
  const aggregate = { status: 'passed', executionModel: LOCAL_PACKAGE_MODEL, sourceCommit: f.sourceCommit,
    sourceTree: f.sourceTree, artifact, registryIdentity: rules.recipeIdentity, packageHandoff: handoff, platformVerification,
    evidenceIds: [...new Set(RELEASE_CHECKS.flatMap(check => 'evidence' in check ? [...check.evidence] : []))]
      .filter(id => !platformVerification.optionalEvidenceIds.includes(id)) };
  const options = { repo: f.repo, sourceCommit: f.sourceCommit, sourceTree: f.sourceTree, directory, handoff,
    artifactDirectory: '/explicit-original', sourcePacket: '/explicit-source', artifactPacket: '/explicit-proof' };
  let fail = false;
  const dependencies = {
    inspectArtifact: () => ({ artifact: { manifest: artifact } }),
    execute(_node: string, args: string[], settings: any) {
      assert.equal(path.basename(args[0]), 'candidate-ci.ts');
      assert.equal(Object.keys(settings.env).some(key => key.startsWith('GITHUB_')), false);
      assert.equal(settings.env.BUILDR_SOURCE_VERIFICATION_FILE, options.sourcePacket);
      if (args[0].startsWith('/explicit-verifier/')) {
        assert.equal(settings.env.BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT, path.join(f.repo, 'projects/product/services/buildr'));
        assert.equal(settings.env.BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE, 'b'.repeat(40));
      }
      commands.push(args[1]);
      if (args[1] === 'aggregate') fs.writeFileSync(settings.env.BUILDR_CANDIDATE_CI_AGGREGATE_OUTPUT,
        JSON.stringify({ ...aggregate, status: fail ? 'failed' : 'passed' }));
      return { status: 0, stdout: '', stderr: '' };
    },
  };
  assert.equal(preflightLocalConsumption(options, dependencies).status, 'passed');
  fail = true;
  assert.throws(() => preflightLocalConsumption(options, dependencies), /passed Candidate/);
  assert.deepEqual(commands, ['plan', 'aggregate', 'plan', 'aggregate'], 'no source/artifact tests, packer or publisher was invoked');
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'local-consumption-preflight.json'), 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(fs.readdirSync(directory).filter(name => name.startsWith('attempt-')).length, 2);
  fail = false;
  const bound = preflightLocalConsumption({ ...options, verifierRepo: '/explicit-verifier', verificationSource: 'b'.repeat(40) }, dependencies);
  assert.equal(bound.status, 'passed');
  assert.equal(bound.verificationSource, 'b'.repeat(40));
  assert.throws(() => preflightLocalConsumption({ ...options, verifierRepo: '/explicit-verifier' }, dependencies), /both verifier/);
});

test('production executes the frozen checkout builder and an interrupted verification never repacks', async t => {
  const f = fixture(t);
  const service = path.join(f.repo, 'projects/product/services/buildr');
  const output = path.join(service, 'build/verification/candidates', f.sourceCommit, 'candidate-package');
  const manifest = path.join(output, 'release-artifact.json');
  const commands: string[] = [], receipts: any[] = [];
  let restorationFails = false;
  const artifact = { manifest: { sourceCommit: f.sourceCommit, sha256: 'a'.repeat(64) }, manifestPath: manifest };
  const dependencies = {
    prepareSource: async () => ({ status: 'ready', transport: 'not-consumed-by-this-failure-path' }),
    assertCheckout() {}, readArtifact: () => artifact,
    onArtifactProduced: (value: any) => receipts.push(value),
    execute: (_node: string, args: string[]) => {
      commands.push(args[0]);
      if (args[0].endsWith('local-package-build.ts')) {
        fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(manifest, JSON.stringify(artifact.manifest));
      }
      if (args[0].endsWith('candidate-environment.ts')) {
        assert.deepEqual(args.slice(1), ['prepare', '--profile', 'base']);
        if (restorationFails) return { status: 1 };
      }
      return { status: args[0].endsWith('artifact.ts') ? 1 : 0 };
    },
  };
  const options = { repo: f.repo, workspace: f.repo, roundId: 'fixture', sourceCommit: f.sourceCommit, sourceTree: f.sourceTree, platform: 'darwin' as const };
  assert.equal((await prepareLocalMainPackage(options, dependencies)).status, 'local-artifact-verification-required');
  assert.equal((await prepareLocalMainPackage({ ...options, previous: receipts[0] }, dependencies)).status, 'local-artifact-verification-required');
  assert.equal(commands.filter(file => file.endsWith('local-package-build.ts')).length, 1);
  const artifactRuns = commands.map((file, index) => file.endsWith('artifact.ts') ? index : -1).filter(index => index >= 0);
  assert.equal(artifactRuns.length, 2);
  for (const index of artifactRuns) assert.ok(commands[index + 1]?.endsWith('candidate-environment.ts'),
    'even failed artifact checks must restore the source dependency environment before returning');
  assert.ok(commands.includes(path.join(f.repo, 'skills/buildr-release/scripts/local-package-build.ts')));
  assert.equal(receipts[0].artifactSha256, artifact.manifest.sha256);
  assert.equal(f.git('status', '--porcelain').includes('source.txt'), false);
  restorationFails = true;
  const deferred = await prepareLocalMainPackage({ ...options, previous: receipts[0] }, dependencies);
  assert.equal(deferred.status, 'local-source-environment-required');
  assert.equal(deferred.localArtifact.artifact.sha256, artifact.manifest.sha256);
  assert.equal(commands.filter(file => file.endsWith('local-package-build.ts')).length, 1);
});
