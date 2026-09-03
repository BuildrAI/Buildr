import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { verificationSteps } from '../verification/registry.ts';

const read: any = (relative: any) => fs.readFileSync(relative, 'utf8');

test('TypeScript execution foundation is strict, no-emit, and development-only', () => {
  const metadata: any = JSON.parse(read('package.json'));
  const lock: any = JSON.parse(read('package-lock.json'));
  const config: any = JSON.parse(read('tsconfig.json'));

  assert.equal(metadata.devDependencies.typescript, '7.0.2');
  assert.equal(metadata.devDependencies['@types/node'], '24.13.3');
  assert.equal(metadata.dependencies.typescript, undefined);
  assert.equal(metadata.dependencies['@types/node'], undefined);
  assert.equal(lock.packages['node_modules/typescript'].version, '7.0.2');
  assert.equal(lock.packages['node_modules/@types/node'].version, '24.13.3');
  assert.deepEqual(config.include, ['src/**/*.ts', 'tools/**/*.ts']);
  const testConfig: any = JSON.parse(read('tsconfig.test.json'));
  assert.deepEqual(testConfig.include, ['test/**/*.ts']);
  assert.equal(testConfig.compilerOptions.strict, false);
  assert.equal(testConfig.compilerOptions.noCheck, true);
  assert.match(metadata.scripts.typecheck, /^npm run artifacts:prepare/);
  assert.equal(config.compilerOptions.module, 'NodeNext');
  assert.equal(config.compilerOptions.moduleResolution, 'NodeNext');
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.verbatimModuleSyntax, true);
  assert.equal(config.compilerOptions.erasableSyntaxOnly, true);
  assert.equal(config.compilerOptions.allowImportingTsExtensions, true);
});

test('TypeScript production source has a low-cost affected verification owner', () => {
  const typecheck: any = verificationSteps.find((step: any) => step.id === 'typecheck');
  assert.ok(typecheck);
  assert.deepEqual(typecheck.profiles, ['fast', 'candidate', 'core']);
  assert.equal(typecheck.executor.type, 'npm');
  assert.deepEqual(typecheck.executor.args, ['run', 'typecheck']);
  assert.ok(typecheck.inputs.includes('src/**/*.ts'));
  assert.ok(typecheck.inputs.includes('tsconfig.json'));
});

test('CLI identity remains native TypeScript and the old path is retired', () => {
  assert.equal(fs.existsSync('src/bootstrap/cli/identity.ts'), true);
  assert.equal(fs.existsSync('src/bootstrap/cli/identity.mjs'), false);
  assert.match(read('src/bootstrap/cli/registry.ts'), /from '\.\/identity\.ts'/);
});

test('source-tree JavaScript is limited to public facades and compatibility fixtures', () => {
  const scan: any = (directory: any, relative = ''): any[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: any) => {
    if (entry.isDirectory() && ['node_modules', 'targets'].includes(entry.name)) return [];
    const childRelative: any = relative ? `${relative}/${entry.name}` : entry.name;
    const child: any = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return scan(child, childRelative);
    return entry.isFile() && entry.name.endsWith('.mjs') ? [childRelative] : [];
  });
  assert.deepEqual(scan('.').sort(), [
    'bin/buildr.mjs',
    'package/launchers/manage.mjs',
    'test-context.mjs',
    'test/fixtures/node-test-context/host-failure.fixture.mjs',
    'test/fixtures/node-test-context/host-first.fixture.mjs',
    'test/fixtures/node-test-context/host-second.fixture.mjs',
    'test/fixtures/node-test-context/shared-context.mjs',
    'test/fixtures/test-context-consumer/runtime.mjs',
  ]);
});
