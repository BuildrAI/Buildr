import {agentRuntimeStatus} from '../interfaces/http/runtime-status.ts';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import type {Socket} from 'node:net';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {HarnessWebSessions,type WebListenerIdentity} from './web-session-store.ts';
import {HarnessWebAssets} from './web-assets.ts';
import {AgentServiceError} from '../domain/agent-state.ts';
import {body,json} from './transport.ts';
import {createAgentServiceHttpContribution} from '../interfaces/http/agent-service-http.ts';
import {createProgrammaticHttpContribution} from '../interfaces/http/programmatic-http.ts';
import {eventStreamResponse} from '../interfaces/http/stream-response.ts';
import type {AgentProcessConnection} from './client.ts';
import {chooseHarnessDirectory} from './directory-picker.ts';
import {readLocalHtmlFile,writeIsolatedLocalHtml} from '../application/local-file-preview.ts';
import {EDITABLE_FILE_JSON_BYTES} from '../workbench/editable-file.ts';
import {defaultHarnessWorkspaceRoot} from '../profile.ts';

export interface HarnessWebStatus {enabled:boolean;ready:boolean;endpointId?:string;origin?:string;generation:string;diagnostic?:string;mode?:'live'|'static'}
interface Options {dataRoot:string;profileId?:string;generation:string;instanceId:string;staticRoot:string;runtimeDigest?:string;ownsListener():boolean;connect():Promise<AgentProcessConnection>}
const PUBLIC_ICON_FILES=new Map<string,string>([
  ['favicon.ico','image/x-icon'],
  ['favicon-32x32.png','image/png'],
  ['icon-192.png','image/png'],
  ['apple-touch-icon.png','image/png'],
]);
const BOOTSTRAP_ICON_LINKS='<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">';
/** A listener owned by the shared core, not a third resident host process. */
export class HarnessWebEndpoint {
  private readonly options:Options;
  private readonly sessions:HarnessWebSessions;
  private readonly assets:HarnessWebAssets;
  private server?:Server;
  private handlers?:{common:ReturnType<typeof createAgentServiceHttpContribution>;programmatic:ReturnType<typeof createProgrammaticHttpContribution>};
  private sockets=new Set<Socket>();
  private streams=new Set<ServerResponse>();
  private starting?:Promise<HarnessWebStatus>;
  private bundle?:string;
  private diagnostic?:string;
  private origin?:string;
  private development?:{root:string;handle(req:IncomingMessage,res:ServerResponse,options?:{document?:boolean;entry?:string;frame?:boolean}):Promise<void>;close():Promise<void>};
  private developmentWork:Promise<void>=Promise.resolve();
  private closed=false;
  private readonly identity:WebListenerIdentity;
  constructor(options:Options){this.options=options;this.sessions=new HarnessWebSessions(options.dataRoot);this.assets=new HarnessWebAssets(options.dataRoot);this.identity={instanceId:options.instanceId,generation:options.generation,pid:process.pid,released:false};}
  status():HarnessWebStatus {const state=this.sessions.read();return {enabled:state?.enabled??false,ready:!!this.server?.listening&&state?.listener?.instanceId===this.options.instanceId&&state.listener.generation===this.options.generation&&!state.listener.released&&this.origin===`http://127.0.0.1:${state.port}`,endpointId:state?.endpointId,...(state?.port?{origin:`http://127.0.0.1:${state.port}`} :{}),generation:this.options.generation,...(this.diagnostic?{diagnostic:this.diagnostic}:{}),...(state?.developmentRoot?{mode:this.development?'live' as const:'static' as const}:{})};}
  developmentEnabled():boolean{return Boolean(this.sessions.read()?.developmentRoot);}
  async enable(input:{port?:number;developmentRoot?:string|null}={}):Promise<HarnessWebStatus>{
    if(!this.options.ownsListener()||this.closed)throw new AgentServiceError('agent_web_not_coordinator','独立网页须由当前协调代次启用。',409);
    if(input.developmentRoot!==undefined&&input.developmentRoot!==null)input={...input,developmentRoot:this.validateDevelopmentRoot(input.developmentRoot)};
    this.sessions.enable(input.port,input.developmentRoot);
    await this.resume();
    if(this.server?.listening)try{await this.configureDevelopment(this.server);}catch(error){this.diagnostic='开发网页未采用，静态页面与原执行保留。';throw error;}
    return this.status();
  }
  private validateDevelopmentRoot(root:string):string {
    if(this.options.profileId!=='development'||typeof root!=='string'||!path.isAbsolute(root))throw new AgentServiceError('agent_web_development_forbidden','源码热更新只允许显式 development 入口。',403);
    const real=fs.realpathSync(root);
    if(JSON.parse(fs.readFileSync(path.join(real,'package.json'),'utf8')).name!=='@buildr-ai/buildr-harness-web'||!fs.statSync(path.join(real,'src')).isDirectory())throw new AgentServiceError('agent_web_development_invalid','Harness 网页开发源码身份不匹配。',409);
    return real;
  }
  private configureDevelopment(server:Server,force=false):Promise<void> {
    const operation=this.developmentWork.catch(()=>{}).then(()=>this.applyDevelopment(server,force));
    this.developmentWork=operation;return operation;
  }
  private async applyDevelopment(server:Server,force:boolean):Promise<void> {
    const root=this.sessions.read()?.developmentRoot;
    if(root===this.development?.root&&!force)return;
    if(!root){await this.development?.close();this.development=undefined;return;}
    const real=this.validateDevelopmentRoot(root);
    const previous=this.development;this.development=undefined;
    // One upgrade handler per path. A configuration replacement may briefly
    // fall back to static HTML, but must never double-upgrade the same socket.
    await previous?.close();
    // This source adapter is never imported by a static/released endpoint.
    const {createDevelopmentWeb}=await import(pathToFileURL(path.join(real,'tools/dev-server.mjs')).href);
    const candidate=await createDevelopmentWeb({root:real,server,authorize:(req:IncomingMessage)=>this.authorize(req),
      inject:(html:string,req:IncomingMessage)=>html.replace('</head>',`<meta name="buildr-session" content="${this.authorize(req)}"><meta name="buildr-web-profile" content="harness-${this.sessions.read()!.endpointId}"></head>`)});
    if(this.closed||!this.options.ownsListener()||this.sessions.read()?.developmentRoot!==root){await candidate.close();throw new AgentServiceError('agent_web_endpoint_changed','开发网页目标已变化，未采用旧候选。',409);}
    this.development={...candidate,root:real};
    this.diagnostic=undefined;
  }
  resume():Promise<HarnessWebStatus>{
    if(this.starting)return this.starting;
    if(this.closed||!this.sessions.read()?.enabled||!this.options.ownsListener()||this.server?.listening)return Promise.resolve(this.status());
    this.starting=this.bind().finally(()=>{this.starting=undefined;});return this.starting;
  }
  private async bind():Promise<HarnessWebStatus>{
    const state=this.sessions.read()!;
    try {
      this.bundle=this.assets.install(this.options.staticRoot);
      const server=createServer((req,res)=>{void this.handle(req,res).catch(error=>this.error(res,error));});
      this.server=server;server.requestTimeout=10*60*1000;server.headersTimeout=15000;
      let sourceDiagnostic:string|undefined;
      try {await this.configureDevelopment(server);}catch{sourceDiagnostic='开发网页准备失败，静态页面与执行已保留。';}
      server.on('error',()=>{this.diagnostic='网页监听异常，尚未恢复就绪。';server.close();});
      server.on('connection',socket=>{this.sockets.add(socket);socket.once('close',()=>this.sockets.delete(socket));});
      server.listen(state.port,'127.0.0.1');await once(server,'listening');
      const address=server.address();if(!address||typeof address==='string')throw new Error('listener_address_missing');
      if(this.closed||!this.options.ownsListener())throw new AgentServiceError('agent_web_not_coordinator','网页监听期间协调身份已变化。',409);
      this.origin=`http://127.0.0.1:${address.port}`;this.sessions.listening({...this.identity,...(this.bundle?{bundle:this.bundle}:{})},address.port);this.diagnostic=sourceDiagnostic;
      return this.status();
    }catch(error){
      if(this.server?.listening)this.server.close();this.server=undefined;
      await this.development?.close();this.development=undefined;
      this.diagnostic=(error as {code?:string}).code==='EADDRINUSE'?'稳定网页端口被占用，未抢占或改用其他地址。':error instanceof AgentServiceError?error.message:'网页监听未确认就绪，未改变稳定地址。';
      throw new AgentServiceError('agent_web_not_ready',this.diagnostic,409);
    }
  }
  rebind(input:{expectedEndpointId:string;expectedPort:number;expectedGeneration:string;port:number}):Promise<HarnessWebStatus>{
    if(this.starting)return Promise.reject(new AgentServiceError('agent_web_endpoint_changed','网页正在交接，请重新观察。',409));
    const state=this.sessions.read();
    if(this.closed||!this.options.ownsListener()||input.expectedGeneration!==this.options.generation||state?.endpointId!==input.expectedEndpointId||state.port!==input.expectedPort||!this.status().ready)return Promise.reject(new AgentServiceError('agent_web_endpoint_changed','网页端点或协调代次已变化，未更换端口。',409));
    if(!Number.isInteger(input.port)||input.port<1||input.port>65535)return Promise.reject(new AgentServiceError('agent_web_port_invalid','网页端口无效。',400));
    if(input.port===input.expectedPort)return Promise.resolve(this.status());
    this.starting=this.moveListener(input).finally(()=>{this.starting=undefined;});return this.starting;
  }
  private async moveListener(input:{expectedEndpointId:string;expectedPort:number;port:number}):Promise<HarnessWebStatus>{
    const previous=this.server!;
    const candidate=createServer((req,res)=>{void this.handle(req,res).catch(error=>this.error(res,error));});
    candidate.requestTimeout=10*60*1000;candidate.headersTimeout=15000;
    candidate.on('connection',socket=>{this.sockets.add(socket);socket.once('close',()=>this.sockets.delete(socket));});
    try {
      candidate.listen(input.port,'127.0.0.1');await once(candidate,'listening');
      if(this.closed||!this.options.ownsListener())throw new AgentServiceError('agent_web_not_coordinator','网页监听期间协调身份已变化。',409);
      this.sessions.rebind(this.identity,input);
    }catch(error){
      candidate.close();candidate.closeAllConnections();
      if(error instanceof AgentServiceError)throw error;
      throw new AgentServiceError('agent_web_not_ready',(error as {code?:string}).code==='EADDRINUSE'?'目标网页端口被占用，原地址和执行均保留。':'新网页监听未确认，原地址和执行均保留。',409);
    }
    this.server=candidate;this.origin=`http://127.0.0.1:${input.port}`;this.diagnostic=undefined;
    try {await this.configureDevelopment(candidate,true);}
    catch {await this.development?.close();this.development=undefined;this.diagnostic='新地址已启用，但开发网页未恢复；静态页面与执行已保留。';}
    candidate.on('error',()=>{this.diagnostic='网页监听异常，尚未恢复就绪。';candidate.close();});
    previous.close();previous.closeAllConnections();
    return this.status();
  }
  async login():Promise<{url:string;expiresAt:number;endpointId:string}>{
    const status=await this.resume();if(!status.ready||!this.origin||!this.bundle)throw new AgentServiceError('agent_web_not_ready','独立网页尚未就绪。',503);
    const value=this.sessions.issue(this.origin,this.bundle);return {url:this.origin+'/#ticket='+value.ticket,expiresAt:value.expiresAt,endpointId:status.endpointId!};
  }
  /** Stop accepting on the stable address, without ending old requests or native work. */
  async releaseListener():Promise<void>{
    if(this.starting)await this.starting.catch(()=>{});
    await this.developmentWork.catch(()=>{});
    const server=this.server;
    await this.development?.close();this.development=undefined;
    if(server?.listening){
      const sockets=[...this.sockets];
      const closed=once(server,'close').catch(()=>{});
      server.close();
      for(const stream of this.streams)stream.end();
      this.streams.clear();
      // Let ended SSE chunks flush, then close pooled keep-alive sockets before the successor binds.
      await new Promise<void>(resolve=>setImmediate(resolve));
      server.closeIdleConnections();
      const deadline=setTimeout(()=>server.closeAllConnections(),250);
      deadline.unref();
      await closed;
      clearTimeout(deadline);
      await Promise.race([Promise.all(sockets.map(socket=>socket.closed?Promise.resolve():once(socket,'close').catch(()=>{}))),new Promise<void>(resolve=>setTimeout(resolve,50))]);
      // Allow loopback HTTP keep-alive pools (e.g. fetch/undici) one I/O poll cycle to observe FIN before successor rebind.
      await new Promise<void>(resolve=>setTimeout(resolve,5));
      if(server.listening)throw new AgentServiceError('agent_web_release_unknown','原网页监听释放未确认。',409);
      this.sessions.released({...this.identity,...(this.bundle?{bundle:this.bundle}:{})});
    }
    this.server=undefined;
  }
  async close():Promise<void>{this.closed=true;await this.releaseListener();for(const socket of this.sockets)socket.destroy();this.sockets.clear();}
  private fence(req:IncomingMessage):void {
    const state=this.sessions.read();
    if(state?.listener?.instanceId!==this.options.instanceId||state.listener.generation!==this.options.generation||state.listener.released||this.origin!==`http://127.0.0.1:${state.port}`)throw new AgentServiceError('agent_web_endpoint_changed','网页监听身份已交接，请重新读取原请求；不会自动重发。',409);
    if(!this.origin||req.headers.host!==new URL(this.origin).host||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==this.origin)throw new AgentServiceError('agent_web_origin_forbidden','网页请求目标或来源不匹配。',403);
    if(!['GET','HEAD'].includes(req.method??'GET')&&req.headers.origin!==this.origin&&!(req.url?.startsWith('/api/v1/programmatic/')&&/^Bearer brp_[A-Za-z0-9_-]{43}$/.test(req.headers.authorization??'')))throw new AgentServiceError('agent_web_origin_forbidden','网页写入需要本入口的准确同源。',403);
  }
  private cookie(req:IncomingMessage):string|undefined {const name=this.sessions.cookieName();return req.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1);}
  private authorize(req:IncomingMessage,write=false):string {
    this.fence(req);const token=this.cookie(req);
    if(!this.sessions.authenticate(token))throw new AgentServiceError('session_forbidden','Harness 页面会话已失效；草稿保留，请重新从启动器打开。',403);
    this.sessions.renew(token);
    if(write&&req.headers['x-buildr-session']!==token)throw new AgentServiceError('session_forbidden','Harness 页面写入身份不匹配。',403);
    return token!;
  }
  private error(res:ServerResponse,error:unknown):void {
    if(res.headersSent){res.destroy();return;}
    const known=error instanceof AgentServiceError;
    json(res,known?error.status:500,{error:{code:known?error.code:'agent_web_failed',message:known?error.message:'独立网页请求未完成；原工作保留，请核对当前状态。'}});
  }
  private html(res:ServerResponse,content:string,nonce?:string):void {
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':`default-src 'self'; script-src 'self'${nonce?" 'nonce-"+nonce+"'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`});res.end(content);
  }
  private mermaidHtml(res:ServerResponse,content:string):void {
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",'x-frame-options':'SAMEORIGIN'});res.end(content);
  }
  private async binary(req:IncomingMessage,limit:number):Promise<Buffer>{const chunks:Buffer[]=[];let size=0;for await(const value of req){const chunk=Buffer.from(value);size+=chunk.length;if(size>limit)throw new AgentServiceError('agent_web_input_too_large','材料超过限制。',413);chunks.push(chunk);}return Buffer.concat(chunks);}
  private readPublicIcon(name:string):{bytes:Buffer;mimeType:string}{
    const mimeType=PUBLIC_ICON_FILES.get(name);
    if(!mimeType)throw new AgentServiceError('agent_web_asset_missing','没有此网页资源。',404);
    if(this.development){
      const publicRoot=path.join(this.development.root,'public');
      const candidate=path.join(publicRoot,name);
      const stat=fs.lstatSync(candidate,{throwIfNoEntry:false});
      if(stat?.isFile()&&!stat.isSymbolicLink()&&fs.realpathSync(candidate).startsWith(fs.realpathSync(publicRoot)+path.sep)){
        return {bytes:fs.readFileSync(candidate),mimeType};
      }
    }
    return this.assets.read(this.bundle!,name);
  }
  private async handle(req:IncomingMessage,res:ServerResponse):Promise<void>{
    this.fence(req);const url=new URL(req.url!,this.origin);
    if(url.search&&!url.pathname.startsWith('/api/')&&(!this.development||url.pathname==='/'||url.pathname==='/index.html'))throw new AgentServiceError('agent_web_query_invalid','网页入口不接受登录 query 或未知查询。',400);
    // API queries are parsed below from the original URL; the public index never accepts secrets in query.
    const iconName=url.pathname.startsWith('/')?url.pathname.slice(1):'';
    if((req.method==='GET'||req.method==='HEAD')&&PUBLIC_ICON_FILES.has(iconName)){
      const file=this.readPublicIcon(iconName);
      res.writeHead(200,{'content-type':file.mimeType,'content-length':file.bytes.length,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:file.bytes);return;
    }
    if(req.method==='POST'&&url.pathname==='/session/ticket'){
      const input=await body(req,4096);this.fence(req);if(Object.keys(input).join()!=='ticket')throw new AgentServiceError('agent_web_ticket_invalid','票据参数无效。',400);
      const value=this.sessions.exchange(this.origin!,input.ticket);
      res.setHeader('set-cookie',`${this.sessions.cookieName()}=${value.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((value.expiresAt-Date.now())/1000))}`);json(res,200,{ready:true});return;
    }
    if(req.method==='POST'&&url.pathname==='/session/revoke'){const token=this.authorize(req,true);this.sessions.revoke(token);res.setHeader('set-cookie',`${this.sessions.cookieName()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);json(res,200,{revoked:true});return;}
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
      const token=this.cookie(req),remaining=this.sessions.renew(token);
      if(remaining===undefined){
        const nonce=randomBytes(18).toString('base64');
        this.html(res,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Buildr Harness</title>${BOOTSTRAP_ICON_LINKS}</head><body><p id="status">请从 Buildr Harness 启动器打开；已有草稿仍保留。</p><script nonce="${nonce}">async function redeem(){const value=new URLSearchParams(location.hash.slice(1)).get('ticket');history.replaceState(null,'','/');if(!value)return;try{const response=await fetch('/session/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket:value})});if(response.ok)location.replace('/');else document.getElementById('status').textContent='登录票据已失效，请重新从启动器打开；草稿仍保留。';}catch{document.getElementById('status').textContent='网页连接未确认，请核对启动器状态；草稿仍保留。';}}addEventListener('hashchange',redeem);void redeem();</script></body></html>`,nonce);return;
      }
      // Refresh the browser cookie to the server-side remaining lifetime so it never outlives the session.
      res.setHeader('set-cookie',`${this.sessions.cookieName()}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor(remaining/1000))}`);
      if(this.development){await this.development.handle(req,res,{document:true});return;}
      const html=this.assets.read(this.bundle!,'index.html').bytes.toString('utf8').replaceAll('./assets/',`/bundles/${this.bundle}/assets/`).replace('</head>',`<meta name="buildr-session" content="${token}"><meta name="buildr-web-profile" content="harness-${this.sessions.read()!.endpointId}"></head>`);
      this.html(res,html);return;
    }
    const bundle=url.pathname.match(/^\/bundles\/([a-f0-9]{64})\/(.+)$/);
    if(req.method==='GET'&&bundle){this.authorize(req);const file=this.assets.read(bundle[1]!,decodeURIComponent(bundle[2]!));res.writeHead(200,{'content-type':file.mimeType,'cache-control':'private, max-age=86400, immutable','x-content-type-options':'nosniff'});res.end(file.bytes);return;}
    if(req.method==='GET'&&!url.pathname.startsWith('/api/')&&this.development){
      this.authorize(req);
      const mermaid=url.pathname==='/mermaid-renderer.html';
      await this.development.handle(req,res,{document:mermaid,entry:mermaid?'mermaid-renderer.html':'index.html',frame:mermaid});return;
    }
    if(req.method==='GET'&&url.pathname==='/mermaid-renderer.html'){this.authorize(req);const file=this.assets.read(this.bundle!,'mermaid-renderer.html');this.mermaidHtml(res,file.bytes.toString('utf8').replaceAll('./assets/',`/bundles/${this.bundle}/assets/`));return;}
    const connection=await this.options.connect();
    if(url.pathname==='/api/v1/harness/scopes'&&req.method==='GET'){this.authorize(req);json(res,200,await connection.scopeCatalog());return;}
    if(url.pathname==='/api/v1/harness/directories/choose'&&req.method==='POST'){
      this.authorize(req,true);
      const input=await body(req,1024);
      if(Object.keys(input).length)throw new AgentServiceError('agent_directory_path_invalid','目录选择请求无效。');
      const selected=await chooseHarnessDirectory();
      this.authorize(req,true);
      json(res,200,{path:selected});return;
    }
    if(url.pathname==='/api/v1/harness/directories'){
      if(req.method==='GET'){this.authorize(req);json(res,200,{directories:await connection.directories.list()});return;}
      if(req.method==='POST'){this.authorize(req,true);const input=await body(req,16384);this.authorize(req,true);if(!Object.hasOwn(input,'path')||Object.keys(input).some(key=>!['path','name'].includes(key)))throw new AgentServiceError('agent_directory_path_invalid','请选择准确目录。');json(res,201,await connection.directories.register(input.path,input.name));return;}
    }
    if(url.pathname==='/api/v1/harness/files'&&req.method==='POST'){
      this.authorize(req,true);const input=await body(req,16384);this.authorize(req,true);
      if(Object.keys(input).some(key=>!['conversationId','path'].includes(key)))throw new AgentServiceError('agent_directory_file_invalid','文件请求无效。');
      const preview=await connection.directories.preview(input);
      const resolvedPath=typeof preview.path==='string'&&preview.path?preview.path:input.path;
      json(res,200,preview.kind==='html'?{...preview,path:resolvedPath,htmlUrl:`/api/v1/harness/files/html?conversationId=${encodeURIComponent(input.conversationId)}&path=${encodeURIComponent(resolvedPath)}`}:preview);return;
    }
    if(url.pathname==='/api/v1/harness/files/html'&&req.method==='GET'){
      this.authorize(req);
      const keys=[...url.searchParams.keys()];
      if(keys.some(key=>!['conversationId','path'].includes(key))||url.searchParams.getAll('conversationId').length!==1||url.searchParams.getAll('path').length!==1)throw new AgentServiceError('agent_directory_file_invalid','文件请求无效。');
      const conversationId=url.searchParams.get('conversationId')!,filePath=url.searchParams.get('path')!;
      if(!conversationId||!filePath)throw new AgentServiceError('agent_directory_file_invalid','文件请求无效。');
      const preview=await connection.directories.preview({conversationId,path:filePath});
      if(preview.kind!=='html')throw new AgentServiceError('agent_directory_file_unsupported','仅支持预览 HTML 文件。',415);
      const {html}=await readLocalHtmlFile({path:preview.path||filePath});
      writeIsolatedLocalHtml(res,html);return;
    }
    const workbench=url.pathname.match(/^\/api\/v1\/harness\/directory-workbench\/([a-z-]+)$/);
    if(workbench && req.method==='POST') {
      this.authorize(req,true);
      const operation=workbench[1], input=await body(req,operation==='save'?EDITABLE_FILE_JSON_BYTES:32768);
      this.authorize(req,true);
      json(res,200,await connection.directories.workbench(operation,input));
      return;
    }
    if(!this.handlers){
      const defaultWorkspace=()=>{const rootPath=defaultHarnessWorkspaceRoot(this.options.dataRoot);return {rootPath:fs.existsSync(rootPath)?fs.realpathSync(rootPath):rootPath};};
      const common=createAgentServiceHttpContribution(async()=>(await this.options.connect()).operations,{defaultWorkspace,prepareDefaultWorkspace:()=>{fs.mkdirSync(defaultWorkspace().rootPath,{recursive:true});},executionScopeKeys:async()=>[...new Set(['@default',...(await (await this.options.connect()).scopeCatalog()).scopes.map(value=>value.key)])],runtimeStatus:async()=>agentRuntimeStatus(await (await this.options.connect()).lifecycle.status()),restartRuntime:async input=>(await this.options.connect()).web.restart(input)});
      const programmatic=createProgrammaticHttpContribution(async()=>(await this.options.connect()).operations,common,{dataRoot:()=>this.options.dataRoot,workspaces:()=>[],scopeKeys:async()=>[...new Set(['@default',...(await (await this.options.connect()).scopeCatalog()).scopes.map(value=>value.key)])],version:()=>'harness',buildId:()=>this.options.runtimeDigest??null});
      this.handlers={common,programmatic};
    }
    const {common,programmatic}=this.handlers;
    const context={request:req,pathname:url.pathname,searchParams:url.searchParams,authorizeRead:()=>this.authorize(req),authorizeWrite:()=>this.authorize(req,true),authorizeMutation:()=>this.authorize(req,true),readJsonBody:async(limit?:number)=>{const value=await body(req,limit);this.fence(req);if(!url.pathname.startsWith('/api/v1/programmatic/'))this.authorize(req,true);return value;},readBinaryBody:async(limit:number)=>{const bytes=await this.binary(req,limit);this.authorize(req,true);return bytes;},respond:{stream:(subscription:Parameters<typeof eventStreamResponse>[1],validate:Parameters<typeof eventStreamResponse>[2])=>{this.streams.add(res);res.once('close',()=>this.streams.delete(res));return eventStreamResponse(res,subscription,validate);},binary:(bytes:Buffer,mimeType:string,options?:{filename?:string;disposition?:string})=>{res.writeHead(200,{'content-type':mimeType,'x-content-type-options':'nosniff','cache-control':'no-store',...(options?{'content-disposition':`${options.disposition}; filename*=UTF-8''${encodeURIComponent(options.filename??'file')}`}:{})});res.end(bytes);}}};
    const result=await programmatic.handleTopLevel(context)??await common.handleTopLevel(context);
    if(result===true)return;
    if(result){json(res,result.status,result.body);return;}
    throw new AgentServiceError('agent_web_route_missing','没有此网页操作。',404);
  }
}
