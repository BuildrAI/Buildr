import { useSyncExternalStore } from 'react';
import { readOptionalPreference, writeOptionalPreference } from '../lib/optional-preferences';
import { executionModelPreferenceKey, executionModelDetailKey, executionModelGroups, executionModelReasoning, executionModelWithPreferences, selectedExecutionModel, type ExecutionModelOption } from '../lib/execution-model';
import { nextServiceTier } from '../lib/model-picker.ts';
import { ModelPicker } from './ModelPicker';
import './execution-model-select.css';

const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();
let revision = 0;
let observingStorage = false;

function readRemembered(key: string): string | null {
  if (!memory.has(key)) memory.set(key, readOptionalPreference(key));
  return memory.get(key) ?? null;
}
function notify() { ++revision; for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
  if (!observingStorage && typeof window !== 'undefined') {
    observingStorage = true;
    window.addEventListener('storage', event => {
      if (event.key === null) memory.clear();
      else if (event.key === executionModelPreferenceKey || event.key.startsWith(executionModelPreferenceKey + '.')) memory.set(event.key, event.newValue);
      else return;
      notify();
    });
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function remember(key: string, value: string) {
  memory.set(key, value);
  writeOptionalPreference(key, value);
  notify();
}

/** Execution choices and per-account reasoning/tier memory never touch conversation preferences. */
export function useExecutionModelChoice(options: ExecutionModelOption[]) {
  useSyncExternalStore(subscribe, () => revision, () => 0);
  const model = selectedExecutionModel(options, readRemembered(executionModelPreferenceKey));
  return executionModelWithPreferences(model, model && readRemembered(executionModelDetailKey(model, 'service-tier')), model && readRemembered(executionModelDetailKey(model, 'reasoning-effort')));
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
  const tier = selected?.serviceTiers?.find(item => item.id === selected.serviceTier);
  const defaultTier = options.find(item => item.key === selected?.key)?.serviceTier;
  const accelerated = !!(selected?.serviceTiers && selected.serviceTiers.length > 1 && tier && (tier.id === 'priority' || tier.id !== defaultTier));
  return <div className="execution-model-select">
    <ModelPicker compact id={id + '-model-menu'} selectedKey={selected?.key ?? ''} modelLabel={selected ? '执行模型：' + selected.label : '选择执行模型'} defaultLabel="选择执行模型"
      groups={executionModelGroups(options)} reasoning={executionModelReasoning(selected)} disabled={disabled || pending} unavailable={disabled || pending}
      tierSwitchable={!!selected?.serviceTiers && selected.serviceTiers.length > 1} tierDisabled={disabled || pending || !selected?.available} tierLabel={tier?.label} accelerated={accelerated}
      onSelectModel={key => {if (options.some(option => option.key === key && option.available)) remember(executionModelPreferenceKey, key);}}
      onSelectEffort={effort => {if (selected) remember(executionModelDetailKey(selected, 'reasoning-effort'), effort);}}
      onCycleTier={() => {if (!selected) return; const next = nextServiceTier(selected.serviceTiers, selected.serviceTier, defaultTier); if (next) remember(executionModelDetailKey(selected, 'service-tier'), next);}}
      onOpenModels={onOpenModels}/>
  </div>;
}
