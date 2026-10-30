import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { readProgramRelease } from '../../src/executors/program-release.ts';

test('release reader pins vendor registry identity and derives Qoder package version from the bound executable', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'program-release-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const entry = path.join(root, 'dist', '_bundled', 'qodercli');
  await fs.mkdir(path.dirname(entry), {recursive:true}); await fs.writeFile(entry, 'fixture');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({name:'@qoder-ai/qoder-agent-sdk',version:'1.0.55'}));
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], input?: Parameters<typeof fetch>[1]) => {
    assert.equal(url, 'https://registry.npmjs.org/%40qoder-ai%2Fqoder-agent-sdk/latest');
    assert.equal(input?.redirect, 'error'); assert.ok(input?.signal);
    return Response.json({name:'@qoder-ai/qoder-agent-sdk',version:'1.0.56'});
  });
  const result = await readProgramRelease('qoder', entry, new AbortController().signal);
  assert.equal(result.currentReleaseVersion,'1.0.55'); assert.equal(result.latestVersion,'1.0.56');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({name:'wrong-package',version:'99.0.0'}));
  assert.equal((await readProgramRelease('qoder', entry, new AbortController().signal)).currentReleaseVersion,undefined);
});

test('release reader rejects identity mismatch, failure status and oversized metadata',async t=>{
  for (const response of [Response.json({name:'malicious',version:'9.0.0'}),new Response('failure',{status:503}),new Response('x'.repeat(128*1024+1))]) {
    const mock=t.mock.method(globalThis,'fetch',async()=>response);
    await assert.rejects(readProgramRelease('codex','/fixture/codex',new AbortController().signal));mock.mock.restore();
  }
});
