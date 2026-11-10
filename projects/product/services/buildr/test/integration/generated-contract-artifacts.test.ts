import { checkWorkbenchDto, writeWorkbenchDto } from '../../tools/codegen/contracts/workbench-dto.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { checkRuntimeSystemDto, writeRuntimeSystemDto } from '../../tools/codegen/contracts/runtime-system-dto.ts';
import { checkTaskProfessionalHttpDto, writeTaskProfessionalHttpDto } from '../../tools/codegen/contracts/task-professional-dto.ts';
import { checkTaskRecordHttpDto, writeTaskRecordHttpDto } from '../../tools/codegen/contracts/task-dto.ts';
import { checkWorkspaceAgentAssetsDtos, writeWorkspaceAgentAssetsDtos } from '../../tools/codegen/contracts/workspace-agent-assets-dto.ts';

function fixture(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-contract-output-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function generate(root: string): Promise<void> {
  await writeWorkbenchDto(root);
  await writeTaskRecordHttpDto(root);
  await writeTaskProfessionalHttpDto(root);
  await writeRuntimeSystemDto(root);
  await writeWorkspaceAgentAssetsDtos(root);
}

test('repeated contract generation preserves unchanged compiler inputs and replaces only drifted output', async t => {
  const root = fixture(t);
  await generate(root);
  const files = ['buildr', 'buildr-web'].flatMap(service => {
    const directory = path.join(root, service, 'build/generated');
    return fs.readdirSync(directory).map(name => path.join(directory, name));
  });
  for (const file of files) fs.utimesSync(file, 1, 1);
  const before = files.map(file => ({ ...fs.statSync(file), content: fs.readFileSync(file, 'utf8') }));
  await generate(root);
  for (const [index, file] of files.entries()) {
    assert.equal(fs.statSync(file).mtimeMs, before[index]!.mtimeMs, 'identical bytes must not invalidate incremental compilation');
    assert.equal(fs.statSync(file).ino, before[index]!.ino);
    assert.equal(fs.readFileSync(file, 'utf8'), before[index]!.content);
  }
  const changed = files[0]!;
  fs.writeFileSync(changed, 'drifted output');
  const descriptor = fs.openSync(changed, 'r');
  try {
    await generate(root);
    assert.equal(fs.readFileSync(changed, 'utf8'), before[0]!.content);
    assert.equal(fs.readFileSync(descriptor, 'utf8'), 'drifted output', 'an existing reader retains its complete old inode');
    for (const file of files.slice(1)) assert.equal(fs.statSync(file).mtimeMs, 1000);
  } finally { fs.closeSync(descriptor); }
});

test('全部HTTP DTO从空显式目标生成两端闭合输出', async (t) => {
  const root = fixture(t);
  await generate(root);
  const backend = path.join(root, 'buildr/build/generated');
  const web = path.join(root, 'buildr-web/build/generated');
  assert.equal((await checkTaskRecordHttpDto(root)).length, 0);
  assert.equal((await checkWorkbenchDto(root)).length, 0);
  assert.equal((await checkTaskProfessionalHttpDto(root)).length, 0);
  assert.equal((await checkRuntimeSystemDto(root)).length, 0);
  assert.equal((await checkWorkspaceAgentAssetsDtos(root)).length, 0);
  const manifest = createGeneratedArtifactManifest({
    inputs: { schemas: 'current' },
    artifacts: [{ id: 'backend-dto', root: backend }, { id: 'web-dto', root: web }],
  });
  // Keep the complete output inventory of the five registered generator families closed.
  const expectedFiles = [
    'agent-assets-http-dto.ts',
    'agent-service-http-dto.ts',
    'code-generation-http-dto.ts',
    'code-http-dto.ts',
    'knowledge-http-dto.ts',
    'runtime-system-http-dto.ts',
    'task-dto.ts',
    'task-professional-http-dto.ts',
    'workbench-dto.ts',
    'workspace-http-dto.ts',
  ];
  for (const artifact of manifest.artifacts) assert.deepEqual(artifact.files.map(file => file.path).sort(), expectedFiles);
  for (const directory of [backend, web]) {
    const knowledgeDto = fs.readFileSync(path.join(directory, 'knowledge-http-dto.ts'), 'utf8');
    assert.match(knowledgeDto, /export interface Knowledge_NavigationResponse/);
    assert.match(knowledgeDto, /entryObject: string \| null/);
    assert.match(knowledgeDto, /artifactCount: number/);
    assert.match(knowledgeDto, /entryObject\?: string/);
  }
});

test('相同Schema向两个全新目标生成相同DTO清单', async (t) => {
  const root = fixture(t);
  const left = path.join(root, 'left');
  const right = path.join(root, 'right');
  await generate(left);
  await generate(right);
  const manifest = (target: string) => createGeneratedArtifactManifest({
    inputs: { schemas: 'current' },
    artifacts: [
      { id: 'backend-dto', root: path.join(target, 'buildr/build/generated') },
      { id: 'web-dto', root: path.join(target, 'buildr-web/build/generated') },
    ],
  });
  assert.deepEqual(manifest(left), manifest(right));
});
