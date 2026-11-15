import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AgentServiceError} from '../domain/agent-state.ts';
import {readPrivate,writePrivate} from './ownership.ts';
const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.json':'application/json','.map':'application/json','.gz':'application/gzip','.br':'application/octet-stream'};
/** Content-addressed static payloads remain available to valid old page scripts. */
export class HarnessWebAssets {
  private readonly root:string;
  constructor(dataRoot:string){this.root=path.join(dataRoot,'agent-service/harness-web/bundles');}
  install(source:string):string {
    if(!fs.statSync(path.join(source,'index.html'),{throwIfNoEntry:false})?.isFile())throw new AgentServiceError('agent_web_payload_missing','此运行负载未包含独立 Harness 网页。',409);
    const files:Record<string,string>={};
    for(const relative of fs.globSync('**/*',{cwd:source})){const file=path.join(source,relative),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new AgentServiceError('agent_web_payload_unsafe','网页负载含未确认链接。',409);if(stat.isFile()){if(stat.size>32*1024*1024)throw new AgentServiceError('agent_web_payload_unsafe','网页资源超过限制。',409);files[relative.replaceAll(path.sep,'/')]=digest(fs.readFileSync(file));}}
    const id=digest(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))));
    fs.mkdirSync(this.root,{recursive:true,mode:0o700});
    if(fs.lstatSync(this.root).isSymbolicLink())throw new AgentServiceError('agent_web_payload_unsafe','网页保留目录身份变化。',409);
    const destination=path.join(this.root,id);
    if(!fs.existsSync(destination)){
      const stage=fs.mkdtempSync(path.join(this.root,'.stage-'));
      try{for(const relative of Object.keys(files)){const output=path.join(stage,relative);fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});fs.copyFileSync(path.join(source,relative),output);}writePrivate(path.join(stage,'bundle.json'),{id,files});fs.renameSync(stage,destination);}
      finally{fs.rmSync(stage,{recursive:true,force:true});}
    }
    this.read(id,'index.html');return id;
  }
  read(id:string,relative:string):{bytes:Buffer;mimeType:string} {
    if(!/^[a-f0-9]{64}$/.test(id)||!relative||relative.split('/').some(part=>!part||part==='.'||part==='..')||relative.includes('\\')||relative.includes('\0'))throw new AgentServiceError('agent_web_asset_missing','没有此网页资源。',404);
    const directory=path.join(this.root,id),manifest=readPrivate<{id:string;files:Record<string,string>}>(path.join(directory,'bundle.json'));
    if(!manifest||manifest.id!==id||!Object.hasOwn(manifest.files,relative))throw new AgentServiceError('agent_web_asset_missing','没有此网页资源。',404);
    const file=path.join(directory,relative),stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(directory)+path.sep))throw new AgentServiceError('agent_web_payload_unsafe','网页资源身份变化。',409);
    const bytes=fs.readFileSync(file);
    if(digest(bytes)!==manifest.files[relative])throw new AgentServiceError('agent_web_payload_unsafe','网页资源内容变化。',409);
    return {bytes,mimeType:mime[path.extname(relative)]??'application/octet-stream'};
  }
}
