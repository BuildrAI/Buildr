import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { inspectDevelopmentInstance, restartDevelopmentInstance, verifyDevelopmentPage, releaseCheckoutPort } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';

const proof = (digit: string) => `sha256-${digit.repeat(64)}`;

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'development-restart-coordination-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(dataRoot);
  const identity = { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', source: 'checkout', sourceRoot: root,
    developmentRuntime: { executable: process.execPath }, checkout: { head: 'a'.repeat(40) } };
  const launcherIdentityPath = path.join(root, 'launcher.json');
  fs.writeFileSync(launcherIdentityPath, JSON.stringify(identity));
  const file = path.join(dataRoot, 'instance.json');
  let restarting = false;
  const write = (pid: number, digest = proof('1'), launcherIdentity = identity) => {
    fs.writeFileSync(file, JSON.stringify({ pid, url: 'http://127.0.0.1:4458', secret: `private-${pid}`, launcherIdentity,
      productIdentity: { developmentRuntimeIdentity: digest } }));
  };
  write(100);
  const stops: number[] = [];
  let spawns = 0;
  const base = {
    releasePort: async () => [],
    dataRoot, launcherIdentityPath, expectedSourceRoot: root, expectedHead: identity.checkout.head,
    nodeExecutable: process.execPath, expectedRuntimeIdentity: proof('2'), previousPid: 100,
    projectBridge: path.join(root, 'buildr'), timeoutMs: 300,
    fetchImpl: async (_url: any, init: any) => {
      if (new URL(_url).pathname === '/') {
        assert.equal(init.headers, undefined);
        return new Response('<div id="root"></div><script type="module" src="/assets/app.js"></script>', { headers: { 'content-type': 'text/html' } });
      }
      if (new URL(_url).pathname === '/assets/app.js') {
        assert.equal(init.headers, undefined);
        return new Response('export {};', { headers: { 'content-type': 'text/javascript' } });
      }
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(init.headers['x-buildr-instance'], state.secret);
      if (init.method === 'POST') {
        stops.push(state.pid);
        fs.rmSync(file);
        return new Response('{}', { status: 202 });
      }
      return new Response(JSON.stringify({ ...state, schemaVersion: 'buildr.local-app-health/v1', status: 'ready', restartInProgress: restarting }));
    },
    spawnImpl: (() => { spawns++; write(300, proof('2')); return { pid: 300, once() {}, unref() {} }; }) as any,
    killProcess: () => { throw new Error('Must not kill a process in this scenario.'); },
  };
  return { root, identity, file, write, stops, base, restarting: (value: boolean) => { restarting = value; }, spawns: () => spawns };
}

test('continuity waits for an authenticated page restart and reuses its target even for forced restart', async t => {
  const f = fixture(t);
  f.restarting(true);
  const result = await restartDevelopmentInstance({ ...f.base, forceRestart: true,
    wait: async () => { f.write(200, proof('2')); f.restarting(false); } });
  assert.equal(result.disposition, 'reused');
  assert.equal(result.instance?.pid, 200);
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
});

test('continuity handles page restart accepted between its health observation and quit request', async t => {
  const f = fixture(t);
  let conflict = true;
  const result = await restartDevelopmentInstance({ ...f.base,
    fetchImpl: async (url: any, init: any) => {
      if (init.method === 'POST' && conflict) {
        conflict = false;
        f.write(200, proof('2'));
        return new Response(JSON.stringify({ error: { code: 'restart_in_progress' } }), { status: 409 });
      }
      return f.base.fetchImpl(url, init);
    }, wait: async () => {} });
  assert.equal(result.instance?.pid, 200);
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
});

test('continuity re-observes the same owner after page restart before applying changed content', async t => {
  const f = fixture(t);
  f.restarting(true);
  const result = await restartDevelopmentInstance({ ...f.base,
    wait: async () => { f.write(200); f.restarting(false); } });
  assert.equal(result.instance?.pid, 300);
  assert.deepEqual(f.stops, [200]);
  assert.equal(f.spawns(), 1);
});

test('continuity accepts a completed same-owner page restart observed after launcher installation', async t => {
  const f = fixture(t);
  f.write(200);
  const result = await restartDevelopmentInstance(f.base);
  assert.equal(result.instance?.pid, 300);
  assert.deepEqual(f.stops, [200]);
});

test('continuity preserves an unrelated owner that appeared while waiting', async t => {
  const f = fixture(t);
  f.restarting(true);
  await assert.rejects(restartDevelopmentInstance({ ...f.base,
    wait: async () => { f.write(200, proof('1'), { ...f.identity, sourceRoot: path.join(f.root, 'foreign') }); f.restarting(false); } }),
  (error: any) => error.code === 'development-web-continuity.owner-mismatch');
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).pid, 200);
});

test('continuity waiting has a deadline and does not stop the in-progress instance', async t => {
  const f = fixture(t);
  f.restarting(true);
  await assert.rejects(restartDevelopmentInstance({ ...f.base, timeoutMs: 15, wait: async () => { await new Promise(resolve => setTimeout(resolve, 5)); } }),
    (error: any) => error.code === 'development-web-continuity.restart-wait-timeout');
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
});

test('continuity health proof rejects launcher identity drift', async t => {
  const f = fixture(t);
  const observed = await inspectDevelopmentInstance({ dataRoot: f.base.dataRoot,
    fetchImpl: async () => new Response(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: 100,
      launcherIdentity: { ...f.identity, sourceRoot: path.join(f.root, 'foreign') }, productIdentity: { developmentRuntimeIdentity: proof('1') } })) });
  assert.equal(observed.status, 'stale');
  assert.equal(observed.reason, 'health-identity-mismatch');
});

function manualSource(f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) {
  f.write(100, proof('1'), null as any);
  const state = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  state.productIdentity = { channel: 'development', sourceRoot: f.root, runtime: { role: 'development', executable: process.execPath }, developmentRuntimeIdentity: proof('1'), ...patch };
  fs.writeFileSync(f.file, JSON.stringify(state));
}
test('authenticated manual source Web is updated through the same owner without inventing a Launcher identity', async t => {
  const f = fixture(t); manualSource(f);
  const observed = await inspectDevelopmentInstance({ dataRoot: f.base.dataRoot, fetchImpl: f.base.fetchImpl });
  assert.equal(observed.status, 'healthy-development'); assert.equal(observed.instance?.launcherIdentity, null);
  const result = await restartDevelopmentInstance(f.base);
  assert.equal(result.instance?.pid, 300); assert.deepEqual(f.stops, [100]); assert.equal(f.spawns(), 1);
});
for (const patch of [
  { channel: 'npm' }, { sourceRoot: undefined }, { developmentRuntimeIdentity: undefined },
  { runtime: { role: 'host', executable: process.execPath } }, { runtime: { role: 'development' } },
  { sourceRoot: '/unrelated/source' }, { runtime: { role: 'development', executable: '/unrelated/node' } },
]) test('manual source update preserves unknown or foreign ownership: ' + JSON.stringify(patch), async t => {
  const f = fixture(t); manualSource(f, patch);
  await assert.rejects(restartDevelopmentInstance(f.base), (error: any) => error.code === 'development-web-continuity.owner-mismatch');
  assert.deepEqual(f.stops, []); assert.equal(f.spawns(), 0);
});

const pageHtml = '<div id="root"></div><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">';
function deliveryFetch(patch: Record<string, { body?: string, status?: number, mime?: string } | undefined> = {}) {
  return async (url: any, init: any) => {
    assert.equal(init.headers, undefined);
    assert.equal(init.redirect, 'error');
    const name = new URL(url).pathname;
    const defaults = name === '/' ? { body: pageHtml, mime: 'text/html' } : name.endsWith('.css')
      ? { body: 'body{}', mime: 'text/css' } : { body: 'export {};', mime: 'application/javascript' };
    const value = { ...defaults, ...patch[name] };
    return new Response(value.body, { status: value.status || 200, headers: { 'content-type': value.mime } });
  };
}
test('HTTP delivery verifies the application and critical resources without sending instance secrets', async () => {
  const result = await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl: deliveryFetch() });
  assert.equal(result.status, 'passed'); assert.equal(result.resourceCount, 2);
});
for (const patch of [
  { '/': { body: '<html>unavailable</html>' } },
  { '/assets/app.js': { status: 404 } },
  { '/assets/app.js': { mime: 'text/html', body: '<html>fallback</html>' } },
  { '/assets/app.js': { body: '<!doctype html><html>fallback</html>' } },
  { '/assets/app.css': { mime: 'application/json' } },
  { '/': { body: '<div id="root"></div><script type="module" src="http://foreign.invalid/app.js"></script>' } },
]) test('HTTP delivery rejects broken pages or resources: ' + JSON.stringify(patch), async () => {
  assert.equal((await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl: deliveryFetch(patch) })).status, 'failed');
});
test('healthy identity remains authoritative when page delivery fails, and reuse is not reported as passed', async t => {
  const f = fixture(t); f.write(100, proof('2'));
  const fetchImpl = async (url: any, init: any) => new URL(url).pathname === '/'
    ? new Response('missing', { status: 503 }) : f.base.fetchImpl(url, init);
  const observed = await inspectDevelopmentInstance({ dataRoot: f.base.dataRoot, fetchImpl });
  assert.equal(observed.status, 'healthy-development'); assert.equal(observed.instance?.pid, 100);
  assert.ok(observed.pageVerification);
  assert.equal(observed.pageVerification.status, 'failed');
  await assert.rejects(restartDevelopmentInstance({ ...f.base, fetchImpl }), (error: any) => {
    assert.equal(error.code, 'development-web-continuity.page-verification-failed');
    assert.equal(error.details.timings.interruption.durationMs, null); return true;
  });
  assert.deepEqual(f.stops, []); assert.equal(f.spawns(), 0);
});
test('page delivery uses one total budget and bounds the resource count', async () => {
  let tick = 0, requests = 0;
  const fetchImpl = async (url: any, init: any) => { requests++; return deliveryFetch()(url, init); };
  const result = await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl, timeoutMs: 10, now: () => tick += 11 });
  assert.equal(result.status, 'failed'); assert.equal(result.reason, 'page-timeout'); assert.equal(requests, 1);
  const bounded = await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl: deliveryFetch(), maxResources: 1 });
  assert.equal(bounded.reason, 'resource-limit');
});
test('successful restart reports a conservative interruption upper bound with a monotonic clock', async t => {
  const f = fixture(t); let tick = 0;
  const result = await restartDevelopmentInstance({ ...f.base, now: () => tick += 10 });
  assert.equal(result.pageVerification.status, 'passed');
  assert.equal(result.timings.interruption.status, 'measured-upper-bound');
  assert.ok(result.timings.interruption.durationMs !== null);
  assert.ok(result.timings.interruption.durationMs > 0); assert.ok(result.timings.shutdownMs >= 0);
});
test('preexisting broken page is not reported as zero interruption', async t => {
  const f = fixture(t);
  const fetchImpl = async (url: any, init: any) => new URL(url).pathname === '/' && JSON.parse(fs.readFileSync(f.file, 'utf8')).pid === 100
    ? new Response('missing', { status: 503 }) : f.base.fetchImpl(url, init);
  const result = await restartDevelopmentInstance({ ...f.base, fetchImpl });
  assert.equal(result.timings.interruption.status, 'preexisting-unavailable');
  assert.equal(result.timings.interruption.durationMs, null);
});

test('redirected pages are rejected without returning destination or session material', async () => {
  const response = new Response(pageHtml, { headers: { 'content-type': 'text/html' } });
  Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://foreign.invalid/?session=private' } });
  const result = await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl: async () => response });
  assert.equal(result.status, 'failed'); assert.equal(JSON.stringify(result).includes('private'), false);
});
test('page requests and all resources share a single abort signal', async () => {
  const signals: AbortSignal[] = [];
  const fetchImpl = async (url: any, init: any) => { signals.push(init.signal); return deliveryFetch()(url, init); };
  assert.equal((await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl })).status, 'passed');
  assert.equal(signals.length, 3); assert.equal(new Set(signals).size, 1);
});
test('failed new page does not pass recovery and reports an ongoing interruption with preserved authenticated child', async t => {
  const f = fixture(t);
  const fetchImpl = async (url: any, init: any) => new URL(url).pathname === '/' && JSON.parse(fs.readFileSync(f.file, 'utf8')).pid === 300
    ? new Response('missing', { status: 503 }) : f.base.fetchImpl(url, init);
  await assert.rejects(restartDevelopmentInstance({ ...f.base, fetchImpl, timeoutMs: 15,
    wait: async () => new Promise(resolve => setTimeout(resolve, 5)) }), (error: any) => {
    assert.equal(error.code, 'development-web-continuity.start-timeout');
    assert.equal(error.details.pageVerification.status, 'failed');
    assert.equal(error.details.timings.interruption.status, 'ongoing');
    assert.equal(error.details.timings.interruption.durationMs, null);
    assert.equal(error.details.cleanup.status, 'preserved'); return true;
  });
});
test('reuse reports no observed interruption, not a zero-duration outage', async t => {
  const f = fixture(t); f.write(100, proof('2'));
  const result = await restartDevelopmentInstance(f.base);
  assert.equal(result.timings.interruption.status, 'not-observed');
  assert.equal(result.timings.interruption.durationMs, null);
  assert.equal(result.timings.shutdownMs, null); assert.equal(result.timings.startupMs, null);
});

const externalModule = '<script type="module" src="/assets/app.js"></script>';
for (const [label, html] of [
  ['comment-only application', `<!--${pageHtml}-->`],
  ['data-id is not id', `<div data-id="root"></div>${externalModule}`],
  ['inline script string is not a root', `<script>const fake = '<div id="root"></div>';</script>${externalModule}`],
  ['template subtree is inactive', `<template>${pageHtml}</template>`],
  ['nested templates remain inactive', `<template><template></template>${pageHtml}</template>`],
  ['template module is not an entry', `<div id="root"></div><template>${externalModule}</template>`],
  ['quoted meta attribute is not markup', `<meta content='>${pageHtml}' >`],
  ['quoted attribute id is not a root', `<div title='id="root"'></div>${externalModule}`],
  ['inline module string is not an external entry', `<div id="root"></div><script type="module">const fake = '${externalModule}';</script>`],
  ['duplicate id retains first value', `<div id="other" id="root"></div>${externalModule}`],
  ...['style', 'textarea', 'title', 'noscript', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']
    .map(name => [`${name} content is inactive`, `<${name}>${pageHtml}</${name}>`]),
]) test('HTML delivery ignores non-active markup: ' + label, async () => {
  const result = await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl: deliveryFetch({ '/': { body: html } }) });
  assert.equal(result.status, 'failed'); assert.equal(result.resourceCount, 0);
});
test('HTML tokenizer accepts real tags after raw text, comments and templates, including quoted greater-than', async () => {
  const html = `<!doctype html><html><head><meta content="ignore > text">
    <script>const fake = '<div id="other"></div>';</script>
    <style>.x::after {content: '<div id="other">'}</style>
    <title>ignore <div id="other"></title></head><body>
    <!-- <script type="module" src="http://foreign.invalid/ignored.js"></script> -->
    <template><template></template><div id="unused"></div></template>
    <DIV title="a > b" ID=root></DIV>${externalModule}</body></html>`;
  const result = await verifyDevelopmentPage({ url: 'http://127.0.0.1:1', fetchImpl: deliveryFetch({ '/': { body: html } }) });
  assert.equal(result.status, 'passed'); assert.equal(result.resourceCount, 1);
});

for (const alreadyStopping of [false, true]) test('continuity finishes only the authenticated exact Web that is stuck stopping: ' + alreadyStopping, async t => {
  const f = fixture(t); let stopping=alreadyStopping, released=false;
  const result=await restartDevelopmentInstance({...f.base,timeoutMs:10,killProcess:(_pid:number,signal?:string|number)=>{assert.equal(signal,0);return true;},
    fetchImpl:async(url:any,init:any)=>{
      if(init.method==='POST'){stopping=true;return new Response('{}',{status:202});}
      const response=await f.base.fetchImpl(url,init);
      if(new URL(url).pathname==='/api/v1/health'&&stopping&&!released){const body=await response.json();body.status='stopping';return new Response(JSON.stringify(body));}
      return response;
    },wait:async()=>new Promise(resolve=>setTimeout(resolve,5)),
    releasePort:async(input:any)=>{assert.equal(input.expectedPid,100);assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).pid,100);released=true;return[100];}});
  assert.equal(released,true);assert.equal(result.instance?.pid,300);assert.equal(f.spawns(),1);
});
test('accepted quit without authenticated stopping proof does not force an exit',async t=>{
  const f=fixture(t);let releases=0;
  await assert.rejects(restartDevelopmentInstance({...f.base,timeoutMs:10,killProcess:(_pid:number,signal?:string|number)=>{assert.equal(signal,0);return true;},
    fetchImpl:async(url:any,init:any)=>init.method==='POST'?new Response('{}',{status:202}):f.base.fetchImpl(url,init),
    wait:async()=>new Promise(resolve=>setTimeout(resolve,5)),releasePort:async()=>{releases++;return[];}}),(error:any)=>error.code==='development-web-continuity.shutdown-timeout');
  assert.equal(releases,0);assert.equal(f.spawns(),0);
});
test('owned-port release rejects a changed listener set before sending any signal',async()=>{
  const signals:any[]=[];
  await assert.rejects(releaseCheckoutPort({port:4458,serviceRoot:'/checkout/services/buildr',expectedPid:100,platform:'darwin',
    run:(()=>({stdout:'100\n200\n'})) as any,killProcess:(...args:any[])=>{signals.push(args);return true;}}),
    (error:any)=>error.code==='development-web-continuity.owner-mismatch');
  assert.deepEqual(signals,[]);
});

test('stopping recovery preserves a receipt replaced during graceful waiting',async t=>{
  const f=fixture(t);let releases=0;
  await assert.rejects(restartDevelopmentInstance({...f.base,timeoutMs:10,killProcess:()=>true,
    fetchImpl:async(url:any,init:any)=>init.method==='POST'?new Response('{}',{status:202}):f.base.fetchImpl(url,init),
    wait:async()=>{f.write(200);},releasePort:async()=>{releases++;return[];}}),(error:any)=>error.code==='development-web-continuity.owner-mismatch');
  assert.equal(releases,0);assert.equal(f.spawns(),0);assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).pid,200);
});
