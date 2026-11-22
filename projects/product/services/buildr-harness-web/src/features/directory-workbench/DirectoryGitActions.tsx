import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Select, Space } from 'antd';
import type { DirectoryRequest } from './api';

type Action = 'branch-switch' | 'fetch' | 'sync' | 'push' | 'create' | 'remove';
type Branch = {ref:string;name:string;hash:string;kind:'local'|'remote';current:boolean;worktreeId:string|null;worktreeLocation:string|null};
type Plan = {action:Action;title:string;description:string;input:Record<string,string>};
const actionText = { 'branch-switch':'切换分支',fetch:'获取远程',sync:'同步',push:'推送',create:'新建工作树',remove:'移除工作树' } as const;
const message = (error:unknown) => error instanceof Error?error.message:'操作结果未确认，请刷新核对，不会自动重试。';

/** Planning is read-only; only confirming the displayed exact target starts the mutation. */
export function DirectoryGitActions({request,worktreeId,active,disabled,onChanged}: {
  request:DirectoryRequest;worktreeId:string;active:boolean;disabled:boolean;onChanged():Promise<void>;
}) {
  const [planning,setPlanning]=useState(false),[executing,setExecuting]=useState(false);
  const [branchPicker,setBranchPicker]=useState<{observedRevision:string;branches:Branch[]}|null>(null);
  const [name,setName]=useState('');
  const [plan,setPlan]=useState<Plan|null>(null);
  const [feedback,setFeedback]=useState<{warning:boolean;text:string}>();
  const busy=useRef(false), pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const review=useCallback(async(action:Action)=>{
    if(busy.current||disabled||!active)return;
    busy.current=true;setPlanning(true);setFeedback(undefined);
    const read=new AbortController();pending.current=read;
    try {
      if(action==='branch-switch') {
        const value=await request<{observedRevision:string;branches:Branch[]}>('branches',{},read.signal);
        if(!read.signal.aborted)setBranchPicker(value);
        return;
      }
      if(action==='create'||action==='remove') {
        const current=await request<{location:string;manager:string;revision:string;head:string|null;createReason:string|null;removeReason:string|null}>('worktree-context',{},read.signal);
        const reason=action==='create'?current.createReason:current.removeReason;
        if(reason)throw new Error(reason);
        if(!read.signal.aborted){
          setName('');
          setPlan({action,title:actionText[action],description:action==='create'?`在 ${current.manager} 下以当前提交 ${current.head?.slice(0,12)} 新建工作树和同名本地分支。`:`移除 ${current.location}；仅允许干净工作树，本地分支保留。`,input:{expectedRevision:current.revision}});
        }
        return;
      }
      if(action==='fetch') {
        const current=await request<{revision:string;remotes:string[]}>('fetch-context',{},read.signal);
        if(!current.remotes.length)throw new Error('当前仓库没有配置远程。');
        if(!read.signal.aborted)setPlan({action,title:actionText[action],description:`获取 ${current.remotes.join('、')} 的远程跟踪记录，不切换分支、不推送。`,input:{expectedRevision:current.revision}});
        return;
      }
      const current=await request<{revision:string;target:string|null;available:boolean;reason:string|null;ahead:number|null;behind?:number|null}>(action+'-context',{},read.signal);
      if(!current.available||!current.target)throw new Error(current.reason??'尚无可核对的远程目标。');
      const description=action==='push'?`将当前分支 ${current.ahead??0} 个待推送提交普通推送到 ${current.target}，不包含未提交文件。`
        :`获取 ${current.target}，按当前分支安全条件快进或变基，再普通推送；不会丢弃未提交文件或强推。`;
      if(!read.signal.aborted)setPlan({action,title:actionText[action],description,input:{expectedRevision:current.revision}});
    } catch(error) {if(!read.signal.aborted)setFeedback({warning:true,text:message(error)});}
    finally{busy.current=false;if(!read.signal.aborted)setPlanning(false);}
  },[active,disabled,request]);
  async function confirm() {
    if(!plan||busy.current||disabled||!active||plan.action==='create'&&!name.trim())return;
    busy.current=true;setExecuting(true);setFeedback(undefined);
    try {
      const worktree=plan.action==='create'||plan.action==='remove';
      const result=await request<{status?:string;message?:string;effects?:{switched:boolean};repositories?:Array<{status:string;message:string;remotes:Array<{name:string;message:string}>}>}>(worktree?'worktree-write':plan.action,worktree?{...plan.input,action:plan.action,...(plan.action==='create'?{name:name.trim()}:{})}:plan.input);
      const fetched=result.repositories?.[0];
      setFeedback({warning:Boolean((fetched?.status??result.status)&& (fetched?.status??result.status)!=='succeeded'),text:fetched?[fetched.message,...fetched.remotes.map(item=>item.name+'：'+item.message)].join(' '):result.message??(result.effects?.switched?'已切换分支。':'当前分支保持不变。')});
    }catch(error){setFeedback({warning:true,text:message(error)});}
    finally{setPlan(null);await onChanged();setExecuting(false);busy.current=false;}
  }
  const tied=disabled||planning||executing;
  return <section aria-label="Git 管理" data-checkout={worktreeId}>
    <Space size={4} wrap>{(Object.keys(actionText) as Action[]).map(action=><Button key={action} size="small" disabled={tied} onClick={()=>void review(action)}>{actionText[action]}</Button>)}</Space>
    {feedback&&<Alert type={feedback.warning?'warning':'success'} showIcon message={feedback.text}/>}
    {branchPicker&&active&&<Modal title="选择目标分支" open onCancel={()=>setBranchPicker(null)} footer={null}>
      <Select style={{width:'100%'}} aria-label="目标分支" placeholder="选择本地或远程分支" options={branchPicker.branches.map(branch=>({value:branch.ref,label:(branch.kind==='remote'?'远程 · ':'本地 · ')+branch.name+(branch.current?'（当前）':''),title:branch.worktreeLocation??undefined,disabled:branch.current||Boolean(branch.kind==='local'&&branch.worktreeId&&branch.worktreeId!==worktreeId)}))} showSearch optionFilterProp="label" onChange={ref=>{
        const branch=branchPicker.branches.find(item=>item.ref===ref);if(!branch)return;
        setPlan({action:'branch-switch',title:'切换分支',description:`将所选工作树切换到 ${branch.name}（${branch.hash.slice(0,12)}）。不会改绑对话，不覆盖未保存内容。`,input:{targetRef:branch.ref,expectedTargetHash:branch.hash,expectedRevision:branchPicker.observedRevision}});setBranchPicker(null);
      }}/>
    </Modal>}
    {plan&&active&&<Modal open title={plan.title} okText={plan.title} cancelText="取消" confirmLoading={executing} okButtonProps={{disabled:disabled||plan.action==='create'&&!name.trim()}} onCancel={()=>{if(!executing)setPlan(null);}} onOk={()=>void confirm()}><p>{plan.description}</p>{plan.action==='create'&&<Input aria-label="新工作树与分支名" placeholder="新工作树与分支名" value={name} maxLength={80} onChange={event=>setName(event.target.value)} />}</Modal>}
  </section>;
}
