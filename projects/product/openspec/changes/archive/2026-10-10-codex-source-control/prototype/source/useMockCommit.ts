import {useEffect,useRef,useState} from 'react';
import type {SourceControlRepository} from '/Users/chenjun/workspaces/BuildrAI/Buildr/projects/product/services/buildr-web/src/features/code/source-control-model';
import {sampleMessage,type CommitMode,type CommitRecord} from './state';
const mainKey='buildr:mock-buildr-main';
export function useMockCommit(repository:SourceControlRepository,onCommitted:(key:string)=>void){
 const [records,setRecords]=useState<Record<string,CommitRecord>>({});const recordsRef=useRef(records),callback=useRef(onCommitted);callback.current=onCommitted;
 const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>()),sequence=useRef(1),failNextPush=useRef(false);
 function update(key:string,value:CommitRecord){const next={...recordsRef.current,[key]:value};recordsRef.current=next;setRecords(next);}
 function stop(){for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();}
 useEffect(()=>stop,[]);
 function reset(scene:string){stop();failNextPush.current=scene==='push-will-fail';const done=['commit-success','commit-push-success','push-failed','pushing'].includes(scene);const next:Record<string,CommitRecord>=done||scene==='committing'?{[mainKey]:{sourceKey:mainKey,hash:'c0'.repeat(20),message:sampleMessage,completed:done,pushed:scene==='commit-push-success',mode:scene==='commit-success'?'commit':'commit-push',target:'origin/dev',phase:scene==='push-failed'?'push-failed':scene==='committing'?'committing':scene==='pushing'?'pushing':'success'}}:{};recordsRef.current=next;setRecords(next);}
 function push(key:string,retry=false){const original=recordsRef.current[key];if(!original?.completed)return;if(!original.target){update(key,{...original,phase:'upstream-missing'});return;}update(key,{...original,phase:'pushing'});timers.current.set(key,setTimeout(()=>{timers.current.delete(key);const failed=!retry&&failNextPush.current;failNextPush.current=false;update(key,{...original,phase:failed?'push-failed':'success',pushed:!failed});},900));}
 function commit(key:string,text:string,mode:CommitMode){
  const tree=repository.worktrees.find(item=>repository.id+':'+item.worktreeId===key);if(!tree||!tree.changes.length||!text.trim()||recordsRef.current[key]?.completed)return;
  const record:CommitRecord={sourceKey:key,phase:'committing',mode,message:text,completed:false,pushed:false,target:tree.upstream||null,hash:'c0'.repeat(19)+(sequence.current++%256).toString(16).padStart(2,'0')};update(key,record);
  timers.current.set(key,setTimeout(()=>{timers.current.delete(key);const done={...record,completed:true,phase:'success' as const};update(key,done);callback.current(key);if(mode==='commit-push')push(key);},650));
 }
 return {records,commit,retryPush:(key:string)=>push(key,true),reset,stop};
}
