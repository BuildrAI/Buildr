import {useOptionalAgentConversations} from './AgentConversationsContext';
import { useEffect, useRef, useState } from 'react';
import { Button, Popover, Select, Slider } from 'antd';
import { DownOutlined, ReloadOutlined } from '@ant-design/icons';
import { providerNames, type ConnectionView } from './types';
import {conversationReasoningSelection,reasoningEffortLabel,selectedConversationModel,type ConversationChoice} from './conversation-options';

type Props = {
  connections:ConnectionView[];
  value:ConversationChoice;
  disabled:boolean;
  onChange(value:ConversationChoice):void;
};

export function ConversationOptions({connections,value,disabled,onChange}:Props) {
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const controlsRef=useRef<HTMLDivElement>(null);
  const context=useOptionalAgentConversations();
  const shared=context?.modelCatalog||[];
  const original=connections.find(item=>item.id===value.connectionId);
  const selectedShared=shared.find(item=>item.accountId===value.modelAccountId&&item.modelId===value.model);
  const connection=value.modelAccountId&&original?{...original,models:selectedShared?[{...selectedShared,id:selectedShared.modelId,isDefault:true}]:[]}:original;
  const model=selectedConversationModel(connection,value.model);
  useEffect(()=>{if(selectedShared&&value.modelAccountIdentity===selectedShared.accountIdentity&&value.modelAccountRevision!==selectedShared.accountRevision)onChange({...value,modelAccountRevision:selectedShared.accountRevision});},[selectedShared?.accountRevision,selectedShared?.accountIdentity,value.modelAccountIdentity,value.modelAccountRevision]);
  const defaultModel=selectedConversationModel(connection);
  const reasoning=conversationReasoningSelection(connection,value);
  const modelLabel=(selectedShared?selectedShared.accountLabel+' / '+selectedShared.label:undefined)||model?.label||value.model||defaultModel?.label||'默认模型';
  const unavailable=disabled||(!original?.models.length&&!shared.some(item=>item.available));
  useEffect(()=>{setOpen(false);},[value.connectionId,disabled]);
  useEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>controlsRef.current?.querySelector<HTMLElement>('[role="slider"],input')?.focus());
    return()=>cancelAnimationFrame(frame);
  },[open]);
  const selectEffort=(index:number)=>{
    const effort=reasoning.options[index];
    if(effort)onChange({...value,reasoningEffort:effort.id});
  };
  const controls=<div ref={controlsRef} className="ac-model-controls" role="dialog" aria-label="模型与推理强度设置" onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();setOpen(false);trigger.current?.focus();}
  }}>
    <div className="ac-model-controls-heading">
      <span aria-hidden="true"/>
      <strong aria-live="polite">{reasoning.options.length?reasoning.label:'模型设置'}</strong>
      <Button type="text" size="small" icon={<ReloadOutlined/>} aria-label="恢复默认推理强度" title="使用模型默认推理强度" disabled={disabled||!value.reasoningEffort} onClick={()=>onChange({...value,reasoningEffort:undefined})}/>
    </div>
    <Select className="ac-model-picker" aria-label="执行模型" title="模型" size="small" showSearch optionFilterProp="label"
      value={value.modelAccountId?'shared:'+value.modelAccountId+'::'+value.model:value.model||''} labelRender={({label})=>value.model?label:defaultModel?.label||'默认模型'}
      disabled={unavailable} popupMatchSelectWidth placement="topRight"
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}}
      options={[{label:'原生账号',options:[{value:'',label:'原生默认模型'},...(original?.models||[]).map(item=>({value:item.id,label:item.label}))]},...Array.from(new Set(shared.map(item=>item.accountId))).map(accountId=>({label:shared.find(item=>item.accountId===accountId)!.accountLabel,options:shared.filter(item=>item.accountId===accountId).map(item=>({value:'shared:'+accountId+'::'+item.modelId,label:item.label,disabled:!item.available}))}))]}
      onChange={model=>{const source=shared.find(item=>'shared:'+item.accountId+'::'+item.modelId===model);onChange({...value,model:source?.modelId||model||undefined,modelAccountId:source?.accountId,modelAccountRevision:source?.accountRevision,modelAccountIdentity:source?.accountIdentity,reasoningEffort:undefined});}}/>
    <div className="ac-effort-controls">
      {reasoning.options.length>1&&reasoning.index>=0?<>
        <Slider min={0} max={reasoning.options.length-1} step={1} dots value={reasoning.index} disabled={disabled}
          ariaLabelForHandle="思考深度" ariaValueTextFormatterForHandle={index=>reasoningEffortLabel(reasoning.options[index]!)}
          tooltip={{formatter:index=>index===undefined?'':reasoningEffortLabel(reasoning.options[index]!)}}
          onChange={selectEffort}/>
      </>:reasoning.options.length?<div className="ac-effort-presets" aria-label="思考深度">{reasoning.options.map((effort,index)=><Button key={effort.id} type={index===reasoning.index?'primary':'default'} size="small" disabled={disabled} onClick={()=>selectEffort(index)}>{reasoningEffortLabel(effort)}</Button>)}</div>:<p className="ac-effort-unavailable">此模型未提供可调节的推理强度</p>}
    </div>
  </div>;
  return <div className="ac-execution-options">
    <Select className="ac-choice ac-provider-select" aria-label="下一位智能体" title="智能体" variant="borderless" size="small" suffixIcon={<DownOutlined/>}
      value={value.connectionId||undefined} placeholder="选择智能体" disabled={disabled} popupMatchSelectWidth={false} placement="topRight"
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}}
      options={connections.map(item=>({value:item.id,label:providerNames[item.provider]||item.label}))}
      onChange={connectionId=>onChange(value.modelAccountId?{...value,connectionId,reasoningEffort:undefined}:{connectionId})}/>
    <Popover rootClassName="ac-panel-popup ac-model-popover" trigger="click" placement="topRight" open={open&&!unavailable} onOpenChange={next=>setOpen(next&&!unavailable)} content={controls}>
      <Button ref={trigger} type="text" size="small" className="ac-model-trigger" aria-label="模型与推理强度" aria-haspopup="dialog" aria-expanded={open&&!unavailable}
        title={modelLabel+(reasoning.options.length?` · ${reasoning.label}${reasoning.inherited?'（默认）':''}`:'')} disabled={unavailable}>
        <span className="ac-model-label">{modelLabel}</span>{reasoning.options.length>0&&<span className="ac-model-effort">{reasoning.label}</span>}<DownOutlined/>
      </Button>
    </Popover>
  </div>;
}
