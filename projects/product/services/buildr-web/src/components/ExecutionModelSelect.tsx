import { useSyncExternalStore } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { readOptionalPreference, writeOptionalPreference } from '../lib/optional-preferences';
import { executionModelPreferenceKey, selectedExecutionModel, type ExecutionModelOption } from '../lib/execution-model';
import './execution-model-select.css';

const listeners = new Set<() => void>();
let remembered: string | null | undefined;
let observingStorage = false;

function readRemembered(): string | null {
  if (remembered === undefined) remembered = readOptionalPreference(executionModelPreferenceKey);
  return remembered;
}
function notify() { for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
  if (!observingStorage && typeof window !== 'undefined') {
    observingStorage = true;
    window.addEventListener('storage', event => {
      if (event.key !== executionModelPreferenceKey) return;
      remembered = event.newValue;
      notify();
    });
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function remember(key: string) {
  remembered = key;
  writeOptionalPreference(executionModelPreferenceKey, key);
  notify();
}

/** Remembers one execution model across places and reloads; conversation model choices stay separate. */
export function useExecutionModelChoice(options: ExecutionModelOption[]) {
  const saved = useSyncExternalStore(subscribe, readRemembered, () => null);
  return selectedExecutionModel(options, saved);
}

type Props = {
  id: string;
  options: ExecutionModelOption[];
  disabled?: boolean;
  pending?: boolean;
  onOpenModels(): void;
};

export function ExecutionModelSelect({ id, options, disabled = false, pending = false, onOpenModels }: Props) {
  const selected = useExecutionModelChoice(options);
  const title = selected ? '执行模型：' + selected.label : '选择执行模型';
  return <div className="execution-model-select">
    <Tooltip title={title}><Dropdown trigger={['click']} disabled={disabled || pending} menu={{
      selectedKeys: selected ? [selected.key] : [],
      items: [...options.map(option => ({key: option.key, label: option.label, disabled: !option.available})), {type: 'divider'}, {key: '__models__', label: '配置模型'}],
      onClick: ({key}) => { if (key === '__models__') onOpenModels(); else if (options.some(option => option.key === key)) remember(key); },
    }}><Button id={id + '-model-menu'} aria-label="选择执行模型" type="text" size="small" icon={<DownOutlined />} disabled={disabled || pending} /></Dropdown></Tooltip>
  </div>;
}
