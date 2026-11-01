import {modelSourceName,reasoningEffortLabel,reasoningEffortRank,sortReasoningEfforts} from './model-picker.ts';

export type ExecutionReasoningEffort = {id: string; label: string};
export type ExecutionServiceTier = {id: string; label: string; reasoningEfforts?: ExecutionReasoningEffort[]; defaultReasoningEffort?: string};

/** Execution-model choices are a browser preference; callers own how a choice is executed. */
export const executionModelPreferenceKey = 'buildr.execution-model';

export type ExecutionModelSource = {
  accountId: string;
  modelId: string;
  label: string;
  accountLabel: string;
  enabled?: boolean;
  available: boolean;
  accountIdentity: string;
  accountRevision: string;
  defaultServiceTier?: string;
  provider?: string;
  creditFactor?: number;
  reasoningEfforts?: ExecutionReasoningEffort[];
  defaultReasoningEffort?: string;
  serviceTiers?: ExecutionServiceTier[];
};

export type ExecutionModelOption = {
  key: string;
  label: string;
  available: boolean;
  accountId: string;
  modelId: string;
  accountIdentity: string;
  accountRevision: string;
  serviceTier?: string;
  reasoningEffort?: string;
  provider?: string;
  accountLabel?: string;
  modelLabel?: string;
  creditFactor?: number;
  reasoningEfforts?: ExecutionReasoningEffort[];
  defaultReasoningEffort?: string;
  serviceTiers?: ExecutionServiceTier[];
};

export function executionModelKey(accountId: string, modelId: string): string {
  return JSON.stringify([accountId, modelId]);
}

/** Only models enabled in the model settings are offered; availability stays a separate fact. */
export function executionModelOptions(models: readonly ExecutionModelSource[]): ExecutionModelOption[] {
  return models.filter(model => model.enabled !== false).map(model => ({
    key: executionModelKey(model.accountId, model.modelId),
    label: model.accountLabel + ' / ' + model.label,
    available: model.available,
    accountId: model.accountId,
    modelId: model.modelId,
    accountIdentity: model.accountIdentity,
    accountRevision: model.accountRevision,
    serviceTier: model.defaultServiceTier,
    provider: model.provider,
    accountLabel: model.accountLabel,
    modelLabel: model.label,
    creditFactor: model.creditFactor,
    reasoningEfforts: model.reasoningEfforts,
    defaultReasoningEffort: model.defaultReasoningEffort,
    serviceTiers: model.serviceTiers,
  }));
}

export function selectedExecutionModel(options: readonly ExecutionModelOption[], savedKey: string | null): ExecutionModelOption | null {
  return options.find(option => option.key === savedKey) ?? null;
}

/** Preferences are scoped to the actual account identity, never the conversation. */
export function executionModelDetailKey(model: ExecutionModelOption, kind: 'reasoning-effort' | 'service-tier'): string {
  return `${executionModelPreferenceKey}.${kind}:${encodeURIComponent(JSON.stringify([model.accountId, model.accountIdentity, model.modelId]))}`;
}

export function executionModelWithPreferences(model: ExecutionModelOption | null, tierId?: string | null, effort?: string | null): ExecutionModelOption | null {
  if (!model) return null;
  const serviceTier = model.serviceTiers?.some(tier => tier.id === tierId) ? tierId! : model.serviceTier;
  const tier = model.serviceTiers?.find(item => item.id === serviceTier);
  const options = tier?.reasoningEfforts ?? model.reasoningEfforts ?? [];
  return {...model, serviceTier, reasoningEffort: effort && options.some(item => item.id === effort) ? effort : undefined};
}

export function executionModelReasoning(model: ExecutionModelOption | null) {
  const tier = model?.serviceTiers?.find(item => item.id === model.serviceTier);
  const options = sortReasoningEfforts(tier?.reasoningEfforts ?? model?.reasoningEfforts ?? []);
  // Generation without an explicit effort uses the lowest known depth, not the
  // catalog's conversation default. Mixed/unknown modes are sent unset.
  const lowest = options.length && options.every(option => option.id === option.id.toLowerCase() && reasoningEffortRank(option.id) !== undefined) ? options[0]?.id : undefined;
  const id = model?.reasoningEffort ?? lowest;
  const index = options.findIndex(option => option.id === id);
  const ranks = options.map(option => reasoningEffortRank(option.id));
  const ordered = options.length > 1 && ranks.every(rank => rank !== undefined) && new Set(ranks).size === ranks.length;
  return {options, index, ordered, inherited: model?.reasoningEffort === undefined, label: index >= 0 ? reasoningEffortLabel(options[index]!) : model?.reasoningEffort || '未设置'};
}

export function executionModelGroups(options: readonly ExecutionModelOption[]) {
  const sourceName = (option: ExecutionModelOption) => modelSourceName(option.provider ?? option.accountLabel ?? option.accountId);
  return Array.from(new Set(options.map(item => item.accountId))).map(id => {
    const source = options.find(item => item.accountId === id)!;
    const name = sourceName(source);
    const duplicate = new Set(options.filter(item => sourceName(item) === name).map(item => item.accountId)).size > 1;
    return {id, label: name + (duplicate ? ' · ' + source.accountLabel : ''), options: options.filter(item => item.accountId === id).map(item => ({value: item.key, label: (item.modelLabel ?? item.label) + (item.creditFactor === undefined ? '' : ` · ${item.creditFactor.toFixed(2)}x`), disabled: !item.available}))};
  });
}
