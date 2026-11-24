import { spawn, execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { ModelAccessError } from '../contracts.ts';

const version = '0.1.4708';
const hashes: Record<string,string> = {
  'darwin-amd64':'42d8133a8714bc9f641788b89a707344fae1d274b5e7b1c4256970c254a1c33e',
  'darwin-arm64':'55cf2b9692f017bfa63ef963b04d0c6ecf984f14dfefc46246990ef75e5b44a9',
  'linux-amd64':'25975b889a54a6aa1c5656020f36a1f7ba14402f8e7087a70d371cb8cfa9a754',
  'linux-arm64':'2d5861af8f55dc08a4a47aceb7614c418a44ea0f37c1d037faebcebdac7fc0df',
  'windows-amd64.exe':'f8002f7499b71dfae0efd8b70beb492a91d092847ee486c9beb787f3610c6ff4',
  'windows-arm64.exe':'c9ad18fbb9ea2992a2d9c8b6c38ce08a9fda313b059b236a56abfd6faa16339c',
};
const IP = '127.0.0.1', local = (port: number) => `http://${IP}:${port}`;
const maxBinary = 120 * 1024 * 1024;
const run = promisify(execFile);
const error = (code: string, message: string) => new ModelAccessError('model_magpie_'+code,message,409);
interface Instance { gateway: number; web: number; key: string; }
export interface MagpieInstallation { address(): Promise<string|undefined>; start(signal: AbortSignal): Promise<string>; open(origin: string): Promise<void>; }
async function folder(path: string) {
  await mkdir(path,{recursive:true,mode:0o700});
  const s=await lstat(path); if (!s.isDirectory() || s.isSymbolicLink()) throw error('unsafe_path','Magpie 安装目录不安全。');
}
function port(value: unknown): value is number { return Number.isInteger(value) && Number(value)>0 && Number(value)<65536; }
async function freePort() {
  return await new Promise<number>((resolve,reject)=>{
    const s=createServer();s.once('error',reject);s.listen(0,IP,()=>{const address=s.address();s.close(e=>e?reject(e):resolve(typeof address==='object'&&address?address.port:0));});
  });
}
export class ManagedMagpie implements MagpieInstallation {
  private readonly root: string;
  private readonly identify: (origin:string,signal?:AbortSignal)=>Promise<string|undefined>;
  constructor(root:string,identify:(origin:string,signal?:AbortSignal)=>Promise<string|undefined>){this.root=root;this.identify=identify;}
  private get receipt(){return join(this.root,'instance.json');}
  private async read(): Promise<Instance | undefined> {
    let s;
    try { s=await lstat(this.receipt); } catch(e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e; }
    if (!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>1024) throw error('unsafe_instance','Magpie 受管实例记录不可用。');
    const value=JSON.parse(await readFile(this.receipt,'utf8')) as Instance;
    if(!port(value.gateway)||!port(value.web)||value.gateway===value.web||!/^[a-f0-9]{48}$/.test(value.key))throw error('unsafe_instance','Magpie 受管实例记录不可用。');
    return value;
  }
  private managementUrl(value: Instance) { return local(value.web)+'/?k='+value.key; }
  private async webOwns(value:Instance, signal?:AbortSignal) {
    try {
      const response=await fetch(this.managementUrl(value),{redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(1000)]):AbortSignal.timeout(1000)});
      await response.body?.cancel();
      return response.status===303 && response.headers.get('location')==='/' && Boolean(response.headers.get('set-cookie'));
    }catch{return false;}
  }
  async address(){const value=await this.read();return value && local(value.gateway);}
  private async binary(signal: AbortSignal): Promise<string> {
    const asset = `${process.platform==='win32'?'windows':process.platform}-${process.arch==='x64'?'amd64':process.arch}${process.platform==='win32'?'.exe':''}`;
    const hash=hashes[asset]; if(!hash)throw error('platform','当前平台不支持自动安装，请启动已有 Magpie 并连接。');
    const dir=join(this.root,'bin'); await folder(dir);
    const file=join(dir,`magpie-${version}${process.platform==='win32'?'.exe':''}`);
    try {
      const s=await lstat(file); if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>maxBinary)throw error('unsafe_path','Magpie 程序文件不安全。');
      const h=createHash('sha256');for await(const chunk of createReadStream(file,{signal}))h.update(chunk);
      if(h.digest('hex')!==hash)throw error('checksum','已安装的 Magpie 程序校验失败。');
      return file;
    } catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; }
    const url=`https://github.com/yetone/magpie-releases/releases/download/v${version}/magpie-cli-${asset}`;
    const stop=AbortSignal.any([signal,AbortSignal.timeout(180_000)]);
    const dl=join(dir,`download-${randomUUID()}`);
    try {
      let response: Response;
      try {response=await fetch(url,{signal:stop});} catch {throw error('download','未能下载 Magpie 官方发行包，请检查网络后重试。');}
      if(!response.ok||!response.body){await response.body?.cancel();throw error('download','未能下载 Magpie 官方发行包，请检查网络后重试。');}
      const h=createHash('sha256');let bytes=0;
      await pipeline(response.body,new Transform({transform(chunk,_encoding,next){bytes+=chunk.length;if(bytes>maxBinary)return next(error('download','Magpie 发行包超过预期大小。'));h.update(chunk);next(null,chunk);}}),createWriteStream(dl,{flags:'wx',mode:0o600}),{signal:stop});
      if(h.digest('hex')!==hash)throw error('checksum','Magpie 官方发行包校验失败，未启动。');
      await chmod(dl,0o700);await rename(dl,file);return file;
    } finally { await unlink(dl).catch(()=>{}); }
  }
  async start(signal:AbortSignal):Promise<string> {
    await folder(this.root);
    const file=join(this.root,'preparing.lock');const handle=await open(file,'wx',0o600).catch(e=>{if(e.code==='EEXIST')throw error('busy','Magpie 正在准备，或上次准备未正常结束。');throw e;});
    let child: ReturnType<typeof spawn>|undefined;
    try {
      const saved=await this.read(); if(saved&&await this.identify(local(saved.gateway),signal)) {
        if(await this.webOwns(saved,signal))return local(saved.gateway);
        throw error('port_in_use','受管 Magpie 端口已由其他实例占用，请连接实际地址。');
      }
      let instance=saved;
      if(!instance){const gateway=await freePort();let web=await freePort();while(gateway===web)web=await freePort();instance={gateway,web,key:randomBytes(24).toString('hex')};}
      const executable=await this.binary(signal);
      const home=join(this.root,'home'), xdg=join(home,'.config'), config=join(xdg,'magpie');
      for(const path of [home,xdg,config])await folder(path);
      try {await writeFile(join(config,'settings.json'),JSON.stringify({port:instance.gateway,noAutoUpdate:true}),{flag:'wx',mode:0o600});}
      catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
      if(!saved)await writeFile(this.receipt,JSON.stringify(instance),{flag:'wx',mode:0o600});
      signal.throwIfAborted();
      // Empty tool PATH and isolated HOME prevent discovering or invoking the user's host agent tools.
      const privateBin=join(home,'bin');await folder(privateBin);
      child=spawn(executable,['serve',`--web=${IP}:${instance.web}`],{cwd:home,stdio:'ignore',detached:true,windowsHide:true,env:{HOME:home,USERPROFILE:home,APPDATA:home,LOCALAPPDATA:home,XDG_CONFIG_HOME:xdg,PATH:privateBin,MAGPIE_ADDR:`${IP}:${instance.gateway}`,MAGPIE_WEB_KEY:instance.key,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})}});
      let failed=false;child.once('error',()=>{failed=true;});child.once('exit',()=>{failed=true;});
      const deadline=Date.now()+12_000;
      do {
        await delay(150,undefined,{signal});
        if(failed)break;
        if(await this.identify(local(instance.gateway),signal)===version&&await this.webOwns(instance,signal)&&!failed){child.unref();child=undefined;return local(instance.gateway);}
      }while(Date.now()<deadline);
      throw error('startup','Magpie 未能启动。请检查端口占用或在 Magpie 中查看状态。');
    } finally { if(child&&!child.killed&&child.exitCode===null)child.kill(); await handle.close();await unlink(file).catch(()=>{}); }
  }
  async open(origin:string) {
    const value=await this.read();
    if(!value||origin!==local(value.gateway))throw error('external','该实例由你管理，请在已安装的 Magpie 中打开设置。');
    if(!await this.identify(origin)||!await this.webOwns(value))throw error('offline','未确认受管 Magpie 管理页，请启动并核对该实例。');
    const url=this.managementUrl(value);
    try {
      if(process.platform==='darwin')await run('/usr/bin/open',[url],{timeout:10000});
      else if(process.platform==='win32')await run('rundll32.exe',['url.dll,FileProtocolHandler',url],{timeout:10000,windowsHide:true});
      else await run('xdg-open',[url],{timeout:10000});
    } catch { throw error('browser','未能打开 Magpie 管理页。'); }
  }
}
