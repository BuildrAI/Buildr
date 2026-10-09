/** Prepare the fixed source SDK on a clean runner; stdout is one successful JSON result. */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DSH_SDK_REPOSITORY, type DshSdkBaseline } from './sdk-baselines.ts';
import { ownedBuildRoot, parseSourcePatchManifest, sha256, SOURCE_SDK_RECEIPT, validatePreparedSourceSdk, verifySourcePatchInput, type SourceSdkReceipt } from './prepare-source-sdk.ts';

const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RELEASE_SDK_REPOSITORY = `https://github.com/${DSH_SDK_REPOSITORY}.git`;
export const RELEASE_SDK_MANIFEST = 'sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json';
export const RELEASE_SDK_PNPM_VERSION = '11.7.0';
export interface ReleaseSdkInput { node: string; pnpm: string }
interface CommandOptions { cwd: string; env: NodeJS.ProcessEnv; diagnostic?: boolean }
export type ReleaseSdkCommand = (executable: string, args: string[], options: CommandOptions) => string;
interface Dependencies {
  command?: ReleaseSdkCommand;
  verifyInput?: typeof verifySourcePatchInput;
  verifyPatched?: typeof verifyPatchedReleaseSdkCheckout;
  validate?: typeof validatePreparedSourceSdk;
}
function fail(message: string): never { throw new Error(`dsh_release_sdk_invalid: ${message}`); }
function absoluteFile(value: string, label: string): string {
  if (!isAbsolute(value) || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label} must be an explicit absolute file path`);
  const file = realpathSync(value);
  if (!lstatSync(file).isFile()) fail(`${label} must be a regular file`);
  return file;
}
/** Public input selects tools, never upstream repositories, refs, manifests or existing SDKs. */
export function parseReleaseSdkInput(args: string[]): ReleaseSdkInput {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!key || !['--node', '--pnpm'].includes(key) || !value || value.startsWith('--') || values.has(key)) fail('Usage: node tools/prepare-release-sdk.ts --node <absolute Node> --pnpm <absolute pnpm JS entry>');
    values.set(key, value);
  }
  if (values.size !== 2) fail('explicit --node and --pnpm are required');
  return { node: values.get('--node')!, pnpm: values.get('--pnpm')! };
}
/** The source-patch manifest and registered baselines remain the persistent authorities. */
export function releaseSdkPlan() {
  const manifestFile = join(SERVICE_ROOT, RELEASE_SDK_MANIFEST);
  const manifest = parseSourcePatchManifest(JSON.parse(readFileSync(manifestFile, 'utf8')));
  if (manifest.schemaVersion !== 'buildr.dsh-source-patch/v2' || JSON.stringify(manifest.clientPackages) !== JSON.stringify(['packages/client/ui-settings-agent-loop'])) fail('release requires the reviewed settings source patch');
  const nodeVersion = JSON.parse(readFileSync(join(SERVICE_ROOT, 'package.json'), 'utf8')).engines?.node;
  if (typeof nodeVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(nodeVersion)) fail('service must declare one exact Node version');
  return { manifestFile, manifest, nodeVersion, pnpmVersion: RELEASE_SDK_PNPM_VERSION, repository: RELEASE_SDK_REPOSITORY };
}
const command: ReleaseSdkCommand = (executable, args, options) => execFileSync(executable, args, {
  cwd: options.cwd, env: options.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  stdio: options.diagnostic ? ['ignore', 2, 2] : ['ignore', 'pipe', 'pipe'],
}) ?? '';
/** No inherited auth, npm configuration, SDK selectors, Git overrides or implicit package-manager switching. */
export function releaseSdkEnvironment(node: string, userConfig: string, globalConfig: string): NodeJS.ProcessEnv {
  return {
    PATH: [dirname(node), '/usr/local/bin', '/usr/bin', '/bin'].join(delimiter),
    ...(process.platform === 'win32' && process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    CI: 'true', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig,
    GIT_ALLOW_PROTOCOL: 'https', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: dirname(userConfig),
    NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_CACHE: join(dirname(userConfig), 'npm-cache'), TMPDIR: join(dirname(userConfig), 'tmp'),
    XDG_CONFIG_HOME: join(dirname(userConfig), 'config'), XDG_CACHE_HOME: join(dirname(userConfig), 'cache'),
    XDG_DATA_HOME: join(dirname(userConfig), 'data'), XDG_STATE_HOME: join(dirname(userConfig), 'state'),
    PNPM_CONFIG_NPMRC_AUTH_FILE: userConfig,
    npm_config_manage_package_manager_versions: 'false',
  };
}
function git(source: string, args: string[], run: ReleaseSdkCommand, env: NodeJS.ProcessEnv): string {
  return run('git', args, { cwd: source, env }).trim();
}
/** Inspect actual Git boundaries; a marker, nested directory or matching version cannot attest a checkout. */
export function verifyReleaseSdkCheckout(sourceRoot: string, baseline: DshSdkBaseline, run: ReleaseSdkCommand = command, env: NodeJS.ProcessEnv = {}): string {
  const source = realpathSync(sourceRoot);
  const directory = join(source, '.git');
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) fail('upstream input must be an independent regular Git checkout');
  if (realpathSync(git(source, ['rev-parse', '--show-toplevel'], run, env)) !== source || realpathSync(git(source, ['rev-parse', '--absolute-git-dir'], run, env)) !== directory) fail('upstream Git boundary does not match its owned checkout');
  if (git(source, ['rev-parse', 'HEAD'], run, env) !== baseline.commit) fail('upstream Git HEAD differs from the fixed baseline');
  if (git(source, ['remote', 'get-url', 'origin'], run, env) !== RELEASE_SDK_REPOSITORY) fail('upstream remote differs from the fixed repository');
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (manifest.version !== baseline.version || manifest.packageManager !== `pnpm@${RELEASE_SDK_PNPM_VERSION}`) fail('upstream package version or package manager differs from the fixed baseline');
  return source;
}
function patchedPaths(source: string, run: ReleaseSdkCommand, env: NodeJS.ProcessEnv): string[] {
  return [...git(source, ['diff', '--name-only', 'HEAD'], run, env).split('\n'), ...git(source, ['ls-files', '--others', '--exclude-standard'], run, env).split('\n')].filter(Boolean).sort();
}
export function verifyPatchedReleaseSdkCheckout(source: string, plan: ReturnType<typeof releaseSdkPlan>, run: ReleaseSdkCommand, env: NodeJS.ProcessEnv): void {
  verifyReleaseSdkCheckout(source, plan.manifest.upstream, run, env);
  if (JSON.stringify(patchedPaths(source, run, env)) !== JSON.stringify(plan.manifest.files.map(file => file.path).sort())) fail('dependency checkout changes differ from the complete reviewed patch');
  for (const file of plan.manifest.files) {
    const path = join(source, file.path);
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || sha256(readFileSync(path)) !== file.patchedSha256) fail(`dependency checkout patch bytes changed: ${file.path}`);
  }
}
/** Consume only the final result, and only a new, owned SDK output from this invocation. */
export function preparedReleaseSdkOutput(stdout: string, existingOutputs: ReadonlySet<string>): string {
  const line = stdout.trim().split('\n').at(-1);
  let result: unknown;
  try { result = JSON.parse(line ?? ''); } catch { fail('source preparation did not return its final JSON result'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('source preparation result must be an object');
  const value = result as Record<string, unknown>;
  if (value.status !== 'prepared' || typeof value.sdk !== 'string' || !isAbsolute(value.sdk) || /[\u0000-\u001f\u007f]/.test(value.sdk)) fail('source preparation has no prepared SDK result');
  const build = ownedBuildRoot(SERVICE_ROOT), sdk = resolve(value.sdk), parent = dirname(sdk);
  if (dirname(parent) !== build || !/^dsh-source-sdk-[A-Za-z0-9_-]+$/.test(parent.slice(build.length + 1)) || sdk !== join(parent, 'sdk') || existingOutputs.has(parent)) fail('source preparation must return its own unique build output');
  for (const path of [parent, sdk]) if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) fail('prepared SDK output must be an owned regular directory');
  return sdk;
}
/** Even local validation imports SDK dependencies, so it must execute inside the same isolated environment. */
export function releaseSdkValidationCommand(action: 'verify-input' | 'validate-sdk', args: string[]): string[] {
  const module = JSON.stringify(pathToFileURL(join(SERVICE_ROOT, 'tools/prepare-source-sdk.ts')).href);
  const symbol = action === 'verify-input' ? 'verifySourcePatchInput' : 'validatePreparedSourceSdk';
  return ['--input-type=module', '--eval', `// buildr-dsh-release-sdk:${action}\nimport { ${symbol} as verify } from ${module}; console.log(JSON.stringify(verify(process.argv[1], process.argv[2])));`, '--', ...args];
}
function isolatedSdkValidation<T>(node: string, action: 'verify-input' | 'validate-sdk', args: string[], run: ReleaseSdkCommand, env: NodeJS.ProcessEnv): T {
  const stdout = run(node, releaseSdkValidationCommand(action, args), { cwd: SERVICE_ROOT, env });
  try { return JSON.parse(stdout.trim()) as T; } catch { fail(`${action} did not return valid validation JSON`); }
}
/** Public orchestration downloads only the fixed source; injected collaborators are test-only API arguments. */
export async function prepareReleaseSdk(input: ReleaseSdkInput, dependencies: Dependencies = {}) {
  const run = dependencies.command ?? command, verifyPatched = dependencies.verifyPatched ?? verifyPatchedReleaseSdkCheckout;
  const plan = releaseSdkPlan(), node = absoluteFile(input.node, 'Node'), pnpm = absoluteFile(input.pnpm, 'pnpm');
  if (!/\.(?:cjs|mjs|js)$/.test(pnpm)) fail('pnpm must name its installed JavaScript entry');
  const build = ownedBuildRoot(SERVICE_ROOT), stage = mkdtempSync(join(build, 'dsh-release-sdk-'));
  const userConfig = join(stage, 'user.npmrc'), globalConfig = join(stage, 'global.npmrc');
  writeFileSync(userConfig, '', { flag: 'wx', mode: 0o600 }); writeFileSync(globalConfig, '', { flag: 'wx', mode: 0o600 });
  mkdirSync(join(stage, 'tmp'));
  const env = releaseSdkEnvironment(node, userConfig, globalConfig);
  if (run(node, ['--version'], { cwd: stage, env }).trim() !== `v${plan.nodeVersion}` || realpathSync(process.execPath) !== node) fail(`run this preparer with the declared Node ${plan.nodeVersion} and pass that exact executable`);
  if (run(node, [pnpm, '--version'], { cwd: stage, env }).trim() !== plan.pnpmVersion) fail(`pnpm ${plan.pnpmVersion} is required`);
  const source = join(stage, 'source'); mkdirSync(source);
  git(source, ['init', '--quiet'], run, env);
  git(source, ['remote', 'add', 'origin', plan.repository], run, env);
  git(source, ['fetch', '--quiet', '--depth=1', 'origin', `refs/tags/${plan.manifest.upstream.tag}`], run, env);
  if (git(source, ['rev-parse', 'FETCH_HEAD^{commit}'], run, env) !== plan.manifest.upstream.commit) fail('fetched upstream tag differs from its registered exact commit');
  git(source, ['checkout', '--quiet', '--detach', plan.manifest.upstream.commit], run, env);
  verifyReleaseSdkCheckout(source, plan.manifest.upstream, run, env);
  if (git(source, ['status', '--porcelain', '--untracked-files=all'], run, env) !== '') fail('downloaded upstream checkout is not pristine');
  const selected = dependencies.verifyInput ? dependencies.verifyInput(source, plan.manifestFile)
    : isolatedSdkValidation<ReturnType<typeof verifySourcePatchInput>>(node, 'verify-input', [source, plan.manifestFile], run, env);
  git(source, ['apply', '--check', selected.patchFile], run, env);
  git(source, ['apply', selected.patchFile], run, env);
  verifyPatched(source, plan, run, env);
  const lock = join(source, 'pnpm-lock.yaml'), lockSha256 = sha256(readFileSync(lock));
  run(node, [pnpm, 'install', '--frozen-lockfile', '--ignore-scripts', '--store-dir', join(stage, 'pnpm-store')], { cwd: source, env, diagnostic: true });
  if (!existsSync(join(source, 'node_modules')) || !lstatSync(join(source, 'node_modules')).isDirectory() || lstatSync(join(source, 'node_modules')).isSymbolicLink()) fail('frozen dependency installation did not create owned dependencies');
  if (sha256(readFileSync(lock)) !== lockSha256) fail('frozen dependency lockfile changed during installation');
  verifyPatched(source, plan, run, env);
  const existingOutputs = new Set(readdirSync(build).map(entry => join(build, entry)));
  const stdout = run(node, [join(SERVICE_ROOT, 'tools/prepare-source-sdk.ts'), '--source', source, '--manifest', plan.manifestFile, '--node', node], { cwd: SERVICE_ROOT, env });
  const sdk = preparedReleaseSdkOutput(stdout, existingOutputs);
  let receipt: SourceSdkReceipt;
  try {
    receipt = dependencies.validate ? dependencies.validate(sdk, SERVICE_ROOT)
      : isolatedSdkValidation<SourceSdkReceipt>(node, 'validate-sdk', [sdk, SERVICE_ROOT], run, env);
    if (realpathSync(receipt.sourceCheckout) !== source || JSON.stringify(receipt.baseline) !== JSON.stringify(plan.manifest.upstream) || receipt.sourceManifest.sha256 !== sha256(readFileSync(plan.manifestFile)) || receipt.patchSha256 !== plan.manifest.patch.sha256) fail('prepared SDK identity differs from this fixed source preparation');
  } catch (error) {
    // Only this invocation's proven unique output is affected; preserve all source and pending evidence.
    const ready = join(sdk, SOURCE_SDK_RECEIPT);
    if (existsSync(ready)) unlinkSync(ready);
    throw error;
  }
  return { schemaVersion: 'buildr.dsh-release-sdk/v1', status: 'prepared', sdk, baseline: receipt.baseline, sourceManifestSha256: receipt.sourceManifest.sha256, patchSha256: receipt.patchSha256, nodeVersion: plan.nodeVersion, pnpmVersion: plan.pnpmVersion, runtimeActivated: false, desktopValidated: false };
}

if (import.meta.main) console.log(JSON.stringify(await prepareReleaseSdk(parseReleaseSdkInput(process.argv.slice(2)))));
