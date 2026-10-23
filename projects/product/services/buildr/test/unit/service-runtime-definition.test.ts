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

test('远程环境独立于完整后端清单，保留变量且拒绝重复环境与含业务路径的网关', () => {
  const input = valid + '  remoteEnvironments:\n    - code: qa\n      name: 测试环境\n      url: https://gateway.example.com\n      variables: {API_BASE: https://gateway.example.com}\n';
  const definition = parseRuntimeDefinition(input);
  assert.equal(definition.local.backends, undefined); assert.equal(definition.local.remoteEnvironments?.[0]?.variables.API_BASE, 'https://gateway.example.com');
  assert.deepEqual(parseRuntimeDefinition(renderRuntimeDefinition(definition)), definition);
  assert.throws(() => parseRuntimeDefinition(input.replace('url: https://gateway.example.com', 'url: https://gateway.example.com/service')), RuntimeDefinitionError);
  assert.throws(() => parseRuntimeDefinition(input + '    - code: qa\n      name: 重复\n'), RuntimeDefinitionError);
});

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

const routing = {
  serviceId: 'caller-app', environmentVariable: 'LOCAL_SERVICE_ROUTING_FILE',
  format: 'buildr.local-service-routing/v1', observationPath: '/actuator/local-service-routing',
};
const discovery = { kind: 'service-discovery', serviceCode: 'business', serviceId: 'business-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
const lane = () => valid.replace('version: 1', 'version: 2') + `  routing: ${JSON.stringify(routing)}\n  backends: [${JSON.stringify(discovery)}]\n`;

test('版本 2 将自身发现名称、观察入口与发现目标完整往返，不制造 URL', () => {
  const parsed = parseRuntimeDefinition(lane());
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.local.routing, routing);
  assert.deepEqual(parsed.local.backends, [discovery]);
  assert.deepEqual(parseRuntimeDefinition(renderRuntimeDefinition(parsed)), parsed);
  assert.doesNotMatch(renderRuntimeDefinition(parsed), /remoteUrl/);
  assert.equal(parsed.verifiedAt, parseRuntimeDefinition(valid).verifiedAt);
});

test('发现声明拒绝错误回落、任意地址、自身名称缺失及不安全观察路径', () => {
  for (const content of [
    lane().replace('version: 2', 'version: 1'),
    lane().replace('"context":"qa"', '"context":"other-task"'),
    lane().replace('"kind":"service-discovery"', '"kind":"service-discovery","url":"http://other.invalid"'),
    lane().replace('"serviceId":"caller-app",', ''),
    lane().replace('/actuator/local-service-routing', '//other.invalid/read'),
    lane().replace('/actuator/local-service-routing', '/safe/../outside'),
    lane().replace('  routing:', '  missing-routing:'),
  ]) assert.throws(() => parseRuntimeDefinition(content), RuntimeDefinitionError);
});

test('版本 2 混合声明保持直接地址类型，并拒绝发现名称或变量冲突', () => {
  const direct = { kind: 'direct-url', serviceCode: 'web-backend', environmentVariable: 'PROXY_URL', remoteUrl: 'https://qa.example' };
  const mixed = lane().replace(`[${JSON.stringify(discovery)}]`, JSON.stringify([discovery, direct]));
  assert.deepEqual(parseRuntimeDefinition(renderRuntimeDefinition(parseRuntimeDefinition(mixed))), parseRuntimeDefinition(mixed));
  for (const backends of [
    [discovery, { ...discovery, serviceCode: 'another' }],
    [discovery, { ...direct, environmentVariable: routing.environmentVariable }],
    [{ ...direct, kind: undefined }],
  ]) assert.throws(() => parseRuntimeDefinition(lane().replace(`[${JSON.stringify(discovery)}]`, JSON.stringify(backends))), RuntimeDefinitionError);
});
