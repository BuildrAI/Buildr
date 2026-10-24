import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexExecutor, createDshExecutor, createQoderExecutor } from '../../build/executors/index.js';

async function pidAt(filename: string): Promise<number> {
  const end = Date.now() + 3000;
  while (Date.now() < end) { try { return Number(await readFile(filename, 'utf8')); } catch { await new Promise(resolve => setTimeout(resolve, 5)); } }
  throw new Error('native initialization did not start');
}
for (const provider of ['codex', 'dsh'] as const) test(`${provider} cancels its owned process while initialization has not returned a runtime`, { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-open-cancel-')); const executable = join(root, `${provider}.mjs`); const controller = new AbortController();
  const version = provider === 'codex' ? '0.163.0' : '0.2.1-rc.2';
  await writeFile(executable, `import fs from 'node:fs';import path from 'node:path';if(process.argv.includes('--version')){console.log('${version}');process.exit(0)}fs.writeFileSync(path.join(process.env.${provider === 'codex' ? 'CODEX_HOME' : 'DSH_HOME'},'initializing.pid'),String(process.pid));process.stdin.resume();setInterval(()=>{},10000);`);
  const executor = provider === 'codex' ? createCodexExecutor() : createDshExecutor();
  const opening = executor.open({ connectionId: provider, executable, configRoot: join(root, 'config'), environment: { PATH: process.env.PATH ?? '' }, signal: controller.signal }); opening.catch(() => {});
  try {
    const pid = await pidAt(join(root, 'config', `${provider}-home`, 'initializing.pid'));
    const started = Date.now(); controller.abort(); await assert.rejects(opening); assert.ok(Date.now() - started < 4000);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally { controller.abort(); await rm(root, { recursive: true, force: true }); }
});
test('an already-cancelled Qoder open creates no SDK worker', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createQoderExecutor().open({ connectionId: 'qoder', configRoot: '/uncreated', environment: {}, signal: controller.signal }), { name: 'AbortError' });
});
