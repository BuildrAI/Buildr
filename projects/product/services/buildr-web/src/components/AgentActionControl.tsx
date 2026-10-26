import { Button, Dropdown, Tooltip } from 'antd';
import { DownOutlined, RobotOutlined } from '@ant-design/icons';
import './agent-action-control.css';

export type AgentActionOption = { id: string; label: string; available: boolean };
type Props = {
  id: string;
  label: string;
  executor: AgentActionOption | null;
  options: AgentActionOption[];
  overrideId: string | null;
  disabled?: boolean;
  pending?: boolean;
  onAction(): void;
  onSelect(id: string | null): void;
  onOpenModels(): void;
};

/** Common action affordance; business state and provider protocols belong to the caller. */
export function AgentActionControl({ id, label, executor, options, overrideId, disabled = false, pending = false, onAction, onSelect, onOpenModels }: Props) {
  const actionTitle = executor ? `${label} · ${executor.label}` : '选择模型后生成说明';
  const choiceTitle = executor ? '本次模型：' + executor.label : '选择生成模型';
  return <div className="agent-action-control">
    <Tooltip title={actionTitle}><Button id={id} aria-label={actionTitle} type="text" size="small" icon={<RobotOutlined />} disabled={disabled || pending || !executor?.available} onClick={onAction} /></Tooltip>
    <Tooltip title={choiceTitle}><Dropdown trigger={['click']} disabled={pending} menu={{
      selectedKeys: overrideId ? [overrideId] : [],
      items: [...options.map(option=>({key:option.id,label:option.label,disabled:!option.available})),{type:'divider'},{key:'__models__',label:'配置模型'}],
      onClick: ({key}) => { if (key === '__models__') onOpenModels(); else onSelect(key); },
    }}><Button id={id + '-model-menu'} aria-label="选择生成模型" type="text" size="small" icon={<DownOutlined />} disabled={pending} /></Dropdown></Tooltip>
  </div>;
}
