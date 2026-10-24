import { Select } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { providerNames, type ConnectionView } from './types';
import {conversationReasoningOptions,reasoningEffortLabel,selectedConversationModel,type ConversationChoice} from './conversation-options';

type Props = {
  connections:ConnectionView[];
  value:ConversationChoice;
  disabled:boolean;
  onChange(value:ConversationChoice):void;
};

export function ConversationOptions({connections,value,disabled,onChange}:Props) {
  const connection=connections.find(item=>item.id===value.connectionId);
  const model=selectedConversationModel(connection,value.model);
  const defaultModel=selectedConversationModel(connection);
  const reasoningOptions=conversationReasoningOptions(connection,value.model);
  const defaultEffort=reasoningOptions.find(item=>item.id===model?.defaultReasoningEffort);
  const defaultEffortLabel=defaultEffort?`默认 · ${reasoningEffortLabel(defaultEffort)}`:'默认深度';
  const selectedEffort=reasoningOptions.find(item=>item.id===value.reasoningEffort);
  const reasoningLabel=selectedEffort?reasoningEffortLabel(selectedEffort):value.reasoningEffort||(defaultEffort?reasoningEffortLabel(defaultEffort):'默认');
  return <div className="ac-execution-options">
    <Select className="ac-choice ac-provider-select" aria-label="下一位智能体" title="智能体" variant="borderless" size="small" suffixIcon={<DownOutlined/>}
      value={value.connectionId||undefined} placeholder="选择智能体" disabled={disabled} popupMatchSelectWidth={false} placement="topRight"
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}}
      options={connections.map(item=>({value:item.id,label:providerNames[item.provider]||item.label}))}
      onChange={connectionId=>onChange({connectionId})}/>
    <Select className="ac-choice ac-model-select" aria-label="执行模型" title="模型" variant="borderless" size="small" suffixIcon={<DownOutlined/>}
      value={value.model||''} labelRender={({label})=>value.model?label:defaultModel?.label||'默认模型'}
      disabled={disabled||!connection?.models.length} popupMatchSelectWidth={false} placement="topRight"
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}}
      options={[{value:'',label:defaultModel?`默认 · ${defaultModel.label}`:'默认模型'},...(connection?.models||[]).map(item=>({value:item.id,label:item.label}))]}
      onChange={model=>onChange({...value,model:model||undefined,reasoningEffort:undefined})}/>
    {reasoningOptions.length>0&&<Select className="ac-choice ac-reasoning-select" aria-label="思考深度" title="思考深度" variant="borderless" size="small" suffixIcon={<DownOutlined/>}
      value={value.reasoningEffort||''} labelRender={()=>reasoningLabel} disabled={disabled} popupMatchSelectWidth={false}
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}} options={[{value:'',label:defaultEffortLabel},...reasoningOptions.map(item=>({value:item.id,label:reasoningEffortLabel(item)}))]}
      onChange={reasoningEffort=>onChange({...value,reasoningEffort:reasoningEffort||undefined})}/>}
  </div>;
}
