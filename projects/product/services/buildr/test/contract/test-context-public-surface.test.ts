import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');

test('public Test Context entry preserves its exact API and generated declarations', async () => {
  const metadata: any = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  assert.deepEqual(metadata.exports['./test-context'], {
    types: './build/test-context/public.d.ts',
    import: './build/test-context/public.js',
    default: './build/test-context/public.js',
  });
  assert.equal(fs.existsSync(path.join(serviceRoot, 'test-context.mjs')), false);
  const publicApi = await import('@buildr-ai/buildr/test-context');
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'canonicalContextConfiguration', 'closeDefaultNodeTestContextRuntime', 'contextConfigurationIdentity',
    'contextTest', 'createNodeTestContextAdapter', 'createTestContextRuntime', 'defaultNodeTestContextRuntime',
    'defineTestContext', 'isTestContextDefinition', 'runNodeTestContextHosts',
  ].sort());

  const generatedRoot: any = path.join(serviceRoot, 'build/test-context');
  const files: any = fs.readdirSync(generatedRoot).sort();
  assert.equal(files.some((file: any) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false);
  for (const file of files.filter((candidate: any) => candidate.endsWith('.js'))) {
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes("from './src/"), false, file);
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes('.ts\''), false, file);
  }
});
