import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): string => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const packageManifest = YAML.parse(read('resources/manifest.yml'));

test('能力绑定不再要求Task Environment', () => {
  const triage = packageManifest.builtins.skills.find((item: { id: string }) => item.id === 'task-triage');
  const finish = packageManifest.builtins.skills.find((item: { id: string }) => item.id === 'task-finish');
  assert.ok(triage.requires.some((item: { capability: string }) => item.capability === 'buildr.git-worktree-provider'));
  assert.ok(finish.requires.some((item: { capability: string }) => item.capability === 'buildr.git-worktree-provider'));
  assert.equal(triage.requires.some((item: { capability: string }) => item.capability === 'buildr.task-environment'), false);
  assert.equal(finish.requires.some((item: { capability: string }) => item.capability === 'buildr.task-environment'), false);
  const worktreeBinding = packageManifest.initialSkillBindings.find((item: { capability: string }) => item.capability === 'buildr.git-worktree-provider');
  assert.equal(worktreeBinding.provider, 'task-worktree');
});
