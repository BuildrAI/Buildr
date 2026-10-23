import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeDefinition, renderRuntimeDefinition, RuntimeDefinitionError } from '../../src/modules/service-runtime/domain/runtime-definition.ts';

const valid = `version: 1
source: agent
verifiedAt: '2026-10-21T14:02:00+08:00'
local:
  command: [node, server.js]
  cwd: app
  profile: local
  preferredPort: 8080
  portOverride: --port
  readiness:
    kind: log
    pattern: Started App
  timeoutSeconds: 180
`;

test('解析与渲染本地定义，保留已验证前端连接声明', () => {
  const definition = parseRuntimeDefinition(valid + `  backend:
    serviceCode: business
    environmentVariable: VITE_PROXY_URL
    remoteUrl: https://test.example/api
`);
  assert.deepEqual(definition.local.backends, [{ serviceCode: 'business', environmentVariable: 'VITE_PROXY_URL', remoteUrl: 'https://test.example/api' }]);
  assert.deepEqual(parseRuntimeDefinition(renderRuntimeDefinition(definition)), definition);
});

test('多后端声明列表逐项解析，渲染为同一列表形态', () => {
  const definition = parseRuntimeDefinition(valid + `  backends:
    - serviceCode: business
      environmentVariable: VITE_PROXY_URL
      remoteUrl: https://test.example/api
    - serviceCode: upms
      environmentVariable: UPMS_URL
      remoteUrl: https://test.example/upms
`);
  assert.equal(definition.local.backends?.length, 2);
  assert.equal(definition.local.backends?.[1]?.serviceCode, 'upms');
  assert.deepEqual(parseRuntimeDefinition(renderRuntimeDefinition(definition)), definition);
});

test('拒绝重复的后端服务、重复的注入变量与新旧字段并存', () => {
  for (const extra of [
    `  backends:\n    - serviceCode: business\n      environmentVariable: A_URL\n      remoteUrl: https://test.example/a\n    - serviceCode: business\n      environmentVariable: B_URL\n      remoteUrl: https://test.example/b\n`,
    `  backends:\n    - serviceCode: business\n      environmentVariable: SAME_URL\n      remoteUrl: https://test.example/a\n    - serviceCode: upms\n      environmentVariable: SAME_URL\n      remoteUrl: https://test.example/b\n`,
    `  backend: { serviceCode: business, environmentVariable: A_URL, remoteUrl: https://test.example/a }\n  backends: [{ serviceCode: upms, environmentVariable: B_URL, remoteUrl: https://test.example/b }]\n`,
  ]) assert.throws(() => parseRuntimeDefinition(valid + extra), RuntimeDefinitionError);
});

test('旧部署字段即使损坏也忽略，不要求修复退役配置', () => {
  for (const legacy of ['environments: broken\n', 'environments:\n  qa:\n    connectionId: null\n', 'environments: [unknown]\n']) {
    const parsed = parseRuntimeDefinition(valid + legacy);
    assert.equal(parsed.local.preferredPort, 8080);
    assert.equal('environments' in parsed, false);
    assert.doesNotMatch(renderRuntimeDefinition(parsed), /environments/);
  }
});

test('拒绝未知来源、目录逃逸、非法端口和就绪声明', () => {
  for (const content of [valid.replace('source: agent', 'source: manual'), valid.replace('cwd: app', 'cwd: /etc'), valid.replace('cwd: app', 'cwd: ../outside'), valid.replace('preferredPort: 8080', 'preferredPort: 70000'), valid.replace('kind: log', 'kind: tcp')]) assert.throws(() => parseRuntimeDefinition(content), RuntimeDefinitionError);
});

test('前端连接只接受服务编号、显式环境变量和无认证的网页地址', () => {
  for (const backend of [
    { serviceCode: '../other', environmentVariable: 'VITE_PROXY_URL', remoteUrl: 'https://test.example' },
    { serviceCode: 'business', environmentVariable: 'A=B', remoteUrl: 'https://test.example' },
    { serviceCode: 'business', environmentVariable: 'VITE_PROXY_URL', remoteUrl: 'https://user:secret@test.example' },
    { serviceCode: 'business', environmentVariable: 'VITE_PROXY_URL', remoteUrl: 'file:///tmp/a' },
  ]) assert.throws(() => parseRuntimeDefinition(valid + `  backend: ${JSON.stringify(backend)}\n`), RuntimeDefinitionError);
  for (const backend of [
    { serviceCode: 'business', environmentVariable: 'VITE_PROXY_URL', remoteUrl: 'notaurl' },
  ]) assert.throws(() => parseRuntimeDefinition(valid + `  backends: [${JSON.stringify(backend)}]\n`), RuntimeDefinitionError);
});
