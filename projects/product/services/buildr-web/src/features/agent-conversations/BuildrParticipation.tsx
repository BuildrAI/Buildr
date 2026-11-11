import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import { useAgentConversations } from './AgentConversationsContext';
import type { AgentParticipationParticipation, AgentParticipationSummaryParticipationSummary } from '../../../build/generated/agent-service-http-dto';

type Props={workspaceId:string;conversationId?:string;runId?:string};
const actionNames:Record<string,string>={available:'可发现',submitted:'已提交',requested:'请求读取／调用',observed:'实际观察'};
const statusNames:Record<string,string>={confirmed:'来源已确认',candidate:'候选来源',unknown:'来源未知'};
const providerNames:Record<string,string>={buildr:'Buildr',workspace:'工作空间',external:'外部',unknown:'未知'};
const gapNames:Record<string,string>={'implicit-consumption-unavailable':'厂商隐式加载不可观察','historical-not-collected':'部分历史执行未采集','source-discovery-unavailable':'来源观察暂不可用','source-discovery-pending':'来源快照尚未返回','discovery-partial':'仅覆盖已核验的可发现对象','unsupported-source-form':'部分请求形式无法核对来源','index-building':'部分索引正在构建','tool-observation-stale':'部分原条目已被旧写入者更新，观察版本已失效','tool-not-collected':'部分工具缺少采集字段','partial-tool-observation':'部分工具观察不完整','projection-limit':'记录超过本次投影容量','metadata-limit':'元数据超过容量'};
const resultNames:Record<string,string>={succeeded:'成功',failed:'失败',pending:'进行中',unknown:'结果未知'};
/** On-demand metadata only. Closing or changing identity invalidates the observation. */
// Temporary product visibility: keep collection and the implementation intact.
const participationEntriesVisible = false;
export function BuildrParticipation(props: Props) {
  return participationEntriesVisible ? <ParticipationDetails {...props}/> : null;
}
function ParticipationDetails({workspaceId,conversationId,runId}:Props) {
  const context=useAgentConversations();
  const [open,setOpen]=useState(false),[days,setDays]=useState(7),[cursor,setCursor]=useState<string>(),[refresh,setRefresh]=useState(0),[cut,setCut]=useState(()=>new Date().toISOString());
  const [data,setData]=useState<AgentParticipationParticipation|AgentParticipationSummaryParticipationSummary>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [filters,setFilters]=useState<Record<string,string>>({});
  const [group,setGroup]=useState('all');
  const [evidence,setEvidence]=useState<{conversationId:string;entryId:string;entryRevision:string}>(),[body,setBody]=useState('');
  const single=!!conversationId&&!!runId;
  useEffect(()=>{setOpen(false);setData(undefined);setCursor(undefined);},[workspaceId,conversationId,runId]);
  useEffect(()=>{
    if(!open)return;
    const abort=new AbortController();setLoading(true);setError('');setData(undefined);
    const now=new Date(cut);
    const query=single?context.api.participation(workspaceId,conversationId!,runId!,abort.signal):context.api.participationSummary(workspaceId,{from:new Date(now.getTime()-days*86400000).toISOString(),to:now.toISOString(),...filters,cursor},abort.signal);
    void query.then(value=>{if(!abort.signal.aborted)setData(value);},failure=>{if(!abort.signal.aborted)setError(failure instanceof Error?failure.message:'参与查询失败');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>abort.abort();
  },[open,workspaceId,conversationId,runId,single,days,cursor,refresh,cut,filters,context.api]);
  useEffect(()=>{
    setBody('');if(!open||!evidence)return;
    const abort=new AbortController();
    void context.api.entryReference(workspaceId,evidence.conversationId,evidence.entryId,evidence.entryRevision,abort.signal).then(entry=>{if(!abort.signal.aborted)setBody([entry.name,entry.input,entry.text].filter(Boolean).join('\n'));},failure=>{if(!abort.signal.aborted)setBody(failure instanceof Error?failure.message:'原文不可用；未读取当前源文件');});
    return ()=>abort.abort();
  },[open,evidence,workspaceId,context.api]);
  const close=()=>{setOpen(false);setCursor(undefined);setEvidence(undefined);};
  const showEvidence=(ref:{conversationId:string;entryId?:string;entryRevision?:string})=>{if(ref.entryId&&ref.entryRevision)setEvidence({conversationId:ref.conversationId,entryId:ref.entryId,entryRevision:ref.entryRevision});else setBody('此事实只保留原输入引用，没有可按需读取的工具正文。');};
  const filter=(key:string,value:string)=>{setFilters(previous=>({...previous,[key]:value}));setCursor(undefined);setCut(new Date().toISOString());};
  const locate=async(ref:{conversationId:string;runId:string;entryId?:string})=>{
    if(context.locateParticipation){await context.locateParticipation(workspaceId,ref.conversationId,ref.runId);close();return;}
    if(ref.conversationId!==conversationId)await context.openConversation(workspaceId,ref.conversationId,{preserveVisibility:true});
    close();requestAnimationFrame(()=>{
      const nodes=document.querySelectorAll<HTMLElement>('[data-entry-id],[data-run-id]');
      const target=[...nodes].find(node=>ref.entryId?node.dataset.entryId===ref.entryId:node.dataset.runId===ref.runId);
      target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus();
    });
  };
  return <><Button size="small" type="text" onClick={()=>setOpen(true)}>{single?'Buildr 参与':'Buildr 参与汇总'}</Button>
    <Drawer open={open} onClose={close} title={single?'本次执行的 Buildr 参与':'Buildr 参与汇总'} placement={context.side==='left'?'left':'right'} width={720} destroyOnClose>
      <Space direction="vertical" style={{width:'100%'}}>
        <Typography.Text type="secondary">工作空间：{workspaceId}。字节数是可见内容体积，不是 Token 或费用；提供、请求与实际消费不是同一事实。</Typography.Text>
        {!single&&<Select aria-label="参与汇总时间范围" value={days} options={[{value:7,label:'最近 7 天'},{value:30,label:'最近 30 天'},{value:90,label:'最近 90 天'}]} onChange={value=>{setDays(value);setCut(new Date().toISOString());setCursor(undefined);}}/>}
        {!single&&<Space wrap>
          <Select aria-label="参与执行器" allowClear placeholder="执行器" style={{width:130}} options={['codex','dsh','qoder'].map(value=>({value,label:value}))} onChange={value=>filter('provider',value??'')}/>
          <Select aria-label="参与对象种类" allowClear placeholder="种类" style={{width:130}} options={['instruction','rule','skill-catalog','skill','capability','cli','script'].map(value=>({value,label:value}))} onChange={value=>filter('kind',value??'')}/>
          <Input.Search aria-label="参与模型" placeholder="精确模型" onSearch={value=>filter('model',value)}/>
          <Input.Search aria-label="参与对象身份" placeholder="精确对象身份" onSearch={value=>filter('identity',value)}/>
          <Input.Search aria-label="参与对象版本" placeholder="精确版本" onSearch={value=>filter('version',value)}/>
        </Space>}
        <Button onClick={()=>{setCursor(undefined);setCut(new Date().toISOString());setRefresh(v=>v+1);}}>刷新</Button>
        {error&&<Alert type="error" message={error}/>}
        {data&&<><Tag>{data.coverage==='complete'?'已知范围完整':data.coverage==='not-collected'?'未采集':'部分覆盖'}</Tag>{data.gaps.length>0&&<Alert type="info" message="存在观察缺口，不能将未知解释为未使用" description={data.gaps.map(gap=>gapNames[gap]??gap).join('；')}/>}
          {'items'in data?<><Radio.Group aria-label="参与明细分组" value={group} onChange={event=>setGroup(event.target.value)} options={[{value:'all',label:'全部'},{value:'provided',label:'已提供'},{value:'usage',label:'读取／调用'},{value:'unknown',label:'候选／未知'}]}/>{data.contextUsage&&<Typography.Text>原生上下文：{data.contextUsage.usedTokens===undefined?'token 数未报告':`${data.contextUsage.usedTokens} Token`}{data.contextUsage.usedRatio!==undefined?` · ${Math.floor(data.contextUsage.usedRatio*100)}%`:''} / {data.contextUsage.windowTokens??'窗口未知'}（非累计费用）</Typography.Text>}<Typography.Text>上下文配置：{data.contextConfiguration==='new'?'本次新增':data.contextConfiguration==='inherited'?'沿用原配置':'未知'}</Typography.Text><Table rowKey={(_,i)=>String(i)} size="small" pagination={false} scroll={{x:600}} dataSource={data.items.filter(item=>group==='all'||group==='provided'&&['available','submitted'].includes(item.action)||group==='usage'&&['requested','observed'].includes(item.action)||group==='unknown'&&(item.status!=='confirmed'||item.outcome==='unknown'))} locale={{emptyText:<Empty description="未观察到可展示的参与；不代表没有使用"/>}} columns={[
            {title:'对象',render:(_,item)=><Space direction="vertical"><span>{item.name}</span><Typography.Text type="secondary">{statusNames[item.status]} · {providerNames[item.providedBy]}{item.managedBy==='buildr'?' · Buildr 管理':''}</Typography.Text></Space>},
            {title:'动作',render:(_,item)=>actionNames[item.action]}, {title:'结果',render:(_,item)=>resultNames[item.outcome]},
            {title:'输入／输出字节',render:(_,item)=>`${item.input?.utf8Bytes??'未知'} / ${item.output?.utf8Bytes??'未知'}`},
            {title:'原记录',render:(_,item)=><Button type="link" onClick={()=>showEvidence({conversationId:item.conversationId,...item.evidence})}>原文</Button>},
          ]}/></>:<><Typography.Text>已知执行 {data.runs} 次，采集到 {data.collectedRuns} 次。</Typography.Text><Table rowKey={(_,i)=>String(i)} size="small" pagination={false} scroll={{x:650}} dataSource={data.rows} columns={[
            {title:'对象／版本',render:(_,row)=><Space direction="vertical"><span>{row.name}</span><Tag>{statusNames[row.status]} · {providerNames[row.providedBy]}{row.managedBy==='buildr'?' · Buildr 管理':''}</Tag><Typography.Text ellipsis style={{maxWidth:180}}>{row.version??'版本未知'} · {row.versionBasis==='observed'?'观察版本':row.versionBasis==='offered'?'供给版本':'版本依据未知'}</Typography.Text></Space>},
            {title:'提交／请求／观察',render:(_,row)=>`${row.submitted} / ${row.requested} / ${row.observed}`},
            {title:'成功／失败／未知',render:(_,row)=>`${row.succeeded} / ${row.failed} / ${row.unknown}`},
            {title:'已知输出字节',render:(_,row)=>`${row.outputBytes}（${row.unknownMeasures} 项体积未知）`},
            {title:'可观察覆盖',render:(_,row)=>row.observableUseRatio===null?'不可计算':`${row.requestedAvailableRuns} / ${row.availableRuns}（非真实使用率）`},
            {title:'重复请求',render:(_,row)=>row.repeatedRequests??'不可计算'},
            {title:'证据',render:(_,row)=>row.evidence.map((ref,i)=><Space key={i}><Button type="link" onClick={()=>void locate(ref)}>执行 {i+1}</Button><Button type="link" onClick={()=>showEvidence(ref)}>原文</Button></Space>)},
          ]}/>{data.nextCursor&&<Button onClick={()=>setCursor(data.nextCursor)}>下一页</Button>}</>}
        </>}
        {body&&<Typography.Paragraph className="ac-participation-evidence" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{body}</Typography.Paragraph>}
        {loading&&<Typography.Text role="status">正在读取参与记录…</Typography.Text>}
      </Space>
    </Drawer></>;
}
