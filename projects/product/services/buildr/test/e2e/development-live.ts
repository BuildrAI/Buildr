import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stopAgentProcess} from '@buildr-ai/buildr-harness';
import {materializeCleanProductSource} from '../helpers/clean-product-source.ts';
import {launchTestBrowser} from './browser-launch.ts';
const execute=promisify(execFile),serviceRoot=path.resolve(import.meta.dirname,'../..');
const smoke=process.env.BUILDR_SMOKE_ROOT!,workspace=process.env.BUILDR_SMOKE_WORKSPACE_ROOT!;
assert.ok(smoke&&workspace,'Use run-isolated-workspace-check.ts.');
const controller=materializeCleanProductSource(serviceRoot,path.join(smoke,'source'));
// Sharing immutable dependency caches is sufficient. The prepared Harness package
// is writable build output and must be owned by this fixture, not a symlink to
// another checkout's node_modules.
fs.unlinkSync(path.join(controller.root,'node_modules'));fs.mkdirSync(path.join(controller.root,'node_modules'));
for(const entry of fs.readdirSync(path.join(serviceRoot,'node_modules'))){
  if(entry==='@buildr-ai'){fs.mkdirSync(path.join(controller.root,'node_modules',entry));fs.cpSync(path.join(serviceRoot,'node_modules/@buildr-ai/buildr-harness'),path.join(controller.root,'node_modules/@buildr-ai/buildr-harness'),{recursive:true});}
  else fs.symlinkSync(path.join(serviceRoot,'node_modules',entry),path.join(controller.root,'node_modules',entry),'dir');
}
for(const service of ['buildr-web','buildr-harness','buildr-harness-web']){
  const from=path.resolve(serviceRoot,'..',service),to=path.resolve(controller.root,'..',service);fs.mkdirSync(to);
  for(const name of fs.readdirSync(from)){
    if(['node_modules','web-dist','dist','build','.git'].includes(name))continue;
    fs.cpSync(path.join(from,name),path.join(to,name),{recursive:true});
  }
  fs.symlinkSync(path.join(from,'node_modules'),path.join(to,'node_modules'),'dir');
  if(service==='buildr-web'&&fs.existsSync(path.join(from,'build/generated')))fs.cpSync(path.join(from,'build/generated'),path.join(to,'build/generated'),{recursive:true});
  if(service==='buildr-harness-web')fs.cpSync(path.join(from,'dist'),path.join(to,'dist'),{recursive:true});
  if(service==='buildr-harness')fs.cpSync(path.join(from,'build'),path.join(to,'build'),{recursive:true});
}
fs.copyFileSync(path.resolve(serviceRoot,'../../.node-version'),path.resolve(controller.root,'../../.node-version'));
await execute(process.execPath,[controller.cli,'init','--target',workspace,'--name','live-development','--profile','personal','--source-only'],{env:process.env,timeout:30_000,maxBuffer:4*1024*1024});
const listener=net.createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=(listener.address() as net.AddressInfo).port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
const origin=`http://127.0.0.1:${port}`,statusFile=path.join(process.env.BUILDR_APP_DATA_DIR!,'development-live.json'),instanceFile=path.join(process.env.BUILDR_APP_DATA_DIR!,'instance.json');
let output='';
const child=spawn(process.execPath,[path.join(controller.root,'tools/development/dev-live.ts'),'--target',workspace,'--port',String(port),'--no-open'],{cwd:controller.root,env:process.env,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
const read=(file:string)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
async function until(predicate:()=>boolean|Promise<boolean>,message:string,timeout=60_000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await predicate())return;if(child.exitCode!==null)throw new Error(`${message}: supervisor exited ${child.exitCode}\n${output.slice(-12000)}`);await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`${message}\n${output.slice(-12000)}`);}
const recoveryOnly = process.argv.includes('--recovery');
let browser:Awaited<ReturnType<typeof launchTestBrowser>>|undefined;
try{
  // The receipt can become ready before the supervisor registers its source watchers.
  const startupAnnouncement = `Buildr dev: ${origin} (same-origin source + API + HMR)`;
  await until(() => read(statusFile)?.phase === 'ready' && output.includes(startupAnnouncement), 'live host and source watcher startup');
  const initial=read(instanceFile),runtimeFile=path.join(process.env.BUILDR_APP_DATA_DIR!,'agent-service/process/instance.json'),generation=read(runtimeFile).identity.generation;
  assert.equal(initial.url,origin);
  if (!recoveryOnly) {
    browser = await launchTestBrowser();
    const page = await browser.newPage();
    const errors: string[] = [];
    const socketFrames: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framereceived', ({payload}) => {
      if (typeof payload === 'string') socketFrames.push(payload);
    }));
    await page.goto(origin, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.locator('#root > *').first().waitFor({state: 'attached', timeout: 30000});
    await until(() => socketFrames.some(frame => frame.includes('"type":"connected"')), 'Vite HMR socket did not connect', 15000);
    const stylesheet = page.locator('style[data-vite-dev-id$="/src/styles.css"]').first();
    await stylesheet.waitFor({state: 'attached', timeout: 15000});
    const mainStyle = path.resolve(controller.root, '../buildr-web/src/styles.css');
    const navigation = await page.evaluateHandle(() => document.documentElement);
    try {
      fs.appendFileSync(mainStyle, '\n:root{--buildr-live-proof:main-updated;}\n');
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--buildr-live-proof').trim() === 'main-updated', null, {timeout: 15000});
      assert.equal(await page.evaluate(previous => previous === document.documentElement, navigation), true);
    } catch (error) {
      throw new Error('Development stylesheet update not observed; recent HMR frames: ' + JSON.stringify(socketFrames.slice(-8)), {cause: error});
    }
    assert.equal(read(instanceFile).pid, initial.pid, 'frontend HMR must not restart the host');
    assert.deepEqual(errors, [], 'the source page must mount without browser errors');
    console.log(JSON.stringify({status: 'passed', checks: ['development-browser-hmr', 'frontend-no-backend-restart'], origin}));
  } else {
    const backend=path.join(controller.root,'src/web/http/session.ts'),original=fs.readFileSync(backend,'utf8');
    fs.writeFileSync(backend,original+'\nexport const = broken;\n');
    await until(()=>read(statusFile)?.phase==='failed','bad edit must be rejected before stopping');
    assert.equal(read(instanceFile).pid,initial.pid);assert.equal((await fetch(origin)).status,200);
    fs.writeFileSync(backend,original+'\n// valid latest backend edit\n');
    await until(()=>read(statusFile)?.phase==='ready'&&read(instanceFile)?.pid!==initial.pid,'fixed edit automatically adopted');
    const good=read(instanceFile),goodSnapshot=read(statusFile).current;
    const serverFile=path.join(controller.root,'src/web/http/server.ts'),serverSource=fs.readFileSync(serverFile,'utf8');
    fs.writeFileSync(serverFile,serverSource.replace("  if (typeof ensureRegisteredTarget", "  if (process.env.BUILDR_DEV_LIVE === '1') throw new Error('injected-development-startup-failure');\n  if (typeof ensureRegisteredTarget"));
    await until(()=>read(statusFile)?.phase==='restored','startup failure restores last runnable snapshot');
    assert.equal(read(statusFile).current,goodSnapshot);assert.notEqual(read(instanceFile).pid,good.pid);assert.equal((await fetch(origin)).status,200);
    assert.equal(read(runtimeFile).identity.generation,generation,'host restarts and rollback must not switch or stop Harness execution');
    fs.writeFileSync(serverFile,serverSource);fs.writeFileSync(backend,original);
    await until(()=>read(statusFile)?.phase==='ready','source repair returns to normal updates');
    const sourceProfile=path.resolve(controller.root,'../buildr-harness/src/profile.ts'),profileText=fs.readFileSync(sourceProfile,'utf8');
    fs.writeFileSync(sourceProfile,profileText+'\n// latest harness edit\n');
    await until(()=>read(statusFile)?.phase==='ready'&&read(runtimeFile).identity.generation!==generation,'Harness update and automatic contract generation',90_000);
    const state=read(instanceFile),pageResponse=await fetch(origin),html=await pageResponse.text(),token=/name="buildr-session" content="([^"]+)"/.exec(html)![1]!;
    const status=await fetch(origin+'/api/v1/development/status',{headers:{'x-buildr-session':token}});assert.equal(status.status,200);assert.equal((await status.json()).hostSnapshot,read(statusFile).current);
    assert.notEqual(state.productIdentity.developmentRuntimeIdentity,initial.productIdentity.developmentRuntimeIdentity,'snapshot identity reflects actual loaded code');
    console.log(JSON.stringify({status:'passed',checks:['syntax-failure-retains-host','automatic-recovery','startup-rollback','execution-backend-retained','harness-contract-update','current-version-status'],origin}));
  }
}catch(error){process.stderr.write(output.slice(-16000)+'\n');throw error;}
finally{
  await browser?.close();
  if(child.exitCode===null){child.kill('SIGTERM');const deadline=Date.now()+30_000;while(child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));assert.notEqual(child.exitCode,null,'supervisor cleanup must settle');}
  await stopAgentProcess({dataRoot:process.env.BUILDR_APP_DATA_DIR!,profileId:'development',mode:'if-idle'});
  assert.equal(fs.existsSync(instanceFile),false,'owned host receipt must be released');
  assert.equal(read(statusFile).phase,'stopped');
}
