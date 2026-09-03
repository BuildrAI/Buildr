import assert from 'node:assert/strict';
import test from 'node:test';
import {
  productSourceLayoutContract,
  validateProductSourceLayout,
} from '../verification/cli/product-source-layout.ts';

const canonicalProjectEntries: any[] = [
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
const canonicalServiceEntries: any[] = [
  'AGENTS.md',
  'bin',
  'docs',
  'package',
  'package-lock.json',
  'package.json',
  'resources',
  'src',
  'test',
  'tools',
];
const deferredPackageFiles: any[] = [
  'launchers/build.ts',
  'launchers/manage.mjs',
  'launchers/manage.ts',
  'targets/runtime/skills/buildr/SKILL.md',
];
const canonicalBridge: any = '#!/bin/sh\nset -eu\nproject_root=$(CDPATH= cd "${0%/*}" && pwd)\nexec "$project_root/services/buildr/tools/development/run-development-cli" "$@"\n';

test('Product 治理根与 Buildr Service 实现根满足最终结构契约', () => {
  assert.deepEqual(validateProductSourceLayout({
    projectEntries: canonicalProjectEntries,
    serviceEntries: canonicalServiceEntries,
    packageFiles: deferredPackageFiles,
    bridgeSource: canonicalBridge,
  }), []);
});

test('Product 治理根接受与 AGENTS 同目录的受管 CLAUDE runtime bridge', () => {
  assert.ok(productSourceLayoutContract.allowedProjectRootEntries.includes('CLAUDE.md'));
  assert.deepEqual(validateProductSourceLayout({
    projectEntries: canonicalProjectEntries,
    serviceEntries: canonicalServiceEntries,
    packageFiles: deferredPackageFiles,
    bridgeSource: canonicalBridge,
  }), []);
});

test('结构 verifier 拒绝旧 Product package-root 残留', () => {
  for (const forbidden of productSourceLayoutContract.forbiddenProjectRootEntries) {
    const findings: any = validateProductSourceLayout({
      projectEntries: [...canonicalProjectEntries, forbidden],
      serviceEntries: canonicalServiceEntries,
      packageFiles: deferredPackageFiles,
      bridgeSource: canonicalBridge,
    });
    const expected: any = forbidden === 'node_modules'
      ? 'Product Project root must not retain node_modules from a retired package root; remove it and run npm ci in projects/product/services/buildr.'
      : `Project root must not own ${forbidden}`;
    assert.ok(findings.includes(expected), forbidden);
  }
});

test('结构 verifier 拒绝未分类内容、空壳 Service 和非薄 bridge', () => {
  const findings: any = validateProductSourceLayout({
    projectEntries: [...canonicalProjectEntries, 'unknown-runtime'],
    serviceEntries: canonicalServiceEntries.filter((entry: any) => entry !== 'src'),
    packageFiles: deferredPackageFiles,
    bridgeSource: "#!/usr/bin/env node\nconsole.log('duplicated implementation');\n",
  });
  assert.deepEqual(findings, [
    'unclassified Product root entry: unknown-runtime',
    'Buildr Service root is missing src',
    'projects/product/buildr must be a thin Service CLI bridge',
  ]);
});

test('结构 verifier 拒绝 scripts 根和未获许可的 package 遗留', () => {
  assert.deepEqual(validateProductSourceLayout({
    projectEntries: canonicalProjectEntries,
    serviceEntries: [...canonicalServiceEntries, 'scripts'],
    packageFiles: [...deferredPackageFiles, 'manifest.yml'],
    bridgeSource: canonicalBridge,
  }), [
    'Buildr Service root must not retain scripts',
    'Buildr Service package/ contains non-deferred file: manifest.yml',
  ]);
});

test('结构 verifier 拒绝重新跟踪可重建生成物', () => {
  const trackedFiles: any[] = [
    'projects/product/services/buildr/web-dist/index.html',
    'projects/product/services/buildr/package/targets/test-context/index.js',
    'projects/product/services/buildr/src/task/interfaces/http/generated/task-record-http-dto.ts',
    'projects/product/services/buildr-web/src/api/generated/task-record-http-dto.ts',
  ];
  assert.deepEqual(validateProductSourceLayout({
    projectEntries: canonicalProjectEntries,
    serviceEntries: canonicalServiceEntries,
    packageFiles: deferredPackageFiles,
    trackedFiles,
    bridgeSource: canonicalBridge,
  }), trackedFiles.map((file: any) => `generated artifact must not be tracked: ${file}`));
});
