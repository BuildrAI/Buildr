import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTaskFinishActivationDeclaration } from '../../src/application/task-finish/task-finish-activation.mjs';

const declaration = `schemaVersion: buildr.task-finish-activation/v1
bindings:
  - id: buildr-self-bootstrap
    service: buildr
    mode: sync-workspace
    inputs:
      - services/buildr/package/manifest.yml
      - services/buildr/package/targets/workspace/**
`;

test('closed declaration normalizes the only supported typed binding', () => {
  const parsed = parseTaskFinishActivationDeclaration(declaration);
  assert.equal(parsed.declaration.schemaVersion, 'buildr.task-finish-activation/v1');
  assert.deepEqual(parsed.declaration.bindings, [{
    id: 'buildr-self-bootstrap',
    service: 'buildr',
    mode: 'sync-workspace',
    inputs: ['services/buildr/package/manifest.yml', 'services/buildr/package/targets/workspace/**'],
  }]);
  assert.match(parsed.digest, /^sha256-/);
});

test('closed declaration rejects unknown fields, modes, duplicate keys and paths outside Project', () => {
  assert.throws(() => parseTaskFinishActivationDeclaration(`${declaration}command: echo nope\n`), (error) => error.code === 'task-finish.activation-declaration-invalid');
  assert.throws(() => parseTaskFinishActivationDeclaration(declaration.replace('sync-workspace', 'shell')), (error) => error.code === 'task-finish.activation-declaration-invalid');
  assert.throws(() => parseTaskFinishActivationDeclaration(declaration.replace('services/buildr/package/manifest.yml', '../task-finish.yml')), (error) => error.code === 'task-finish.activation-input-outside-project');
  assert.throws(() => parseTaskFinishActivationDeclaration(declaration.replace('service: buildr', 'service: buildr\n    service: other')), (error) => error.code === 'task-finish.activation-declaration-invalid');
});
