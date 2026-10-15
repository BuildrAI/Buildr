import { Button, Collapse, Tag } from 'antd';
import type { CatalogEntry, ConnectionField, ConnectionFieldLabels, ConnectionInstance, HookResult } from '../connection-skill-types';
import { authenticationLabel } from '../connection-skill-form';
import { ConnectionFields } from './ConnectionFields';

type Props = {
  entry: CatalogEntry; instance?: ConnectionInstance; config: Record<string, unknown>; authentication: Record<string, unknown>;
  fieldLabels: ConnectionFieldLabels;
  intent: 'keep' | 'replace' | 'remove'; disabled: boolean;
  options: Record<string, NonNullable<HookResult['options']>>; discovering: string; discoveryResults: Record<string, HookResult>; discoveryReady: Record<string, boolean>;
  onConfig(key: string, value: unknown, label?: string): void; onAuthentication(key: string, value: unknown): void; onIntent(intent: 'keep' | 'replace' | 'remove'): void; onDiscover(hook: string): void;
};

export function ConnectionTeamForm({ entry, instance, config, fieldLabels, authentication, intent, disabled, options, discovering, discoveryResults, discoveryReady, onConfig, onAuthentication, onIntent, onDiscover }: Props) {
  const configFields = entry.definition.config.fields, authFields = entry.definition.authentication.fields;
  const references = new Map<string, { source: 'config' | 'authentication'; field: ConnectionField }>([
    ...configFields.map(field => [`config.${field.key}`, { source: 'config' as const, field }] as const),
    ...authFields.map(field => [`authentication.${field.key}`, { source: 'authentication' as const, field }] as const),
  ]);
  const groups = entry.definition.presentation?.groups || [];
  const assigned = new Set(groups.flatMap(group => group.fields));
  const remainder = [...references.keys()].filter(key => !assigned.has(key));
  const sections = [...groups, ...(remainder.length ? [{ id: '__remaining', title: groups.length ? '其他设置' : '连接与账号', fields: remainder, collapsed: false }] : [])];
  const firstAuthentication = sections.flatMap(section => section.fields).find(reference => references.get(reference)?.source === 'authentication');
  function renderField(reference: string) {
    const item = references.get(reference);
    if (!item) return null;
    const { source, field } = item;
    if (source === 'authentication' && intent !== 'replace') {
      if (reference !== firstAuthentication) return null;
      return <div className="buildr-connection-auth-summary" key="authentication-summary" id="connection-skill-team-summary"><div><span>团队账号</span><strong>{intent === 'keep' ? authenticationLabel(authFields, authentication) : '未配置团队账号'}</strong>{intent === 'keep' && <Tag>已配置</Tag>}</div><Button id="change-connection-skill-team" disabled={disabled} onClick={() => onIntent('replace')}>{intent === 'keep' ? '更换账号' : '填写账号'}</Button></div>;
    }
    return <ConnectionFields key={reference} fields={[field]} values={source === 'config' ? config : authentication} fieldLabels={source === 'config' ? fieldLabels : undefined} prefix={source === 'config' ? 'connection-skill-config' : 'connection-skill-team'} disabled={disabled} options={options} discovering={discovering} discoveryResults={discoveryResults} discoveryReady={discoveryReady} showGroupHeading={false} onChange={source === 'config' ? onConfig : onAuthentication} onDiscover={source === 'config' ? onDiscover : undefined} />;
  }
  return <div className="buildr-connection-team-form">{sections.map(section => {
    const content = <div className="buildr-connection-skill-fields">{section.fields.map(renderField)}{section.fields.includes(firstAuthentication || '') && intent === 'replace' && instance?.authentication.team.configured && <Button className="buildr-connection-auth-cancel" type="link" disabled={disabled} onClick={() => onIntent('keep')}>取消更换，保留现有账号</Button>}</div>;
    return section.collapsed ? <Collapse className="buildr-connection-form-collapse" ghost key={section.id} items={[{ key: section.id, label: section.title, children: content }]} /> : <section className="buildr-connection-skill-section" aria-label={section.title} key={section.id}><h3>{section.title}</h3>{content}</section>;
  })}</div>;
}
