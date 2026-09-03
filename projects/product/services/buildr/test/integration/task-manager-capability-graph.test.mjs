import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { resolveSkillCapabilityGraph } from '../../src/agent-assets/infrastructure/runtime/skills/capabilities.ts';

test('task-triage 的 optional provider 不 ready 只降级依赖，不让其他分支伪造成功', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-manager-graph-'));
  try {
    createRuntime().initBuildr(['--target', root, '--name', 'task-manager-graph', '--description', 'Capability graph fixture', '--profile', 'personal']);
    const file = path.join(root, 'skills', 'manifest.yml');
    const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
    manifest.skills.find((item) => item.id === 'task-manager').state = 'uninstalled';
    fs.writeFileSync(file, YAML.stringify(manifest, { lineWidth: 0 }));
    const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
    const triage = graph.consumers.find((item) => item.consumer === 'task-triage');
    const dependency = triage.dependencies.find((item) => item.capability === 'buildr.task-record');
    assert.equal(triage.readiness, 'degraded');
    assert.equal(dependency.readiness, 'degraded');
    assert.equal(dependency.reason, 'invalid_binding');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
