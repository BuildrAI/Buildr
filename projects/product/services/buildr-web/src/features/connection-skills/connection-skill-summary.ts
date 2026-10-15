import type { ConnectionField, ConnectionFieldLabels, ConnectionInstance } from './connection-skill-types.ts';

export function connectionFieldLabel(field: ConnectionField, value: unknown, labels: ConnectionFieldLabels = {}): string | undefined {
  const saved = labels[field.key];
  return field.type === 'select' && field.optionsFrom && typeof value === 'string' && saved?.value === value && typeof saved.label === 'string' && saved.label.trim() ? saved.label : undefined;
}

/** Keep actual selection edits, but refresh untouched public metadata after account changes. */
export function fieldLabelsAfterRead(fields: ConnectionField[], config: Record<string, unknown>, draft: ConnectionFieldLabels, baseline: ConnectionFieldLabels = {}, incoming: ConnectionFieldLabels = {}, targetChanged = false): ConnectionFieldLabels {
  return Object.fromEntries(fields.flatMap(field => {
    const current = draft[field.key], before = baseline[field.key];
    const edited = current?.value !== before?.value || current?.label !== before?.label;
    const selected = edited ? current : targetChanged ? undefined : incoming[field.key];
    return selected && connectionFieldLabel(field, config[field.key], { [field.key]: selected }) ? [[field.key, selected]] : [];
  }));
}

/** Mask display text only. The unmodified draft remains the input to an explicit save. */
export function displayFieldLabels(fields: ConnectionField[], config: Record<string, unknown>, labels: ConnectionFieldLabels, secrets: readonly string[]): ConnectionFieldLabels {
  const patterns = [...new Set(secrets.filter(Boolean))].sort((left, right) => right.length - left.length);
  return Object.fromEntries(fields.flatMap(field => {
    const item = labels[field.key];
    if (!item || !connectionFieldLabel(field, config[field.key], labels) || patterns.some(secret => item.value.includes(secret))) return [];
    let label = item.label;
    for (const secret of patterns) label = label.split(secret).join('[已隐藏]');
    return [[field.key, { value: item.value, label }]];
  }));
}

/** Summary data is already public; rendering never discovers or refreshes remote options. */
export function connectionSummaryLines(instance: ConnectionInstance): string[] {
  const definition = instance.definition?.definition;
  const values = (definition?.presentation?.summaryFields || []).flatMap(key => {
    const value = instance.config[key];
    if (value === undefined || value === null || value === '' || Array.isArray(value) && value.length === 0) return [];
    const field = definition?.config.fields.find(field => field.key === key);
    return [field && connectionFieldLabel(field, value, instance.fieldLabels) || (Array.isArray(value) ? value.join(' · ') : String(value))];
  });
  return values.length > 1 ? [values[0]!, values.slice(1).join(' · ')] : values;
}
