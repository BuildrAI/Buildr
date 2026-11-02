import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeChange } from '../../src/process/runtime-change.ts';
import { readProcessInstances, writeProcessInstance } from '../../src/process/ownership.ts';
import type { ProcessRecord } from '../../src/process/ownership.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('backend provenance distinguishes content changes and restarts without inventing an initial update', () => {
  const previous = { identity: { generation: '00000000-0000-0000-0000-000000000001', runtime: { digest: 'before' } } } as ProcessRecord;
  assert.equal(runtimeChange(undefined, 'after', 'time'), undefined);
  assert.equal(runtimeChange(previous, 'before', 'time')?.reason, 'process-restarted');
  assert.deepEqual(runtimeChange(previous, 'after', 'time'), { reason: 'runtime-content-changed', detectedAt: 'time', fromGeneration: previous.identity.generation, fromDigest: 'before', toDigest: 'after' });
});

test('backend provenance survives the existing private instance persistence', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-change-'));
  try {
    const record={identity:{dataRoot:root,generation:'00000000-0000-0000-0000-000000000001',runtime:{digest:'before'}},origin:'local',token:'test-only'} as ProcessRecord;
    record.backendChange=runtimeChange(record,'after','time');
    writeProcessInstance(root,record);
    assert.deepEqual(readProcessInstances(root)[0].backendChange,record.backendChange);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
