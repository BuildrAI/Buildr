import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('工作空间添加、共享资源、定制保留、入口恢复与诊断使用真实隔离进程及 HTTP', {timeout:150000}, () => {
  const service=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const result=spawnSync(process.execPath,[path.join(service,'tools/development/run-isolated-workspace-check.ts'),'--script',path.join(service,'tools/development/workspace-continuity-check.ts')],{cwd:service,env:process.env,encoding:'utf8',timeout:145000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr+result.stdout);
  const fastReadd = result.stdout.split('\n').find(line => line.includes('"scenario":"ready-workspace-readd"'));
  assert.ok(fastReadd, 'Must verify ready-directory re-add without a CLI process.');
  assert.equal(JSON.parse(fastReadd).cliSpawned, false);
  process.stdout.write(`${fastReadd}\n`);
  assert.match(result.stdout,/"status":"passed"/);assert.match(result.stdout,/"cleanup":"cleaned"/);
});
