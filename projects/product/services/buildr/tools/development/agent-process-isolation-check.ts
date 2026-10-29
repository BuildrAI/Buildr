import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stopAgentProcess } from '@buildr-ai/buildr-agent';
import { materializeCleanProductSource } from '../../test/helpers/clean-product-source.ts';
import { createWebStaticFixture } from '../../test/helpers/web-static-fixture.ts';

const root = process.env.BUILDR_SMOKE_ROOT;
assert.ok(root, 'run through run-isolated-workspace-check.ts');
const dataRoot = process.env.BUILDR_APP_DATA_DIR!;
const serviceRoot = path.resolve(import.meta.dirname, '../..');
const controller = materializeCleanProductSource(serviceRoot, path.join(root, 'controller'));
createWebStaticFixture(path.join(controller.root, 'web-dist'));
const executable = path.join(root, 'codex.mjs');
fs.copyFileSync(path.resolve(serviceRoot, '../buildr-agent/test/integration/executors/fixtures/codex-cli.mjs'), executable);
const children: ChildProcess[] = [];
let diagnostics = '';
const wait = (ms = 25) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  let observed: unknown;
  for (let n = 0; n < 1200; n++) {
    try { const value = await read(); if (accept(value)) return value; observed = value; } catch (error) { observed = String(error); }
    await wait();
  }
  throw new Error(`state did not settle: ${JSON.stringify(observed)}; ${diagnostics}`);
}
async function launch() {
  const child = spawn(process.execPath, [controller.cli, 'web', '--no-open', '--port', '0'], { env: { ...process.env, BUILDR_NPM_ENTRY_PATH: controller.cli }, stdio: ['ignore','pipe','pipe'] });
  children.push(child);
  child.stderr!.on('data', value => { diagnostics += value; }); child.stdout!.resume();
  const instance = await until(async () => JSON.parse(fs.readFileSync(path.join(dataRoot, 'instance.json'), 'utf8')), value => value.pid === child.pid);
  const html = await (await fetch(instance.url)).text();
  const token = html.match(/<meta name="buildr-session" content="([a-f0-9]+)"/)?.[1]; assert.ok(token);
  const call = async (suffix: string, method = 'GET', body?: unknown) => {
    const response = await fetch(instance.url + '/api/v1/app/agent-service' + suffix, { method, headers: { origin: instance.url, 'x-buildr-session': token, 'content-type':'application/json' }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value as any;
  };
  return { child, instance, call, async close() {
    const response = await fetch(instance.url + '/api/v1/app/quit-instance', {method:'POST',headers:{'x-buildr-instance':instance.secret}}); assert.equal(response.status,202);
    await until(async()=>child.exitCode, value=>value === 0);
  } };
}
try {
  let main = await launch();
  let connection = await main.call('/connections/codex');
  await main.call('/connections/codex/connect', 'POST', {expectedRevision:connection.revision, executable});
  let conversation = await main.call('/conversations', 'POST', {});
  const draft = {expectedRevision:conversation.revision,connectionId:'codex',text:'continue after main restart',permissionMode:'default'};
  const preview = await main.call(`/conversations/${conversation.id}/prepare-send`, 'POST', draft);
  await main.call(`/conversations/${conversation.id}/send`, 'POST', {...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  conversation = await until(()=>main.call(`/conversations/${conversation.id}`), value=>value.requests.length === 1);
  const identity = await main.call('/runtime'), run = conversation.run, request = conversation.requests[0];
  const participant = conversation.participants[0].contextId;
  for (let n = 0; n < 2; n++) {
    await main.close(); main = await launch();
    const status = await main.call('/runtime'); assert.equal(status.instanceId,identity.instanceId); assert.equal(status.generation,identity.generation);
    conversation = await main.call(`/conversations/${conversation.id}`);
    assert.equal(conversation.run.id,run.id); assert.equal(conversation.participants[0].contextId,participant); assert.equal(conversation.requests[0].id,request.id);
  }
  await main.call(`/conversations/${conversation.id}/requests/${request.id}/reply`, 'POST', {expectedRevision:conversation.revision,runId:run.id,participantId:run.participantId,generation:run.generation,answer:{color:'蓝'}});
  conversation = await until(()=>main.call(`/conversations/${conversation.id}`), value=>value.run.tools.length > 0);
  assert.ok(conversation.entries.some((entry: any)=>entry.text.includes('你好')));
  await main.call(`/conversations/${conversation.id}/stop`, 'POST', {expectedRevision:conversation.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  await until(()=>main.call(`/conversations/${conversation.id}`), value=>value.run.status === 'stopped');
  await main.close();
  process.stdout.write(JSON.stringify({status:'passed',mainRestarts:2,sameExecutionProcess:true,sameNativeContext:true,pendingQuestionRetained:true,exactStop:true}) + '\n');
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await stopAgentProcess({dataRoot});
}
