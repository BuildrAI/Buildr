import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startAgentExecutionServer } from './index.js';

const bootstrap=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const marker=JSON.parse(fs.readFileSync(new URL('./fixture-version.json',import.meta.url),'utf8'));
const capabilities={supplement:true,text:true,images:true,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
function executor(id){return{descriptor:{id,label:id,capabilities},async open({configRoot}){
  fs.mkdirSync(configRoot,{recursive:true});
  const read=ref=>JSON.parse(fs.readFileSync(path.join(configRoot,ref.id+'.json'),'utf8'));
  const save=(ref,value)=>fs.writeFileSync(path.join(configRoot,ref.id+'.json'),JSON.stringify(value));
  return{bindingIdentity:id+':'+configRoot,capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'fixture',label:'fixture'}],
    beginLogin:async update=>update({state:'waiting-browser',url:'https://example.test/login'}),cancelLogin:async()=>{},
    async createContext(){const ref={id:randomUUID()};save(ref,{items:[],status:'idle',tools:[]});return ref;},resumeContext:async({contextRef})=>{read(contextRef);},readHistory:async({contextRef})=>read(contextRef).items,
    async send(input){
      const ref=input.contextRef,state=read(ref),executionRef={id:randomUUID()};
      state.executionRef=executionRef;state.status='running';state.kind=input.text;state.stopRequested=false;state.tools=[];save(ref,state);
      fs.appendFileSync(path.join(bootstrap.dataRoot,'native-sends.jsonl'),JSON.stringify({id,text:input.text,executionRef,version:marker.version})+'\n');
      input.onEvent({type:'accepted',executionRef});
      if(input.text==='lost-observation'){state.status='unknown';save(ref,state);throw new Error('dsh_execution_observation_lost');}
      if(input.text==='approval'){input.onEvent({type:'request',request:{id:'permit',kind:'approval',title:'Continue?',options:[{id:'allow',label:'Allow'}]}});}
      for(let n=0;n<3000;n++){
        const current=read(ref);
        if(current.stopRequested){if(!fs.existsSync(path.join(bootstrap.dataRoot,'finish-stop'))){await new Promise(resolve=>setTimeout(resolve,10));continue;}current.status='stopped';current.tools=[];save(ref,current);break;}
        if(current.status==='stopped')break;
        if(input.text.startsWith('hold:')&&!fs.existsSync(path.join(bootstrap.dataRoot,'release-'+input.text.slice(5)))){await new Promise(resolve=>setTimeout(resolve,10));continue;}
        if(input.text==='approval'&&!current.approved||input.text==='hold'&&!fs.existsSync(path.join(bootstrap.dataRoot,'release'))){await new Promise(resolve=>setTimeout(resolve,10));continue;}
        break;
      }
      const current=read(ref),item={id:randomUUID(),kind:'message',role:'assistant',text:'answer '+marker.version,status:'completed',executionId:executionRef.id};
      current.items.push(item);input.onEvent({type:'item',item});
      current.status=current.status==='stopped'?'stopped':'idle';save(ref,current);input.onEvent({type:'completed',status:current.status==='stopped'?'stopped':'completed'});
    },
    async supplement(input){fs.appendFileSync(path.join(bootstrap.dataRoot,'native-inputs.jsonl'),JSON.stringify({text:input.text,version:marker.version})+'\n');const state=read(input.contextRef);if(state.executionRef.id!==input.executionRef.id)throw Error('wrong execution');const item={id:input.clientRequestId,clientRequestId:input.clientRequestId,kind:'message',role:'user',text:input.text,executionId:state.executionRef.id};state.items.push(item);save(input.contextRef,state);return{executionRef:state.executionRef,inputItemId:item.id};},
    observe:async({contextRef})=>{const value=read(contextRef);return{status:value.status,tools:value.tools,executionRef:value.executionRef};},
    reply:async({contextRef})=>{const value=read(contextRef);value.approved=true;save(contextRef,value);},
    stop:async({contextRef})=>{const value=read(contextRef);if(value.kind==='hold:slow'&&!fs.existsSync(path.join(bootstrap.dataRoot,'finish-stop'))){value.stopRequested=true;value.status='tools-active';value.tools=[{id:'slow-tool',label:'正在停止的命令',status:'running',canStop:true}];}else{value.status='stopped';value.tools=[];}save(contextRef,value);return{status:value.status,tools:value.tools,executionRef:value.executionRef};},close:async()=>{if(fs.existsSync(path.join(bootstrap.dataRoot,'slow-close')))await new Promise(resolve=>setTimeout(resolve,800));},
  };
}};}
const provider={id:'fixture-model',label:'Fixture model',async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'fixture',label:'Fixture',images:false,tools:false}]}),beginLogin:async()=>{},cancelLogin:async()=>{},
  async infer({signal}){fs.appendFileSync(path.join(bootstrap.dataRoot,'model-started'),'start\n');return await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{fs.appendFileSync(path.join(bootstrap.dataRoot,'model-aborted'),'abort\n');reject(signal.reason);},{once:true});});},close:async()=>{}};}};
await startAgentExecutionServer({...bootstrap,serviceOptions:{executors:[executor('first'),executor('second')],modelProviders:[provider]}});
