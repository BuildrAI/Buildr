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
  }));
}

export function selectedExecutionModel(options: readonly ExecutionModelOption[], savedKey: string | null): ExecutionModelOption | null {
  return options.find(option => option.key === savedKey) ?? null;
}
