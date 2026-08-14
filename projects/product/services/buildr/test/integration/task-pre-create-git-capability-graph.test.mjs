import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { resolveSkillCapabilityGraph } from '../../src/infrastructure/runtime/skills/capabilities.mjs';

test('task-triage 的 Git Operations provider 不 ready 只降级创建前依赖', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-pre-create-git-'));
  try {
    createRuntime().initBuildr(['--target', root, '--name', 'pre-create-git', '--description', 'Capability graph fixture', '--profile', 'personal']);
    const file = path.join(root, 'skills/manifest.yml');
    const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
    manifest.skills.find((item) => item.id === 'git-operations').state = 'uninstalled';
    fs.writeFileSync(file, YAML.stringify(manifest, { lineWidth: 0 }));
    const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
    const consumer = graph.consumers.find((item) => item.consumer === 'task-triage');
    const gitDependency = consumer.dependencies.find((item) => item.capability === 'buildr.git-operations');
    const taskDependency = consumer.dependencies.find((item) => item.capability === 'buildr.task-record');
    assert.equal(consumer.readiness, 'degraded');
    assert.equal(gitDependency.readiness, 'degraded');
    assert.equal(taskDependency.readiness, 'ready');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
