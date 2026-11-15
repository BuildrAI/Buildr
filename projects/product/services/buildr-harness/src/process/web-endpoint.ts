import {agentRuntimeStatus} from '../interfaces/http/runtime-status.ts';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import type {Socket} from 'node:net';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {HarnessWebSessions,type WebListenerIdentity} from './web-session-store.ts';
import {HarnessWebAssets} from './web-assets.ts';
import {AgentServiceError} from '../domain/agent-state.ts';
import {body,json} from './transport.ts';
import {createAgentServiceHttpContribution} from '../interfaces/http/agent-service-http.ts';
import {createProgrammaticHttpContribution} from '../interfaces/http/programmatic-http.ts';
import {eventStreamResponse} from '../interfaces/http/stream-response.ts';
import type {AgentProcessConnection} from './client.ts';

export interface HarnessWebStatus {enabled:boolean;ready:boolean;endpointId?:string;origin?:string;generation:string;diagnostic?:string}
interface Options {dataRoot:string;generation:string;instanceId:string;staticRoot:string;runtimeDigest?:string;ownsListener():boolean;connect():Promise<AgentProcessConnection>}
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
  private closed=false;
  private readonly identity:WebListenerIdentity;
  constructor(options:Options){this.options=options;this.sessions=new HarnessWebSessions(options.dataRoot);this.assets=new HarnessWebAssets(options.dataRoot);this.identity={instanceId:options.instanceId,generation:options.generation,pid:process.pid,released:false};}
  status():HarnessWebStatus {const state=this.sessions.read();return {enabled:state?.enabled??false,ready:!!this.server?.listening&&state?.listener?.instanceId===this.options.instanceId&&state.listener.generation===this.options.generation&&!state.listener.released&&this.origin===`http://127.0.0.1:${state.port}`,endpointId:state?.endpointId,...(state?.port?{origin:`http://127.0.0.1:${state.port}`} :{}),generation:this.options.generation,...(this.diagnostic?{diagnostic:this.diagnostic}:{})};}
  async enable(input:{port?:number}={}):Promise<HarnessWebStatus>{if(!this.options.ownsListener()||this.closed)throw new AgentServiceError('agent_web_not_coordinator','独立网页须由当前协调代次启用。',409);this.sessions.enable(input.port);return this.resume();}
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
      server.on('error',()=>{this.diagnostic='网页监听异常，尚未恢复就绪。';server.close();});
      server.on('connection',socket=>{this.sockets.add(socket);socket.once('close',()=>this.sockets.delete(socket));});
      server.listen(state.port,'127.0.0.1');await once(server,'listening');
      const address=server.address();if(!address||typeof address==='string')throw new Error('listener_address_missing');
      if(this.closed||!this.options.ownsListener())throw new AgentServiceError('agent_web_not_coordinator','网页监听期间协调身份已变化。',409);
      this.origin=`http://127.0.0.1:${address.port}`;this.sessions.listening(this.identity,address.port);this.diagnostic=undefined;
      return this.status();
    }catch(error){
      if(this.server?.listening)this.server.close();this.server=undefined;
      this.diagnostic=(error as {code?:string}).code==='EADDRINUSE'?'稳定网页端口被占用，未抢占或改用其他地址。':error instanceof AgentServiceError?error.message:'网页监听未确认就绪，未改变稳定地址。';
      throw new AgentServiceError('agent_web_not_ready',this.diagnostic,409);
    }
  }
  async login():Promise<{url:string;expiresAt:number;endpointId:string}>{
    const status=await this.resume();if(!status.ready||!this.origin||!this.bundle)throw new AgentServiceError('agent_web_not_ready','独立网页尚未就绪。',503);
    const value=this.sessions.issue(this.origin,this.bundle);return {url:this.origin+'/#ticket='+value.ticket,expiresAt:value.expiresAt,endpointId:status.endpointId!};
  }
  /** Stop accepting on the stable address, without ending old requests or native work. */
  async releaseListener():Promise<void>{
    if(this.starting)await this.starting.catch(()=>{});
    const server=this.server;
    if(server?.listening){server.close();server.closeIdleConnections();for(const stream of this.streams)stream.end();this.streams.clear();const deadline=setTimeout(()=>server.closeAllConnections(),1000);deadline.unref();await new Promise<void>(resolve=>setImmediate(resolve));if(server.listening)throw new AgentServiceError('agent_web_release_unknown','原网页监听释放未确认。',409);this.sessions.released(this.identity);}
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
  private async binary(req:IncomingMessage,limit:number):Promise<Buffer>{const chunks:Buffer[]=[];let size=0;for await(const value of req){const chunk=Buffer.from(value);size+=chunk.length;if(size>limit)throw new AgentServiceError('agent_web_input_too_large','材料超过限制。',413);chunks.push(chunk);}return Buffer.concat(chunks);}
  private async handle(req:IncomingMessage,res:ServerResponse):Promise<void>{
    this.fence(req);const url=new URL(req.url!,this.origin);
    if(url.search&&!url.pathname.startsWith('/api/'))throw new AgentServiceError('agent_web_query_invalid','网页入口不接受登录 query 或未知查询。',400);
    // API queries are parsed below from the original URL; the public index never accepts secrets in query.
    if(req.method==='POST'&&url.pathname==='/session/ticket'){
      const input=await body(req,4096);this.fence(req);if(Object.keys(input).join()!=='ticket')throw new AgentServiceError('agent_web_ticket_invalid','票据参数无效。',400);
      const value=this.sessions.exchange(this.origin!,input.ticket);
      res.setHeader('set-cookie',`${this.sessions.cookieName()}=${value.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);json(res,200,{ready:true});return;
    }
    if(req.method==='POST'&&url.pathname==='/session/revoke'){const token=this.authorize(req,true);this.sessions.revoke(token);res.setHeader('set-cookie',`${this.sessions.cookieName()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);json(res,200,{revoked:true});return;}
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
      const token=this.cookie(req);
      if(!this.sessions.authenticate(token)){
        const nonce=randomBytes(18).toString('base64');
        this.html(res,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Buildr Harness</title><p id="status">请从 Buildr Harness 启动器打开；已有草稿仍保留。</p><script nonce="${nonce}">async function redeem(){const value=new URLSearchParams(location.hash.slice(1)).get('ticket');history.replaceState(null,'','/');if(!value)return;try{const response=await fetch('/session/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket:value})});if(response.ok)location.replace('/');else document.getElementById('status').textContent='登录票据已失效，请重新从启动器打开；草稿仍保留。';}catch{document.getElementById('status').textContent='网页连接未确认，请核对启动器状态；草稿仍保留。';}}addEventListener('hashchange',redeem);void redeem();</script></html>`,nonce);return;
      }
      const html=this.assets.read(this.bundle!,'index.html').bytes.toString('utf8').replaceAll('./assets/',`/bundles/${this.bundle}/assets/`).replace('</head>',`<meta name="buildr-session" content="${token}"><meta name="buildr-web-profile" content="harness-${this.sessions.read()!.endpointId}"></head>`);
      this.html(res,html);return;
    }
    const bundle=url.pathname.match(/^\/bundles\/([a-f0-9]{64})\/(.+)$/);
    if(req.method==='GET'&&bundle){this.authorize(req);const file=this.assets.read(bundle[1]!,decodeURIComponent(bundle[2]!));res.writeHead(200,{'content-type':file.mimeType,'cache-control':'private, max-age=86400, immutable','x-content-type-options':'nosniff'});res.end(file.bytes);return;}
    if(req.method==='GET'&&url.pathname==='/mermaid-renderer.html'){this.authorize(req);const file=this.assets.read(this.bundle!,'mermaid-renderer.html');this.html(res,file.bytes.toString('utf8').replaceAll('./assets/',`/bundles/${this.bundle}/assets/`));return;}
    const connection=await this.options.connect();
    if(url.pathname==='/api/v1/harness/scopes'&&req.method==='GET'){this.authorize(req);json(res,200,await connection.scopeCatalog());return;}
    if(url.pathname==='/api/v1/harness/directories'){
      if(req.method==='GET'){this.authorize(req);json(res,200,{directories:await connection.directories.list()});return;}
      if(req.method==='POST'){this.authorize(req,true);const input=await body(req,16384);this.authorize(req,true);if(Object.keys(input).join()!=='path')throw new AgentServiceError('agent_directory_path_invalid','请选择准确目录。');json(res,201,await connection.directories.register(input.path));return;}
    }
    if(url.pathname==='/api/v1/harness/files'&&req.method==='POST'){this.authorize(req,true);const input=await body(req,16384);this.authorize(req,true);if(Object.keys(input).some(key=>!['conversationId','path'].includes(key)))throw new AgentServiceError('agent_directory_file_invalid','文件请求无效。');json(res,200,await connection.directories.preview(input));return;}
    if(!this.handlers){
      const common=createAgentServiceHttpContribution(async()=>(await this.options.connect()).operations,{executionScopeKeys:async()=>(await (await this.options.connect()).scopeCatalog()).scopes.map(value=>value.key),runtimeStatus:async()=>agentRuntimeStatus(await (await this.options.connect()).lifecycle.status()),restartRuntime:async input=>(await this.options.connect()).web.restart(input)});
      const programmatic=createProgrammaticHttpContribution(async()=>(await this.options.connect()).operations,common,{dataRoot:()=>this.options.dataRoot,workspaces:()=>[],scopeKeys:async()=>(await (await this.options.connect()).scopeCatalog()).scopes.map(value=>value.key),version:()=>'harness',buildId:()=>this.options.runtimeDigest??null});
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
