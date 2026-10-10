/** Complete plugin source, package and DSH loader verification against an explicit prepared source SDK. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedBuildRoot, validatePreparedSourceSdk } from './prepare-source-sdk.ts';
import { hash, packageArchiveFiles, prepareBuildrPeer, readArtifactInput, readPreparedBuildrPeer, resolvePeerNpm, smokePeerEnvironment } from './buildr-peer.ts';
import { artifactFromTarball } from '../../buildr/tools/release/package-artifact-observation.ts';
import { verifyBuildrPluginPair } from './verify-buildr-plugin-pair.ts';
import { captureVerificationSource } from './verification-source.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function parseVerificationInputs(args: string[], env: NodeJS.ProcessEnv = process.env): {sourceSdk:string;peerInput?:string;peerManifest?:string;output?:string;npmCli?:string} {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source-sdk', '--buildr-peer', '--buildr-peer-manifest', '--output', '--npm'].includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args[i + 1].includes('\0')) throw new Error('Usage: verify-all.ts --source-sdk <sdk> --buildr-peer <artifact-input> --output <aggregate>');
    values.set(args[i], args[i + 1]);
  }
  const sdk = values.get('--source-sdk') ?? env.BUILDR_DSH_SOURCE_SDK_ROOT;
  const raw = values.get('--buildr-peer') ?? (values.has('--buildr-peer-manifest') ? undefined : env.BUILDR_DSH_BUILDR_PEER_INPUT);
  const prepared = values.get('--buildr-peer-manifest') ?? (values.has('--buildr-peer') ? undefined : env.BUILDR_DSH_BUILDR_PEER_MANIFEST);
  if (!sdk || !raw && !prepared || raw && prepared) throw new Error('增强插件完整验证需要明确的候选软件开发工具包（SDK）和唯一 Buildr 对端清单；请提供 --source-sdk，以及 --buildr-peer 或 --buildr-peer-manifest。');
  return { sourceSdk: resolve(sdk), ...(raw ? { peerInput: resolve(raw) } : { peerManifest: resolve(prepared!) }), output: values.get('--output') ? resolve(values.get('--output')!) : undefined, npmCli: values.get('--npm') };
}
export const archiveTreeIdentity = (bytes: Buffer) => hash(Buffer.from(JSON.stringify([...packageArchiveFiles(bytes)].map(([name, data]) => [name, hash(data)]).sort((a, b) => a[0].localeCompare(b[0])))));
export function verifyAll(args = process.argv.slice(2)) {
const request = parseVerificationInputs(args), sdk = request.sourceSdk, sdkReceipt = validatePreparedSourceSdk(sdk, root);
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
const testFiles = ['unit', 'integration'].flatMap(group => readdirSync(join(root, 'test', group))
  .filter(name => name.endsWith('.test.ts')).map(name => join(root, 'test', group, name)));
execFileSync(process.execPath, ['--test', ...testFiles], { cwd: root, stdio: 'inherit', env: environment, shell: false });
run('test/integration/run-source-ui.ts');
run('tools/verify-package.ts', '--source-sdk', sdk, '--bundle', join(bundles, 'composition'));
run('tools/verify-package.ts', '--dev', '--source-sdk', sdk, '--bundle', join(bundles, 'composition-dev'));
const packEnvironment = smokePeerEnvironment({ root: bundles, workspace: join(bundles, 'pack-workspace'), appData: join(bundles, 'pack-app'), productData: join(bundles, 'pack-product') }, process.execPath);
const packed = spawnSync(process.execPath, [resolvePeerNpm(process.execPath, request.npmCli), 'pack', join(bundles, 'composition'), '--json', '--ignore-scripts', '--pack-destination', bundles], { cwd: root, env: packEnvironment, shell: false, encoding: 'utf8', timeout: 30_000 });
if (packed.error || packed.status !== 0) throw new Error('Verified bundle packing failed');
const rows = JSON.parse(String(packed.stdout)); if (!Array.isArray(rows) || rows.length !== 1 || !/^[A-Za-z0-9._-]+\.tgz$/.test(rows[0].filename)) throw new Error('Verified package inventory invalid');
const tarball = join(bundles, rows[0].filename), bytes = readFileSync(tarball), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const metadata = JSON.parse(packageArchiveFiles(bytes).get('package/package.json')!.toString());
const consumer = artifactFromTarball(bytes, { origin: 'candidate', packageName: '@buildr-ai/buildr-dsh-plugin', version: metadata.version, integrity: rows[0].integrity, sourceCommit });
const input = readArtifactInput(raw), pair = verifyBuildrPluginPair({ consumer: { artifact: consumer, tarball }, provider: { artifact: input.artifact, tarball: input.tarball }, npmCli: request.npmCli });
if (pair.status !== 'passed') throw new Error(`Real plugin peer verification blocked: ${pair.diagnostic ?? 'feature failed'}`);
if (captureVerificationSource(root).contentSha256 !== verificationSource.contentSha256) throw new Error('验证期间插件来源内容发生变化；本次结果不能绑定其他来源。');
const report = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', sourceCommit, verificationSource, consumer, consumerTreeSha256: archiveTreeIdentity(bytes), peer: peer.artifact, pair,
  sourceSdk: { baseline: sdkReceipt.baseline, manifestSha256: sdkReceipt.sourceManifest.sha256, patchSha256: sdkReceipt.patchSha256, contracts: sdkReceipt.contracts },
  checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false };
if (request.output) writeFileSync(request.output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report)); return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyAll();
