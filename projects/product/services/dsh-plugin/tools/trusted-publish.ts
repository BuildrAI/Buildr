/** Publish only a transported plugin candidate from its protected GitHub-hosted identity. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { publisherNpmCli } from '../../buildr/tools/verification/candidate-environment.ts';
import { requestReleaseJson } from '../../buildr/tools/release/release-observation.ts';
import { containsCredentialMaterial } from '../../buildr/tools/release/release-authority.ts';
import { artifactFromTarball, observePublishedPackageArtifact } from '../../buildr/tools/release/package-artifact-observation.ts';
import { evaluatePackageCompatibility, type CompatibilityArtifact } from '../../buildr/tools/release/package-compatibility.ts';
import { assertBoundVerification } from './full-verification.ts';
import { assertPairReport, verifyBuildrPluginPair } from './verify-buildr-plugin-pair.ts';
import { PLUGIN_PACKAGE, PLUGIN_REGISTRY, PLUGIN_SERVICE_PATH, SOURCE_SDK_MANIFEST, readReleaseCandidate, sourceSdkIdentityFromFiles, type ReleaseCandidate, type SourceSdkIdentity } from './release-candidate.ts';

export const PLUGIN_PUBLISH_AUTHORITY = Object.freeze({ provider: 'github-actions', repository: 'BuildrAI/Buildr', workflow: 'publish-dsh-plugin.yml', environment: 'npm-production', allowedActions: ['npm publish'] });
export const PLUGIN_WORKFLOW_PATH = '.github/workflows/publish-dsh-plugin.yml';
export const PUBLICATION_SCHEMA = 'buildr.dsh-plugin-publication/v1';
const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(serviceRoot, '../../../..');
interface SourceState { sourceCommit: string; sourceTree: string; version: string; workflowSha256: string; sourceSdk: SourceSdkIdentity }
interface RegistryState { published: boolean; integrity?: string }
interface AuthorityEvidence { status: 'ready'; expected: typeof PLUGIN_PUBLISH_AUTHORITY; workflowSha256: string; npm: { package: string; tokenType: string; created: string; expires: string } }
export interface PublicationJournal {
  schemaVersion: typeof PUBLICATION_SCHEMA;
  packageName: string; version: string; sourceCommit: string; sourceTree: string; sha256: string; integrity: string;
  attempted: boolean; status: 'running' | 'passed' | 'blocked'; action: 'publishing' | 'published' | 'reused' | 'readback-required' | 'blocked';
  publishedObserved: boolean;
  registry: 'present' | 'absent' | 'unknown'; authority?: AuthorityEvidence; code?: string; observedAt: string;
  request: { runId: number; runAttempt: number; workflowRef: string };
}
export interface PublishDependencies {
  env?: NodeJS.ProcessEnv; now?: () => number; fetchImpl?: typeof fetch;
  source?: () => SourceState; authority?: (source: SourceState) => Promise<AuthorityEvidence>;
  registry?: (candidate: ReleaseCandidate) => Promise<RegistryState>;
  publish?: (tarball: string, candidate: ReleaseCandidate) => Promise<{ status: number }>;
  observePeer?: typeof observePublishedPackageArtifact; verifyPair?: typeof verifyBuildrPluginPair;
  sleep?: (milliseconds: number) => Promise<void>; registryWait?: { attempts?: number; delayMs?: number };
}
function failure(code: string): never { throw Object.assign(new Error(code), { code }); }
function required(value: unknown, code: string): string { if (typeof value !== 'string' || !value) failure(code); return value; }
export function assertPluginHostedIdentity(env: NodeJS.ProcessEnv, sourceCommit: string): void {
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.GITHUB_SERVER_URL !== 'https://github.com') failure('github-hosted-publisher-required');
  if (env.GITHUB_REPOSITORY !== PLUGIN_PUBLISH_AUTHORITY.repository || env.GITHUB_WORKFLOW_REF !== `${PLUGIN_PUBLISH_AUTHORITY.repository}/${PLUGIN_WORKFLOW_PATH}@refs/heads/main` || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') failure('plugin-publish-authority-mismatch');
  if (env.GITHUB_SHA !== sourceCommit) failure('plugin-publish-source-mismatch');
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) if (!/^[1-9]\d*$/.test(env[key] ?? '') || !Number.isSafeInteger(Number(env[key]))) failure('github-run-identity-invalid');
}
function sourceState(repo: string): SourceState {
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sourceCommit = git(['rev-parse', 'HEAD']);
  const metadata = JSON.parse(git(['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/package.json`]));
  if (metadata.name !== '@buildr-ai/buildr-dsh-plugin-source' || metadata.private !== true) failure('plugin-source-package-mismatch');
  git(['diff', '--exit-code', 'HEAD', '--', PLUGIN_SERVICE_PATH, PLUGIN_WORKFLOW_PATH]);
  const workflow = execFileSync('git', ['show', `${sourceCommit}:${PLUGIN_WORKFLOW_PATH}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (readFileSync(join(repo, PLUGIN_WORKFLOW_PATH), 'utf8') !== workflow) failure('plugin-workflow-drift');
  const committed = (path: string) => execFileSync('git', ['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/${path}`], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  const sourceSdk = sourceSdkIdentityFromFiles(committed(SOURCE_SDK_MANIFEST), committed('sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch'));
  return { sourceCommit, sourceTree: git(['rev-parse', `${sourceCommit}:${PLUGIN_SERVICE_PATH}`]), version: metadata.version, workflowSha256: createHash('sha256').update(workflow).digest('hex'), sourceSdk };
}
export function assertPluginOidcClaims(token: string, sourceCommit: string, nowMs: number): void {
  let claims: Record<string, any>;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) failure('plugin-oidc-invalid');
    claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  } catch { failure('plugin-oidc-invalid'); }
  const audience = claims.aud;
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || !(audience === 'npm:registry.npmjs.org' || Array.isArray(audience) && audience.includes('npm:registry.npmjs.org')) || claims.sub !== 'repo:BuildrAI/Buildr:environment:npm-production'
    || claims.repository !== PLUGIN_PUBLISH_AUTHORITY.repository || claims.workflow_ref !== `${PLUGIN_PUBLISH_AUTHORITY.repository}/${PLUGIN_WORKFLOW_PATH}@refs/heads/main` || claims.sha !== sourceCommit || claims.ref !== 'refs/heads/main' || claims.runner_environment !== 'github-hosted' || claims.event_name !== 'workflow_dispatch'
    || claims.environment !== undefined && claims.environment !== PLUGIN_PUBLISH_AUTHORITY.environment) failure('plugin-oidc-authority-mismatch');
  const now = nowMs / 1000;
  if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 60 || !Number.isFinite(claims.iat) || claims.iat > now + 60) failure('plugin-oidc-expired-or-not-active');
}
export async function probePluginPublishAuthority(source: SourceState, dependencies: PublishDependencies = {}): Promise<AuthorityEvidence> {
  const env = dependencies.env ?? process.env, now = dependencies.now ?? Date.now, fetchImpl = dependencies.fetchImpl ?? fetch;
  assertPluginHostedIdentity(env, source.sourceCommit);
  const url = new URL(required(env.ACTIONS_ID_TOKEN_REQUEST_URL, 'plugin-oidc-request-missing'));
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com')) failure('plugin-oidc-request-origin-invalid');
  url.searchParams.set('audience', 'npm:registry.npmjs.org');
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${required(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'plugin-oidc-request-missing')}` }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) failure('plugin-oidc-request-failed');
  const document = await response.json();
  const token = required(document?.value, 'plugin-oidc-invalid');
  assertPluginOidcClaims(token, source.sourceCommit, now());
  // npm verifies the signed JWT and this package's actual Trusted Publisher tuple.
  const exchangeResponse = await fetchImpl(`${PLUGIN_REGISTRY}-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(PLUGIN_PACKAGE)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (exchangeResponse.status !== 201) failure('plugin-npm-oidc-exchange-failed');
  const exchange = await exchangeResponse.json();
  required(exchange?.token, 'plugin-npm-oidc-exchange-invalid');
  if (exchange?.token_type !== 'oidc') failure('plugin-npm-oidc-exchange-invalid');
  const timestamp = (value: unknown): number => typeof value === 'string' ? Date.parse(value) : typeof value === 'number' && Number.isFinite(value) ? value * 1000 : Number.NaN;
  const created = timestamp(exchange.created), expires = timestamp(exchange.expires);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created || expires <= now() || created > now() + 60_000) failure('plugin-npm-oidc-exchange-expired');
  return { status: 'ready', expected: PLUGIN_PUBLISH_AUTHORITY, workflowSha256: source.workflowSha256, npm: { package: PLUGIN_PACKAGE, tokenType: 'oidc', created: new Date(created).toISOString(), expires: new Date(expires).toISOString() } };
}
export function isolatedPluginNpmEnvironment(env: NodeJS.ProcessEnv, configDirectory: string): NodeJS.ProcessEnv {
  const isolated: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) if (!/^(?:npm_config_|NPM_TOKEN$|NODE_AUTH_TOKEN$)/i.test(key)) isolated[key] = value;
  isolated.NPM_CONFIG_USERCONFIG = join(configDirectory, 'user.npmrc');
  isolated.NPM_CONFIG_GLOBALCONFIG = join(configDirectory, 'global.npmrc');
  isolated.NPM_CONFIG_CACHE = join(configDirectory, 'cache');
  return isolated;
}
async function publishIsolated(tarball: string, candidate: ReleaseCandidate, env: NodeJS.ProcessEnv, npmCli?: string): Promise<{ status: number }> {
  const cli = npmCli ?? publisherNpmCli();
  if (!isAbsolute(cli) || !lstatSync(cli).isFile()) failure('plugin-publisher-npm-missing');
  const directory = mkdtempSync(join(tmpdir(), 'buildr-dsh-npm-publish-'));
  try {
    if (!lstatSync(tarball).isFile() || realpathSync(tarball) !== tarball || lstatSync(tarball).size !== candidate.size) failure('plugin-publish-archive-drift');
    const bytes = readFileSync(tarball);
    if (bytes.length !== candidate.size || createHash('sha256').update(bytes).digest('hex') !== candidate.sha256 || `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== candidate.integrity) failure('plugin-publish-archive-drift');
    const frozenTarball = join(directory, candidate.filename);
    writeFileSync(frozenTarball, bytes, { mode: 0o400, flag: 'wx' });
    writeFileSync(join(directory, 'user.npmrc'), '', { mode: 0o600 }); writeFileSync(join(directory, 'global.npmrc'), '', { mode: 0o600 });
    const result = spawnSync(process.execPath, [cli, 'publish', frozenTarball, '--ignore-scripts', '--access=public', `--tag=${candidate.npmTag}`, `--registry=${PLUGIN_REGISTRY}`], {
      cwd: directory, env: isolatedPluginNpmEnvironment(env, directory), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    });
    // npm output may contain sensitive values. Only retain its numeric outcome.
    return { status: result.status ?? 1 };
  } finally { rmSync(directory, { recursive: true }); }
}
async function registryState(candidate: ReleaseCandidate, fetchImpl?: typeof fetch): Promise<RegistryState> {
  const response = await requestReleaseJson(`${PLUGIN_REGISTRY}${encodeURIComponent(PLUGIN_PACKAGE)}/${encodeURIComponent(candidate.version)}`, { fetchImpl, headers: { accept: 'application/json' } });
  if (response.status === 404) return { published: false };
  if (response.status !== 200 || response.body?.name !== PLUGIN_PACKAGE || response.body?.version !== candidate.version || typeof response.body?.dist?.integrity !== 'string') failure('plugin-registry-identity-invalid');
  return { published: true, integrity: response.body.dist.integrity };
}
/** Protect only a new write; an already-public archive remains an established fact. */
export async function verifyPluginPublishCompatibility(options: { candidate: ReturnType<typeof readReleaseCandidate>; verificationPath?: string; npmCli?: string }, dependencies: PublishDependencies = {}): Promise<void> {
  const { candidate } = options;
  const consumer = artifactFromTarball(readFileSync(candidate.tarball), { origin: 'candidate', packageName: candidate.manifest.packageName,
    version: candidate.manifest.version, integrity: candidate.manifest.integrity, sourceCommit: candidate.manifest.sourceCommit });
  // A real legacy candidate keeps its original owner semantics. All new declared
  // candidates must transport the original successful prepare proof.
  if (consumer.compatibility === null && candidate.manifest.compatibility === undefined) return;
  if (!isDeepStrictEqual(consumer.compatibility, candidate.manifest.compatibility)) failure('plugin-candidate-compatibility-drift');
  if (!options.verificationPath) failure('plugin-prepare-verification-required');
  let verification: unknown;
  try {
    const filename = resolve(options.verificationPath), state = lstatSync(filename);
    if (!state.isFile() || state.size > 4 * 1024 * 1024 || realpathSync(filename) !== filename) failure('plugin-prepare-verification-invalid');
    verification = JSON.parse(readFileSync(filename, 'utf8'));
    if (containsCredentialMaterial(verification)) failure('plugin-prepare-verification-invalid');
    assertBoundVerification(verification, candidate);
  } catch { failure('plugin-prepare-verification-invalid'); }
  const observed = await (dependencies.observePeer ?? observePublishedPackageArtifact)('buildr', { fetchImpl: dependencies.fetchImpl });
  if (observed.observation.status !== 'present' || !observed.bytes) failure('plugin-current-buildr-unavailable');
  const current = observed.observation.artifact;
  if (current.origin !== 'registry' || current.packageName !== '@buildr-ai/buildr') failure('plugin-current-buildr-unavailable');
  // Reconstruct both identities from original bytes, never a checkout or dist tag.
  const provider = artifactFromTarball(observed.bytes, { origin: 'registry', packageName: '@buildr-ai/buildr', version: current.version, integrity: current.integrity });
  if (!isDeepStrictEqual(provider, current)) failure('plugin-current-buildr-artifact-drift');
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'buildr-dsh-publish-peer-')));
  try {
    const tarball = join(directory, 'buildr.tgz');
    writeFileSync(tarball, observed.bytes, { mode: 0o400, flag: 'wx' });
    const pair = assertPairReport((dependencies.verifyPair ?? verifyBuildrPluginPair)({ consumer: { artifact: consumer, tarball: candidate.tarball },
      provider: { artifact: provider, tarball }, npmCli: options.npmCli, nodeExecutable: process.execPath }), consumer, provider);
    const provedProvider: CompatibilityArtifact = pair.providerContracts ? { ...provider, verifiedContracts: pair.providerContracts } : provider;
    if (pair.status !== 'passed' || evaluatePackageCompatibility(consumer, provedProvider, { legacyPairEvidence: [pair.legacyPairEvidence] }).status !== 'passed') failure('plugin-current-buildr-incompatible');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function journalIdentity(manifest: ReleaseCandidate) { return { packageName: manifest.packageName, version: manifest.version, sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree, sha256: manifest.sha256, integrity: manifest.integrity }; }
function readJournal(output: string, manifest: ReleaseCandidate): PublicationJournal | undefined {
  if (!existsSync(output)) return undefined;
  if (!lstatSync(output).isFile() || realpathSync(output) !== output || lstatSync(output).size > 256 * 1024) failure('plugin-publication-journal-invalid');
  const journal = JSON.parse(readFileSync(output, 'utf8'));
  if (journal?.schemaVersion !== PUBLICATION_SCHEMA || typeof journal.attempted !== 'boolean' || !['running', 'passed', 'blocked'].includes(journal.status) || !Number.isSafeInteger(journal.request?.runId) || journal.request.runId < 1 || !Number.isSafeInteger(journal.request?.runAttempt) || journal.request.runAttempt < 1 || journal.request.workflowRef !== `BuildrAI/Buildr/${PLUGIN_WORKFLOW_PATH}@refs/heads/main` || containsCredentialMaterial(journal)) failure('plugin-publication-journal-invalid');
  if (journal.publishedObserved !== undefined && typeof journal.publishedObserved !== 'boolean') failure('plugin-publication-journal-invalid');
  for (const [key, value] of Object.entries(journalIdentity(manifest))) if (journal[key] !== value) failure('plugin-publication-journal-drift');
  return journal;
}
function saveJournal(output: string, value: PublicationJournal): void {
  if (containsCredentialMaterial(value)) failure('plugin-publication-evidence-contains-credentials');
  mkdirSync(dirname(output), { recursive: true });
  if (realpathSync(dirname(output)) !== dirname(output) || existsSync(output) && (!lstatSync(output).isFile() || realpathSync(output) !== output)) failure('plugin-publication-output-invalid');
  const pending = `${output}.pending-${process.pid}`;
  writeFileSync(pending, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(pending, output);
}
export async function publishPluginCandidate(options: { manifestPath: string; version: string; sourceCommit: string; output?: string; repo?: string; npmCli?: string; verificationPath?: string }, dependencies: PublishDependencies = {}): Promise<PublicationJournal> {
  const env = dependencies.env ?? process.env, now = dependencies.now ?? Date.now;
  assertPluginHostedIdentity(env, options.sourceCommit);
  const source = (dependencies.source ?? (() => sourceState(resolve(options.repo ?? repositoryRoot))))();
  if (source.sourceCommit !== options.sourceCommit || source.version !== options.version) failure('plugin-publish-source-drift');
  const artifact = readReleaseCandidate(options.manifestPath, { version: source.version, sourceCommit: source.sourceCommit, sourceTree: source.sourceTree, sourceSdk: source.sourceSdk });
  const manifest = artifact.manifest, outputValue = resolve(options.output ?? join(dirname(artifact.manifestPath), 'publication.json'));
  mkdirSync(dirname(outputValue), { recursive: true });
  const output = join(realpathSync(dirname(outputValue)), basename(outputValue));
  const previous = readJournal(output, manifest);
  let journal: PublicationJournal = { schemaVersion: PUBLICATION_SCHEMA, ...journalIdentity(manifest), attempted: previous?.attempted ?? false, publishedObserved: previous?.publishedObserved === true || previous?.status === 'passed' || previous?.registry === 'present', status: 'blocked', action: 'blocked', registry: previous?.registry ?? 'unknown', observedAt: new Date(now()).toISOString(), request: previous?.attempted ? previous.request : { runId: Number(env.GITHUB_RUN_ID), runAttempt: Number(env.GITHUB_RUN_ATTEMPT), workflowRef: env.GITHUB_WORKFLOW_REF! } };
  const save = () => { journal.observedAt = new Date(now()).toISOString(); saveJournal(output, journal); return journal; };
  const read = dependencies.registry ?? ((candidate: ReleaseCandidate) => registryState(candidate, dependencies.fetchImpl));
  try {
    let before: RegistryState;
    try { before = await read(manifest); }
    catch (error) { if (journal.registry !== 'present') journal.registry = 'unknown'; throw error; }
    journal.registry = before.published ? 'present' : 'absent';
    if (before.published) {
      if (before.integrity !== manifest.integrity) failure('plugin-registry-integrity-conflict');
      journal.publishedObserved = true;
      journal.status = 'passed'; journal.action = 'reused'; return save();
    }
    if (previous?.attempted || journal.publishedObserved) { journal.action = 'readback-required'; journal.code = 'plugin-publication-attempt-unconfirmed'; return save(); }
    const authority = await (dependencies.authority ?? ((state: SourceState) => probePluginPublishAuthority(state, dependencies)))(source);
    if (authority.status !== 'ready' || authority.npm.package !== PLUGIN_PACKAGE || authority.npm.tokenType !== 'oidc' || !isDeepStrictEqual(authority.expected, PLUGIN_PUBLISH_AUTHORITY) || authority.workflowSha256 !== source.workflowSha256 || !Number.isFinite(Date.parse(authority.npm.expires)) || Date.parse(authority.npm.expires) <= now() || containsCredentialMaterial(authority)) failure('plugin-publish-authority-invalid');
    journal.authority = authority;
    // Recheck the transported bytes immediately before the only public write.
    const refreshed = readReleaseCandidate(options.manifestPath, { version: source.version, sourceCommit: source.sourceCommit, sourceTree: source.sourceTree, sourceSdk: source.sourceSdk });
    if (!isDeepStrictEqual(refreshed.manifest, manifest) || refreshed.tarball !== artifact.tarball) failure('plugin-publish-archive-drift');
    const currentSource = (dependencies.source ?? (() => sourceState(resolve(options.repo ?? repositoryRoot))))();
    if (!isDeepStrictEqual(currentSource, source)) failure('plugin-publish-source-drift');
    await verifyPluginPublishCompatibility({ candidate: refreshed, verificationPath: options.verificationPath, npmCli: options.npmCli }, dependencies);
    journal.attempted = true; journal.status = 'running'; journal.action = 'publishing'; save();
    try { await (dependencies.publish ?? ((tarball: string, candidate: ReleaseCandidate) => publishIsolated(tarball, candidate, env, options.npmCli)))(artifact.tarball, manifest); }
    catch { /* A lost response is still an attempted write. Only readback can establish its outcome. */ }
    const attempts = dependencies.registryWait?.attempts ?? 12, delayMs = dependencies.registryWait?.delayMs ?? 5000;
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 24 || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 20_000) failure('plugin-registry-wait-invalid');
    for (let attempt = 0; attempt < attempts; attempt++) {
      let after: RegistryState | undefined;
      try { after = await read(manifest); } catch { journal.registry = 'unknown'; }
      if (after?.published) {
        journal.registry = 'present';
        if (after.integrity !== manifest.integrity) failure('plugin-registry-integrity-conflict');
        journal.publishedObserved = true;
        journal.status = 'passed'; journal.action = 'published'; return save();
      }
      if (after) journal.registry = 'absent';
      if (attempt + 1 < attempts) await (dependencies.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(delayMs);
    }
    journal.status = 'blocked'; journal.action = 'readback-required'; journal.code = 'plugin-publication-attempt-unconfirmed'; return save();
  } catch (error: any) {
    journal.status = 'blocked'; journal.action = journal.attempted ? 'readback-required' : 'blocked';
    const safeCodes = ['plugin-registry-integrity-conflict', 'plugin-publish-authority-invalid', 'plugin-oidc-request-missing', 'plugin-oidc-expired-or-not-active', 'plugin-oidc-authority-mismatch', 'plugin-npm-oidc-exchange-failed', 'plugin-npm-oidc-exchange-expired', 'plugin-candidate-compatibility-drift', 'plugin-prepare-verification-required', 'plugin-prepare-verification-invalid', 'plugin-current-buildr-unavailable', 'plugin-current-buildr-artifact-drift', 'plugin-current-buildr-incompatible'];
    journal.code = safeCodes.includes(error?.code) ? error.code : 'plugin-publication-check-failed';
    return save();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1];
    if (!name || !['--manifest', '--version', '--source-commit', '--output', '--npm-cli', '--verification'].includes(name) || !value || value.startsWith('--') || Object.hasOwn(values, name)) failure('plugin-publish-arguments-invalid');
    values[name] = value;
  }
  try {
    const result = await publishPluginCandidate({ manifestPath: required(values['--manifest'], 'plugin-manifest-required'), version: required(values['--version'], 'plugin-version-required'), sourceCommit: required(values['--source-commit'], 'plugin-source-required'), output: values['--output'], npmCli: values['--npm-cli'], verificationPath: values['--verification'] });
    process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.status === 'passed' ? 0 : 1;
  } catch { process.stderr.write('Plugin publication refused before a public write; check candidate and protected workflow identity.\n'); process.exitCode = 1; }
}
