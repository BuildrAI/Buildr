import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { resolveSkillCapabilityGraph } from '../../src/agent-assets/infrastructure/runtime/skills/capabilities.ts';

test('task-triage 的 Git Operations provider 不 ready 只降级创建前依赖', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-pre-create-git-'));
  try {
    createRuntime().initBuildr(['--target', root, '--name', 'pre-create-git', '--description', 'Capability graph fixture', '--profile', 'personal']);
    const file: any = path.join(root, 'skills/manifest.yml');
    const manifest: any = YAML.parse(fs.readFileSync(file, 'utf8'));
    manifest.skills.find((item: any) => item.id === 'git-operations').state = 'uninstalled';
    fs.writeFileSync(file, YAML.stringify(manifest, { lineWidth: 0 }));
    const graph: any = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
    const consumer: any = graph.consumers.find((item: any) => item.consumer === 'task-triage');
    const gitDependency: any = consumer.dependencies.find((item: any) => item.capability === 'buildr.git-operations');
    const taskDependency: any = consumer.dependencies.find((item: any) => item.capability === 'buildr.task-record');
    assert.equal(consumer.readiness, 'degraded');
    assert.equal(gitDependency.readiness, 'degraded');
    assert.equal(taskDependency.readiness, 'ready');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
