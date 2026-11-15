import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectDistributionEvidence} from '../src/distribution-evidence.ts';
const components=[{name:'fixture-dependency',version:'1.0.0',license:'MIT'}];
const approved={...components[0]!,disposition:'approved' as const,authority:{name:'fixture owner',source:'test-only decision'},reason:'test-only license decision'};
test('artifact license evidence rejects missing, replaced and escaping files even with a decision', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-license-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const license = 'Fixture license text\n';
  fs.writeFileSync(path.join(root, 'LICENSE'), license);
  const item = {file: 'LICENSE', sha256: createHash('sha256').update(license).digest('hex')};
  const write = (items: typeof item[]) => fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({
    schemaVersion: 1, components: [{...components[0], evidence: items}],
  }));
  write([item]);
  assert.equal(inspectDistributionEvidence(root, [approved]).status, 'eligible');
  fs.writeFileSync(path.join(root, 'LICENSE'), 'Changed text');
  assert.equal(inspectDistributionEvidence(root, [approved]).status, 'blocked');
  write([]);
  assert.equal(inspectDistributionEvidence(root, [approved]).status, 'blocked');
  write([{...item, file: '../outside'}]);
  assert.equal(inspectDistributionEvidence(root, [approved]).status, 'blocked');
});
