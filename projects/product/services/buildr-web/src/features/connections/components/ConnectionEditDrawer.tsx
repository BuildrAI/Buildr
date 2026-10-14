import { useEffect, useState } from 'react';
import { Alert, AutoComplete, Button, Input, InputNumber, Select } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import type { ConnectionClient } from '../api/connection-api';
import { connectionDraft, connectionInput } from '../connection-form';
import { isMySqlConnection, isNacosConnection, type EditableConnection } from '../connection-types';
import { nacosConnectionDraft, nacosConnectionInput } from '../nacos-connection-form';
import { NacosConnectionFields } from './NacosConnectionFields';

type Props = { connection?: EditableConnection; environments: string[]; client: ConnectionClient; onClose(): void; onSaved(): void };

export function ConnectionEditDrawer({ connection, environments, client, onClose, onSaved }: Props) {
  const [type, setType] = useState<'mysql' | 'nacos'>(connection?.type || 'mysql');
  const [mysqlDraft, setMysqlDraft] = useState(() => connectionDraft(connection && isMySqlConnection(connection) ? connection : undefined));
  const [nacosDraft, setNacosDraft] = useState(() => nacosConnectionDraft(connection && isNacosConnection(connection) ? connection : undefined));
  const [saving, setSaving] = useState(false), [testing, setTesting] = useState(false), [error, setError] = useState(''), [testMessage, setTestMessage] = useState('');
  useEffect(() => {
    setType(connection?.type || 'mysql');
    setMysqlDraft(connectionDraft(connection && isMySqlConnection(connection) ? connection : undefined));
    setNacosDraft(nacosConnectionDraft(connection && isNacosConnection(connection) ? connection : undefined));
    setError(''); setTestMessage('');
  }, [connection]);
  const draft = type === 'mysql' ? mysqlDraft : nacosDraft, label = type === 'mysql' ? 'MySQL' : 'Nacos';
  const updateMysql = <K extends keyof typeof mysqlDraft>(field: K, value: (typeof mysqlDraft)[K]) => { setMysqlDraft(current => ({ ...current, [field]: value })); setTestMessage(''); setError(''); };
  const updateNacos = <K extends keyof typeof nacosDraft>(field: K, value: (typeof nacosDraft)[K]) => { setNacosDraft(current => ({ ...current, [field]: value })); setTestMessage(''); setError(''); };
  const update = (field: 'name' | 'environment' | 'username' | 'password', value: string) => { if (type === 'mysql') updateMysql(field, value); else updateNacos(field, value); };
  const input = () => type === 'mysql'
    ? connectionInput(mysqlDraft, connection && isMySqlConnection(connection) ? connection : undefined)
    : nacosConnectionInput(nacosDraft, connection && isNacosConnection(connection) ? connection : undefined);
  function changeType(value: 'mysql' | 'nacos') {
    if (connection || value === type) return;
    const common = { name: draft.name, environment: draft.environment };
    if (value === 'mysql') setMysqlDraft({ ...connectionDraft(), ...common }); else setNacosDraft({ ...nacosConnectionDraft(), ...common });
    setType(value); setError(''); setTestMessage('');
  }
  async function save() {
    try {
      const value = input(); setSaving(true); setError('');
      if (connection) await client.update(connection.id, connection.revision, value); else await client.create(value);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接保存失败。'); }
    finally { setSaving(false); }
  }
  async function test() {
    try {
      const value = input(); setTesting(true); setError(''); setTestMessage('');
      const result = await client.test({ ...value, ...(connection ? { id: connection.id, expectedRevision: connection.revision } : {}) });
      setTestMessage(`连接成功${result.serverVersion ? ` · ${label} ${result.serverVersion}` : ''}${result.apiVersion ? ` · ${result.apiVersion}` : ''}${result.namespaceId ? ` · ${result.namespaceId}` : ''}${result.elapsedMs === undefined ? '' : ` · ${result.elapsedMs} ms`}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接测试失败。'); }
    finally { setTesting(false); }
  }
  const disabled = saving || testing;
  return <MetadataEditDrawer open title={connection ? '编辑连接' : '新增连接'} objectName={connection?.name || `${label} 连接`} formId={`${type}-connection-form`} saveButtonId={`save-${type}-connection`} saving={saving} disabled={testing} onClose={() => { if (!disabled) onClose(); }}>
    <form id={`${type}-connection-form`} className="buildr-connection-form" aria-label={`${label} 连接配置`} onSubmit={event => { event.preventDefault(); if (!disabled) void save(); }}>
      <label>名称<Input id={`${type}-connection-name`} aria-label="连接名称" value={draft.name} disabled={disabled} onChange={event => update('name', event.target.value)} /></label>
      <label>连接类型<Select aria-label="连接类型" value={type} disabled={disabled || Boolean(connection)} onChange={changeType} options={[{ value: 'mysql', label: '数据源 · MySQL' }, { value: 'nacos', label: '配置系统 · Nacos' }]} /></label>
      <label>环境<AutoComplete aria-label="连接环境" value={draft.environment} disabled={disabled} onChange={value => update('environment', value)} options={environments.map(value => ({ value }))} placeholder="填写环境，或选择已有值" filterOption={(input, option) => String(option?.value || '').toLocaleLowerCase().includes(input.toLocaleLowerCase())} /></label>
      {type === 'mysql' ? <div className="buildr-connection-host"><label>主机<Input aria-label="连接主机" value={mysqlDraft.host} disabled={disabled} onChange={event => updateMysql('host', event.target.value)} placeholder="localhost" /></label><label>端口<InputNumber aria-label="连接端口" value={mysqlDraft.port} min={1} max={65535} precision={0} disabled={disabled} onChange={value => updateMysql('port', value)} /></label></div> : <label>网站地址<Input id="nacos-connection-url" aria-label="Nacos 网站地址" value={nacosDraft.consoleUrl} disabled={disabled} onChange={event => updateNacos('consoleUrl', event.target.value)} placeholder="https://example.com/nacos/#/" /></label>}
      <label>用户<Input aria-label="连接用户" value={draft.username} disabled={disabled} autoComplete="off" onChange={event => update('username', event.target.value)} /></label>
      <label>密码<Input.Password aria-label="连接密码" value={draft.password} disabled={disabled} autoComplete="new-password" onChange={event => update('password', event.target.value)} placeholder={connection?.hasCredentials ? '已保存，留空保持不变' : type === 'mysql' ? '可留空' : '填写登录密码'} /></label>
      {type === 'nacos' && <NacosConnectionFields draft={nacosDraft} disabled={disabled} onChange={updateNacos} />}
      {type === 'mysql' && <label>默认数据库 · 可选<Input aria-label="默认数据库" value={mysqlDraft.defaultDatabase} disabled={disabled} onChange={event => updateMysql('defaultDatabase', event.target.value)} placeholder="可留空" /></label>}
      <div><Button id={`test-${type}-connection`} loading={testing} disabled={saving} onClick={() => void test()}>测试连接</Button></div>
      <p className="buildr-connections-muted">密码保存在本机，不写入工作空间连接声明。</p>
      {testMessage && <Alert type="success" showIcon message={testMessage} />}
      {error && <Alert type="error" showIcon message={error} />}
    </form>
  </MetadataEditDrawer>;
}
