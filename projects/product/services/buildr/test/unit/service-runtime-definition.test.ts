import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeDefinition, renderRuntimeDefinition, RuntimeDefinitionError } from '../../src/modules/service-runtime/domain/runtime-definition.ts';

const valid = `version: 1
source: agent
verifiedAt: '2026-10-21T14:02:00+08:00'
local:
  command: [mvnd, -pl, saas-freshx-biz, spring-boot:run]
  cwd: saas-freshx-biz
  profile: local
  preferredPort: 8080
  portOverride: --server.port
  readiness:
    kind: log
    pattern: Started FreshXApplication
  timeoutSeconds: 180
environments:
  qa:
    connectionId: jixian-yunque
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-QA
    integrationBranch: dev-pigs
`;

test('解析合法运行定义', () => {
  const definition = parseRuntimeDefinition(valid);
  assert.equal(definition.source, 'agent');
  assert.deepEqual(definition.local.command, ['mvnd', '-pl', 'saas-freshx-biz', 'spring-boot:run']);
  assert.equal(definition.local.preferredPort, 8080);
  assert.deepEqual(definition.local.readiness, { kind: 'log', pattern: 'Started FreshXApplication' });
  assert.equal(definition.environments.qa?.integrationBranch, 'dev-pigs');
});

test('环境集合由运行定义登记，可增加其他环境', () => {
  const definition = parseRuntimeDefinition(valid + `  prod:
    connectionId: jixian-yunque
    program: deploy
    args: [--env, prod]
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-PROD
    integrationBranch: main
    timeoutSeconds: 300
`);
  assert.deepEqual(Object.keys(definition.environments).sort(), ['prod', 'qa']);
  assert.equal(definition.environments.prod?.targetRef, 'JX-FRESHX-PIGS-PROD');
  assert.equal(definition.environments.prod?.timeoutSeconds, 300);
});

test('拒绝非法环境编号', () => {
  const invalid = valid + `  Prod_QA:
    connectionId: jixian-yunque
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-PROD
    integrationBranch: main
`;
  assert.throws(() => parseRuntimeDefinition(invalid), (error: unknown) => error instanceof RuntimeDefinitionError && error.problems.some(item => item.includes('Prod_QA')));
});

test('渲染后可再次解析', () => {
  const definition = parseRuntimeDefinition(valid);
  const reparsed = parseRuntimeDefinition(renderRuntimeDefinition(definition));
  assert.deepEqual(reparsed, definition);
});

test('拒绝手动来源与非法字段', () => {
  const manual = valid.replace('source: agent', 'source: manual');
  assert.throws(() => parseRuntimeDefinition(manual), (error: unknown) => error instanceof RuntimeDefinitionError && error.problems.some(item => item.includes('source')));
  const absolute = valid.replace('cwd: saas-freshx-biz', 'cwd: /etc');
  assert.throws(() => parseRuntimeDefinition(absolute), RuntimeDefinitionError);
  const port = valid.replace('preferredPort: 8080', 'preferredPort: 70000');
  assert.throws(() => parseRuntimeDefinition(port), RuntimeDefinitionError);
  const readiness = valid.replace(/readiness:\n\s+kind: log\n\s+pattern: .*\n/, 'readiness:\n    kind: tcp\n');
  assert.throws(() => parseRuntimeDefinition(readiness), RuntimeDefinitionError);
  const qa = valid.replace('connectionId: jixian-yunque', 'connectionId: ""');
  assert.throws(() => parseRuntimeDefinition(qa), RuntimeDefinitionError);
});

test('环境集合可省略', () => {
  const definition = parseRuntimeDefinition(valid.replace(/environments:\n(?: +.*\n)+/, ''));
  assert.deepEqual(definition.environments, {});
});
