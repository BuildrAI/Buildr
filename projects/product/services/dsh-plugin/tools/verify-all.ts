/** Complete plugin source, package and DSH loader verification against an explicit prepared source SDK. */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newBuildOutput, ownedBuildRoot, validatePreparedSourceSdk } from './prepare-source-sdk.ts';
import { hash, packageArchiveFiles, prepareBuildrPeer, readArtifactInput, readPreparedBuildrPeer, resolvePeerNpm, smokePeerEnvironment } from './buildr-peer.ts';
import { artifactFromTarball } from '../../../../../skills/buildr-release/scripts/package-artifact-observation.ts';
import { verifyBuildrPluginPair } from './verify-buildr-plugin-pair.ts';
import { captureVerificationSource, gitTreeSourceIdentity } from './verification-source.ts';
import { createReleaseCandidate, readReleaseCandidate, sourceSdkIdentityFromFiles, SOURCE_SDK_MANIFEST, type SourceSdkIdentity } from '../../../../../skills/buildr-release/scripts/dsh-plugin/release-candidate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function parseVerificationInputs(args: string[], env: NodeJS.ProcessEnv = process.env): {sourceSdk:string;peerInput?:string;peerManifest?:string;output?:string;npmCli?:string;candidateOutput?:string} {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source-sdk', '--buildr-peer', '--buildr-peer-manifest', '--output', '--npm', '--candidate-output'].includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args[i + 1].includes('\0')) throw new Error('Usage: verify-all.ts --source-sdk <sdk> --buildr-peer <artifact-input> --output <aggregate> [--candidate-output <directory>]');
    values.set(args[i], args[i + 1]);
  }
  const sdk = values.get('--source-sdk') ?? env.BUILDR_DSH_SOURCE_SDK_ROOT;
  const raw = values.get('--buildr-peer') ?? (values.has('--buildr-peer-manifest') ? undefined : env.BUILDR_DSH_BUILDR_PEER_INPUT);
  const prepared = values.get('--buildr-peer-manifest') ?? (values.has('--buildr-peer') ? undefined : env.BUILDR_DSH_BUILDR_PEER_MANIFEST);
  if (!sdk || !raw && !prepared || raw && prepared) throw new Error('增强插件完整验证需要明确的候选软件开发工具包（SDK）和唯一 Buildr 对端清单；请提供 --source-sdk，以及 --buildr-peer 或 --buildr-peer-manifest。');
  return { sourceSdk: resolve(sdk), ...(raw ? { peerInput: resolve(raw) } : { peerManifest: resolve(prepared!) }), output: values.get('--output') ? resolve(values.get('--output')!) : undefined, npmCli: values.get('--npm'), ...(values.has('--candidate-output') ? { candidateOutput: resolve(values.get('--candidate-output')!) } : {}) };
}
export const archiveTreeIdentity = (bytes: Buffer) => hash(Buffer.from(JSON.stringify([...packageArchiveFiles(bytes)].map(([name, data]) => [name, hash(data)]).sort((a, b) => a[0].localeCompare(b[0])))));
export const PLUGIN_SOURCE_PHASE_IDS = ['dsh-plugin:unit', 'dsh-plugin:integration'] as const;
export const PLUGIN_PEER_PHASE_FILES = ['test/integration/source-business-gateway.test.ts'] as const;
export function pluginSourcePhaseFiles(group: 'unit' | 'integration', pluginRoot = root): string[] {
  return readdirSync(join(pluginRoot, 'test', group)).filter(name => name.endsWith('.test.ts')).sort()
    .map(name => `test/${group}/${name}`).filter(file => !(PLUGIN_PEER_PHASE_FILES as readonly string[]).includes(file));
}
export function pluginSourcePhaseStep(group: 'unit' | 'integration', files: string[]) {
  return { id: `dsh-plugin:${group}`, executor: { type: 'node-test', files: [...files].sort() }, reuse: { scope: 'plugin' as const, git: false, ...(group === 'integration' ? { tools: ['sdk'] } : {}) } };
}
export function pluginSourceSdkKey(pluginRoot = root): string {
  const identity = sourceSdkIdentityFromFiles(readFileSync(join(pluginRoot, SOURCE_SDK_MANIFEST)),
    readFileSync(join(pluginRoot, 'sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch')));
  return hash(Buffer.from(JSON.stringify(identity)));
}
/** A passed child remains a fact even when its proof can no longer authorize a candidate. */
export async function assertPluginSourcePhaseProof(input: { productRoot: string; step: any; store: any; record: any; snapshot: any; current: any; phase: any; fresh?: boolean }) {
  const { createVerificationReuseIdentity, validateVerificationReuseRecord } = await import(new URL('../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
  const before = createVerificationReuseIdentity(input.step, input.snapshot), after = createVerificationReuseIdentity(input.step, input.current);
  const code = !before || !after || before.key !== after.key ? 'source-input-drift'
    : !input.record || !validateVerificationReuseRecord(input.record, { productRoot: input.productRoot, snapshot: input.current, step: input.step })
      || !(input.fresh === true ? input.store.isCurrentFresh(input.record) : input.store.isCurrent(input.record))
      ? 'verification-proof-invalidated' : null;
  if (!code) return;
  if (code === 'source-input-drift' && (input.record?.identity ?? before)) input.store.invalidate(input.record?.identity ?? before);
  input.phase.proof = { status: 'invalidated', code };
  throw Object.assign(new Error(`${input.step.id}: ${code}; the original child result is unchanged.`), { code, sourcePhase: input.phase });
}
export async function collectPluginSourceVerificationBundle(options: { env?: NodeJS.ProcessEnv; pluginRoot?: string; repo?: string; imports?: { schemaVersion: string; records: any[] } } = {}) {
  const pluginRoot = options.pluginRoot ?? (options.repo ? resolve(options.repo, 'projects/product/services/dsh-plugin') : root);
  const steps = (['unit', 'integration'] as const).map(group => pluginSourcePhaseStep(group, pluginSourcePhaseFiles(group, pluginRoot)));
  const { createVerificationReuseStore, collectVerificationReuseSnapshot, validateVerificationReuseRecord, VERIFICATION_REUSE_BUNDLE_SCHEMA } = await import(new URL('../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
  const productRoot = resolve(pluginRoot, '../buildr');
  const snapshot = collectVerificationReuseSnapshot({ productRoot, env: options.env });
  snapshot.environment.tools.sdk = pluginSourceSdkKey(pluginRoot);
  if (options.imports && (options.imports.schemaVersion !== VERIFICATION_REUSE_BUNDLE_SCHEMA || !Array.isArray(options.imports.records) || options.imports.records.length > 512)) throw new Error('Plugin source verification bundle is invalid.');
  const imports = { schemaVersion: VERIFICATION_REUSE_BUNDLE_SCHEMA, records: (options.imports?.records ?? []).filter(record => {
    const step = steps.find(item => item.id === record?.identity?.stepId);
    return step && (step.id !== 'dsh-plugin:integration' || record.environment?.tools?.sdk === snapshot.environment.tools.sdk)
      && validateVerificationReuseRecord(record, { productRoot, snapshot, step });
  }) };
  const store = createVerificationReuseStore({ productRoot, snapshot, steps, env: options.env, imports: [imports], portableImports: true });
  return { schemaVersion: VERIFICATION_REUSE_BUNDLE_SCHEMA, records: steps.map(step => store.lookup(step)).filter(Boolean) };
}
/** Transport the archive already consumed by the pair check, never run a second pack. */
export function writeVerifiedPluginCandidate(input: { output: string; tarball: string; version: string; sourceCommit: string; sourceTree: string;
  sourceSdk: SourceSdkIdentity; fileCount: number; pluginRoot?: string }) {
  const output = newBuildOutput(input.pluginRoot ?? root, input.output); mkdirSync(dirname(output), { recursive: true });
  const stage = mkdtempSync(join(dirname(output), '.candidate-')), filename = input.tarball.split(/[\\/]/u).at(-1)!;
  const candidate = createReleaseCandidate({ ...input, filename, bytes: readFileSync(input.tarball) });
  copyFileSync(input.tarball, join(stage, candidate.filename)); writeFileSync(join(stage, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  readReleaseCandidate(join(stage, 'candidate.json'), { version: input.version, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, sourceSdk: input.sourceSdk });
  renameSync(stage, output);
  return candidate;
}
export async function verifyAll(args = process.argv.slice(2)) {
const request = parseVerificationInputs(args), sdk = request.sourceSdk, sdkReceipt = validatePreparedSourceSdk(sdk, root);
const { collectVerificationReuseSnapshot, createVerificationReuseStore } = await import(new URL('../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
const { candidateSourceImportFromEnvironment } = await import(new URL('../../buildr/test/verification/candidate-source-reuse.ts', import.meta.url).href);
const { runVerificationStep } = await import(new URL('../../buildr/test/verification/timing/parallel-runner.ts', import.meta.url).href);
const verificationSource = captureVerificationSource(root);
const bundles = mkdtempSync(join(ownedBuildRoot(root), 'dsh-plugin-full-'));
const peer = request.peerInput ? prepareBuildrPeer({ artifactManifest: request.peerInput, npmCli: request.npmCli, ownedRoot: bundles }) : readPreparedBuildrPeer(request.peerManifest!);
const raw = request.peerInput ?? join(bundles, 'peer-input.json');
if (!request.peerInput) writeFileSync(raw, JSON.stringify({ schemaVersion: 'buildr.package-artifact-input/v1', artifact: peer.artifact, tarball: join(peer.root, 'artifact.tgz') }));
const environment = { ...process.env, BUILDR_DSH_SDK_ROOT: sdk, BUILDR_DSH_SOURCE_SDK_ROOT: sdk, BUILDR_DSH_BUNDLE_ROOT: bundles,
  BUILDR_DSH_SOURCE_UI_SDK_ROOT: sdk, BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT: join(bundles, 'dsh-plugin'), BUILDR_DSH_BUILDR_PEER_MANIFEST: peer.manifestPath,
  BUILDR_DSH_COMPOSITION_ROOT: join(bundles, 'composition'), BUILDR_DSH_COMPOSITION_DEV_ROOT: join(bundles, 'composition-dev') };
const run = (script: string, ...parameters: string[]): void => {
  execFileSync(process.execPath, [join(root, script), ...parameters], { cwd: root, stdio: 'inherit', env: environment, shell: false });
};
run('tools/build-plugin.ts', '--source-sdk', sdk, '--output', join(bundles, 'dsh-plugin'));
run('tools/build-plugin.ts', '--dev', '--source-sdk', sdk, '--output', join(bundles, 'dsh-plugin-dev'));
run('tools/build-composition.ts', '--source-sdk', sdk, '--entry', join(bundles, 'dsh-plugin'), '--output', join(bundles, 'composition'));
run('tools/build-composition.ts', '--source-sdk', sdk, '--entry', join(bundles, 'dsh-plugin-dev'), '--output', join(bundles, 'composition-dev'));
const sourcePhases: any[] = [];
const sourceProofs: any[] = [];
const imported = candidateSourceImportFromEnvironment(process.env);
for (const group of ['unit', 'integration'] as const) {
  const files = pluginSourcePhaseFiles(group);
  const step = pluginSourcePhaseStep(group, files);
  const snapshot = collectVerificationReuseSnapshot({ productRoot: resolve(root, '../buildr') });
  if (group === 'integration') snapshot.environment.tools = { ...snapshot.environment.tools, sdk: pluginSourceSdkKey() };
  const matchingImports = { ...imported, records: imported.records.filter((record: any) => group === 'unit' || record.environment?.tools?.sdk === snapshot.environment.tools.sdk) };
  const store = createVerificationReuseStore({ productRoot: resolve(root, '../buildr'), snapshot, steps: [step], imports: [matchingImports], portableImports: true });
  const reused = process.env.BUILDR_VERIFICATION_FORCE === '1' ? null : store.lookup(step);
  if (reused) {
    const phase = { ...reused.result, durationMs: 0, disposition: 'reused', reusedFrom: { key: reused.identity.key, origin: reused.origin, environment: reused.environment, durationMs: reused.result.durationMs } };
    sourcePhases.push(phase); sourceProofs.push({ productRoot: resolve(root, '../buildr'), step, store, record: reused, snapshot, phase });
    console.error(`[dsh-source-phase] ${group} reused`); continue;
  }
  console.error(`[dsh-source-phase] ${group} started`);
  const startedAt = new Date().toISOString();
  const result = await runVerificationStep({ name: step.id, command: process.execPath, args: ['--test', ...files], cwd: root, env: environment });
  if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr);
  store.stage(step, result, { kind: process.env.GITHUB_RUN_ID ? 'ci' : 'local', runId: process.env.GITHUB_RUN_ID ?? `dsh-${process.pid}-${Date.now()}`, sourceCommit: snapshot.sourceCommit, startedAt, finishedAt: new Date().toISOString() });
  const after = collectVerificationReuseSnapshot({ productRoot: resolve(root, '../buildr') });
  if (group === 'integration') Object.assign(after.environment.tools, { sdk: pluginSourceSdkKey() });
  const committed = store.commit(after, result.processCleanup?.status === 'clean');
  const phase = { id: step.id, status: result.status, exitCode: result.exitCode, childOutcome: result.childOutcome, childExitCode: result.childExitCode, childSignal: result.childSignal,
    disposition: 'executed', durationMs: result.durationMs, startedAt, finishedAt: new Date().toISOString(), environment: snapshot.environment };
  sourcePhases.push(phase);
  if (result.status !== 'passed') throw new Error(`Plugin ${group} verification failed (${result.exitCode}).`);
  const proof = { productRoot: resolve(root, '../buildr'), step, store, record: committed.records.find((record: any) => record.identity.stepId === step.id), snapshot, phase, fresh: true };
  await assertPluginSourcePhaseProof({ ...proof, current: after }); sourceProofs.push(proof);
}
console.error('[dsh-source-phase] peer-gateway started');
execFileSync(process.execPath, ['--test', ...PLUGIN_PEER_PHASE_FILES], { cwd: root, stdio: 'inherit', env: environment, shell: false });
sourcePhases.push({ id: 'dsh-plugin:peer-gateway', status: 'passed', disposition: 'executed' });
run('test/integration/run-source-ui.ts');
run('tools/verify-package.ts', '--source-sdk', sdk, '--bundle', join(bundles, 'composition'));
run('tools/verify-package.ts', '--dev', '--source-sdk', sdk, '--bundle', join(bundles, 'composition-dev'));
const packEnvironment = smokePeerEnvironment({ root: bundles, workspace: join(bundles, 'pack-workspace'), appData: join(bundles, 'pack-app'), productData: join(bundles, 'pack-product') }, process.execPath);
const packed = spawnSync(process.execPath, [resolvePeerNpm(process.execPath, request.npmCli), 'pack', join(bundles, 'composition'), '--json', '--ignore-scripts', '--pack-destination', bundles], { cwd: root, env: packEnvironment, shell: false, encoding: 'utf8', timeout: 30_000 });
if (packed.error || packed.status !== 0) throw new Error('Verified bundle packing failed');
const rows = JSON.parse(String(packed.stdout)); if (!Array.isArray(rows) || rows.length !== 1 || !/^[A-Za-z0-9._-]+\.tgz$/.test(rows[0].filename)) throw new Error('Verified package inventory invalid');
const tarball = join(bundles, rows[0].filename), bytes = readFileSync(tarball), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const metadata = JSON.parse(packageArchiveFiles(bytes).get('package/package.json')!.toString());
const sourceTree = execFileSync('git', ['rev-parse', `${sourceCommit}:projects/product/services/dsh-plugin`], { cwd: root, encoding: 'utf8' }).trim();
const consumer = { ...artifactFromTarball(bytes, { origin: 'candidate', packageName: '@buildr-ai/buildr-dsh-plugin', version: metadata.version, integrity: rows[0].integrity, sourceCommit }), sourceTree };
const input = readArtifactInput(raw), pair = verifyBuildrPluginPair({ consumer: { artifact: consumer, tarball }, provider: { artifact: input.artifact, tarball: input.tarball }, npmCli: request.npmCli });
if (pair.status !== 'passed') throw new Error(`Real plugin peer verification blocked: ${pair.diagnostic ?? 'feature failed'}`);
const current = collectVerificationReuseSnapshot({ productRoot: resolve(root, '../buildr') });
current.environment.tools.sdk = pluginSourceSdkKey();
for (const proof of sourceProofs) await assertPluginSourcePhaseProof({ ...proof, current });
if (captureVerificationSource(root).contentSha256 !== verificationSource.contentSha256) throw new Error('验证期间插件来源内容发生变化；本次结果不能绑定其他来源。');
const sourceSdk = { baseline: sdkReceipt.baseline, manifestSha256: sdkReceipt.sourceManifest.sha256, patchSha256: sdkReceipt.patchSha256, contracts: sdkReceipt.contracts };
if (request.candidateOutput) {
  if (verificationSource.observedCommit !== sourceCommit || gitTreeSourceIdentity(sourceTree, root) !== verificationSource.contentSha256) throw new Error('Commit the verified plugin contents before producing its final Candidate.');
  if (!Array.isArray(rows[0].files)) throw new Error('Verified package inventory missing');
  const persisted = writeVerifiedPluginCandidate({ output: request.candidateOutput, tarball, version: metadata.version, sourceCommit, sourceTree, sourceSdk, fileCount: rows[0].files.length });
  if (persisted.sha256 !== hash(bytes) || persisted.integrity !== consumer.integrity) throw new Error('Candidate transport changed the tested archive bytes.');
}
const report = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', sourceCommit, verificationSource, consumer, consumerTreeSha256: archiveTreeIdentity(bytes), peer: peer.artifact, pair,
  sourceSdk, sourcePhases, ...(request.candidateOutput ? { candidateBound: true, sourceTree, sourceBinding: { method: 'git-tree-content-equivalence', testedGitHead: verificationSource.observedCommit, testedWorkingTreeDirty: verificationSource.dirty, verifiedContentSha256: verificationSource.contentSha256, candidateSourceCommit: sourceCommit, candidateSourceTree: sourceTree } } : {}),
  checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false };
if (request.output) writeFileSync(request.output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report)); return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyAll();
