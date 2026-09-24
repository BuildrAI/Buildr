import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');
const WORKSPACE_TARGET: any = path.join(SERVICE_ROOT, 'resources', 'workspace');
const manifest: any = YAML.parse(fs.readFileSync(path.join(SERVICE_ROOT, 'resources/manifest.yml'), 'utf8'));

test('直接 Git 与 Formal Task Finish 保持两个可解析 capability 入口', () => {
  const git: any = manifest.builtins.skills.find((item: any) => item.id === 'git-operations');
  const finish: any = manifest.builtins.skills.find((item: any) => item.id === 'task-finish');
  assert.deepEqual(git.provides, [{ capability: 'buildr.git-operations', version: 1 }]);
  assert.deepEqual(finish.provides, [{ capability: 'buildr.task-finish', version: 1 }]);
  assert.equal(parseCapabilityContract(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/git-operations/v1.md')).id, 'buildr.git-operations');
  assert.equal(parseCapabilityContract(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/task-finish/v1.md')).id, 'buildr.task-finish');
  assert.ok(finish.requires.some((item: any) => item.capability === 'buildr.git-operations' && item.mode === 'optional'));
});

test('Task Triage 的正式 owner 依赖保持 optional，直接工作不被结构性绑定扩大为通用许可', () => {
  const triage: any = manifest.builtins.skills.find((item: any) => item.id === 'task-triage');
  for (const capability of [
    'buildr.task-record',
    'buildr.git-operations',
    'buildr.git-worktree-provider',
  ]) {
    assert.ok(triage.requires.some((item: any) => item.capability === capability && item.mode === 'optional'), capability);
  }
  assert.equal(triage.requires.some((item: any) => item.capability === 'buildr.task-environment'), false);
});

test('明确收尾指令触发 task-finish 并授权任务范围内常规 Git 交付', () => {
  const read = (relative: string) => fs.readFileSync(path.join(SERVICE_ROOT, relative), 'utf8');
  const coreRule = read('resources/workspace/AGENTS.md');
  const finishSkill = read('resources/workspace/skills/buildr/task-finish/SKILL.md');
  const gitSkill = read('resources/workspace/skills/buildr/git-operations/SKILL.md');
  const finishContract = read('resources/workspace/skills/contracts/buildr/task-finish/v1.md');
  const gitContract = read('resources/workspace/skills/contracts/buildr/git-operations/v1.md');
  const finish = manifest.builtins.skills.find((item: { id: string }) => item.id === 'task-finish');

  assert.equal(finishSkill.match(/^description:\s*(.+)$/m)?.[1], finish.description);
  assert.match(finish.description, /明确要求“收尾”/);
  for (const source of [coreRule, finishSkill, finishContract, gitSkill, gitContract]) {
    assert.match(source, /“收尾”/);
    assert.match(source, /常规.*提交、集成和普通推送/);
    assert.match(source, /不.*重复询问|不.*逐项重述|不重复索取|不要求用户再逐项重复|不让提供者重新索取/);
  }
  assert.match(finishSkill, /当前任务.*授权.*所选 `git-operations`/);
});

test('收尾授权保留范围核验和额外副作用边界', () => {
  const read = (relative: string) => fs.readFileSync(path.join(SERVICE_ROOT, relative), 'utf8');
  const sources = [
    read('resources/workspace/AGENTS.md'),
    read('resources/workspace/skills/buildr/task-finish/SKILL.md'),
    read('resources/workspace/skills/buildr/git-operations/SKILL.md'),
    read('resources/workspace/skills/contracts/buildr/task-finish/v1.md'),
    read('resources/workspace/skills/contracts/buildr/git-operations/v1.md'),
  ];
  for (const source of sources) {
    assert.match(source, /范围/);
    assert.match(source, /强推|force push/);
    assert.match(source, /共享历史/);
    assert.match(source, /语义冲突/);
  }
  assert.match(sources[1], /完整推送范围/);
  assert.match(sources[2], /完整 commit range/);
  assert.match(sources[2], /scope 外 unpublished commit/);
});
