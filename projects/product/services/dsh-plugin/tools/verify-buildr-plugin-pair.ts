/** Consume both original archives; this is an entry test, not desktop activation. */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash, inspectSmokeScope, OFFICIAL_REGISTRY, packageArchiveFiles, prepareBuildrPeer, readArtifactInput, resolvePeerNpm, smokePeerEnvironment, type PreparedBuildrPeer } from './buildr-peer.ts';
import { artifactFromTarball } from '../../buildr/tools/release/package-artifact-observation.ts';
import { parseCompatibilityArtifact, parseLegacyPairEvidence, sameArtifactIdentity, type ArtifactContractProof, type ArtifactIdentity, type CompatibilityArtifact, type LegacyPairEvidence } from '../../buildr/tools/release/package-compatibility.ts';

const service = path.resolve(import.meta.dirname, '..');
const runner = path.resolve(service, '../buildr/tools/development/run-isolated-workspace-smoke.ts');
const thisFile = fileURLToPath(import.meta.url);
type ArtifactInput = { artifact: CompatibilityArtifact; tarball: string };
export const identity = (a: CompatibilityArtifact): ArtifactIdentity => ({ packageName: a.packageName, version: a.version, integrity: a.integrity, artifactSha256: a.artifactSha256 });
export interface PairReport { schemaVersion: 'buildr.dsh-package-pair-verification/v1'; status: 'passed' | 'blocked'; consumer: ArtifactIdentity; provider: ArtifactIdentity; features: LegacyPairEvidence['features']; contracts: string[]; diagnostic: string | null; evidenceSha256: string; legacyPairEvidence: LegacyPairEvidence; providerContracts?: ArtifactContractProof }
/** Public status calls label their own active npm origin current; registry-selected origins use installed. */
export function publicPairIdentity(status:any,artifact:CompatibilityArtifact) {
  const installation=status?.channels?.npm,instance=status?.instances?.released;
  if(status?.schemaVersion!=='buildr.installation-status/v1' || !['installed','current'].includes(installation?.status) || installation.identity?.package!==artifact.packageName || installation.identity?.version!==artifact.version || installation.identity?.channel!=='npm' || instance?.status!=='ready')throw new Error('installed-artifact-identity-unproved');
  if(installation.identity.protocolIdentity!=='buildr.web-protocol/v1' || typeof installation.identity.ownershipIdentity!=='string' || !installation.identity.ownershipIdentity || instance.identity?.ownershipIdentity!==installation.identity.ownershipIdentity)throw new Error('public-instance-identity-unproved');
  const url=new URL(instance.identity.url);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw new Error('invalid-loopback-instance');
  return {installation,instance,url};
}
export function assertPairReport(value: unknown, consumer: CompatibilityArtifact, provider: CompatibilityArtifact): PairReport {
  const report = value as PairReport, proof = parseLegacyPairEvidence(report?.legacyPairEvidence);
  if (report.schemaVersion !== 'buildr.dsh-package-pair-verification/v1' || !sameArtifactIdentity(proof.consumer, consumer) || !sameArtifactIdentity(proof.provider, provider) || !isDeepStrictEqual(report.consumer, proof.consumer) || !isDeepStrictEqual(report.provider, proof.provider) || !isDeepStrictEqual(report.features, proof.features)) throw new Error('Package pair evidence identity mismatch');
  if (!Array.isArray(report.contracts) || report.contracts.some(contract => !['buildr.installation-status/v1','buildr.web-protocol/v1','buildr.agent-asset-source-observations/v1','buildr.agent-asset-source-result/v1'].includes(contract)) || report.diagnostic !== null && (typeof report.diagnostic !== 'string' || !/^[a-z-]+$/.test(report.diagnostic))) throw new Error('Package pair evidence contract invalid');
  const digest = hash(Buffer.from(JSON.stringify({ consumer: report.consumer, provider: report.provider, features: report.features, contracts: report.contracts, diagnostic: report.diagnostic })));
  const blocked = report.features.some(f => f.status === 'failed' || f.status === 'unknown' || f.required && f.status !== 'passed');
  if (digest !== report.evidenceSha256 || digest !== proof.evidenceSha256 || report.status !== (blocked ? 'blocked' : 'passed')) throw new Error('Package pair evidence result mismatch');
  if (report.providerContracts) {
    const verified = parseCompatibilityArtifact({ ...provider, verifiedContracts: report.providerContracts });
    if (report.providerContracts.evidenceSha256 !== digest || !isDeepStrictEqual(verified.verifiedContracts?.contracts, [...report.contracts].sort())) throw new Error('Package contract proof differs from pair evidence');
  }
  return report;
}
function unavailableReport(consumerArtifact: CompatibilityArtifact, providerArtifact: CompatibilityArtifact): PairReport {
  const consumer = identity(consumerArtifact), provider = identity(providerArtifact), features: LegacyPairEvidence['features'] = [{ feature:'entry', required:true, status:'unknown' }], contracts: string[] = [], diagnostic = 'pair-runtime-unavailable';
  const evidenceSha256 = hash(Buffer.from(JSON.stringify({ consumer, provider, features, contracts, diagnostic })));
  return {schemaVersion:'buildr.dsh-package-pair-verification/v1',status:'blocked',consumer,provider,features,contracts,diagnostic,evidenceSha256,legacyPairEvidence:{schemaVersion:'buildr.package-pair-evidence/v1',consumer,provider,features,evidenceSha256}};
}
export function verifyBuildrPluginPair(options: { consumer: ArtifactInput; provider: ArtifactInput; sourceSdk?: string; nodeExecutable?: string; npmCli?: string }): PairReport {
  const node = realpathSync(options.nodeExecutable ?? process.execPath), stage = realpathSync(mkdtempSync(path.join(tmpdir(), 'buildr-pair-input-')));
  try {
    const input = path.join(stage, 'input.json');
    writeFileSync(input, JSON.stringify({ ...options, nodeExecutable: node }));
    for (const [name, value] of [['consumer', options.consumer], ['provider', options.provider]] as const) { const filename=path.join(stage,`${name}.json`); writeFileSync(filename,JSON.stringify({schemaVersion:'buildr.package-artifact-input/v1',...value})); readArtifactInput(filename); }
    const env = smokePeerEnvironment({ root: stage, workspace: path.join(stage, 'workspace'), appData: path.join(stage, 'app'), productData: path.join(stage, 'product') }, node);
    const result = spawnSync(node, [runner, '--script', thisFile, '--', '--pair-input', input], { cwd: service, env, shell: false, encoding: 'utf8', timeout: 180_000, maxBuffer: 2 * 1024 * 1024 });
    const rows = String(result.stdout ?? '').split(/\r?\n/).filter(line => line.startsWith('{')).map(line => { try { return JSON.parse(line); } catch { return null; } });
    const reports = rows.filter(row => row?.schemaVersion === 'buildr.dsh-package-pair-verification/v1'), execution = rows.find(row => row?.schemaVersion === 'buildr.workspace-smoke-run/v1');
    if (reports.length !== 1 || result.error || result.status !== 0 || execution?.status !== 'passed' || execution?.cleanup !== 'cleaned') return unavailableReport(options.consumer.artifact,options.provider.artifact);
    return assertPairReport(reports[0], options.consumer.artifact, options.provider.artifact);
  } finally { if (realpathSync(stage) !== stage) throw new Error('Pair input ownership changed'); rmSync(stage, { recursive: true, force: true }); }
}
function missingCommand(result: ReturnType<typeof spawnSync>): boolean {
  if (result.status === 0 || result.error) return false;
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  // Only an explicit unsupported command proves absence. Crashes/timeouts are failures.
  return /unknown[_ -]command|unsupported[_ -]command|unrecognized command|无法识别.*命令|未知命令|不支持.*命令/iu.test(text);
}
async function consumePair(input: { consumer: ArtifactInput; provider: ArtifactInput; nodeExecutable: string; npmCli?: string }): Promise<PairReport> {
  const scope = inspectSmokeScope(process.env), node = input.nodeExecutable;
  const providerInput = path.join(scope.root, 'provider.json'), consumerInput = path.join(scope.root, 'consumer.json');
  for (const [filename, value] of [[providerInput, input.provider], [consumerInput, input.consumer]] as const) writeFileSync(filename, JSON.stringify({ schemaVersion: 'buildr.package-artifact-input/v1', ...value }));
  const frozenConsumer = readArtifactInput(consumerInput);
  if (frozenConsumer.artifact.packageName !== '@buildr-ai/buildr-dsh-plugin') throw new Error('Pair consumer must be the released plugin archive');
  const peer = prepareBuildrPeer({ artifactManifest: providerInput, nodeExecutable: node, npmCli: input.npmCli, ownedRoot: scope.root });
  const environment = smokePeerEnvironment(scope, node);
  // The actual plugin adapter removes these selectors. Use the same owned HOME defaults everywhere.
  delete environment.BUILDR_APP_DATA_DIR; delete environment.BUILDR_PRODUCT_DATA_DIR;
  mkdirSync(scope.workspace, { recursive: true });
  const cli = (args: string[], stdin?: string) => spawnSync(node, [peer.cliEntry, ...args], { cwd: scope.workspace, env: environment, input: stdin, shell: false, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  const features: LegacyPairEvidence['features'] = [{ feature: 'entry', required: true, status: 'unknown' }];
  const contracts: string[] = []; let diagnostic: string | null = null;
  let web: ReturnType<typeof spawn> | undefined, ctx: any;
  try {
    const npm = resolvePeerNpm(node, input.npmCli), prefix = path.join(scope.root, 'plugin-prefix');
    const install = spawnSync(node, [npm, 'install', '--global', '--prefix', prefix, '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--registry', OFFICIAL_REGISTRY, frozenConsumer.tarball], { cwd: scope.root, env: environment, shell: false, encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    if (install.error || install.status !== 0) throw new Error('plugin-dependencies-unavailable');
    const pluginRoot = path.join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', '@buildr-ai', 'buildr-dsh-plugin');
    for (const [name, bytes] of frozenConsumer.files) if (hash(readFileSync(path.join(pluginRoot, name.slice(8)))) !== hash(bytes)) throw new Error('installed-plugin-byte-drift');
    const main = frozenConsumer.metadata.main;
    if (typeof main !== 'string' || path.isAbsolute(main) || path.relative(pluginRoot, path.resolve(pluginRoot, main)).startsWith('..') || !frozenConsumer.files.has(`package/${main.replace(/^\.\//, '')}`)) throw new Error('plugin-host-entry-unavailable');
    // Enrollment is explicit and confined to this smoke scope; npm scripts remain disabled.
    const enrolled = spawnSync(node, [peer.cliEntry, '__internal', 'enroll-npm-installation'], { cwd: scope.workspace, env: { ...environment, BUILDR_INTERNAL_PRODUCT_REENTRY: '1' }, shell: false, encoding: 'utf8', timeout: 30_000 });
    // Legacy packages may identify their npm origin directly without the enrollment command.
    const initial = cli(['installation', 'status', '--json']);
    if (initial.error || initial.status !== 0) throw new Error('public-installation-status-unavailable');
    web = spawn(node, [peer.cliEntry, 'web', '--no-open', '--port', '0'], { cwd: scope.workspace, env: environment, stdio: ['ignore', 'ignore', 'ignore'] });
    let status: any;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const response = cli(['installation', 'status', '--json']);
      if (response.status === 0) { try { status = JSON.parse(String(response.stdout)); } catch {} }
      if (status?.instances?.released?.status === 'ready') break;
      if (web.exitCode !== null) throw new Error('owned-web-exited');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const {installation,url}=publicPairIdentity(status,peer.artifact);
    const req = createRequire(path.join(pluginRoot, 'package.json')), { Context } = req('@deepseek-ai/cordis');
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, environment);
    try {
      const host = await import(pathToFileURL(path.resolve(pluginRoot, main)).href);
      if (typeof host.default !== 'function') throw new Error('actual-plugin-host-unavailable');
      ctx = new Context(); const gateway = new host.default(ctx, { binding: { nodeExecutable: node, cliEntry: peer.cliEntry }, timeoutMs: 10_000 });
      const opened = await gateway.open();
      if (opened?.ready !== true || opened.channel !== 'released' || opened.ownershipIdentity !== installation.identity.ownershipIdentity || opened.url !== url.origin) throw new Error('actual-plugin-open-failed');
      features[0].status = 'passed'; contracts.push('buildr.installation-status/v1', 'buildr.web-protocol/v1');
      if (typeof gateway.sourceRecord !== 'function') features.push({ feature: 'sourceCapture', required: false, status: 'unsupported' });
      else {
        const setup = cli(['init', '--source-only', '--target', scope.workspace, '--name', 'pair-source', '--description', 'isolated pair proof', '--profile', 'personal']);
        writeFileSync(path.join(scope.workspace, 'ordinary.txt'), 'PRIVATE_PAIR_BODY');
        const observations = { schemaVersion: 'buildr.agent-asset-source-observations/v1', observations: [{ id: 'ordinary', type: 'file', locator: { path: path.join(scope.workspace, 'ordinary.txt') } }] };
        const source = cli(['agent-assets', 'source', 'inspect', '--target', scope.workspace, '--input', '-', '--json'], JSON.stringify(observations));
        if (!peer.sourceCapture && missingCommand(source)) features.push({ feature: 'sourceCapture', required: false, status: 'unsupported' });
        else {
          let result: any; try { result = JSON.parse(String(source.stdout)); } catch {}
          const passed = setup.status === 0 && source.status === 0 && result?.schemaVersion === 'buildr.agent-asset-source-result/v1' && Array.isArray(result.effects) && result.effects.length === 0 && !JSON.stringify(result).includes('PRIVATE_PAIR_BODY');
          features.push({ feature: 'sourceCapture', required: false, status: passed ? 'passed' : 'failed' });
          if (passed) contracts.push('buildr.agent-asset-source-observations/v1', 'buildr.agent-asset-source-result/v1');
        }
      }
    } finally { /* This owned child exits after the report; no caller environment is restored. */ }
  } catch (error) { diagnostic = error instanceof Error && /^[a-z-]+$/.test(error.message) ? error.message : 'package-consumption-error'; if (features[0].status !== 'passed') features[0].status = 'failed'; }
  finally {
    if (ctx?.fiber) await ctx.fiber.dispose();
    if (web && web.exitCode === null) { web.kill('SIGTERM'); await Promise.race([new Promise(resolve => web!.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]); if (web.exitCode === null) { web.kill('SIGKILL'); await new Promise(resolve => web!.once('close', resolve)); } }
  }
  const consumer = identity(frozenConsumer.artifact), provider = identity(peer.artifact);
  const evidence = { consumer, provider, features, contracts, diagnostic }, evidenceSha256 = hash(Buffer.from(JSON.stringify(evidence)));
  const legacyPairEvidence: LegacyPairEvidence = { schemaVersion: 'buildr.package-pair-evidence/v1', consumer, provider, features, evidenceSha256 };
  return { schemaVersion: 'buildr.dsh-package-pair-verification/v1', status: features.some(f => f.status === 'failed' || f.status === 'unknown' || f.required && f.status !== 'passed') ? 'blocked' : 'passed', ...evidence, evidenceSha256, legacyPairEvidence,
    ...(peer.artifact.origin === 'registry' && peer.artifact.compatibility === null && features[0].status === 'passed' ? { providerContracts: { schemaVersion: 'buildr.package-contract-proof/v1', ...provider, contracts, evidenceSha256 } as ArtifactContractProof } : {}) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile && process.argv[2] === '--pair-input') {
  try { const input = JSON.parse(readFileSync(process.argv[3], 'utf8')); console.log(JSON.stringify(await consumePair(input))); }
  catch { process.stderr.write('Package pair preparation failed in its isolated scope.\n'); process.exitCode = 1; }
}
