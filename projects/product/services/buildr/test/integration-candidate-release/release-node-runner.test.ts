import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const runner = path.join(serviceRoot, 'test/verification/run-node-tests.ts');

test('release test runner respects the granted worker count and retains abnormal exit details', t => {
  fs.mkdirSync(path.join(serviceRoot, 'package/targets'), { recursive: true });
  const root = fs.mkdtempSync(path.join(serviceRoot, 'package/targets/release-runner-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = path.join(root, 'events.jsonl');
  const files = ['one', 'two'].map(id => {
    const file = path.join(root, `${id}.test.mjs`);
    fs.writeFileSync(file, `import fs from 'node:fs'; import test from 'node:test';
      test(${JSON.stringify(id)}, async () => {
        fs.appendFileSync(${JSON.stringify(journal)}, JSON.stringify({id:${JSON.stringify(id)},event:'start'})+'\\n');
        await new Promise(resolve => setTimeout(resolve, 400));
        fs.appendFileSync(${JSON.stringify(journal)}, JSON.stringify({id:${JSON.stringify(id)},event:'end'})+'\\n');
      });`);
    return file;
  });
  const diagnostics = path.join(root, 'diagnostics');
  const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_VERIFICATION_WORKER_BUDGET: '1', BUILDR_DIAGNOSTICS_OUTPUT: diagnostics };
  delete env.NODE_TEST_CONTEXT;
  const success = spawnSync(process.execPath, [runner, ...files], { cwd: serviceRoot, env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(success.status, 0, success.stderr || success.stdout);
  assert.ok(fs.existsSync(journal), `${success.stdout}\n${success.stderr}`);
  const active = new Set();
  const events = fs.readFileSync(journal, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.length, 4);
  for (const item of events) {
    if (item.event === 'start') { assert.equal(active.size, 0, 'a second file must wait for the granted worker'); active.add(item.id); }
    else { assert.ok(active.delete(item.id)); }
  }
  assert.equal(active.size, 0);
  const crash = path.join(root, 'crash.test.mjs');
  fs.writeFileSync(crash, 'process.exit(9);\n');
  const failure = spawnSync(process.execPath, [runner, crash], { cwd: serviceRoot, env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(failure.status, 1);
  const reports = fs.readdirSync(diagnostics).map(file => fs.readFileSync(path.join(diagnostics, file), 'utf8')).join('\n');
  assert.match(reports, /exitCode: 9/u);
});
