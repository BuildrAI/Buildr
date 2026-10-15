import { Button, Dropdown, Tooltip } from 'antd';
import { DownOutlined, RobotOutlined } from '@ant-design/icons';
import './agent-action-control.css';

export type AgentActionOption = { id: string; label: string; available: boolean };
type Props = {
  id: string;
  label: string;
  executor: AgentActionOption | null;
  defaultExecutor: AgentActionOption | null;
  options: AgentActionOption[];
  overrideId: string | null;
  disabled?: boolean;
  pending?: boolean;
  onAction(): void;
  onSelect(id: string | null): void;
  onOpenAgents(): void;
};

/** Common action affordance; business state and provider protocols belong to the caller. */
export function AgentActionControl({ id, label, executor, defaultExecutor, options, overrideId, disabled = false, pending = false, onAction, onSelect, onOpenAgents }: Props) {
  const actionTitle = executor ? `${label} · ${executor.label}` : '先接入智能体以生成说明';
  const choiceTitle = pending ? `本次执行者：${executor?.label || '智能体'}` : overrideId ? `仅本次使用 ${executor?.label || '所选智能体'}，调用后恢复默认` : `跟随默认${defaultExecutor ? '：' + defaultExecutor.label : ''}`;
  return <div className="agent-action-control">
    <Tooltip title={actionTitle}><Button id={id} aria-label={actionTitle} type="text" size="small" icon={<RobotOutlined />} disabled={disabled || pending || !executor?.available} onClick={onAction} /></Tooltip>
    <Tooltip title={choiceTitle}><Dropdown trigger={['click']} disabled={pending} menu={{
      selectedKeys: [overrideId || '__default__'],
      items: [
        {key: '__default__', label: `跟随默认${defaultExecutor ? '（' + defaultExecutor.label + '）' : ''}`},
        ...(options.length > 1 ? [{type: 'divider' as const}, ...options.map(option => ({key: option.id, label: `仅本次使用 ${option.label}`}))] : []),
        {type: 'divider'}, {key: '__agents__', label: '查看智能体'},
      ],
      onClick: ({key}) => { if (key === '__agents__') onOpenAgents(); else onSelect(key === '__default__' ? null : key); },
    }}><Button id={id + '-agent-menu'} aria-label="选择本次智能体" type="text" size="small" icon={<DownOutlined />} disabled={pending} /></Dropdown></Tooltip>
  </div>;
}
