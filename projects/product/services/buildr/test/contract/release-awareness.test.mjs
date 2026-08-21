import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.resolve(serviceRoot, '../buildr-web');

function read(relative) {
  return fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
}

test('产品入口 Buildr Skill 与 bootstrap guide 让 Agent 解释 GA/RC 并等待用户选择', () => {
  const skill = read('package/targets/runtime/skills/buildr/SKILL.md');
  const guide = read('docs/bootstrap-guide.md');
  for (const content of [skill, guide]) {
    assert.match(content, /buildr update check --json/);
    assert.match(content, /GA 正式版/);
    assert.match(content, /RC 候选版/);
    assert.match(content, /buildr update --track (?:stable\|candidate|<stable\|candidate>)/);
    assert.match(content, /用户.*选择/);
    assert.match(content, /不得自动切轨或降级/);
  }
});

test('CLI 和 Buildr Web 只暴露明确轨道选择，不提供网页 npm 更新写入口', () => {
  const registry = read('src/bootstrap/cli/registry.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const appLayout = fs.readFileSync(path.join(webRoot, 'src/app/AppLayout.tsx'), 'utf8');
  assert.match(registry, /Usage: buildr update \[--track <stable\|candidate>\] \[--json\]/);
  assert.match(server, /request\.method === 'GET' && pathname === '\/api\/v1\/release-awareness'/);
  assert.doesNotMatch(server, /request\.method === 'POST' && pathname === '\/api\/v1\/release-awareness'/);
  assert.match(appLayout, /data-release-track=\{track\.track\}/);
  assert.match(appLayout, /复制命令/);
  assert.match(appLayout, /交给 Agent/);
  assert.match(appLayout, /不要修改 Workspace 数据或 Agent runtime/);
});
