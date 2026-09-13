import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { resolveSkillCapabilityGraph } from '../../src/modules/agent-assets/persistence/capability-graph-repository.ts';

test('Git provider 不可用且工作目录未提交、无上游时仍可创建和激活任务', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-pre-create-git-'));
  try {
    const runtime = createRuntime();
    runtime.initBuildr(['--target', root, '--name', 'pre-create-git', '--description', 'Capability graph fixture', '--profile', 'personal']);
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
    const git = (...args: string[]) => {
      const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    git('init', '--initial-branch=fixture');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    fs.writeFileSync(path.join(root, 'owned.txt'), 'committed\n');
    git('add', 'owned.txt');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    fs.writeFileSync(path.join(root, 'owned.txt'), 'keep local edit\n');
    const head = git('rev-parse', 'HEAD');
    const index = fs.readFileSync(path.join(root, '.git/index'));
    assert.equal(git('remote'), '');
    const created = runtime.createTask(root, { taskId: 'direct', title: '直接登记', intent: '保留工作现场' });
    assert.equal(created.record.status, 'active');
    const todo = runtime.createTask(root, { taskId: 'planned', title: '启动待办', intent: '明确目标', status: 'todo' });
    const activated = runtime.activateTask(root, 'planned', { expectedRecordDigest: todo.recordDigest });
    assert.equal(activated.record.status, 'active');
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.equal(git('remote'), '');
    assert.equal(fs.readFileSync(path.join(root, 'owned.txt'), 'utf8'), 'keep local edit\n');
    assert.deepEqual(fs.readFileSync(path.join(root, '.git/index')), index);

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
