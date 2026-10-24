import type { AgentModel } from '../contracts.ts';

/** Preserve only model-owned catalog choices; never manufacture a provider-wide effort list. */
export function modelOptions(model: { id: string; label: string; isDefault?: boolean }, choices: Array<{ id?: unknown; label?: unknown }> | undefined, defaultEffort?: unknown): AgentModel {
  const efforts = [...new Map((choices ?? []).filter(choice => typeof choice.id === 'string' && choice.id.trim() && choice.id.length <= 80).map(choice => [choice.id as string, { id: choice.id as string, label: typeof choice.label === 'string' && choice.label.trim() ? choice.label : choice.id as string }])).values()];
  return { ...model, ...(efforts.length ? { reasoningEfforts: efforts } : {}), ...(efforts.some(effort => effort.id === defaultEffort) ? { defaultReasoningEffort: defaultEffort as string } : {}) };
}

export function qoderModel(model: any): AgentModel {
  const rich = model.thinking_config?.enabled?.efforts;
  const levels: unknown[] = Array.isArray(model.efforts) ? model.efforts : rich && typeof rich === 'object' ? Object.keys(rich) : [];
  const defaultEffort = model.defaultEffort ?? (rich ? Object.keys(rich).find(id => rich[id]?.is_default) : undefined);
  return modelOptions({ id: model.value ?? model.id, label: String(model.displayName ?? model.name ?? model.value ?? model.id), ...(model.isDefault === true ? { isDefault: true } : {}) }, levels.map(id => ({ id, label: typeof id === 'string' ? rich?.[id]?.description ?? id : undefined })), defaultEffort);
}
