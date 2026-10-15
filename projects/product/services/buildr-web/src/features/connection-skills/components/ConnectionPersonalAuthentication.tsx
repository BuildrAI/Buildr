import { Alert, Button, Collapse, Switch, Tag } from 'antd';
import type { CatalogEntry, ConnectionInstance, HookResult } from '../connection-skill-types';
import { authenticationLabel, targetDraftChanged } from '../connection-skill-form';
import { ConnectionFields } from './ConnectionFields';
import { ConnectionHookResult } from './ConnectionHookResult';

type Props = {
  entry?: CatalogEntry; instance?: ConnectionInstance; config: Record<string, unknown>; enabled: boolean; intent: 'keep' | 'replace'; values: Record<string, unknown>;
  disabled: boolean; conflict: boolean; ready: boolean; saving: boolean; testing: boolean;
  result?: HookResult; stale: boolean;
  onEnabled(value: boolean): void; onChange(key: string, value: unknown): void; onReplace(): void; onSave(): void; onTest(): void;
};

export function ConnectionPersonalAuthentication({ entry, instance, config, enabled, intent, values, disabled, conflict, ready, saving, testing, result, stale, onEnabled, onChange, onReplace, onSave, onTest }: Props) {
  const fields = entry?.definition.authentication.fields || [];
  const current = instance?.authentication.personal;
  const changedTarget = Boolean(entry && targetDraftChanged(entry, config, instance));
  const summary = current?.present ? current.configured ? '当前使用个人账号' : '个人账号需更新' : '可选 · 仅本机使用';
  return <Collapse ghost className="buildr-connection-personal-collapse" items={[{ key: 'personal', label: <span id="connection-skill-personal-summary">个人账号 <Tag color={current?.present && !current.configured ? 'orange' : undefined}>{summary}</Tag>{result && !stale && <Tag color={result.status === 'success' ? 'success' : 'warning'}>{result.status === 'success' ? '测试通过' : '测试未通过'}</Tag>}</span>, children: <section className="buildr-connection-personal-content" aria-label="本机个人认证">
    <p className="buildr-connection-skill-muted">仅保存在本机，优先于团队账号；失效时不会自动回退。</p>
    <label className="buildr-connection-skill-switch"><Switch id="connection-skill-personal-enabled" aria-label="使用个人认证" checked={enabled} disabled={disabled || !entry && !current?.present} onChange={onEnabled} />使用个人账号 · 保存后生效</label>
    {enabled && (intent === 'keep' ? <div className="buildr-connection-auth-summary"><div><strong>{authenticationLabel(fields, values)}</strong><Tag>已配置</Tag></div><Button id="change-connection-skill-personal" disabled={disabled || !entry} onClick={onReplace}>更换账号</Button></div> : <ConnectionFields fields={fields} values={values} prefix="connection-skill-personal" disabled={disabled || !entry} onChange={onChange} />)}
    {current?.diagnostic && <Alert type="warning" showIcon message={current.diagnostic} />}
    {!instance && <small className="buildr-connection-skill-muted">先保存连接，再保存个人账号。</small>}
    {changedTarget && <small className="buildr-connection-skill-muted">连接地址有未保存修改，请先保存连接。</small>}
    <div className="buildr-connection-personal-actions"><Button id="test-connection-skill-personal" disabled={!enabled || !ready || !entry?.definition.hooks?.test} loading={testing} onClick={onTest}>测试个人账号</Button><Button id="save-connection-skill-personal" disabled={disabled || !instance || conflict || enabled && (!entry || changedTarget || intent === 'keep')} loading={saving} onClick={onSave}>保存个人账号</Button></div>
    {result && <ConnectionHookResult result={result} stale={stale} saved={Boolean(instance)} personal />}
  </section> }]} />;
}
