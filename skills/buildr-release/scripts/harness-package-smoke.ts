import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {inspectCandidate} from './harness-release.ts';

const [directory] = process.argv.slice(2);
if (!directory) throw Error('Usage: harness-package-smoke.ts <candidate-directory>');
const {candidate, file} = inspectCandidate(path.resolve(directory));
assert.equal(candidate.target,'harness');
assert.equal(process.platform,'darwin');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'harness-release-smoke-')));
const home = path.join(root,'home'), dataRoot = path.join(root,'data'), prefix=path.join(root,'install');
const env = {...process.env, HOME:home, USERPROFILE:home, XDG_CONFIG_HOME:path.join(home,'.config'),
  PATH:[path.dirname(process.execPath),process.env.PATH].join(path.delimiter),
  BUILDR_APP_DATA_DIR:dataRoot, BUILDR_LAUNCHER_NO_OPEN:'1', BUILDR_LAUNCHER_NO_NOTIFY:'1', NPM_CONFIG_USERCONFIG:path.join(root,'empty.npmrc')};
const savedEnv = {HOME:process.env.HOME,BUILDR_APP_DATA_DIR:process.env.BUILDR_APP_DATA_DIR};
let stop: ((options: any) => Promise<unknown>) | undefined;
const exec = (command: string, args: string[], timeout=30000) => execFileSync(command,args,{cwd:root,env,encoding:'utf8',timeout}).trim();
try {
  fs.mkdirSync(home); fs.mkdirSync(prefix); fs.writeFileSync(env.NPM_CONFIG_USERCONFIG,'');
  exec('npm',['install','--prefix',prefix,'--offline','--no-audit','--no-fund','--ignore-scripts','--',file]);
  const packageRoot=path.join(prefix,'node_modules','@buildr-ai','buildr-harness');
  const entry=path.join(packageRoot,'bin','buildr-harness.mjs');
  assert.equal(exec(process.execPath,[entry,'--version']),candidate.version);
  const {stopAgentProcess,connectHarnessProcess} = await import(pathToFileURL(path.join(packageRoot,'build/index.js')).href);
  stop=stopAgentProcess;
  const target=path.join(home,'Applications','Buildr Harness.app');
  const installed=JSON.parse(exec(process.execPath,[entry,'launcher','install']));
  assert.equal(installed.binding.target,target);
  assert.equal(installed.binding.profile,'released');
  assert.equal(installed.binding.dataRoot,dataRoot);
  const server=(await import('node:net')).createServer();
  const port=await new Promise<number>((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',()=>{
    const address=server.address(); assert.ok(address&&typeof address==='object'); server.close(e=>e?reject(e):resolve(address.port));
  }));
  const web=JSON.parse(exec(process.execPath,[entry,'web','--port',String(port),'--no-open'],60000));
  assert.equal(web.status,'ready'); assert.equal(web.web.origin,`http://127.0.0.1:${port}`);
  const connection=await connectHarnessProcess({dataRoot,profileId:'released',sourceId:'harness-local',caller:{kind:'first-party-user',product:'buildr-harness'}});
  try {
    const login=await connection.web.login();
    assert.equal(login.endpointId,web.web.endpointId);
    const ticket=new URLSearchParams(new URL(login.url).hash.slice(1)).get('ticket');
    const exchange=await fetch(web.web.origin+'/session/ticket',{method:'POST',headers:{'content-type':'application/json',origin:web.web.origin},body:JSON.stringify({ticket}),signal:AbortSignal.timeout(5000)});
    assert.equal(exchange.status,200);
    const cookie=exchange.headers.getSetCookie()[0]?.split(';')[0]; assert.ok(cookie);
    const index=await fetch(web.web.origin,{headers:{cookie},signal:AbortSignal.timeout(5000)});
    assert.equal(index.status,200);
    const asset=(await index.text()).match(/<script[^>]+src="(\/bundles\/[a-f0-9]{64}\/assets\/[^"?]+\.js)"/u)?.[1];
    assert.ok(asset);
    const script=await fetch(web.web.origin+asset,{headers:{cookie},signal:AbortSignal.timeout(5000)});
    assert.equal(script.status,200);
    assert.match(script.headers.get('content-type')??'',/javascript/);
    await script.body?.cancel();
  } finally { await connection.disconnect(); }
  assert.equal(JSON.parse(exec(process.execPath,[entry,'launcher','uninstall'])).dataPreserved,true);
  assert.equal(fs.existsSync(target),false);
  assert.equal(fs.existsSync(dataRoot),true);
  assert.equal(process.version,'v24.15.0');
} finally {
  // The owner cleanup must run using the same isolated home and data domain.
  process.env.HOME=home; process.env.BUILDR_APP_DATA_DIR=dataRoot;
  try {
    if(stop) await stop({dataRoot,profileId:'released',mode:'if-idle'});
    fs.rmSync(root,{recursive:true,force:true});
  } finally {
    for(const [key,value] of Object.entries(savedEnv)) { if(value===undefined) delete process.env[key]; else process.env[key]=value; }
  }
}

console.log(JSON.stringify({status:'passed',check:'installed-cli-launcher-web',sha256:candidate.sha256,node:process.version,platform:process.platform,arch:process.arch}));
