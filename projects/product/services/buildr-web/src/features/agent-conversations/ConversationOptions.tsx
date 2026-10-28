import {useOptionalAgentConversations} from './AgentConversationsContext';
import { useEffect, useRef, useState } from 'react';
import { Button, Popover, Select, Slider, Progress } from 'antd';
import { CheckOutlined, DownOutlined, ThunderboltFilled, ThunderboltOutlined, RobotOutlined } from '@ant-design/icons';
import { providerNames, type ConnectionView, type CatalogModel } from './types';
import { contextReportWindow, conversationUsageReport } from './conversation-state';
import { ContextUsageSummary } from './ContextUsageSummary';
import {officialConversationChoice,modelSourceName,nextServiceTier,conversationTierChoice,conversationReasoningSelection,reasoningEffortLabel,selectedConversationModel,type ConversationChoice} from './conversation-options';

type Props = {
  connections:ConnectionView[];
  modelCatalog?:CatalogModel[];
  value:ConversationChoice;
  disabled:boolean;
  showAgent?:boolean;
  onChange(value:ConversationChoice,remember?:boolean):void;
};

export function ConversationOptions({connections,modelCatalog,value,disabled,onChange,showAgent=true}:Props) {
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const controlsRef=useRef<HTMLDivElement>(null);
  const context=useOptionalAgentConversations();
  const shared=modelCatalog??context?.modelCatalog??[];
  const modelPopup=useRef<HTMLDivElement>(null);
  const original=connections.find(item=>item.id===value.connectionId);
  const nativeModelId=value.model??original?.models.find(item=>item.isDefault)?.id??original?.models[0]?.id;
  const selectedShared=shared.find(item=>item.accountId===(value.modelAccountId??'native-'+value.connectionId)&&item.modelId===nativeModelId);
  const usageReport=conversationUsageReport(context?.contextReport,context?.conversation);
  const tier=selectedShared?.serviceTiers?.find(tier=>tier.id===(value.serviceTier??selectedShared.defaultServiceTier));
  const accelerated=!!(selectedShared?.serviceTiers&&selectedShared.serviceTiers.length>1&&tier&&(tier.id==='priority'||tier.id!==selectedShared.defaultServiceTier));
  const effectiveShared=selectedShared?{...selectedShared,reasoningEfforts:tier?.reasoningEfforts??selectedShared.reasoningEfforts,defaultReasoningEffort:tier?.defaultReasoningEffort??selectedShared.defaultReasoningEffort}:undefined;
  const configuredWindow=selectedShared?.contextWindowOverride===undefined?(tier?.contextWindow??selectedShared?.contextWindow):Math.min(selectedShared.contextWindowOverride,tier?.contextWindow??selectedShared.reportedContextWindow??selectedShared.contextWindowOverride);
  const reportWindow=usageReport?contextReportWindow(usageReport,shared):undefined;
  const usedPercent=usageReport&&reportWindow?Math.min(100,Math.floor(usageReport.usedTokens/reportWindow*100)):undefined;
  const reportSource=usageReport&&shared.find(item=>item.accountId===usageReport.modelAccountId&&item.modelId===usageReport.model&&(!usageReport.modelAccountIdentity||item.accountIdentity===usageReport.modelAccountIdentity));
  const reportLabel=usageReport?(reportSource?modelSourceName(reportSource.provider)+' / '+reportSource.label:usageReport.model||usageReport.modelSourceLabel||modelSourceName(usageReport.provider??'')):undefined;
  const candidates=shared.filter(item=>item.enabled!==false||item.accountId===value.modelAccountId&&item.modelId===value.model);
  const groups=Array.from(new Set(candidates.map(item=>item.accountId))).map(id=>{const source=candidates.find(item=>item.accountId===id)!;const name=modelSourceName(source.provider);return {id,label:name+(new Set(candidates.filter(item=>modelSourceName(item.provider)===name).map(item=>item.accountId)).size>1?' · '+source.accountLabel:'')};});
  const jumpToGroup=(id:string)=>{const root=modelPopup.current;const header=Array.from(root?.querySelectorAll<HTMLElement>('[data-model-source]')??[]).find(node=>node.dataset.modelSource===id)?.closest<HTMLElement>('.ant-select-item-group');const scroll=root?.querySelector<HTMLElement>('.rc-virtual-list-holder');const first=header?.nextElementSibling as HTMLElement|null;if(header&&scroll&&first)scroll.scrollTo({top:scroll.scrollTop+first.getBoundingClientRect().top-scroll.getBoundingClientRect().top-header.getBoundingClientRect().height,behavior:'auto'});};
  const nativeFallback=!shared.some(item=>item.accountId==='native-'+original?.id);
  const connection=value.modelAccountId&&original?{...original,models:effectiveShared?[{...effectiveShared,id:effectiveShared.modelId,isDefault:true}]:[]}:original;
  const model=selectedConversationModel(connection,value.model);
  useEffect(()=>{if(selectedShared&&value.modelAccountIdentity===selectedShared.accountIdentity&&value.modelAccountRevision!==selectedShared.accountRevision)onChange({...value,modelAccountRevision:selectedShared.accountRevision},false);},[selectedShared?.accountRevision,selectedShared?.accountIdentity,value.modelAccountIdentity,value.modelAccountRevision]);
  const defaultModel=selectedConversationModel(connection);
  const reasoning=conversationReasoningSelection(connection,value);
  const modelLabel=(selectedShared?modelSourceName(selectedShared.provider)+' / '+selectedShared.label+(selectedShared.enabled===false?'（已停用）':''):undefined)||model?.label||value.model||defaultModel?.label||'默认模型';
  const unavailable=disabled||(!original?.models.length&&!shared.some(item=>item.available));
  useEffect(()=>{setOpen(false);},[value.connectionId,disabled]);
  useEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>{
      const controls=controlsRef.current;
      if(!controls||controls.contains(document.activeElement)||modelPopup.current?.contains(document.activeElement))return;
      controls.querySelector<HTMLElement>('[role="slider"],[role="radio"]')?.focus();
    });
    return()=>cancelAnimationFrame(frame);
  },[open]);
  const selectEffort=(index:number)=>{
    const effort=reasoning.options[index];
    if(effort)onChange({...value,reasoningEffort:effort.id},true);
  };
  const controls=<div ref={controlsRef} className="ac-model-controls" role="dialog" aria-label="模型与推理强度设置" onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();setOpen(false);trigger.current?.focus();}
  }}>
    <div className="ac-model-top-row">{selectedShared?.serviceTiers && selectedShared.serviceTiers.length>1?<Button type="text" size="small" className={'ac-tier-lightning'+(accelerated?' is-active':'')} disabled={disabled||selectedShared.enabled===false||!selectedShared.available} aria-label="切换服务档位" aria-pressed={accelerated} title={tier?.label||'切换服务档位'} onClick={()=>{const next=nextServiceTier(selectedShared.serviceTiers,value.serviceTier,selectedShared.defaultServiceTier);onChange(conversationTierChoice(value,selectedShared,next),true);}}>{accelerated?<ThunderboltFilled/>:<ThunderboltOutlined/>}</Button>:<Button type="text" size="small" className="ac-tier-lightning" disabled aria-label="服务档位不可切换" title="该模型未提供可切换的快速档位"><ThunderboltOutlined/></Button>}<Select className="ac-model-picker" aria-label="执行模型" title="模型" variant="borderless" size="small" showSearch optionFilterProp="label"
      value={value.modelAccountId?'shared:'+value.modelAccountId+'::'+value.model:value.model||''} labelRender={({label})=>value.model?label:defaultModel?.label||'默认模型'}
      disabled={unavailable} popupMatchSelectWidth placement="topRight" virtual={false} listHeight={248}
      popupRender={menu=><div ref={modelPopup}><nav className="ac-model-source-nav" aria-label="模型来源快速定位">{groups.map(group=><Button key={group.id} size="small" type="text" onMouseDown={event=>{event.preventDefault();event.stopPropagation();}} onClick={event=>{event.stopPropagation();jumpToGroup(group.id);}}>{group.label}</Button>)}</nav>{menu}</div>}
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup ac-model-list-popup'}}}
      options={[...(original?.models.length&&nativeFallback?[{label:'原生账号',options:[{value:'',label:'原生默认模型'},...(original?.models||[]).map(item=>({value:item.id,label:item.label}))]}]:[]),...groups.map(group=>({label:<span data-model-source={group.id}>{group.label}</span>,options:candidates.filter(item=>item.accountId===group.id).map(item=>({value:'shared:'+group.id+'::'+item.modelId,label:item.creditFactor!==undefined?`${item.label} · ${item.creditFactor.toFixed(2)}x`:item.label,disabled:!item.available}))}))]}
      onChange={model=>{requestAnimationFrame(()=>{const input=controlsRef.current?.querySelector<HTMLInputElement>('.ac-model-picker input');if(input===document.activeElement&&input?.getAttribute('aria-expanded')!=='true')input?.blur();});const source=shared.find(item=>'shared:'+item.accountId+'::'+item.modelId===model);onChange({...value,model:source?.modelId||model||undefined,modelAccountId:source?.accountId,modelAccountRevision:source?.accountRevision,modelAccountIdentity:source?.accountIdentity,serviceTier:source?.defaultServiceTier,reasoningEffort:undefined},true);}}/></div>
    <div className="ac-effort-controls">
      {reasoning.ordered&&reasoning.index>=0?<div className="ac-depth-slider"><Slider min={0} max={reasoning.options.length-1} step={1} dots value={reasoning.index} disabled={disabled} ariaLabelForHandle="思考深度" ariaValueTextFormatterForHandle={index=>reasoningEffortLabel(reasoning.options[index]!)} tooltip={{open:false}} onChange={selectEffort}/><div className="ac-depth-labels" aria-hidden="true">{reasoning.options.map((option,index)=><span key={option.id} className={index===reasoning.index?'is-selected':''} style={{left:`${index/(reasoning.options.length-1)*100}%`}}>{reasoningEffortLabel(option)}</span>)}</div></div>:reasoning.options.length?<div className="ac-effort-list" role="radiogroup" aria-label="思考深度" onKeyDown={event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)||disabled)return;event.preventDefault();const next=(Math.max(0,reasoning.index)+(event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1)+reasoning.options.length)%reasoning.options.length;selectEffort(next);event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();}}>{reasoning.options.map((effort,index)=><Button key={effort.id} role="radio" tabIndex={index===Math.max(0,reasoning.index)?0:-1} aria-checked={index===reasoning.index} type="text" className={index===reasoning.index?'is-selected':''} disabled={disabled} onClick={()=>selectEffort(index)}><span>{reasoningEffortLabel(effort)}</span>{index===reasoning.index&&<CheckOutlined aria-hidden="true"/>}</Button>)}</div>:<p className="ac-effort-unavailable">此模型未提供可调节的推理强度</p>}
    </div>
  </div>;
  return <div className="ac-execution-options">
    {showAgent&&<ConversationAgentSelect connections={connections} value={value} modelCatalog={shared} disabled={disabled} onChange={onChange}/>}
    <Popover trigger={['hover','click']} placement="top" content={<ContextUsageSummary configuredWindow={configuredWindow} report={usageReport} reportWindow={reportWindow} reportLabel={reportLabel}/>}><Button type="text" size="small" className="ac-context-trigger" aria-label="上下文窗口与用量"><Progress type="circle" size={14} strokeWidth={15} percent={usedPercent??0} showInfo={false}/></Button></Popover>
    <Popover rootClassName="ac-panel-popup ac-model-popover" trigger="click" placement="topRight" open={open&&!unavailable} onOpenChange={next=>setOpen(next&&!unavailable)} content={controls}>
      <Button ref={trigger} type="text" size="small" className="ac-model-trigger" aria-label="模型与推理强度" aria-haspopup="dialog" aria-expanded={open&&!unavailable}
        title={modelLabel+(reasoning.options.length?` · ${reasoning.label}${reasoning.inherited?'（默认）':''}`:'')} disabled={unavailable}>
        {accelerated&&<ThunderboltFilled className="ac-tier-mark" aria-hidden="true"/>}<span className="ac-model-label">{modelLabel}</span>{reasoning.options.length>0&&<span className="ac-model-effort">{reasoning.label}</span>}<DownOutlined/>
      </Button>
    </Popover>
  </div>;
}

export function ConversationAgentSelect({connections,value,disabled,onChange,modelCatalog}:Pick<Props,'connections'|'value'|'disabled'|'onChange'|'modelCatalog'>){
  const context=useOptionalAgentConversations();
  return (<Select className="ac-choice ac-provider-select" aria-label="下一位智能体" title="智能体" variant="borderless" size="small" suffixIcon={null}
      labelRender={({label})=><span className="ac-agent-label"><RobotOutlined aria-hidden="true"/>{label}</span>} value={value.connectionId||undefined} placeholder="选择智能体" disabled={disabled} popupMatchSelectWidth={false} placement="topLeft"
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}}
      options={connections.map(item=>({value:item.id,label:providerNames[item.provider]||item.label}))}
      onChange={connectionId=>onChange(officialConversationChoice(connections.find(item=>item.id===connectionId),modelCatalog??context?.modelCatalog??[]),true)}/>);
}
