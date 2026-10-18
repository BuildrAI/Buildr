import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { verificationSteps } from '../verification/registry.ts';

const read: any = (relative: any) => fs.readFileSync(relative, 'utf8');

test('TypeScript execution foundation is strict, no-emit, and development-only', () => {
  const metadata: any = JSON.parse(read('package.json'));

  const config: any = JSON.parse(read('tsconfig.json'));

  assert.equal(metadata.dependencies.typescript, undefined);
  assert.equal(metadata.dependencies['@types/node'], undefined);
  assert.deepEqual(config.include, ['src/**/*.ts', 'tools/**/*.ts', '../../../../skills/buildr-release/scripts/**/*.ts']);
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

test('release Skill TypeScript retains its private module owner inside the source scripts', () => {
  const releaseSkill = '../../../../skills/buildr-release';
  const metadata: any = JSON.parse(read(`${releaseSkill}/scripts/package.json`));
  assert.equal(metadata.private, true);
  assert.equal(metadata.type, 'module');
  assert.equal(fs.existsSync(`${releaseSkill}/package.json`), false, 'module metadata belongs inside the Skill scripts, not the Skill root');
  assert.equal(fs.existsSync(`${releaseSkill}/scripts/release-orchestration-runner.ts`), true);
  assert.equal(fs.existsSync(['tools', 'release', 'release-orchestration-runner.ts'].join('/')), false, 'the previous release entry must not return to the product tools namespace');
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
