import { useEffect, useState } from 'react';
import { Alert, AutoComplete, Button, Input, InputNumber, Tag } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import type { ConnectionClient } from '../api/connection-api';
import { connectionDraft, connectionInput } from '../connection-form';
import type { MySqlConnection } from '../connection-types';

type Props = { connection?: MySqlConnection; environments: string[]; client: ConnectionClient; onClose(): void; onSaved(): void };

export function ConnectionEditDrawer({ connection, environments, client, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(() => connectionDraft(connection));
  const [saving, setSaving] = useState(false), [testing, setTesting] = useState(false), [error, setError] = useState(''), [testMessage, setTestMessage] = useState('');
  useEffect(() => { setDraft(connectionDraft(connection)); setError(''); setTestMessage(''); }, [connection]);
  const update = <K extends keyof typeof draft>(field: K, value: (typeof draft)[K]) => { setDraft(current => ({ ...current, [field]: value })); setTestMessage(''); setError(''); };
  async function save() {
    try {
      const input = connectionInput(draft, connection); setSaving(true); setError('');
      if (connection) await client.update(connection.id, connection.revision, input); else await client.create(input);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接保存失败。'); }
    finally { setSaving(false); }
  }
  async function test() {
    try {
      const input = connectionInput(draft, connection); setTesting(true); setError(''); setTestMessage('');
      const result = await client.test({ ...input, ...(connection ? { id: connection.id, expectedRevision: connection.revision } : {}) });
      setTestMessage(`连接成功${result.serverVersion ? ` · MySQL ${result.serverVersion}` : ''}${result.elapsedMs === undefined ? '' : ` · ${result.elapsedMs} ms`}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接测试失败。'); }
    finally { setTesting(false); }
  }
  const disabled = saving || testing;
  return <MetadataEditDrawer open title={connection ? '编辑连接' : '新增连接'} objectName={connection?.name || 'MySQL 连接'} formId="mysql-connection-form" saveButtonId="save-mysql-connection" saving={saving} disabled={testing} onClose={() => { if (!disabled) onClose(); }}>
    <form id="mysql-connection-form" className="buildr-connection-form" aria-label="MySQL 连接配置" onSubmit={event => { event.preventDefault(); if (!disabled) void save(); }}>
      <label>名称<Input id="mysql-connection-name" aria-label="连接名称" value={draft.name} disabled={disabled} onChange={event => update('name', event.target.value)} /></label>
      <div><Tag>数据源 · MySQL</Tag></div>
      <label>环境<AutoComplete aria-label="连接环境" value={draft.environment} disabled={disabled} onChange={value => update('environment', value)} options={environments.map(value => ({ value }))} placeholder="填写环境，或选择已有值" filterOption={(input, option) => String(option?.value || '').toLocaleLowerCase().includes(input.toLocaleLowerCase())} /></label>
      <div className="buildr-connection-host"><label>主机<Input aria-label="连接主机" value={draft.host} disabled={disabled} onChange={event => update('host', event.target.value)} placeholder="localhost" /></label><label>端口<InputNumber aria-label="连接端口" value={draft.port} min={1} max={65535} precision={0} disabled={disabled} onChange={value => update('port', value)} /></label></div>
      <label>用户<Input aria-label="连接用户" value={draft.username} disabled={disabled} autoComplete="off" onChange={event => update('username', event.target.value)} /></label>
      <label>密码<Input.Password aria-label="连接密码" value={draft.password} disabled={disabled} autoComplete="new-password" onChange={event => update('password', event.target.value)} placeholder={connection?.hasCredentials ? '已保存，留空保持不变' : '可留空'} /></label>
      <label>默认数据库 · 可选<Input aria-label="默认数据库" value={draft.defaultDatabase} disabled={disabled} onChange={event => update('defaultDatabase', event.target.value)} placeholder="可留空" /></label>
      <div><Button id="test-mysql-connection" loading={testing} disabled={saving} onClick={() => void test()}>测试连接</Button></div>
      <p className="buildr-connections-muted">密码保存在本机，不写入工作空间连接声明。</p>
      {testMessage && <Alert type="success" showIcon message={testMessage} />}
      {error && <Alert type="error" showIcon message={error} />}
    </form>
  </MetadataEditDrawer>;
}
