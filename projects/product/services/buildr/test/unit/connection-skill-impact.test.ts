import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkillConnectionImpactPort, connectionImpactObjects } from '../../src/modules/agent-assets/application/connection-impact.ts';

test('只读影响端口只绑定一次，未装配及读取故障不阻源资产操作', () => {
  const port = createSkillConnectionImpactPort();
  assert.deepEqual(port.read('workspace', 'skill'), { instances: [], diagnostics: [] });
  let calls = 0;
  port.bindConnectionImpacts((root, assetIdentity) => {
    calls++;
    assert.equal(root, 'workspace'); assert.equal(assetIdentity, 'skill');
    return { instances: [{ id: 'one', name: '示例', sourcePath: 'connections/instances/one.yml', definitionId: 'sample', sourceIdentity: 'company:sample' }], diagnostics: ['另一实例无法读取'] };
  });
  assert.equal(calls, 0);
  const impacts = connectionImpactObjects(port.read('workspace', 'skill'));
  assert.equal(calls, 1); assert.equal(impacts[0]?.kind, 'connection'); assert.equal(impacts[0]?.id, 'one'); assert.equal(impacts[1]?.kind, 'connection-diagnostic');
  assert.throws(() => port.bindConnectionImpacts(() => ({ instances: [], diagnostics: [] })));
  const broken = createSkillConnectionImpactPort(); broken.bindConnectionImpacts(() => { throw new Error('fixture-private-password'); });
  const result = broken.read('workspace', 'skill');
  assert.equal(result.instances.length, 0); assert.equal(result.diagnostics.length, 1); assert.ok(!JSON.stringify(result).includes('fixture-private-password'));
});
