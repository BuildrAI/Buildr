import assert from 'node:assert/strict';
import test from 'node:test';
import { isScriptSource, platformNamespaceImports } from '../verification/cli/source-imports.ts';

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
