import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASK_DEVELOPMENT_ACTIONS,
  taskDevelopmentActionContract,
  taskDevelopmentActionFields,
  taskDevelopmentActionRequiredFields,
  taskDevelopmentDriverExample,
  taskDevelopmentDriverSchema,
} from '../../src/task/application/task-development-operation-contracts.mjs';

const expectedActions = ['inspect', 'discover', 'begin', 'planning', 'observe', 'knowledge', 'gate', 'freeze', 'decide', 'handoff', 'carrier'];

test('Task Development action contract覆盖全部driver actions并提供closed schema', () => {
  assert.deepEqual(TASK_DEVELOPMENT_ACTIONS, expectedActions);
  for (const action of TASK_DEVELOPMENT_ACTIONS) {
    const contract = taskDevelopmentActionContract(action);
    assert.equal(typeof contract.summary, 'string');
    assert.equal(contract.summary.length > 0, true);
    assert.equal(contract.inputSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(contract.inputSchema.type, 'object');
    assert.equal(contract.inputSchema.additionalProperties, false);
    assert.deepEqual([...taskDevelopmentActionFields(action)], Object.keys(contract.inputSchema.properties));
    assert.deepEqual([...taskDevelopmentActionRequiredFields(action)], contract.inputSchema.required || []);
    for (const field of Object.keys(contract.example)) assert.equal(Object.hasOwn(contract.inputSchema.properties, field), true, `${action}.${field}`);
  }
});

test('schema与example使用稳定发现envelope并区分运行态约束', () => {
  const schema = taskDevelopmentDriverSchema('begin');
  assert.equal(schema.schemaVersion, 'buildr.task-development-driver-schema/v1');
  assert.equal(schema.action, 'begin');
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.deepEqual(schema.inputSchema.required, ['changeDispositions', 'planning']);
  assert.deepEqual(Object.keys(schema.inputSchema.properties), ['changeDispositions', 'planning', 'planningGate']);
  assert.match(schema.runtimeValidation, /Application/);

  const example = taskDevelopmentDriverExample('begin');
  assert.equal(example.schemaVersion, 'buildr.task-development-driver-example/v1');
  assert.deepEqual(example.inputJson, { changeDispositions: [], planning: { targetIdentity: null, nodes: [] } });
  assert.match(example.note, /current/);
  assert.deepEqual(taskDevelopmentDriverExample('inspect').inputJson, {});
  assert.deepEqual(taskDevelopmentDriverExample('carrier').inputJson, {
    handoffIdentity: 'sha256-<handoff>',
    candidateIdentity: 'sha256-<candidate>',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-<content-target>',
  });
});

test('未知action不产生伪造contract', () => {
  assert.equal(taskDevelopmentActionContract('unknown'), null);
  assert.equal(taskDevelopmentDriverSchema('unknown'), null);
  assert.equal(taskDevelopmentDriverExample('unknown'), null);
  assert.throws(() => taskDevelopmentActionFields('unknown'), /Unknown Task Development action contract/);
  assert.throws(() => taskDevelopmentActionRequiredFields('unknown'), /Unknown Task Development action contract/);
});
