/** Offline candidate browser fixture: production renderer/slots/features with controlled data and RPC. */
import React, {useLayoutEffect,useRef,useState} from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactJSX from 'react/jsx-runtime';
import * as Cordis from '@deepseek-ai/cordis';
import * as Store from '@deepseek-ai/dsh-client-store';
import * as Slots from '@deepseek-ai/dsh-client-ui-slots';
import * as Primitives from '@deepseek-ai/dsh-client-ui-primitives';
import * as Dockkit from '@deepseek-ai/dsh-client-ui-dockkit';
import * as Modules from '@deepseek-ai/dsh-client-modules/client';
import {ClientModuleSystem, createClientModuleSystem} from '@deepseek-ai/dsh-client-modules/client';
import type {ClientModuleLoaderTarget} from '@deepseek-ai/dsh-client-modules/client';
import * as rendererPlugin from '@deepseek-ai/dsh-client-ui-renderer/client';
import * as sessionPlugin from '@deepseek-ai/dsh-client-ui-session/client';
import * as localePlugin from '@deepseek-ai/dsh-client-locale/client';
import * as trajectoryPlugin from '@deepseek-ai/dsh-client-ui-trajectory/client';
import {UiConversation,EMPTY_CONVERSATION_SNAPSHOT} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {ConversationBinding,ConversationSnapshot} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {TrajectorySnapshot} from '@deepseek-ai/dsh-client-ui-trajectory/client';
import {deriveTrajectoryLayout} from '@deepseek-ai/dsh-client-ui-trajectory/src/client/layout.ts';
import {trajectoryRecordContext} from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-extensions.ts';
import {TestSessions} from '@deepseek-ai/dsh-client-test-runtime/src/sessions.ts';
import {TestRemote} from '@deepseek-ai/dsh-client-test-runtime/src/remote.ts';
import {TestWorkspaces} from '@deepseek-ai/dsh-client-test-runtime/src/workspaces.ts';
import type {SessionReference} from '@deepseek-ai/dsh-api-session-controller/client';
import type {SessionId} from '@deepseek-ai/dsh-session/types';
import type {ComposedProps} from '@deepseek-ai/dsh-client-ui-slots';
import type {EventSources,EventSourceMatch,SourceRecordRequest,SourceRecordResult} from '../../plugin/src/source-types.ts';
import {recordedSourceSummary} from '../../plugin/src/event-sources.ts';
import type {ConfigForm,ConfigFormSnapshot} from '@deepseek-ai/dsh-client-ui-settings/client';
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css';
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css';
import '@deepseek-ai/dsh-client-ui-theme/src/styles/focus.css';
import releaseCode from 'buildr-release-artifact?raw';
import devCode from 'buildr-dev-artifact?raw';

const SID='candidate-browser-session' as SessionId;
const releasedId='@buildr-ai/buildr-dsh-plugin',devId='@buildr-ai/buildr-dsh-plugin-dev';
const requests:SourceRecordRequest[]=[];
const gate={armed:false,started:false,released:false};let releaseGate=()=>{};
function armGate(){gate.armed=true;gate.started=false;gate.released=false;}

const userNodes:TrajectorySnapshot['eventNodes']=Array.from({length:80},(_,index)=>({kind:'user',seq:index===0?1:index+3,time:1000+index*400,content:[{type:'text',text:index===0?'Original preserved user input':'Loaded window record '+(index+1)}],source:null}));
const first=userNodes[0];if(first===undefined)throw Error('Fixture must have a durable user record');
const methodNodes:TrajectorySnapshot['eventNodes']=Array.from({length:24},(_,index)=>({kind:'tool-result',seq:86+index,time:35000+index*400,callId:'fixture-method-'+index,call:{name:'skill',argsRaw:JSON.stringify({name:'method-sample-'+(index+1)})},callTime:34900+index*400,content:[{type:'text',text:'Controlled Buildr method result'}],isError:false,subCalls:[]}));
// Replace one spare sample so the loaded-window/virtualization size stays unchanged.
// This is a controlled failed Buildr capability, with no user document in its output.
methodNodes[23]={kind:'tool-result',seq:109,time:44200,callId:'fixture-failed-capability-call',call:{name:'bash',argsRaw:JSON.stringify({command:'buildr task inspect fixture-failed-task --json'})},callTime:44100,content:[{type:'text',text:'Controlled Buildr capability failure; no user document.'}],isError:true,subCalls:[]};
const readMeta=(path:string)=>({path,offset:1,totalLines:1,lines:[{number:1,text:'Controlled read window'}]});
const nodes:TrajectorySnapshot['eventNodes']=[first,{kind:'tool-result',seq:3,time:1300,callId:'fixture-read-call',call:{name:'read_file',argsRaw:'{"path":"/fixture/AGENTS.md"}'},callTime:1100,content:[{type:'text',text:'Original preserved tool output'}],meta:readMeta('/fixture/AGENTS.md'),isError:false,subCalls:[]},...userNodes.slice(1),
 {kind:'tool-result',seq:83,time:33000,callId:'fixture-ordinary-call',call:{name:'read_file',argsRaw:'{"path":"/fixture/user-notes.md"}'},callTime:32800,content:[{type:'text',text:'Ordinary user material remains in the original trajectory'}],meta:readMeta('/fixture/user-notes.md'),isError:false,subCalls:[]},
 {kind:'tool-result',seq:84,time:33400,callId:'fixture-skill-call',call:{name:'skill',argsRaw:'{"name":"task-review"}'},callTime:33200,content:[{type:'text',text:'Controlled skill result'}],isError:false,subCalls:[]},
 {kind:'tool-result',seq:85,time:33800,callId:'fixture-capability-call',call:{name:'bash',argsRaw:'{"command":"buildr task inspect --task fixture-task --json"}'},callTime:33600,content:[{type:'text',text:'Controlled capability result'}],isError:false,subCalls:[]},
 ...methodNodes,
 {kind:'tool-result',seq:110,time:44800,callId:'fixture-multi-call',call:{name:'skill',argsRaw:'{"name":"buildr-rule-set"}'},callTime:44600,content:[{type:'text',text:'Controlled two-method result'}],isError:false,subCalls:[]}];
function configScope<T>():ConfigForm<T>{
 const snapshot=Store.createSnapshotStore<ConfigFormSnapshot<T>>({status:'loading',value:undefined,base:undefined,user:undefined,revision:undefined,writable:false,mode:'host'});
 return {...snapshot,set:async()=>true,mutate:async()=>true,unset:async()=>true};
}
// Synthetic Buildr-owned method text stresses detail scrolling; it is not any user document.
const coreRuleContent=['# Recorded Buildr rule','This is the method text retained in the original event.','Synthetic Buildr method fixture; no user materials are included.',...Array.from({length:120},(_,index)=>`Synthetic method instruction ${index+1}: preserve observable facts and bounded work.`),'SYNTHETIC_BUILDR_METHOD_END'].join('\n');
function match(name:string,kind:EventSourceMatch['kind'],content:string,block=0):EventSourceMatch{return {providedBy:'buildr',kind,identity:'captured:'+kind+':'+name,name,locator:{workspaceId:'captured-fixture',scope:'.',path:kind==='rule'?'/captured/AGENTS.md':'/captured/'+name+'/SKILL.md'},action:kind==='capability'?'call':kind==='rule'?'read':'load',observedVersion:{algorithm:'sha256',digest:'a'.repeat(64),target:'content'},evidence:[{authority:'captured-producer',identity:'fixture-receipt'}],contentRefs:content.length?[{block,start:0,end:content.length,unit:'utf16'}]:[],completeness:content.length?'complete':'none'};}
const capturedNodes:TrajectorySnapshot['eventNodes']=nodes.map(node=>{
 if(node.kind!=='tool-result')return node;
 const callId=node.callId,methodIndex=methodNodes.findIndex(item=>'callId'in item&&item.callId===callId),skillName=callId==='fixture-skill-call'?'task-review':'method-sample-'+(methodIndex+1);
 if(callId==='fixture-ordinary-call')return {...node,eventSources:{schemaVersion:'dsh.event-sources/v1',status:'not-applicable',matches:[]}};
 const failed=callId==='fixture-failed-capability-call',capability=failed||callId==='fixture-capability-call',multiple=callId==='fixture-multi-call',core=callId==='fixture-read-call';
 let contents:string[],matches:EventSourceMatch[];
 if(capability){contents=node.content.flatMap(block=>block.type==='text'?[block.text]:[]);matches=[{...match('task inspect','capability',''),locator:{entry:'/captured/buildr.mjs'},observedVersion:{algorithm:'sha256',digest:'b'.repeat(64),target:'entry'},operation:'task inspect',targets:[{kind:'task',id:failed?'fixture-failed-task':'fixture-task',title:failed?'Failed fixture task':'Fixture task'}]}];}
 else if(multiple){contents=[coreRuleContent,'Second Buildr method content.'];matches=[match('Buildr 核心规则','rule',contents[0]!,0),match('Buildr execution rule','rule',contents[1]!,1)];}
 else if(core){const prefix='Original preserved tool output\n';contents=[prefix+coreRuleContent];matches=[{...match('Buildr 核心规则','rule',coreRuleContent),completeness:'partial',contentRefs:[{block:0,start:prefix.length,end:contents[0]!.length,unit:'utf16'}]}];}
 else{contents=['# '+skillName+'\nBuildr method instructions for the selected skill.'];matches=[match(skillName,'skill',contents[0]!)];}
 const eventSources:EventSources={schemaVersion:'dsh.event-sources/v1',status:'confirmed',matches,...(core?{mixed:true}:{}),...(capability?{execution:{outcome:failed?'failed' as const:'succeeded' as const,exitCode:failed?1:0}}:{})};
 return {...node,content:contents.map(text=>({type:'text' as const,text})),eventSources};
});
const cells=deriveTrajectoryLayout({nodes:capturedNodes,partial:null,runningCalls:[],eventLocations:new Map()},key=>key).flatMap(turn=>turn.groups.flatMap(group=>group.cells));
const records=cells.flatMap(cell=>{const record=trajectoryRecordContext(SID,cell);return record===undefined?[]:[record];});
const snapshot:TrajectorySnapshot={eventNodes:capturedNodes,eventLocations:new Map(),requests:[],callSchemas:new Map([['fixture-read-call',{name:'read_file',description:'Read-only external fixture operation',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}}]]),partial:null,runningCalls:[],recordContexts:records};
const trajectory=Store.createSnapshotStore(snapshot);
const conversation=Store.createSnapshotStore<ConversationSnapshot>({...EMPTY_CONVERSATION_SNAPSHOT,activeTargets:new Set(['trajectory'])});
const binding:ConversationBinding={snapshot:conversation,openTurn:Store.createSnapshotStore<number|undefined>(undefined),activate:()=>{},target:key=>key==='trajectory'?trajectory:Store.createSnapshotStore(undefined)};
class FixtureConversation extends UiConversation {override binding():ConversationBinding{return binding;}}
async function sourceRecord(input:SourceRecordRequest){
 requests.push(input);if(gate.armed){gate.armed=false;gate.started=true;await new Promise<void>(resolve=>{releaseGate=()=>{gate.released=true;resolve();};});}
 const record=records.find(record=>record.recordId===input.record.recordId);if(!record)throw Error('Missing original persisted fixture record');
 const base=recordedSourceSummary(record);if(!base.ready)throw Error('Local captured summary must be ready');
 const value:SourceRecordResult={...base,result:{...base.result,items:base.result.items.map(item=>({...item,objects:item.objects.map(object=>{
  if(object.kind==='capability')return object;
  for(const entry of record.eventSources??[]){const source=entry.sources as EventSources;const match=source.matches.find(match=>match.identity===object.identity&&item.id.endsWith(':event:'+entry.seq+':'+match.identity));if(!match)continue;const node=capturedNodes.find(node=>node.seq===entry.seq);if(!node||!('content'in node))continue;const content=(match.contentRefs??[]).map(ref=>{const block=node.content[ref.block];return block?.type==='text'?block.text.slice(ref.start,ref.end):'';}).join('\n\n');return {...object,observed:{...object.observed,...(content?{content}:{})}};}
  return object;
 })}))}};
 return {ok:true as const,value};
}
type FrameProps=ComposedProps<'root',never,'conversation.view'|'sidebar.footer.action'|'shell.overlay',undefined,{reference:SessionReference;unload():Promise<void>}>;
function Frame(props:FrameProps){
 const [view,setView]=useState('trajectory');
 const toolbar=useRef<HTMLElement>(null),[toolbarHeight,setToolbarHeight]=useState(84);
 useLayoutEffect(()=>{const element=toolbar.current;if(element===null)return;const measure=()=>setToolbarHeight(element.getBoundingClientRect().height);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 // The host gives the whole conversation viewport, including its overlaid composer. The
 // production view, not this fixture, must reserve those 170 px and bound its own scroll panes.
 const bodyStyle={position:'fixed',top:toolbarHeight,left:0,right:0,bottom:0,height:'auto',overflow:'hidden','--dsh-conversation-viewport-height':`calc(100dvh - ${toolbarHeight}px)`,'--dsh-composer-height':'170px'} as React.CSSProperties;
 return <><header ref={toolbar} className="fixture-toolbar"><strong>Buildr 候选验证夹具（非当前桌面）</strong><button onClick={()=>setView('trajectory')}>原轨迹入口</button><button onClick={()=>setView('buildr')}>Buildr 来源入口</button><button onClick={()=>setView('buildr-dev')}>Buildr 开发入口</button><button onClick={()=>setView('withdrawn')}>撤回来源消费者</button><button onClick={()=>void props.unload()}>卸载 Buildr 贡献</button></header><main className="fixture-body" style={bodyStyle}><props.SessionProvider session={props.reference}>{props.renderSlot('conversation.view',{inspectCall:undefined,viewRequest:undefined,openView:()=>setView('trajectory'),completeViewRequest:()=>{}},{only:view})}</props.SessionProvider></main><footer data-fixture-composer="" aria-label="模拟宿主输入区" style={{position:'fixed',left:0,right:0,bottom:0,height:170,boxSizing:'border-box',padding:16,borderTop:'1px solid var(--dsw-alias-border-l2)',background:'var(--dsw-alias-bg-layer-1)',zIndex:20}}>受控宿主底部输入区（170px）</footer></>;
}
interface ClientPlugin {inject:string[];apply(ctx:Cordis.Context):void|Promise<void>}
function isClientPlugin(value:unknown):value is ClientPlugin{return typeof value==='object'&&value!==null&&'apply'in value&&typeof value.apply==='function'&&'inject'in value&&Array.isArray(value.inject)&&value.inject.every(key=>typeof key==='string');}
async function boot(){
 const target:ClientModuleLoaderTarget={mode:'queue',pendingQueue:[],load(registration){this.pendingQueue.push(registration);},create(options){return createClientModuleSystem(this,{id:'@deepseek-ai/dsh-client-modules',exports:Modules},options);}};
 Object.assign(window,{__ModuleLoader__:target});
 const seed={'react':React,'react/jsx-runtime':ReactJSX,'react-dom':ReactDOM,'react-dom/client':ReactDOMClient,'@deepseek-ai/cordis':Cordis,'@deepseek-ai/dsh-client-store':Store,'@deepseek-ai/dsh-client-ui-slots':Slots,'@deepseek-ai/dsh-client-ui-primitives':Primitives,'@deepseek-ai/dsh-client-ui-dockkit':Dockkit};
 const modules=new ClientModuleSystem({manifest:{rev:'offline-candidate',modules:[],plugins:[]},staticModules:seed,registrationTarget:target,bootstrapModule:{id:'@deepseek-ai/dsh-client-modules',exports:Modules},loadBundle:async url=>{throw Error('Unexpected external bundle load: '+url);}});
 for(const code of [releaseCode,devCode]){const script=document.createElement('script');script.textContent=code;document.head.append(script);}
 const release=await modules.import(releasedId,'',{}),dev=await modules.import(devId,'',{});if(!isClientPlugin(release)||!isClientPlugin(dev))throw Error('Actual bundle did not export a Client plugin');
 const ctx=new Cordis.Context();await ctx.plugin(rendererPlugin).await();
 const stabilize=async(fn:()=>void|Promise<void>)=>{await fn();};const sessions=new TestSessions(stabilize,ctx),workspaces=new TestWorkspaces(stabilize);
 ctx.provide('sessions',sessions);ctx.provide('workspaces',workspaces);class ControlledRemote extends TestRemote{override async $mount(){return async()=>{};}}new ControlledRemote(ctx,{buildr:{activation:async()=>({ok:true,value:{active:true,packageName:releasedId}}),sourceRecord,open:async()=>({ok:true,value:{ready:false,code:'fixture-only',message:''}})},'buildr-dev':{activation:async()=>({ok:true,value:{active:true,packageName:devId}}),sourceRecord,open:async()=>({ok:true,value:{ready:false,code:'fixture-only',message:''}})}});
 ctx.provide('configForms',{developerTools:{enabled:Store.createSnapshotStore(true)},get:configScope});ctx.provide('connection',{api:{settings:{}},isLoopback:false});ctx.provide('fileUpload',{upload:async()=>{throw Error('Not a fixture capability');}});
 ctx.slots.provideRoot({hooks:{workspaces:workspaces.list,panelInfo:Store.createSnapshotStore({activePanelId:null})}});
 await sessions.add({id:SID,snapshot:{blank:false},session:{loadOlder:async()=>{}}});const reference=sessions.retain(SID);await reference.ready;await ctx.plugin(sessionPlugin).await();new FixtureConversation(ctx,sessions);
 ctx.provide('sidebarRight',{mounted:Store.createSnapshotStore(SID),openTabs:Store.createSnapshotStore([]),active:()=>undefined,isExpanded:()=>false,toggleExpanded:()=>{},focus:()=>{},openTab:()=>{throw Error('Unexpected navigation');}});ctx.provide('layout',{panelInfo:Store.createSnapshotStore({activePanelId:null})});
 await ctx.plugin(localePlugin).await();
 let released:Cordis.Fiber|undefined;
 ctx.slots.register({name:'root',children:{'conversation.view':{kind:'list',scope:'session'},'sidebar.footer.action':{kind:'list',scope:'root'},'shell.overlay':{kind:'list',scope:'root'}},inject:()=>({reference,unload:async()=>{await released?.dispose();}})},Frame);
 await ctx.plugin(trajectoryPlugin).await();for(const name of release.inject)if(ctx.get(name)===undefined)throw Error('Missing fixture input: '+name);released=ctx.plugin(release);await released.await();
 const container=document.getElementById('app');if(container===null)throw Error('Missing fixture mount');ctx.uiRenderer.mount(container);
 Object.assign(window,{sourceFixture:{requests,records,gate,armGate,releaseGate:()=>releaseGate(),async mountDev(){await ctx.plugin(dev).await();},async unload(){await released?.dispose();},context:ctx}});
 document.documentElement.dataset.fixtureReady='true';
}
void boot().catch(error=>{document.documentElement.dataset.fixtureError=String(error);console.error(error);});
