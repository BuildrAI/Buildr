import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createDevelopmentSnapshot} from '../../tools/development/dev-snapshot.ts';
import {withDevelopmentUpdate, developmentUpdatePaths} from '../../tools/development/dev-update.ts';
const execute = promisify(execFile);
const serviceRoot = path.resolve(import.meta.dirname, '../..');
const adapter = pathToFileURL(path.resolve(serviceRoot, '../buildr-harness-web/tools/dev-server.mjs')).href;

function fixture(root: string, name = '@buildr-ai/buildr-harness-web') {
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name, type: 'module'}));
  fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default {};\n');
  fs.writeFileSync(path.join(root, 'index.html'), '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>');
  fs.writeFileSync(path.join(root, 'mermaid-renderer.html'), '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>');
  fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const value=1;\n');
}
async function upgrade(url: string, cookie = ''): Promise<boolean> {
  return new Promise(resolve => {
    const request = http.request(url, {headers: {connection: 'Upgrade', upgrade: 'websocket', origin: new URL(url).origin,
      'sec-websocket-key': randomBytes(16).toString('base64'), 'sec-websocket-version': '13', 'sec-websocket-protocol': 'vite-hmr', cookie}});
    request.setTimeout(2000, () => {request.destroy(); resolve(false);});
    request.on('upgrade', (_response, socket) => {socket.destroy(); resolve(true);});
    request.on('response', response => {response.resume(); resolve(false);});
    request.on('error', () => resolve(false)); request.end();
  });
}

test('two middleware roots share one listener with separate HMR and host authentication', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-web-'));
  let main: any, harness: any;
  const server = http.createServer((req, res) => {
    const embedded = req.url!.startsWith('/harness/');
    const mermaid = req.url === '/mermaid-renderer.html';
    const document = req.url === '/' || req.url === '/harness/' || mermaid;
    (embedded ? harness : main).handle(req, res, {document, ...(mermaid ? {entry: 'mermaid-renderer.html'} : {}), frame: embedded}).catch((error: any) => {res.writeHead(error.status ?? 500); res.end('denied');});
  });
  try {
    const root = path.join(temp, 'main'), harnessRoot = path.join(temp, 'harness');
    fixture(root, '@buildr-ai/buildr-web'); fixture(harnessRoot);
    const {createDevelopmentWeb} = await import(adapter);
    const authorize = (request: any) => {
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) throw Object.assign(new Error('origin'), {status: 403});
      if (request.url.startsWith('/harness/') && request.headers.cookie !== 'frame=valid') throw Object.assign(new Error('session'), {status: 403});
    };
    main = await createDevelopmentWeb({root, server, authorize, inject: (html: string) => html.replace('</head>', '<meta name="buildr-session" content="main-token"></head>')});
    harness = await createDevelopmentWeb({root: harnessRoot, base: '/harness/', server, authorize});
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const page = await fetch(origin);
    const html = await page.text();
    assert.match(html, /\/@vite\/client/); assert.match(html, /main-token/);
    assert.match(page.headers.get('content-security-policy')!, /script-src 'self' 'nonce-/);
    assert.doesNotMatch(page.headers.get('content-security-policy')!, /unsafe-eval/);
    const mermaidPage = await fetch(origin + '/mermaid-renderer.html');
    assert.equal(mermaidPage.status, 200);
    assert.equal(mermaidPage.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(mermaidPage.headers.get('content-security-policy')!, /frame-ancestors 'self'/);
    assert.doesNotMatch(await mermaidPage.text(), /main-token/);
    assert.equal((await fetch(origin + '/harness/')).status, 403);
    assert.equal((await fetch(origin + '/harness/src/main.ts')).status, 403);
    const frame = await fetch(origin + '/harness/', {headers: {cookie: 'frame=valid'}});
    assert.match(await frame.text(), /\/harness\/@vite\/client/);
    const client = await (await fetch(origin + '/@vite/client')).text();
    const frameClient = await (await fetch(origin + '/harness/@vite/client', {headers: {cookie: 'frame=valid'}})).text();
    const token = /const wsToken = "([^"]+)"/.exec(client)![1]!;
    const frameToken = /const wsToken = "([^"]+)"/.exec(frameClient)![1]!;
    assert.equal(await upgrade(origin + '/__hmr?token=' + token), true);
    assert.equal(await upgrade(origin + '/harness/__hmr?token=' + frameToken), false);
    assert.equal(await upgrade(origin + '/harness/__hmr?token=' + frameToken, 'frame=valid'), true);
    assert.equal((await fetch(origin + '/src/main.ts', {headers: {origin: 'https://foreign.invalid'}})).status, 403);
    assert.equal((await fetch(origin + '/@fs/' + path.join(temp, 'outside.txt'))).status, 404);
    fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const = broken');
    let failed = false;
    for (let i = 0; i < 30; i++) {
      if ((await fetch(origin + '/src/main.ts?t=' + (100 + i))).status === 500) {failed = true; break;}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(failed, true);
    fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const value=2;');
    let recovered = false;
    for (let i = 0; i < 30; i++) {
      const response = await fetch(origin + '/src/main.ts?t=' + (200 + i));
      if (response.ok && /value\s*=\s*2/.test(await response.text())) {recovered = true; break;}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(recovered, true);
  } finally {
    await Promise.all([main?.close(), harness?.close()]);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('a frozen development module still runs after its source is broken or removed', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-snapshot-'));
  try {
    for (const directory of ['src', 'bin', 'tools/development', 'node_modules/@buildr-ai/buildr-harness/build']) fs.mkdirSync(path.join(temp, directory), {recursive: true});
    fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
    const filename = path.join(temp, 'src/value.ts');
    fs.writeFileSync(path.join(temp,'src/common.cjs'),'module.exports={value:11};');
    fs.writeFileSync(filename, "import box from './common.cjs';export const common=box.value;export const value: number = 7; export const root=import.meta.dirname;");
    fs.copyFileSync(path.join(serviceRoot, 'tools/development/dev-source-loader.mjs'), path.join(temp, 'tools/development/dev-source-loader.mjs'));
    const snapshot = createDevelopmentSnapshot(temp);
    fs.writeFileSync(filename, 'export const = broken');
    fs.writeFileSync(path.join(temp,'src/common.cjs'),'module.exports = BROKEN;');
    const run = () => execute(process.execPath, ['--import', path.join(snapshot.root, 'loader.mjs'), '--input-type=module', '-e', `const value=await import(${JSON.stringify(pathToFileURL(filename).href)}); console.log(JSON.stringify(value))`], {env: {...process.env, BUILDR_DEV_SNAPSHOT: snapshot.file}, timeout: 5000});
    assert.deepEqual(JSON.parse((await run()).stdout), {common:11,root: path.dirname(filename), value: 7});
    fs.unlinkSync(filename);
    assert.equal(JSON.parse((await run()).stdout).value, 7);
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
});

test('formal and live updates serialize and activation suspends new live writes', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-lock-'));
  try {
    await execute('git', ['init', '-q', temp], {timeout: 5000});
    const paths = developmentUpdatePaths(temp);
    let enter!: () => void;
    const gate = new Promise<void>(resolve => {enter = resolve;});
    const events: string[] = [];
    const live = withDevelopmentUpdate(temp, async () => {events.push('live'); await gate; events.push('released');});
    const formal = withDevelopmentUpdate(temp, async () => {events.push('formal');}, {formal: true});
    assert.deepEqual(events, ['live']); enter(); await Promise.all([live, formal]);
    assert.deepEqual(events, ['live', 'released', 'formal']);
    fs.mkdirSync(paths.activation);
    await assert.rejects(withDevelopmentUpdate(temp, async () => {throw new Error('must not enter');}), /development_activation_in_progress/);
    assert.equal(fs.existsSync(paths.lock), false);
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
});
