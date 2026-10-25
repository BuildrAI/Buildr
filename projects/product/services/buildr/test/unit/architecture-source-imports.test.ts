import assert from 'node:assert/strict';
import test from 'node:test';
import { isScriptSource, platformNamespaceImports, sourceModuleReferences, hasWideTaskRecordAccess } from '../verification/cli/source-imports.ts';

test('平台扫描能检测TypeScript、JavaScript和换行别名导入', () => {
  const files = ['ts', 'mjs', 'js', 'cts', 'mts', 'tsx'].map((extension) => ({
    path: `violation.${extension}`,
    source: "import\n * as hiddenPlatform\n from '../infrastructure/platform.ts';\n",
  }));
  files.push({ path: 'readme.md', source: "import * as platform from '../infrastructure/platform.ts';" });
  assert.deepEqual(platformNamespaceImports(files), ['violation.cts', 'violation.js', 'violation.mjs', 'violation.mts', 'violation.ts', 'violation.tsx']);
  assert.equal(isScriptSource('src/module.ts'), true);
  assert.equal(isScriptSource('assets/icon.png'), false);
});


test('type-only references stay resolvable without creating runtime import cycles', () => {
  assert.deepEqual(sourceModuleReferences(`
    import type { Contract } from './contract.ts';
    import { type Shape } from './shape.ts';
    import { type Shape, run } from './runner.ts';
    import './register.ts';
    export type { Value } from './values.ts';
    export { type Value, execute } from './execute.ts';
  `), [
    { specifier: './contract.ts', runtime: false }, { specifier: './shape.ts', runtime: true },
    { specifier: './runner.ts', runtime: true }, { specifier: './register.ts', runtime: true },
    { specifier: './values.ts', runtime: false }, { specifier: './execute.ts', runtime: true },
  ]);
});

test('a declared Task query port does not exempt legacy mutation access', () => {
  const port = "import { TASK_QUERY_APPLICATION } from '../task/module.ts';";
  assert.equal(hasWideTaskRecordAccess(`${port} requires[TASK_QUERY_APPLICATION].inspectTask(root, id);`), false);
  assert.equal(hasWideTaskRecordAccess('runtime.inspectTask(root, id);'), true);
  assert.equal(hasWideTaskRecordAccess(`${port} requires[TASK_QUERY_APPLICATION].createTask(root, input);`), true);
  assert.equal(hasWideTaskRecordAccess(`${port} requires[TASK_QUERY_APPLICATION].inspectTask(root, id); runtime.updateTask(root, id);`), true);
});
