import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Input,Space,Switch,Typography} from 'antd';
import {useAgentConversations} from './AgentConversationsContext.tsx';
import type {HarnessSystemPromptSystemPrompt} from '../../../build/generated/agent-service-http-dto';

export function HarnessSystemPromptSettings(){
  const {api}=useAgentConversations();
  const [view,setView]=useState<HarnessSystemPromptSystemPrompt>();
  const [text,setText]=useState(''),[enabled,setEnabled]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const saving=useRef(false);
  useEffect(()=>{let live=true;api.readSystemPrompt().then(value=>{if(live){setView(value);setText(value.text);setEnabled(value.enabled);}},failure=>{if(live)setError(failure.message??'读取失败。');});return()=>{live=false;};},[api]);
  const save=async()=>{
    if(!view||saving.current)return;saving.current=true;setBusy(true);setError('');setSaved(false);
    try{const next=await api.saveSystemPrompt({expectedRevision:view.revision,enabled,text});setView(next);setSaved(true);}
    catch(failure){setError(failure instanceof Error?failure.message:'保存未确认，请重新打开核对，原文已保留。');}
    finally{saving.current=false;setBusy(false);}
  };
  return <section aria-label="Buildr Harness 系统提示词">
    <Typography.Title level={5}>Buildr Harness 系统提示词</Typography.Title>
    <Typography.Paragraph type="secondary">统一追加到 Buildr 工作对话的原生指令中，不替换原有规则。保存后从下一轮应用，正在执行的工作保持不变。</Typography.Paragraph>
    {error&&<Alert type="warning" showIcon message={error}/>}
    <Space direction="vertical" style={{width:'100%'}} size="middle">
      <Space><Switch aria-label="启用 Buildr Harness 系统提示词" checked={enabled} disabled={!view||busy} onChange={value=>{setEnabled(value);setSaved(false);}}/><span>{enabled?'已启用':'已停用'}</span></Space>
      <Input.TextArea aria-label="系统提示词内容" autoSize={{minRows:8,maxRows:18}} maxLength={16000} showCount value={text} disabled={!view||busy} onChange={event=>{setText(event.target.value);setSaved(false);}}/>
      <Typography.Paragraph type="secondary">仅影响通过 Buildr 发送的工作对话，不影响独立打开的其他应用或辅助标题。支持情况和本轮提交版本可在对话的“系统提示词”中查看；原生不支持时不会伪装成已注入。</Typography.Paragraph>
      <Space><Button aria-label="保存系统提示词" type="primary" disabled={!view||busy||(text===view.text&&enabled===view.enabled)} loading={busy} onClick={()=>void save()}>保存</Button><Button disabled={!view||busy} onClick={()=>{if(view){setText(view.defaultText);setEnabled(true);setSaved(false);}}}>恢复默认内容</Button>{saved&&<Typography.Text type="success">已保存，下一轮应用</Typography.Text>}</Space>
      {view&&<Typography.Text type="secondary">配置版本：{view.revision.slice(0,19)}</Typography.Text>}
    </Space>
  </section>;
}
