import { useEffect, useRef, useState } from 'react';
import { Alert, AutoComplete, Button, Input, InputNumber, Select } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import type { ConnectionClient } from '../api/connection-api';
import { connectionDraft, connectionInput } from '../connection-form';
import { isKibanaConnection, isMySqlConnection, isNacosConnection, isXxlJobConnection, type ConnectionTestResult, type EditableConnection } from '../connection-types';
import { nacosConnectionDraft, nacosConnectionInput } from '../nacos-connection-form';
import { kibanaConnectionDraft, kibanaConnectionDraftUpdate, kibanaConnectionInput } from '../kibana-connection-form';
import { xxlJobConnectionDraft, xxlJobConnectionInput } from '../xxl-job-connection-form';
import { createConnectionRequestScope } from '../connection-request-scope';
import { NacosConnectionFields } from './NacosConnectionFields';
import { KibanaConnectionFields } from './KibanaConnectionFields';
import { XxlJobConnectionFields } from './XxlJobConnectionFields';

type Props = { connection?: EditableConnection; environments: string[]; client: ConnectionClient; onClose(): void; onSaved(connection: EditableConnection): void };

export function ConnectionEditDrawer({ connection, environments, client, onClose, onSaved }: Props) {
  const [type, setType] = useState<EditableConnection['type']>(connection?.type || 'mysql');
  const [mysqlDraft, setMysqlDraft] = useState(() => connectionDraft(connection && isMySqlConnection(connection) ? connection : undefined));
  const [nacosDraft, setNacosDraft] = useState(() => nacosConnectionDraft(connection && isNacosConnection(connection) ? connection : undefined));
  const [kibanaDraft, setKibanaDraft] = useState(() => kibanaConnectionDraft(connection && isKibanaConnection(connection) ? connection : undefined));
  const [xxlJobDraft, setXxlJobDraft] = useState(() => xxlJobConnectionDraft(connection && isXxlJobConnection(connection) ? connection : undefined));
  const [saving, setSaving] = useState(false), [testing, setTesting] = useState(false), [error, setError] = useState(''), [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<ConnectionTestResult>(), [requestVersion, setRequestVersion] = useState(0);
  const testScope = useRef(createConnectionRequestScope()).current, discoveryScope = useRef(createConnectionRequestScope()).current, saveScope = useRef(createConnectionRequestScope()).current;
  function invalidateRequests() {
    testScope.invalidate(); discoveryScope.invalidate();
    setTesting(false); setTestMessage(''); setTestResult(undefined); setError(''); setRequestVersion(current => current + 1);
  }
  useEffect(() => {
    invalidateRequests(); saveScope.invalidate(); setSaving(false);
    setType(connection?.type || 'mysql');
    setMysqlDraft(connectionDraft(connection && isMySqlConnection(connection) ? connection : undefined));
    setNacosDraft(nacosConnectionDraft(connection && isNacosConnection(connection) ? connection : undefined));
    setKibanaDraft(kibanaConnectionDraft(connection && isKibanaConnection(connection) ? connection : undefined));
    setXxlJobDraft(xxlJobConnectionDraft(connection && isXxlJobConnection(connection) ? connection : undefined));
  }, [connection, client]);
  useEffect(() => () => { testScope.invalidate(); discoveryScope.invalidate(); saveScope.invalidate(); }, [testScope, discoveryScope, saveScope]);
  const draft = type === 'mysql' ? mysqlDraft : type === 'nacos' ? nacosDraft : type === 'xxl-job' ? xxlJobDraft : kibanaDraft, label = type === 'mysql' ? 'MySQL' : type === 'nacos' ? 'Nacos' : type === 'xxl-job' ? 'XXL-JOB' : 'Kibana';
  const updateMysql = <K extends keyof typeof mysqlDraft>(field: K, value: (typeof mysqlDraft)[K]) => { invalidateRequests(); setMysqlDraft(current => ({ ...current, [field]: value })); };
  const updateNacos = <K extends keyof typeof nacosDraft>(field: K, value: (typeof nacosDraft)[K]) => { invalidateRequests(); setNacosDraft(current => ({ ...current, [field]: value })); };
  const updateKibana = <K extends keyof typeof kibanaDraft>(field: K, value: (typeof kibanaDraft)[K]) => { invalidateRequests(); setKibanaDraft(current => kibanaConnectionDraftUpdate(current, field, value)); };
  const updateXxlJob = <K extends keyof typeof xxlJobDraft>(field: K, value: (typeof xxlJobDraft)[K]) => { invalidateRequests(); setXxlJobDraft(current => ({ ...current, [field]: value })); };
  const update = (field: 'name' | 'environment' | 'username' | 'password', value: string) => { if (type === 'mysql') updateMysql(field, value); else if (type === 'nacos') updateNacos(field, value); else if (type === 'xxl-job') updateXxlJob(field, value); else updateKibana(field, value); };
  const input = () => type === 'mysql'
    ? connectionInput(mysqlDraft, connection && isMySqlConnection(connection) ? connection : undefined)
    : type === 'nacos' ? nacosConnectionInput(nacosDraft, connection && isNacosConnection(connection) ? connection : undefined)
    : type === 'xxl-job' ? xxlJobConnectionInput(xxlJobDraft, connection && isXxlJobConnection(connection) ? connection : undefined)
    : kibanaConnectionInput(kibanaDraft, connection && isKibanaConnection(connection) ? connection : undefined);
  const testInput = () => ({ ...input(), ...(connection ? { id: connection.id, expectedRevision: connection.revision } : {}) });
  function changeType(value: EditableConnection['type']) {
    if (connection || value === type) return;
    const common = { name: draft.name, environment: draft.environment };
    if (value === 'mysql') setMysqlDraft({ ...connectionDraft(), ...common }); else if (value === 'nacos') setNacosDraft({ ...nacosConnectionDraft(), ...common }); else if (value === 'xxl-job') setXxlJobDraft({ ...xxlJobConnectionDraft(), ...common }); else setKibanaDraft({ ...kibanaConnectionDraft(), ...common });
    invalidateRequests(); setType(value);
  }
  async function save() {
    const request = saveScope.begin();
    try {
      const value = input(); invalidateRequests(); setSaving(true);
      const result = connection ? await client.update(connection.id, connection.revision, value) : await client.create(value);
      if (request.isCurrent()) onSaved(result.connection);
    } catch (cause) { if (request.isCurrent()) setError(cause instanceof Error ? cause.message : '连接保存失败。'); }
    finally { if (request.isCurrent()) setSaving(false); }
  }
  async function test() {
    const request = testScope.begin();
    try {
      const value = testInput(); setTesting(true); setError(''); setTestMessage('');
      setTestResult(undefined);
      const result = await client.test(value, request.signal);
      if (request.isCurrent()) {
        setTestResult(result);
        setTestMessage(`${type === 'kibana' ? '查询能力已验证' : type === 'xxl-job' ? '登录与只读查询已验证' : '连接成功'}${result.serverVersion ? ` · ${label} ${result.serverVersion}` : ''}${result.apiVersion ? ` · ${result.apiVersion}` : ''}${result.namespaceId ? ` · ${result.namespaceId}` : ''}${result.elapsedMs === undefined ? '' : ` · ${result.elapsedMs} ms`}`);
      }
    } catch (cause) { if (request.isCurrent()) setError(cause instanceof Error ? cause.message : '连接测试失败。'); }
    finally { if (request.isCurrent()) setTesting(false); }
  }
  const disabled = saving || (type !== 'kibana' && testing);
  const credentials = <><label>用户<Input aria-label="连接用户" value={draft.username} disabled={disabled} autoComplete="off" onChange={event => update('username', event.target.value)} /></label>
    <label>密码<Input.Password aria-label="连接密码" value={draft.password} disabled={disabled} autoComplete="new-password" onChange={event => update('password', event.target.value)} placeholder={connection?.hasCredentials ? '已保存，留空保持不变' : type === 'mysql' ? '可留空' : '填写登录密码'} /></label></>;
  return <MetadataEditDrawer open title={connection ? '编辑连接' : '新增连接'} objectName={connection?.name || `${label} 连接`} formId={`${type}-connection-form`} saveButtonId={`save-${type}-connection`} saving={saving} disabled={type !== 'kibana' && testing} onClose={() => { if (!disabled) { invalidateRequests(); onClose(); } }}>
    <form id={`${type}-connection-form`} className="buildr-connection-form" aria-label={`${label} 连接配置`} onSubmit={event => { event.preventDefault(); if (!disabled) void save(); }}>
      <label>名称<Input id={`${type}-connection-name`} aria-label="连接名称" value={draft.name} disabled={disabled} onChange={event => update('name', event.target.value)} /></label>
      <label>连接类型<Select aria-label="连接类型" value={type} disabled={disabled || Boolean(connection)} onChange={changeType} options={[{ value: 'mysql', label: '数据源 · MySQL' }, { value: 'nacos', label: '配置系统 · Nacos' }, { value: 'kibana', label: '日志系统 · Kibana' }, { value: 'xxl-job', label: '调度器 · XXL-JOB' }]} /></label>
      <label>环境<AutoComplete aria-label="连接环境" value={draft.environment} disabled={disabled} onChange={value => update('environment', value)} options={environments.map(value => ({ value }))} placeholder="填写环境，或选择已有值" filterOption={(input, option) => String(option?.value || '').toLocaleLowerCase().includes(input.toLocaleLowerCase())} /></label>
      {type === 'mysql' && <div className="buildr-connection-host"><label>主机<Input aria-label="连接主机" value={mysqlDraft.host} disabled={disabled} onChange={event => updateMysql('host', event.target.value)} placeholder="localhost" /></label><label>端口<InputNumber aria-label="连接端口" value={mysqlDraft.port} min={1} max={65535} precision={0} disabled={disabled} onChange={value => updateMysql('port', value)} /></label></div>}
      {type === 'nacos' && <label>网站地址<Input id="nacos-connection-url" aria-label="Nacos 网站地址" value={nacosDraft.consoleUrl} disabled={disabled} onChange={event => updateNacos('consoleUrl', event.target.value)} placeholder="https://example.com/nacos/#/" /></label>}
      {type === 'xxl-job' && <label>网站地址<Input id="xxl-job-connection-url" aria-label="XXL-JOB 网站地址" value={xxlJobDraft.consoleUrl} disabled={disabled} onChange={event => updateXxlJob('consoleUrl', event.target.value)} placeholder="https://example.com/xxl-job-admin/" /></label>}
      {type !== 'kibana' && credentials}
      {type === 'kibana' && <KibanaConnectionFields draft={kibanaDraft} disabled={disabled} requestVersion={requestVersion} requestScope={discoveryScope} client={client} input={testInput} onChange={updateKibana}>{credentials}</KibanaConnectionFields>}
      {type === 'nacos' && <NacosConnectionFields draft={nacosDraft} disabled={disabled} onChange={updateNacos} />}
      {type === 'xxl-job' && <XxlJobConnectionFields draft={xxlJobDraft} disabled={disabled} previousConsoleUrl={connection && isXxlJobConnection(connection) ? connection.config.consoleUrl : undefined} onChange={updateXxlJob} />}
      {type === 'mysql' && <label>默认数据库 · 可选<Input aria-label="默认数据库" value={mysqlDraft.defaultDatabase} disabled={disabled} onChange={event => updateMysql('defaultDatabase', event.target.value)} placeholder="可留空" /></label>}
      {type === 'kibana' && !testMessage && <Alert type="info" showIcon message="当前配置尚未验证查询能力。保存成功只表示配置已登记。" />}
      <div><Button id={`test-${type}-connection`} loading={testing} disabled={saving} onClick={() => void test()}>测试连接</Button></div>
      <p className="buildr-connections-muted">密码保存在本机，不写入工作空间连接声明。</p>
      {testMessage && <Alert type="success" showIcon message={testMessage} />}
      {testResult?.kibana && <p className="buildr-connections-muted">数据视图（Data View）：{testResult.kibana.dataView.name || testResult.kibana.dataView.title} · {testResult.kibana.dataView.id}；本次已验证最小只读查询可执行。</p>}
      {(testResult?.kibana?.warnings || []).map((warning, index) => <Alert key={`${index}:${warning.code}`} type="warning" showIcon message={warning.message} />)}
      {testResult?.xxlJob && <p className="buildr-connections-muted">已核验 {testResult.xxlJob.apiVersion} 读取通道，可见 {testResult.xxlJob.executorCount} 个执行器（Executor）。服务（Service）关联与任务操作尚需按实际目标核对。</p>}
      {(testResult?.xxlJob?.warnings || []).map((warning, index) => <Alert key={`xxl-job:${index}`} type="warning" showIcon message={warning} />)}
      {error && <Alert type="error" showIcon message={error} />}
    </form>
  </MetadataEditDrawer>;
}
