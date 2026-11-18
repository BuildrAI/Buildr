import path from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {claimStorage,readPrivate,writePrivate,live} from './ownership.ts';
import {AgentServiceError} from '../domain/agent-state.ts';

export interface WebListenerIdentity {instanceId:string;generation:string;pid:number;released:boolean}
interface Ticket {hash:string;expiresAt:number;origin:string;bundle:string}
interface Session {hash:string;expiresAt:number;bundle:string}
interface State {version:1;endpointId:string;revision:string;enabled:boolean;port:number;developmentRoot?:string;listener?:WebListenerIdentity;tickets:Ticket[];sessions:Session[]}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Inactivity window for page sessions; authenticated activity slides it forward. */
export const PAGE_SESSION_WINDOW=30*24*60*60*1000;
const fail=(code:string,message:string,status=409):never=>{throw new AgentServiceError(code,message,status);};
/** Logical-service sessions survive compatible generations. Only hashes reach disk. */
export class HarnessWebSessions {
  private readonly filename:string;
  private readonly dataRoot:string;
  private readonly now:()=>number;
  constructor(dataRoot:string,now=Date.now){this.dataRoot=dataRoot;this.now=now;this.filename=path.join(dataRoot,'agent-service/harness-web/session-state.json');}
  read():State|undefined {
    const value=readPrivate<State>(this.filename);
    if(value&&(value.version!==1||typeof value.endpointId!=='string'||!value.endpointId||!Number.isInteger(value.port)||value.port<0||value.port>65535||typeof value.enabled!=='boolean'||!Array.isArray(value.tickets)||value.tickets.length>128||value.tickets.some(item=>!item||typeof item.hash!=='string'||!/^([a-f0-9]{64})$/.test(item.hash)||!Number.isFinite(item.expiresAt)||typeof item.origin!=='string'||typeof item.bundle!=='string')||!Array.isArray(value.sessions)||value.sessions.length>1024||value.sessions.some(item=>!item||typeof item.hash!=='string'||!/^([a-f0-9]{64})$/.test(item.hash)||!Number.isFinite(item.expiresAt)||typeof item.bundle!=='string')))fail('agent_web_state_invalid','网页服务记录不可识别，未覆盖。');
    if(value?.developmentRoot!==undefined&&(typeof value.developmentRoot!=='string'||!path.isAbsolute(value.developmentRoot)))fail('agent_web_state_invalid','开发网页来源记录无效，未覆盖。');
    return value;
  }
  private mutate<T>(action:(state:State)=>T):T {
    const lock=claimStorage(this.dataRoot);
    try {
      const state=this.read()??{version:1,endpointId:randomUUID(),revision:randomUUID(),enabled:false,port:0,tickets:[],sessions:[]};
      state.tickets=state.tickets.filter(value=>value.expiresAt>this.now());state.sessions=state.sessions.filter(value=>value.expiresAt>this.now());
      const result=action(state);state.revision=randomUUID();writePrivate(this.filename,state);return result;
    } finally {lock.release();}
  }
  enable(port?:number,developmentRoot?:string|null):State {
    if(port!==undefined&&(!Number.isInteger(port)||port<1||port>65535))fail('agent_web_port_invalid','网页端口无效。',400);
    return this.mutate(state=>{if(port&&state.port&&port!==state.port)fail('agent_web_endpoint_changed','已存在稳定端点，不能另选端口。');state.enabled=true;if(port)state.port=port;if(developmentRoot!==undefined){if(developmentRoot===null)delete state.developmentRoot;else state.developmentRoot=developmentRoot;}return state;});
  }
  listening(identity:WebListenerIdentity,port:number):void {
    this.mutate(state=>{
      if(state.listener&&!state.listener.released&&state.listener.instanceId!==identity.instanceId&&live(state.listener.pid))fail('agent_web_listener_owned','原网页监听尚未确认释放，未接管。');
      if(state.port&&state.port!==port)fail('agent_web_endpoint_changed','网页端点身份变化，未采用。');
      state.port=port;state.listener={...identity,released:false};
    });
  }
  rebind(identity:WebListenerIdentity,input:{expectedEndpointId:string;expectedPort:number;port:number}):void {
    if(!Number.isInteger(input.port)||input.port<1||input.port>65535)fail('agent_web_port_invalid','网页端口无效。',400);
    this.mutate(state=>{
      if(state.endpointId!==input.expectedEndpointId||state.port!==input.expectedPort||state.listener?.instanceId!==identity.instanceId||state.listener.generation!==identity.generation||state.listener.released)fail('agent_web_endpoint_changed','网页端点已变化，未更换端口。');
      state.port=input.port;state.tickets=[];state.sessions=[];
    });
  }
  released(identity:WebListenerIdentity):void {this.mutate(state=>{if(state.listener?.instanceId===identity.instanceId&&state.listener.generation===identity.generation)state.listener={...identity,released:true};});}
  cookieName():string {const state=this.read();if(!state?.port)fail('agent_web_not_ready','网页尚未就绪。',503);return 'buildr_harness_'+hash(state!.endpointId+':'+state!.port).slice(0,20);}
  issue(origin:string,bundle:string):{ticket:string;expiresAt:number} {
    return this.mutate(state=>{if(origin!==`http://127.0.0.1:${state.port}`||!state.listener||state.listener.released)fail('agent_web_not_ready','网页端点尚未就绪。',503);if(state.tickets.length>=128)fail('agent_web_ticket_capacity','待使用登录票据过多。');const ticket='brht_'+randomBytes(32).toString('base64url'),expiresAt=this.now()+30000;state.tickets.push({hash:hash(ticket),origin,bundle,expiresAt});return {ticket,expiresAt};});
  }
  exchange(origin:string,ticket:unknown):{token:string;expiresAt:number} {
    if(typeof ticket!=='string'||!/^brht_[A-Za-z0-9_-]{43}$/.test(ticket))fail('agent_web_ticket_invalid','登录票据无效或已使用。',401);
    return this.mutate(state=>{
      const index=state.tickets.findIndex(value=>value.hash===hash(ticket as string)&&value.origin===origin&&value.expiresAt>this.now());
      if(index<0||origin!==`http://127.0.0.1:${state.port}`)fail('agent_web_ticket_invalid','登录票据无效、已使用或目标不匹配。',401);
      if(state.sessions.length>=1024)fail('agent_web_session_capacity','有效页面会话过多。');
      const [value]=state.tickets.splice(index,1),token='brhs_'+randomBytes(32).toString('base64url'),expiresAt=this.now()+PAGE_SESSION_WINDOW;
      state.sessions.push({hash:hash(token),expiresAt,bundle:value!.bundle});return {token,expiresAt};
    });
  }
  authenticate(token:unknown):boolean{return typeof token==='string'&&/^brhs_[A-Za-z0-9_-]{43}$/.test(token)&&!!this.read()?.sessions.some(value=>value.hash===hash(token)&&value.expiresAt>this.now());}
  /** Sliding renewal for an already-authenticated session; returns its remaining lifetime.
   * Disk writes are throttled to at most once per half window. Revoked or rebound-away
   * sessions never match, so renewal cannot resurrect them. */
  renew(token:unknown):number|undefined {
    if(typeof token!=='string'||!/^brhs_[A-Za-z0-9_-]{43}$/.test(token))return undefined;
    const hashed=hash(token),match=this.read()?.sessions.find(value=>value.hash===hashed&&value.expiresAt>this.now());
    if(!match)return undefined;
    if(match.expiresAt-this.now()>PAGE_SESSION_WINDOW/2)return match.expiresAt-this.now();
    return this.mutate(state=>{const item=state.sessions.find(value=>value.hash===hashed&&value.expiresAt>this.now());if(!item)return undefined;item.expiresAt=this.now()+PAGE_SESSION_WINDOW;return PAGE_SESSION_WINDOW;});
  }
  revoke(token:string):void {this.mutate(state=>{state.sessions=state.sessions.filter(value=>value.hash!==hash(token));});}
}
