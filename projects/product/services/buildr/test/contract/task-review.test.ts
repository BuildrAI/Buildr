import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';

const read: any = (relative: any) => fs.readFileSync(path.resolve(relative), 'utf8');

test('task-review contract/provider/binding 以一个能力支持两种参数化 Result', () => {
  const manifest: any = YAML.parse(read('resources/manifest.yml'));
  const contract: any = manifest.capabilityContracts.find((item: any) => item.id === 'buildr.task-review' && item.version === 2);
  assert.ok(contract);
  assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-review');
  assert.deepEqual(manifest.initialSkillBindings.find((item: any) => item.capability === 'buildr.task-review'), { capability: 'buildr.task-review', version: 2, provider: 'task-review' });
  const provider: any = manifest.builtins.skills.find((item: any) => item.id === 'task-review');
  assert.equal(provider.required, false);
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-review', version: 2 }]);
  assert.equal(manifest.capabilityContracts.some((item: any) => /(?:planning|completion)[.-]review|task-review-(?:planning|completion)/i.test(item.id)), false);
});

test('Task Review 与纯复盘 Skill 职责独立且都不成为 Finish 依赖', () => {
  const manifest: any = YAML.parse(read('resources/manifest.yml'));
  const review: any = manifest.builtins.skills.find((item: any) => item.id === 'task-review');
  const retrospective: any = manifest.builtins.skills.find((item: any) => item.id === 'task-retrospective');
  const finish: any = manifest.builtins.skills.find((item: any) => item.id === 'task-finish');
  assert.deepEqual(review.provides, [{ capability: 'buildr.task-review', version: 2 }]);
  assert.deepEqual(retrospective.provides || [], []);
  assert.ok(retrospective.requires.some((item: any) => item.capability === 'buildr.task-record' && item.version === 4));
  assert.equal(manifest.builtins.skills.some((item: any) => item.id === 'task-development'), false);
  assert.equal(finish.requires.some((item: any) => item.capability === 'buildr.task-review'), false);
  assert.equal(finish.requires.some((item: any) => /retrospective|asset-review/.test(item.capability)), false);
});

test('Task Review Application 是唯一 repository writer caller', () => {
  const sourceRoot: any = path.resolve('src');
  const callers: any[] = [];
  const visit: any = (directory: any) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file: any = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/static-validation\.(?:mjs|ts)$/.test(file)) continue;
      else if (/\.(?:mjs|js|ts)$/.test(entry.name) && /\.writeTaskReviewResultPersistence!?\(/.test(fs.readFileSync(file, 'utf8'))) callers.push(path.relative(sourceRoot, file).split(path.sep).join('/'));
    }
  };
  visit(sourceRoot);
  assert.deepEqual(callers, ['modules/task/application/task-review-application.ts']);
});
