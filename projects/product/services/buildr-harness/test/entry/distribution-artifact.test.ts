import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {inspectArtifactDistribution} from '../../tools/inspect-artifact-distribution.ts';

test('both products check frozen package evidence, explicit decisions and support rather than current source approvals', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-distribution-artifact-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const harness of [false, true]) {
    const directory = path.join(root, harness ? 'harness' : 'development'), pkg = path.join(directory, 'package');
    const name = harness ? '@buildr-ai/buildr-harness' : '@buildr-ai/buildr';
    const evidence = path.join(pkg, harness ? 'build/third-party' : 'payload/product/distribution');
    const decisions = path.join(harness ? path.join(pkg, 'resources') : evidence, harness ? 'distribution-decisions.json' : 'decisions.json');
    const support = path.join(harness ? path.join(pkg, 'resources') : evidence, 'platform-support.json');
    fs.mkdirSync(evidence, {recursive: true}); fs.mkdirSync(path.dirname(decisions), {recursive: true});
    const write = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value));
    write(path.join(pkg, 'package.json'), {name, version: '0.0.0-fixture'});
    const license = 'Fixture-only permission text\n';
    fs.writeFileSync(path.join(evidence, 'LICENSE'), license);
    write(path.join(evidence, 'evidence.json'), {schemaVersion: 1, components: [{
      name: 'fixture', version: '1', license: 'fixture', evidence: [{file: 'LICENSE', sha256: createHash('sha256').update(license).digest('hex')}],
    }]});
    write(support, {schemaVersion: 1, productId: harness ? 'buildr-harness' : 'buildr-development', platforms: {darwin: {support: 'test-only'}}, publicationApproved: true});
    const decision = {name: 'fixture', version: '1', disposition: 'approved', authority: {name: 'fixture', source: 'test-only'}, reason: 'not a real approval'};
    const archive = path.join(root, harness ? 'harness.tgz' : 'development.tgz');
    const check = () => {
      const packed = spawnSync('tar', ['-czf', archive, '-C', directory, 'package'], {encoding: 'utf8', timeout: 10000});
      assert.equal(packed.status, 0, packed.stderr);
      return inspectArtifactDistribution(archive, name);
    };
    write(decisions, {schemaVersion: 1, decisions: [decision]});
    assert.equal(check().status, 'eligible');
    write(decisions, {schemaVersion: 1, decisions: []});
    assert.equal(check().status, 'blocked');
    write(decisions, {schemaVersion: 1, decisions: [{...decision, disposition: 'denied'}]});
    assert.equal(check().status, 'blocked');
    write(decisions, {schemaVersion: 1, decisions: [decision]});
    fs.writeFileSync(path.join(evidence, 'LICENSE'), 'Replaced');
    assert.equal(check().status, 'blocked');
    fs.writeFileSync(path.join(evidence, 'LICENSE'), license);
    write(support, {schemaVersion: 1, productId: harness ? 'buildr-harness' : 'buildr-development', platforms: {darwin: {}}, publicationApproved: false});
    assert.equal(check().status, 'blocked');
  }
});
