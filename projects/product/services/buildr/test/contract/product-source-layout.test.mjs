import assert from 'node:assert/strict';
import test from 'node:test';
import {
  productSourceLayoutContract,
  validateProductSourceLayout,
} from '../verification/cli/product-source-layout.mjs';

const canonicalProjectEntries = [
  '.node-version',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'buildr',
  'capabilities.yml',
  'commands.yml',
  'docs',
  'openspec',
  'services',
];
const canonicalServiceEntries = [
  'AGENTS.md',
  'bin',
  'package',
  'package-lock.json',
  'package.json',
  'scripts',
  'src',
  'test',
];
const canonicalBridge = '#!/bin/sh\nset -eu\nproject_root=$(CDPATH= cd "${0%/*}" && pwd)\nexec "$project_root/services/buildr/scripts/run-development-cli" "$@"\n';

test('Product 治理根与 Buildr Service 实现根满足最终结构契约', () => {
  assert.deepEqual(validateProductSourceLayout({
    projectEntries: canonicalProjectEntries,
    serviceEntries: canonicalServiceEntries,
    bridgeSource: canonicalBridge,
  }), []);
});

test('Product 治理根接受与 AGENTS 同目录的受管 CLAUDE runtime bridge', () => {
  assert.ok(productSourceLayoutContract.allowedProjectRootEntries.includes('CLAUDE.md'));
  assert.deepEqual(validateProductSourceLayout({
    projectEntries: canonicalProjectEntries,
    serviceEntries: canonicalServiceEntries,
    bridgeSource: canonicalBridge,
  }), []);
});

test('结构 verifier 拒绝旧 Product package-root 残留', () => {
  for (const forbidden of productSourceLayoutContract.forbiddenProjectRootEntries) {
    const findings = validateProductSourceLayout({
      projectEntries: [...canonicalProjectEntries, forbidden],
      serviceEntries: canonicalServiceEntries,
      bridgeSource: canonicalBridge,
    });
    const expected = forbidden === 'node_modules'
      ? 'Product Project root must not retain node_modules from a retired package root; remove it and run npm ci in projects/product/services/buildr.'
      : `Project root must not own ${forbidden}`;
    assert.ok(findings.includes(expected), forbidden);
  }
});

test('结构 verifier 拒绝未分类内容、空壳 Service 和非薄 bridge', () => {
  const findings = validateProductSourceLayout({
    projectEntries: [...canonicalProjectEntries, 'unknown-runtime'],
    serviceEntries: canonicalServiceEntries.filter((entry) => entry !== 'src'),
    bridgeSource: "#!/usr/bin/env node\nconsole.log('duplicated implementation');\n",
  });
  assert.deepEqual(findings, [
    'unclassified Product root entry: unknown-runtime',
    'Buildr Service root is missing src',
    'projects/product/buildr must be a thin Service CLI bridge',
  ]);
});
