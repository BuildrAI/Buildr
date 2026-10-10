/** Verify complete package portability and its exact thin gateway with the actual SDK loader. */
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyComposition } from './verify-composition.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), position = args.indexOf('--bundle');
if (position < 0 || !args[position + 1]) throw Error('verify-package requires --bundle <composition>');
const checked = await verifyComposition(resolve(args[position + 1]!));
const forwarded = [...args]; forwarded[position + 1] = checked.entry;
execFileSync(process.execPath, [join(root, 'tools/verify-plugin.ts'), ...forwarded], { cwd: root, stdio: 'inherit', shell: false });
console.log(JSON.stringify({ status: 'passed', composition: resolve(args[position + 1]!), fileCount: checked.fileCount }));
