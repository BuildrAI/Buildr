import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { service, source, block, principles, hash, fixture, assertInline, legacy } from '../helpers/inline-core-fixture.ts';



test('managed block upgrades, detects drift, repairs markers and preserves outside bytes', (t: any) => {
  const { workspace }: any = fixture(t);
  const runtime: any = {};
  registerWorkspaceInfrastructure(runtime);
  const start: any = '<!-- buildr:required begin -->';
  const end: any = '<!-- buildr:required end -->';
  for (const [before, after] of [
    ['  user\n\n', block + '\n  user\n\n'],
    [`pre\n${start}old${end}\npost`, `pre\n${block}\npost`],
    [`pre${start}one${end}mid${start}two${end}post`, `pre${block}midpost`],
    [`pre${start}unknown\npost`, block + '\npreunknown\npost'],
    [`pre${end}post`, block + '\nprepost'],
  ]) {
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), before);
    assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, false);
    assert.equal(runtime.ensureRootRequiredBlock(workspace), true);
    assert.equal(fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8'), after);
    assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, true);
    assert.equal(runtime.ensureRootRequiredBlock(workspace), false);
  }
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), block.replace(principles[0], 'drift'));
  assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, false);
});
