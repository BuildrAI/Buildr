/** Build the installable composition; the thin gateway remains an internal compilation boundary. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedBuildRoot, newBuildOutput } from './prepare-source-sdk.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
export function parsePackageBuild(args: string[], env = process.env): { dev: boolean; sourceSdk: string; output: string } {
  const values = new Map<string, string>(); let dev = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--dev' && !dev) { dev = true; continue; }
    const value = args[++index];
    if (!['--source-sdk', '--output'].includes(flag) || values.has(flag) || !value || value.startsWith('--')) {
      throw Error('Usage: build-package.ts [--dev] --source-sdk <verified-sdk> [--output <new-build-directory>]');
    }
    values.set(flag, value);
  }
  const sdk = values.get('--source-sdk') ?? env.BUILDR_DSH_SOURCE_SDK_ROOT;
  if (!sdk) throw Error('Installable package requires an explicit verified source SDK');
  return { dev, sourceSdk: resolve(sdk), output: values.get('--output') ?? (dev ? 'build/dsh-plugin-dev' : 'build/dsh-plugin') };
}
export function buildPackage(args = process.argv.slice(2)): { output: string; variant: string } {
  const input = parsePackageBuild(args), output = newBuildOutput(root, input.output);
  const stage = mkdtempSync(join(ownedBuildRoot(root), 'dsh-package-entry-')), entry = join(stage, 'entry');
  const run = (script: string, parameters: string[]) => execFileSync(process.execPath, [join(root, script), ...parameters], { cwd: root, stdio: 'inherit', shell: false });
  run('tools/build-plugin.ts', [...(input.dev ? ['--dev'] : []), '--source-sdk', input.sourceSdk, '--output', entry]);
  run('tools/build-composition.ts', ['--source-sdk', input.sourceSdk, '--entry', entry, '--output', output]);
  return { output, variant: input.dev ? 'development' : 'released' };
}
if (import.meta.main) console.log(JSON.stringify(buildPackage()));
