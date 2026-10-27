import { Button, Tooltip } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { ExecutionModelSelect } from './ExecutionModelSelect';
import type { ExecutionModelOption } from '../lib/execution-model';
import './agent-action-control.css';

export type AgentActionExecutor = Pick<ExecutionModelOption, 'key' | 'label' | 'available'>;
type Props = {
  id: string;
  label: string;
  executor: AgentActionExecutor | null;
  options: ExecutionModelOption[];
  disabled?: boolean;
  pending?: boolean;
  onAction(): void;
  onOpenModels(): void;
};

/** Common action affordance; business state and provider protocols belong to the caller. */
export function AgentActionControl({ id, label, executor, options, disabled = false, pending = false, onAction, onOpenModels }: Props) {
  const actionTitle = executor ? `${label} · ${executor.label}` : '选择模型后生成说明';
  return <div className="agent-action-control">
    <Tooltip title={actionTitle}><Button id={id} aria-label={actionTitle} type="text" size="small" icon={<RobotOutlined />} disabled={disabled || pending || !executor?.available} onClick={onAction} /></Tooltip>
    <ExecutionModelSelect id={id} options={options} pending={pending} onOpenModels={onOpenModels} />
  </div>;
}
