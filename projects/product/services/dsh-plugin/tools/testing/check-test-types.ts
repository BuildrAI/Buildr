/** Strict test typing uses the real SDK, with separate Host/Client ambient contexts per entry. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ownedBuildRoot, sdkDeclarationPaths, validatePreparedSourceSdk } from '../prepare-source-sdk.ts';

const root = path.resolve(import.meta.dirname, '../..');
const core = path.resolve(root, '../buildr');
const sdk = process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
const consumer = process.env.BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT;
if (!sdk || !consumer) throw new Error('Prepared source SDK and generated Client consumer are required for plugin test types.');
validatePreparedSourceSdk(sdk);
if (!fs.statSync(path.join(consumer, 'lib/typert.remote-client.d.ts'), { throwIfNoEntry: false })?.isFile()) throw new Error('Generated Client protocol declarations are missing.');
const require = createRequire(path.join(sdk, 'node_modules/.pnpm/node_modules/toolchain.cjs'));
const paths = sdkDeclarationPaths(sdk);
for (const id of ['esbuild', 'vitest', '@testing-library/react']) {
  const file = require.resolve(id + '/package.json');
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  paths[id] = [path.resolve(path.dirname(file), metadata.types ?? metadata.typings ?? 'index.d.ts')];
}
for (const [id, dir] of [['react', '@types/react'], ['react-dom', '@types/react-dom']]) {
  const types = path.dirname(require.resolve(dir + '/package.json'));
  paths[id] = [path.join(types, 'index.d.ts')];
  paths[id + (id === 'react' ? '/jsx-runtime' : '/client')] = [path.join(types, id === 'react' ? 'jsx-runtime.d.ts' : 'client.d.ts')];
}
for (const [id, directory] of [['dsh-client-ui-trajectory', 'client/ui-trajectory'], ['dsh-client-test-runtime', 'test-support/client-runtime'], ['dsh-api-session-controller', 'api/session-controller'], ['dsh-client-ui-theme', 'client/ui-theme']]) {
  paths['@deepseek-ai/' + id + '/src/*'] = [path.join(sdk, 'packages', directory, 'src/*')];
}
const directory = fs.mkdtempSync(path.join(ownedBuildRoot(root), 'test-types-'));
const files = [...fs.globSync('test/**/*.{ts,tsx}', { cwd: root }).filter(file => !file.endsWith('.d.ts')), 'tools/testing/check-test-types.ts'].sort();
const declarations = fs.globSync('test/**/*.d.ts', { cwd: root }).map(file => path.join(root, file));
let failed = 0;
try {
  for (const file of files) {
    const config = path.join(directory, 'tsconfig.json');
    fs.writeFileSync(config, JSON.stringify({
      extends: path.join(core, 'tsconfig.tests.json'),
      compilerOptions: { paths, typeRoots: [path.join(core, 'node_modules/@types'), path.join(sdk, 'node_modules/@types')], rootDirs: [path.join(root, 'plugin'), consumer], erasableSyntaxOnly: false },
      include: [path.join(root, file), path.join(root, 'plugin/src/css-modules.d.ts'), ...declarations],
    }));
    const result = spawnSync(process.execPath, [path.join(core, 'tools/testing/run-types.ts'), '--project', config], { cwd: core, encoding: 'utf8', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) { failed++; console.error(file + '\n' + result.stdout + result.stderr); }
  }
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log(`Plugin strict test types: ${files.length} entries, ${failed} failed; SDK Host and Client declarations remain isolated.`);
process.exitCode = failed ? 1 : 0;
