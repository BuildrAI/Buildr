import { useEffect, useRef, useState } from 'react';
import type { Candidate } from './AddWorkspaceDialog';

export const BEFORE = '0.2.0';
export const TARGET = '0.2.1';
export type SpaceStatus = 'current'|'waiting'|'running'|'ready'|'failed'|'offline'|'conflict';
export type DemoSpace = { id:string; name:string; path:string; description:string; version:string; status:SpaceStatus; custom?:boolean };
export type UpdateStage = 'available'|'downloading'|'installing'|'restarting'|'spaces'|'partial'|'completed'|'download-error'|'install-error'|'reconnect-error';
export type AddStage = 'select'|'confirm'|'preparing'|'ready'|'failed';
export const seed:DemoSpace[] = [
  {id:'product',name:'产品研发',path:'/Users/lin/Workspaces/product',description:'产品设计、代码开发与日常协作。',version:BEFORE,status:'current'},
  {id:'team',name:'团队协作',path:'/Users/lin/Workspaces/team',description:'团队的工作资料与共同方法。',version:BEFORE,status:'current'},
  {id:'analysis',name:'数据分析',path:'/Volumes/Work/analysis',description:'数据整理、分析报告和自动化脚本。',version:BEFORE,status:'current'},
];
export const statusText:Record<SpaceStatus,string> = {current:'可用',waiting:'等待更新',running:'正在准备',ready:'可用',failed:'待完成',offline:'目录暂不可用',conflict:'有修改待确认'};
const fresh = () => seed.map(s=>({...s}));

/** In-memory demonstration only. No API, localStorage or filesystem access. */
export function useLifecycleDemo() {
  const [spaces,setSpaces] = useState<DemoSpace[]>(fresh);
  const [stage,setStage] = useState<UpdateStage>('available');
  const [installed,setInstalled] = useState(BEFORE);
  const [updateOpen,setUpdateOpen] = useState(false);
  const [addOpen,setAddOpen] = useState(false),[addStage,setAddStage] = useState<AddStage>('select');
  const [selected,setSelected] = useState<Candidate|null>(null),[name,setName] = useState(''),[addStep,setAddStep] = useState(0);
  const [opened,setOpened] = useState<string|null>(null),[conflict,setConflict] = useState<string|null>(null);
  const fault = useRef(''), consumed=useRef(false), addFault=useRef(false);
  const attempt=useRef(0),[cycle,setCycle]=useState(0);
  const active=['downloading','installing','restarting','spaces'].includes(stage);
  const readyCount=spaces.filter(s=>s.status==='ready'&&s.version===TARGET).length;
  const pending=spaces.filter(s=>['waiting','running','failed','offline','conflict'].includes(s.status));
  const setSpace=(id:string,patch:Partial<DemoSpace>)=>setSpaces(list=>list.map(s=>s.id===id?{...s,...patch}:s));

  function reset(page:string,state:string) {
    attempt.current++;setCycle(n=>n+1);fault.current='';consumed.current=false;addFault.current=false;
    setSpaces(state==='empty'?[]:fresh());setStage('available');setInstalled(BEFORE);setOpened(null);setConflict(null);
    setUpdateOpen(false);setAddOpen(false);setAddStage('select');setSelected(null);setName('');setAddStep(0);
    if(page==='add') {
      setAddOpen(true);
      const candidate:Candidate={id:'new',name:'新项目',path:'/Users/lin/Workspaces/新项目',kind:'new'};
      if(state==='existing')Object.assign(candidate,{id:'existing',name:'客户平台',path:'/Users/lin/Workspaces/customer-platform',kind:'existing'});
      if(state==='registered')Object.assign(candidate,{id:'registered',name:'产品研发',path:seed[0].path,kind:'registered'});
      if(state!=='') {setSelected(candidate);setName(candidate.name);setAddStage(['failed','ready','preparing'].includes(state)?state as AddStage:'confirm');}
      if(state==='preparing')setAddStep(0);
      if(state==='failed')setAddStep(1);
      if(['failed','ready','preparing'].includes(state))setSpaces(list=>[...list,{id:candidate.id,name:candidate.name,path:candidate.path,description:'新的工作目录，正在准备开始工作所需内容。',version:BEFORE,status:state==='ready'?'current':state==='failed'?'failed':'running'}]);
      if(state==='ready'){setAddStep(3);setOpened(candidate.id);}
    }
    if(page==='update') {
      setUpdateOpen(true);
      if(state==='download-error'||state==='install-error'||state==='reconnect-error'){setStage(state);consumed.current=true;if(state==='reconnect-error')setInstalled(TARGET);}
      else if(state==='completed'){setInstalled(TARGET);setStage('completed');setSpaces(fresh().map(s=>({...s,version:TARGET,status:'ready'})));}
      else if(state==='spaces'){setInstalled(TARGET);setStage('spaces');setSpaces(fresh().map((s,i)=>({...s,status:i===0?'ready':i===1?'running':'waiting',version:i===0?TARGET:BEFORE})));}
      else if(state==='installing'||state==='downloading'||state==='restarting'){setStage(state);if(state==='restarting')setInstalled(TARGET);}
      else if(state==='partial'){setInstalled(TARGET);setStage('partial');setSpaces(fresh().map((s,i)=>({...s,status:i===0?'ready':i===1?'failed':'offline',version:i===0?TARGET:BEFORE})));}
    }
    if(page==='recovery') {
      setInstalled(TARGET);setStage('partial');setUpdateOpen(true);
      setSpaces(fresh().map((s,i)=>({...s,version:i===0?TARGET:BEFORE,status:i===0?'ready':i===1?(state==='conflict'?'conflict':'failed'):(state==='conflict'?'ready':'offline')})));
      if(state==='conflict')setSpace('analysis',{version:TARGET});
      if(state==='background')setUpdateOpen(false);
      if(state==='completed'){setStage('completed');setSpaces(fresh().map(s=>({...s,status:'ready',version:TARGET})));}
    }
    if(page==='workspaces'&&state==='pending'){setInstalled(TARGET);setStage('partial');setSpaces(fresh().map((s,i)=>({...s,status:i===0?'ready':'failed',version:i===0?TARGET:BEFORE})));}
  }

  useEffect(()=>{
    if(!active)return;
    const timer=setTimeout(()=>{
      if(stage==='downloading'){if(fault.current==='download'&&!consumed.current){consumed.current=true;setStage('download-error');}else setStage('installing');}
      if(stage==='installing'){if(fault.current==='install'&&!consumed.current){consumed.current=true;setStage('install-error');}else{setInstalled(TARGET);setStage('restarting');}}
      if(stage==='restarting'){if(fault.current==='restart'&&!consumed.current){consumed.current=true;setStage('reconnect-error');}else{setSpaces(list=>list.map(s=>s.status==='ready'&&s.version===TARGET?s:{...s,status:'waiting'}));setStage('spaces');}}
      if(stage==='spaces') {
        const running=spaces.find(s=>s.status==='running');
        if(running) {setSpace(running.id,{status:'ready',version:TARGET});return;}
        const next=spaces.find(s=>s.status==='waiting');
        if(next){setSpace(next.id,{status:'running'});return;}
        setStage(spaces.some(s=>['failed','offline','conflict'].includes(s.status))?'partial':'completed');
      }
    },stage==='spaces'?650:1000);
    return()=>clearTimeout(timer);
  },[stage,spaces,cycle]);

  useEffect(()=>{
    if(addStage!=='preparing')return;
    const timer=setTimeout(()=>{
      if(addFault.current&&addStep===1){addFault.current=false;setAddStage('failed');if(selected)setSpace(selected.id,{status:'failed'});return;}
      if(addStep<2){setAddStep(n=>n+1);return;}
      if(selected){setSpaces(list=>list.map(s=>s.path===selected.path?{...s,name:name.trim()||selected.name,description:'所需内容已准备好，可以在这个目录开始工作。',version:installed,status:installed===TARGET?'ready':'current'}:s));if(addOpen)setOpened(selected.id);}
      setAddStep(3);setAddStage('ready');
    },800);
    return()=>clearTimeout(timer);
  },[addStage,addStep,selected,name,installed,cycle,addOpen]);

  useEffect(()=>{if(addStage==='failed'&&selected){const actual=spaces.find(s=>s.path===selected.path);if(actual&&['current','ready'].includes(actual.status))setAddStage('ready');}},[spaces,addStage,selected]);

  function beginUpdate(fail='') {fault.current=fail;consumed.current=false;setUpdateOpen(true);setStage('downloading');}
  function retry(id?:string) {
    if(['download-error','install-error','reconnect-error'].includes(stage)){setStage(stage==='download-error'?'downloading':stage==='install-error'?'installing':'restarting');return;}
    setSpaces(list=>list.map(s=>(!id||s.id===id)&&['failed','offline'].includes(s.status)?{...s,status:'waiting'}:s));
    setStage('spaces');
  }
  function beginAdd(){setAddOpen(true);if(selected&&['preparing','failed'].includes(addStage))return;setAddStage('select');setSelected(null);setName('');setAddStep(0);}
  function select(candidate:Candidate){setSelected(candidate);setName(candidate.name);setAddStage('confirm');}
  function confirmAdd(){if(selected?.kind==='registered'){setOpened('product');setAddOpen(false);return;}if(selected)setSpaces(list=>list.some(s=>s.path===selected.path)?list:[...list,{id:selected.id,name:name.trim()||selected.name,path:selected.path,description:'正在准备开始工作所需的内容。',version:installed,status:'running'}]);setAddStep(0);setAddStage('preparing');}
  function openAdded(){if(selected)setOpened(spaces.find(s=>s.path===selected.path)?.id||selected.id);setAddOpen(false);}
  function openSpace(id:string){setOpened(id);const s=spaces.find(s=>s.id===id);if(s&&['failed','offline'].includes(s.status)){setSpace(id,{status:'waiting'});setStage('spaces');}}
  function resolveConflict(keep:boolean){if(conflict)setSpace(conflict,{status:'ready',version:TARGET,custom:keep});setConflict(null);setStage(spaces.filter(s=>s.id!==conflict).some(s=>['failed','offline','conflict'].includes(s.status))?'partial':'completed');}
  return {spaces,setSpaces,stage,setStage,installed,updateOpen,setUpdateOpen,active,readyCount,pending,
    addOpen,setAddOpen,addStage,setAddStage,selected,name,setName,addStep,setAddStep,opened,setOpened,conflict,setConflict,
    reset,beginUpdate,retry,beginAdd,select,confirmAdd,openAdded,openSpace,resolveConflict,setSpace};
}
