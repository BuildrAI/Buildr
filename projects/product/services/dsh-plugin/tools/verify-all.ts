/** Complete plugin source, package and DSH loader verification against an explicit prepared source SDK. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedBuildRoot, validatePreparedSourceSdk } from './prepare-source-sdk.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--source-sdk' || !args[1])) throw new Error('Usage: node tools/verify-all.ts --source-sdk <prepared source SDK>');
const selected = args[1] ?? process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
if (selected === undefined) throw new Error('增强插件完整验证需要明确的 --source-sdk 或 BUILDR_DSH_SOURCE_SDK_ROOT；未补丁的 SDK 版本号不代表来源接口支持。');
const sdk = resolve(selected);
validatePreparedSourceSdk(sdk, root);
const bundles = mkdtempSync(join(ownedBuildRoot(root), 'dsh-plugin-full-'));
const environment = { ...process.env, BUILDR_DSH_SDK_ROOT: sdk, BUILDR_DSH_SOURCE_SDK_ROOT: sdk, BUILDR_DSH_BUNDLE_ROOT: bundles,
  BUILDR_DSH_SOURCE_UI_SDK_ROOT: sdk, BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT: join(bundles, 'dsh-plugin') };
const run = (script: string, ...parameters: string[]): void => {
  execFileSync(process.execPath, [join(root, script), ...parameters], { cwd: root, stdio: 'inherit', env: environment, shell: false });
};
run('tools/build-plugin.ts', '--source-sdk', sdk, '--output', join(bundles, 'dsh-plugin'));
run('tools/build-plugin.ts', '--dev', '--source-sdk', sdk, '--output', join(bundles, 'dsh-plugin-dev'));
const testFiles = ['unit', 'integration'].flatMap(group => readdirSync(join(root, 'test', group))
  .filter(name => name.endsWith('.test.ts')).map(name => join(root, 'test', group, name)));
execFileSync(process.execPath, ['--test', ...testFiles], { cwd: root, stdio: 'inherit', env: environment, shell: false });
run('test/integration/run-source-ui.ts');
run('tools/verify-plugin.ts', '--source-sdk', sdk, '--bundle', join(bundles, 'dsh-plugin'));
run('tools/verify-plugin.ts', '--dev', '--source-sdk', sdk, '--bundle', join(bundles, 'dsh-plugin-dev'));
console.log(JSON.stringify({ sourceSdk: sdk, bundles, variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false }));
