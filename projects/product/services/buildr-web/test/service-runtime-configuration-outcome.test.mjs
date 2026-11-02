import assert from 'node:assert/strict';
import test from 'node:test';
import { configurationOutcome, runtimeDefinitionSignature } from '../src/features/service-runtime/configurationOutcome.ts';

const definition = {
  source: 'agent',
  verifiedAt: '2026-11-02T00:00:00.000Z',
  path: '/workspace/services/front/runtime.yml',
  local: {
    command: ['node', 'server.mjs'],
    cwd: '.',
    profile: null,
    preferredPort: 3000,
    portOverride: null,
    readiness: { kind: 'log', pattern: 'ready' },
    timeoutSeconds: 30,
  },
};

test('运行定义快照包含验证时间和实际启动配置', () => {
  assert.equal(runtimeDefinitionSignature(null), null);
  assert.equal(runtimeDefinitionSignature(undefined), null);
  const baseline = runtimeDefinitionSignature(definition);
  assert.equal(runtimeDefinitionSignature({ ...definition }), baseline);
  assert.notEqual(runtimeDefinitionSignature({ ...definition, verifiedAt: '2026-11-02T01:00:00.000Z' }), baseline);
  assert.notEqual(runtimeDefinitionSignature({ ...definition, local: { ...definition.local, preferredPort: 3001 } }), baseline);
});

test('首次配置完成必须同时满足执行结束和运行定义可读', () => {
  const outcome = configurationOutcome({ serviceName: '前端', runStatus: 'completed', definition, definitionDiagnostic: null, baseline: null });
  assert.equal(outcome.tone, 'success');
  assert.match(outcome.title, /运行配置已完成/);
  assert.match(outcome.description, /可以启动本地运行/);
  assert.match(outcome.description, /实际启动与业务验证结果/);
});

test('执行未正常结束但定义已保存时不能宣称完成', () => {
  const outcome = configurationOutcome({ serviceName: '前端', runStatus: 'failed', definition, definitionDiagnostic: null, baseline: null });
  assert.equal(outcome.tone, 'warning');
  assert.match(outcome.title, /已保存，执行未完成/);
  assert.match(outcome.description, /验证范围和剩余事项/);
});

test('已有配置检查未变化时说明配置仍可用', () => {
  const outcome = configurationOutcome({
    serviceName: '前端', runStatus: 'completed', definition, definitionDiagnostic: null,
    baseline: runtimeDefinitionSignature(definition),
  });
  assert.equal(outcome.tone, 'info');
  assert.match(outcome.title, /检查完成/);
  assert.match(outcome.description, /运行定义未变化/);
});

test('已有配置检查被中止但定义未变化时保留原配置事实', () => {
  const outcome = configurationOutcome({
    serviceName: '前端', runStatus: 'stopped', definition, definitionDiagnostic: null,
    baseline: runtimeDefinitionSignature(definition),
  });
  assert.equal(outcome.tone, 'warning');
  assert.match(outcome.title, /检查未完成/);
  assert.match(outcome.description, /现有配置仍可继续使用/);
});

test('执行结束但没有可用运行时明确说明未完成和读取诊断', () => {
  const outcome = configurationOutcome({
    serviceName: '前端', runStatus: 'completed', definition: null,
    definitionDiagnostic: '运行定义缺少 local.command', baseline: null,
  });
  assert.equal(outcome.tone, 'warning');
  assert.match(outcome.title, /尚未完成/);
  assert.match(outcome.description, /仍未读到可用的运行定义：运行定义缺少 local\.command/);
});
