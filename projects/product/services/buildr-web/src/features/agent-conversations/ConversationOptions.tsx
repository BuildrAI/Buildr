import {preferredConversationChoice,readConversationModelPreference} from './conversation-preferences';
import {useOptionalAgentConversations} from './AgentConversationsContext';
import { useEffect } from 'react';
import {ModelPicker} from '../../components/ModelPicker';
import { Button, Popover, Select, Progress } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { providerNames, type ConnectionView, type CatalogModel } from './types';
import { contextReportWindow, conversationUsageReport } from './conversation-state';
import { ContextUsageSummary } from './ContextUsageSummary';
import {rememberReasoningEffort,restoreReasoningChoice} from './conversation-preferences';
import {modelSourceName,nextServiceTier,conversationTierChoice,conversationReasoningSelection,selectedConversationModel,catalogConversationOption,type ConversationChoice} from './conversation-options';
import {preparedAgentConnections} from '../../lib/model-picker.ts';

type Props = {
  connections:ConnectionView[];
  modelCatalog?:CatalogModel[];
  value:ConversationChoice;
  disabled:boolean;
  showAgent?:boolean;
  onChange(value:ConversationChoice,remember?:boolean):void;
};

export function ConversationOptions({connections,modelCatalog,value,disabled,onChange,showAgent=true}:Props) {
  const context=useOptionalAgentConversations();
  const shared=modelCatalog??context?.modelCatalog??[];
  const original=connections.find(item=>item.id===value.connectionId);
  const nativeModelId=value.model;
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
  const nativeFallback=false; // The shared catalog is authoritative, including disabled sources.
  const connection=original&&(!value.model||value.modelAccountId||effectiveShared)?{...original,models:effectiveShared?[{...effectiveShared,id:effectiveShared.modelId,isDefault:true}]:[]}:original;
  const model=selectedConversationModel(connection,value.model);
  useEffect(()=>{if(selectedShared&&value.modelAccountIdentity===selectedShared.accountIdentity&&value.modelAccountRevision!==selectedShared.accountRevision)onChange({...value,modelAccountRevision:selectedShared.accountRevision},false);},[selectedShared?.accountRevision,selectedShared?.accountIdentity,value.modelAccountIdentity,value.modelAccountRevision]);
  const defaultModel=selectedConversationModel(connection);
  const reasoning=conversationReasoningSelection(connection,value);
  const modelLabel=(selectedShared?modelSourceName(selectedShared.provider)+' / '+selectedShared.label+(selectedShared.enabled===false?'（已停用）':''):undefined)||model?.label||value.model||'请选择模型';
  const unavailable=disabled||(!original?.models.length&&!shared.some(item=>item.available));
  return <div className="ac-execution-options">
    {showAgent&&<ConversationAgentSelect connections={preparedAgentConnections(connections)} value={value} modelCatalog={shared} disabled={disabled} onChange={onChange}/>}
    <Popover trigger={['hover','click']} placement="top" content={<ContextUsageSummary configuredWindow={configuredWindow} report={usageReport} reportWindow={reportWindow} reportLabel={reportLabel}/>}><Button type="text" size="small" className="ac-context-trigger" aria-label="上下文窗口与用量"><Progress type="circle" size={14} strokeWidth={15} percent={usedPercent??0} showInfo={false}/></Button></Popover>
    <ModelPicker selectedKey={value.modelAccountId?'shared:'+value.modelAccountId+'::'+value.model:value.model||''} modelLabel={modelLabel} defaultLabel={value.model?defaultModel?.label:'请选择模型'} reasoning={reasoning} disabled={disabled} unavailable={unavailable} resetKey={value.connectionId}
      tierSwitchable={!!selectedShared?.serviceTiers&&selectedShared.serviceTiers.length>1} tierDisabled={disabled||selectedShared?.enabled===false||!selectedShared?.available} tierLabel={tier?.label} accelerated={accelerated}
      groups={[...(original?.models.length&&nativeFallback?[{id:'native',label:'原生账号',options:[{value:'',label:'原生默认模型'},...original.models.map(item=>({value:item.id,label:item.label}))]}]:[]),...groups.map(group=>({...group,options:candidates.filter(item=>item.accountId===group.id).map(item=>catalogConversationOption(original?.provider,item))}))]}
      onCycleTier={()=>{if(selectedShared){const next=nextServiceTier(selectedShared.serviceTiers,value.serviceTier,selectedShared.defaultServiceTier);onChange(conversationTierChoice(value,selectedShared,next),true);}}}
      onSelectModel={model=>{const source=shared.find(item=>'shared:'+item.accountId+'::'+item.modelId===model);const next={...value,model:source?.modelId||model||undefined,modelAccountId:source?.accountId,modelAccountRevision:source?.accountRevision,modelAccountIdentity:source?.accountIdentity,serviceTier:source?.defaultServiceTier,reasoningEffort:undefined};onChange(restoreReasoningChoice(next,original,shared),true);}}
      onSelectEffort={effort=>{rememberReasoningEffort({...value,model:nativeModelId,...(selectedShared?{modelAccountId:selectedShared.accountId,modelAccountIdentity:selectedShared.accountIdentity}:{})},effort);onChange({...value,reasoningEffort:effort},true);}}/>

  </div>;
}

export function ConversationAgentSelect({connections,value,disabled,onChange,modelCatalog}:Pick<Props,'connections'|'value'|'disabled'|'onChange'|'modelCatalog'>){
  const context=useOptionalAgentConversations();
  return (<Select className="ac-choice ac-provider-select" aria-label="下一位智能体" title="智能体" variant="borderless" size="small" suffixIcon={null}
      labelRender={({label})=><span className="ac-agent-label"><RobotOutlined aria-hidden="true"/>{label}</span>} value={value.connectionId||undefined} placeholder="选择智能体" disabled={disabled} popupMatchSelectWidth={false} placement="topLeft"
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}}
      options={preparedAgentConnections(connections).map(item=>({value:item.id,label:providerNames[item.provider]||item.label}))}
      onChange={connectionId=>{const connection=connections.find(item=>item.id===connectionId),catalog=modelCatalog??context?.modelCatalog??[];onChange(preferredConversationChoice({version:1,agent:{connectionId}},readConversationModelPreference(),connection?[connection]:[],catalog)??{connectionId},true);}}/>);
}
