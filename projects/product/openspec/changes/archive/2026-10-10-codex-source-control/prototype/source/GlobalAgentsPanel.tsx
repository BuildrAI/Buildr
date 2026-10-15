import {useState} from 'react';
import {Alert,Button,Empty,Input,Tag,Tooltip} from 'antd';
import {DrawerShell} from 'buildr-web-source/src/components/DrawerShell';
import {CheckCircleFilled,CopyOutlined,InfoCircleOutlined,PlusOutlined,RobotOutlined} from '@ant-design/icons';
import {copyValue,registrationPrompt,usePreview,agentNames,type AgentId} from './state';
export function GlobalAgentsPanel(){
 const {connection,services,agentsOpen,setAgentsOpen,multiAgent,defaultAgent,setDefaultAgent}=usePreview();
 const [feedback,setFeedback]=useState(''),[checking,setChecking]=useState(false),[adding,setAdding]=useState(false),[details,setDetails]=useState<AgentId|null>(null);
 const registered=connection!=='unregistered';const agents:AgentId[]=registered?(multiAgent?['codex','dsh']:['codex']):[];
 const displayState=(agent:AgentId)=>agent==='codex'&&connection==='login-required'?'需要授权':agent==='codex'&&connection==='unavailable'?'暂不可用':services[agent]==='starting'?'准备中':services[agent]==='running'?'运行中':'按需启动';
 async function copy(){setFeedback(await copyValue(registrationPrompt,'agent-registration-prompt')?'已复制接入请求':'无法写入剪贴板，请选中接入请求后手动复制。');}
 function check(){setChecking(true);setTimeout(()=>{setChecking(false);setFeedback(connection==='login-required'?'请先前往 Codex 完成原有授权，再回来重试。':'Codex 暂未恢复。接入记录仍然保留。');},650);}
 return <DrawerShell title="智能体" width="min(520px, 100vw)" open={agentsOpen} onClose={()=>setAgentsOpen(false)} closeAriaLabel="关闭智能体" rootClassName="cm-agents-drawer" extra={<Button id="add-agent-entry" size="small" type="text" icon={<PlusOutlined/>} onClick={()=>{setAdding(value=>!value);setFeedback('');}}>接入</Button>}><div data-prototype-position="global-agents">
  {agents.length>0?<><p className="cm-agent-list-caption">选中项用于之后发起的新调用。</p><section className="cm-agent-list" data-prototype-position="agent-list">{agents.map(agent=><article key={agent} className={'cm-agent-list-row'+(defaultAgent===agent?' is-default':'')}>
   <button id={'select-agent-'+agent} type="button" className="cm-agent-select" aria-label={'设为默认智能体 '+agentNames[agent]} aria-pressed={defaultAgent===agent} onClick={()=>setDefaultAgent(agent)}><span className="cm-agent-choice">{defaultAgent===agent?<CheckCircleFilled/>:<span/>}</span><RobotOutlined/><strong>{agentNames[agent]}</strong><small>{displayState(agent)}</small>{defaultAgent===agent&&<Tag bordered={false}>默认</Tag>}</button>
   <Tooltip title={agentNames[agent]+' 详情'}><Button id={'agent-details-'+agent} type="text" size="small" aria-label={agentNames[agent]+' 详情'} icon={<InfoCircleOutlined/>} onClick={()=>setDetails(value=>value===agent?null:agent)}/></Tooltip>
  </article>)}</section></>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未接入智能体"/>}
  {details&&<section className="cm-agent-details" data-prototype-position="agent-details"><header><strong>{agentNames[details]} · 详情</strong><Button type="text" size="small" onClick={()=>setDetails(null)}>收起</Button></header>
   {details==='codex'&&connection!=='connected'?<Alert type="warning" showIcon message={connection==='login-required'?'请完成 Codex 原有授权':'Codex 暂不可用'} description="接入记录仍保留，恢复后可继续使用。" action={<Button size="small" loading={checking} onClick={check}>重新检查</Button>}/>:<p className="cm-agent-detail-state">已接入 · {displayState(details)}{services[details]==='reclaimed'?'，空闲服务已释放。':''}</p>}
   <dl><dt>运行</dt><dd>首次使用自动准备，后续复用专用服务。</dd><dt>回收</dt><dd>没有排队、执行或等待回应的工作，从最后一次工作结束起空闲 30 分钟后释放；下次自动启动。</dd><dt>生成</dt><dd>临时会话不积累对话历史，结果可在原处编辑和复制。</dd><dt>退出</dt><dd>退出 Buildr 会关闭专用服务；关闭浏览器标签不会退出 Buildr。</dd></dl>
  </section>}
  {(adding||!registered)&&<section className="cm-agent-add" data-prototype-position="agent-registration"><header><strong>让智能体接入 Buildr</strong>{registered&&<Button type="text" size="small" onClick={()=>setAdding(false)}>收起</Button>}</header><p>把这句话发给你希望使用的智能体：</p><Input.TextArea id="agent-registration-prompt" value={registrationPrompt} readOnly autoSize={{minRows:3,maxRows:4}}/><Button id="copy-registration-prompt" size="small" icon={<CopyOutlined/>} onClick={()=>void copy()}>复制接入请求</Button></section>}
  {feedback&&<p className="cm-feedback" role="status">{feedback}</p>}
 </div></DrawerShell>;
}
