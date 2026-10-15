import { Button, Checkbox, Input, InputNumber, Select } from 'antd';
import type { ConnectionField, ConnectionFieldLabels, HookResult } from '../connection-skill-types';
import { diagnosticText, fieldVisible } from '../connection-skill-form';
import { connectionFieldLabel } from '../connection-skill-summary';

type Option = { value: string | number | boolean; label: string };
type Props = {
  fields: ConnectionField[]; values: Record<string, unknown>; prefix: string; disabled: boolean; keepSecrets?: boolean;
  options?: Record<string, Option[]>; fieldLabels?: ConnectionFieldLabels; discovering?: string; onChange(key: string, value: unknown, label?: string): void; onDiscover?(hook: string): void;
  discoveryResults?: Record<string, HookResult>; discoveryReady?: Record<string, boolean>; showGroupHeading?: boolean;
};
export function ConnectionFields({ fields, values, prefix, disabled, keepSecrets, options = {}, fieldLabels, discovering, onChange, onDiscover, discoveryResults = {}, discoveryReady = {}, showGroupHeading = true }: Props) {
  const visible = fields.filter(field => fieldVisible(field, values));
  return <div className="buildr-connection-skill-fields">{visible.map((field, index) => {
    const id = `${prefix}-${field.key}`, value = values[field.key];
    let input;
    if (field.type === 'boolean') input = <Checkbox id={id} checked={value === true} disabled={disabled} onChange={event => onChange(field.key, event.target.checked)}>{field.label}</Checkbox>;
    else if (field.type === 'integer') input = <InputNumber id={id} aria-label={field.label} value={typeof value === 'number' ? value : null} min={field.minimum} max={field.maximum} precision={0} disabled={disabled} onChange={next => onChange(field.key, next)} />;
    else if (['enum', 'select', 'multiselect'].includes(field.type)) {
      const choices = field.values?.map(item => ({ value: item, label: item === '' ? '（空值）' : String(item) })) || options[field.optionsFrom || ''] || [];
      const selected = (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]) as (string | number | boolean)[];
      const hasChoices = Boolean(field.values || field.optionsFrom && Object.hasOwn(options, field.optionsFrom));
      const all = [...choices, ...selected.filter(item => !choices.some(choice => choice.value === item)).map(item => { const label = connectionFieldLabel(field, item, fieldLabels) || String(item); return { value: item, label: hasChoices ? `${label}（未在本次结果中）` : label }; })];
      input = <Select id={id} aria-label={field.label} showSearch optionFilterProp="label" allowClear mode={field.type === 'multiselect' ? 'multiple' : undefined} disabled={disabled} value={field.type === 'multiselect' ? selected.map(item => JSON.stringify(item)) : selected.length ? JSON.stringify(selected[0]) : undefined} options={all.map(item => ({ value: JSON.stringify(item.value), label: item.label }))} onChange={(next: string | string[] | undefined) => { const decoded: unknown = Array.isArray(next) ? next.map(item => JSON.parse(item)) : next === undefined ? undefined : JSON.parse(next); onChange(field.key, decoded, choices.find(choice => choice.value === decoded)?.label || connectionFieldLabel(field, decoded, fieldLabels)); }} />;
    } else if (field.type === 'secret') input = <Input.Password id={id} aria-label={field.label} value={typeof value === 'string' ? value : ''} autoComplete="new-password" disabled={disabled} placeholder={keepSecrets ? '已配置；保持原认证无需填写' : '填写秘密值'} onChange={event => onChange(field.key, event.target.value)} />;
    else input = <Input id={id} aria-label={field.label} value={typeof value === 'string' ? value : ''} autoComplete="off" disabled={disabled} maxLength={field.maxLength} onChange={event => onChange(field.key, event.target.value)} />;
    const result = discoveryResults[field.optionsFrom || ''];
    return <div key={field.key} className="buildr-connection-skill-field">{showGroupHeading && field.group && visible[index - 1]?.group !== field.group && <h4>{field.group}</h4>}{field.type !== 'boolean' && <label htmlFor={id}>{field.label}{field.required ? ' *' : ' · 可选'}</label>}{input}{field.description && <small>{field.description}</small>}{field.optionsFrom && onDiscover && <div className="buildr-connection-skill-discovery"><Button id={`discover-${prefix}-${field.key}`} size="small" disabled={disabled || discoveryReady[field.optionsFrom] === false} loading={discovering === field.optionsFrom} onClick={() => onDiscover(field.optionsFrom!)}>读取可选项</Button>{!result && discoveryReady[field.optionsFrom] === false && <small>请先填写前面的必填信息</small>}{result && <details id={`connection-skill-discovery-${field.key}`} className={`buildr-connection-inline-result is-${result.status}`}><summary>{result.status === 'unknown' ? '读取结果未知，查看详情' : result.status === 'failure' ? '读取失败，查看详情' : result.truncated ? `已读取 ${result.options?.length || 0} 项，结果不完整` : `已读取 ${result.options?.length || 0} 个可选项`}</summary>{[...result.diagnostics, ...(result.warnings || []), ...result.limitations].map((item, itemIndex) => <p key={itemIndex}>{diagnosticText(item)}</p>)}</details>}</div>}</div>;
  })}</div>;
}
