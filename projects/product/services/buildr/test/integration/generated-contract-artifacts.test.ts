import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { checkRuntimeSystemDto, writeRuntimeSystemDto } from '../../tools/contracts/runtime-system-dto.ts';
import { checkTaskProfessionalHttpDto, writeTaskProfessionalHttpDto } from '../../tools/contracts/task-professional-dto.ts';
import { checkTaskRecordHttpDto, writeTaskRecordHttpDto } from '../../tools/contracts/task-record-dto.ts';
import { checkWorkspaceAgentAssetsDtos, writeWorkspaceAgentAssetsDtos } from '../../tools/contracts/workspace-agent-assets-dto.ts';

function fixture(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-contract-output-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function generate(root: string): Promise<void> {
  await writeTaskRecordHttpDto(root);
  await writeTaskProfessionalHttpDto(root);
  await writeRuntimeSystemDto(root);
  await writeWorkspaceAgentAssetsDtos(root);
}

test('全部HTTP DTO从空显式目标生成两端闭合输出', async (t) => {
  const root = fixture(t);
  await generate(root);
  const backend = path.join(root, 'buildr/src');
  const web = path.join(root, 'buildr-web/src');
  assert.equal((await checkTaskRecordHttpDto(root)).length, 0);
  assert.equal((await checkTaskProfessionalHttpDto(root)).length, 0);
  assert.equal((await checkRuntimeSystemDto(root)).length, 0);
  assert.equal((await checkWorkspaceAgentAssetsDtos(root)).length, 0);
  const manifest = createGeneratedArtifactManifest({
    inputs: { schemas: 'current' },
    artifacts: [{ id: 'backend-dto', root: backend }, { id: 'web-dto', root: web }],
  });
  assert.equal(manifest.artifacts[0].files.length, 5);
  assert.equal(manifest.artifacts[1].files.length, 5);
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
      { id: 'backend-dto', root: path.join(target, 'buildr/src') },
      { id: 'web-dto', root: path.join(target, 'buildr-web/src') },
    ],
  });
  assert.deepEqual(manifest(left), manifest(right));
});
