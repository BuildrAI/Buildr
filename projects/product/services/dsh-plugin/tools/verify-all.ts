/** Complete plugin source, package and DSH loader verification. */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.BUILDR_DSH_SDK_ROOT ?? join(root, 'build/dsh-0.2.0-rc.1');
const run = (script: string, ...args: string[]): void => {
  execFileSync(process.execPath, [join(root, script), ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, BUILDR_DSH_SDK_ROOT: sdk } });
};
if (process.env.BUILDR_DSH_SDK_ROOT === undefined) run('tools/fetch-sdk.ts');
run('tools/build-plugin.ts', sdk);
run('tools/build-plugin.ts', '--dev', sdk);
const testFiles = ['unit', 'integration'].flatMap(group => readdirSync(join(root, 'test', group))
  .filter(name => name.endsWith('.test.ts')).map(name => join(root, 'test', group, name)));
execFileSync(process.execPath, ['--test', ...testFiles], {
  cwd: root, stdio: 'inherit', env: { ...process.env, BUILDR_DSH_SDK_ROOT: sdk }, shell: false,
});
run('tools/verify-plugin.ts', sdk);
run('tools/verify-plugin.ts', '--dev', sdk);
