import type { ConnectionField } from './definition.ts';
import { failure, type ConnectionFieldLabels, type Values } from './instance.ts';

export type { ConnectionFieldLabels } from './instance.ts';
const keyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,255}$/;
function labelEntry(key: string, raw: unknown): raw is { value: string; label: string } {
  if (!keyPattern.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const item = raw as Record<string, unknown>;
  return Object.keys(item).length === 2 && Object.keys(item).every(key => key === 'value' || key === 'label') && typeof item.value === 'string' && item.value.length <= 8192 && !item.value.includes('\0') && typeof item.label === 'string' && Boolean(item.label.trim()) && item.label.length <= 2048 && !item.label.includes('\0');
}
/** Display metadata is optional: damaged saved labels never invalidate a connection. */
export function readFieldLabels(raw: unknown): ConnectionFieldLabels {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0, 100).filter(([key, item]) => labelEntry(key, item)).map(([key, item]) => [key, { value: (item as { value: string }).value, label: (item as { label: string }).label }]));
}
/** An explicit save must not silently accept a misspelled or mismatched display record. */
export function validatedFieldLabels(fields: ConnectionField[], config: Values, raw: unknown): ConnectionFieldLabels {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 100 || Object.entries(raw).some(([key, item]) => !labelEntry(key, item))) throw failure('connection_skill_field_labels_invalid', '选择名称必须是有界的编号与名称记录。', 400);
  const labels = readFieldLabels(raw);
  for (const [key, item] of Object.entries(labels)) {
    const field = fields.find(field => field.key === key);
    if (field?.type !== 'select' || !field.optionsFrom || config[key] !== item.value) throw failure('connection_skill_field_labels_invalid', '选择名称只能引用当前动态单选字段及其准确编号。', 400);
  }
  return labels;
}
/** Labels never change an identity, and public text follows the same secret hiding as hook labels. */
export function publicFieldLabels(fields: ConnectionField[], config: Values, raw: unknown, secrets: readonly string[] = []): ConnectionFieldLabels {
  const patterns = [...new Set(secrets.filter(Boolean))].sort((left, right) => right.length - left.length);
  return Object.fromEntries(Object.entries(readFieldLabels(raw)).flatMap(([key, item]) => {
    const field = fields.find(field => field.key === key);
    if (field?.type !== 'select' || !field.optionsFrom || config[key] !== item.value || patterns.some(secret => item.value.includes(secret))) return [];
    let label = item.label;
    for (const secret of patterns) label = label.split(secret).join('[已隐藏]');
    return [[key, { value: item.value, label }]];
  }));
}
