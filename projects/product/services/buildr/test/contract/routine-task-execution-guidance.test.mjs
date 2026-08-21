import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const triage = read('resources/workspace/skills/buildr/task-triage/SKILL.md');
const development = read('resources/workspace/skills/buildr/task-development/SKILL.md');
const verification = read('resources/workspace/skills/buildr/task-verification/SKILL.md');
const retrospective = read('resources/workspace/skills/buildr/task-retrospective/SKILL.md');
const proposeSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');
const applySidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md');
const syncSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-sync-converge.md');
const archiveSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-archive-converge.md');
const contractGuard = read('resources/workspace/skills/buildr/openspec-contract-guard/SKILL.md');
const cliRegistry = read('src/bootstrap/cli/registry.mjs');
const cliReference = read('docs/cli-reference.md');
const overview = read('../../openspec/knowledge/overview.md');
const serviceKnowledge = read('../../openspec/knowledge/services/buildr.md');

test('日常正式任务按当前动作渐进装配上下文并复用有界 source map', () => {
  for (const required of [
    '按 next executable action 渐进装配上下文',
    'Verification、Completion、Finish 等下游阶段只在成为当前动作时再读取',
    '立即进入 proposal 或当前首个研发动作',
    '一次有界 authority source map',
    '只有 scope、authority 或相关事实变化时才增量刷新',
  ]) assert.ok(triage.includes(required), `task-triage must include ${required}`);

  for (const required of [
    '## 阶段化上下文与效率边界',
    '不在 proposal 前一次性预读整个生命周期',
    '复用 triage 建立的一次有界 authority source map',
    '不写入 Receipt 或其他产品 store',
  ]) assert.ok(development.includes(required), `task-development must include ${required}`);
});

test('计划预览只帮助选择范围且不替代正式 Verification authority', () => {
  for (const required of [
    '`plan-only` / `dry-run` affected plan',
    '通用Skill不发明或硬编码Project专用命令',
    '计划预览不是 Verification Execution Evidence、Result fact或 capability execution',
    '按exact invocation语义复用既有正式Execution Record',
    'Task Verification Application的current Result authority',
  ]) assert.ok(verification.includes(required), `task-verification must include ${required}`);
  assert.doesNotMatch(verification, /npm run (?:--silent )?test:changed/);
  assert.match(serviceKnowledge, /npm run test:changed -- --base <ref> --json/);
  assert.match(serviceKnowledge, /只返回计划且不执行测试/);
  assert.match(serviceKnowledge, /不能替代正式 Verification evidence/);
});

test('效率指标只进入复盘参考而不成为产品门禁', () => {
  for (const required of [
    '`task-retrospective` 跟踪、评估和优化的参考',
    '不进入专业 Result、Development gate、Task status、Candidate identity',
    '不构成 pass/fail threshold',
  ]) assert.ok(development.includes(required), `task-development must include ${required}`);
  assert.match(overview, /效率指标只供 Task Retrospective 跟踪、评估和优化/);
  assert.match(overview, /不形成新的 Result、gate 或进度 authority/);
  assert.match(retrospective, /用户或团队给出的同类任务耗时参考区间/);
  assert.match(retrospective, /不把它固化为通用产品阈值、Result字段、gate、pass\/fail标准或自动缩减验证范围/);
  assert.doesNotMatch(retrospective, /12\s*[–-]\s*18\s*分钟/);
});

test('OpenSpec checklist 自检就近执行且converge只指向Task execution root', () => {
  for (const sidebar of [proposeSidebar, applySidebar]) {
    assert.match(sidebar, /立即/);
    assert.match(sidebar, /checkbox/);
    assert.match(sidebar, /convergence\/archive前完成/);
    assert.match(sidebar, /不为.*预读完整下游流程/);
  }
  for (const surface of [syncSidebar, archiveSidebar, contractGuard, cliRegistry, cliReference]) {
    assert.match(surface, /<task-execution-root>/);
    assert.match(surface, /execution\.workdir/);
  }
  for (const sidebar of [syncSidebar, archiveSidebar]) {
    assert.doesNotMatch(sidebar, /openspec converge[^\n]*--target <workspace>/);
    assert.match(sidebar, /不得把canonical Workspace当作target/);
    assert.match(sidebar, /自动搜索其他worktree/);
  }
});

test('Verification retry说明只出现在exact identity决策点', () => {
  assert.match(verification, /同一exact invocation独立新执行/);
  assert.match(verification, /该决策点说明一次并显式追加`--retry`/);
  assert.match(verification, /按新identity正常创建首次执行/);
  assert.match(verification, /不重复播报“未传`--retry`”/);
});
