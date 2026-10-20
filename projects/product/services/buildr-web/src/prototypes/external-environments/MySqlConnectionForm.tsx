import { useEffect, useState } from 'react';
import { Alert, AutoComplete, Button, Input, InputNumber, Tag } from 'antd';
import { OfflineEditDrawer } from './OfflineEditDrawer';
import { codeFieldTrim, textFieldTrim } from '../../lib/input-trim';
import { normalizeEnvironment, type Connection } from './models';
type Props = { open: boolean; connection?: Connection; newId?: string; environmentSuggestions: string[]; onCancel(): void; onSave(connection: Connection): void };
export function MySqlConnectionForm({ open, connection, newId = 'demo-mysql', environmentSuggestions, onCancel, onSave }: Props) {
  const [name, setName] = useState(''), [environment, setEnvironment] = useState(''), [host, setHost] = useState(''), [port, setPort] = useState<number | null>(3306);
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [defaultDatabase, setDefaultDatabase] = useState(''), [error, setError] = useState(''), [testNotice, setTestNotice] = useState(false);
  const databases = connection?.databases || ['orders_demo', 'billing_demo', 'reporting_demo'];
  useEffect(() => {
    if (!open) return;
    setName(connection?.name || ''); setEnvironment(connection?.environment || ''); setHost(connection?.host || ''); setPort(connection?.port || 3306);
    setUsername(connection?.username || ''); setPassword(connection?.password || ''); setDefaultDatabase(connection?.defaultDatabase || ''); setError(''); setTestNotice(false);
  }, [open, connection]);
  function save() {
    const explicitEnvironment = normalizeEnvironment(environment), defaultDB = defaultDatabase.trim();
    if (!name.trim() || !explicitEnvironment || !host.trim() || !port || !username.trim()) { setError('请填写名称、环境、主机、端口与用户。'); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host.trim()) || !Number.isInteger(port) || port < 1 || port > 65535) { setError('示例主机使用域名或 IPv4；端口应为 1–65535 的整数。'); return; }
    if (defaultDB && !/^[A-Za-z][A-Za-z0-9_]*$/.test(defaultDB)) { setError('默认数据库可留空；示例库名使用字母、数字和下划线。'); return; }
    onSave({ ...connection, id: connection?.id || newId, name: name.trim(), category: 'data-source', type: 'mysql', environment: explicitEnvironment, host: host.trim(), port,
      revision: connection?.revision || 1, databases, visibleDatabases: connection?.visibleDatabases || databases.slice(0, 2), defaultDatabase: defaultDB || undefined, username: username.trim(), password });
  }
  return <OfflineEditDrawer open={open} title={connection ? '编辑连接' : '新增连接'} objectName={connection?.name || 'MySQL 连接'} onSave={save} onClose={onCancel}><div className="connections-form" role="form" aria-label="MySQL 连接配置">
    <label>名称<Input aria-label="连接名称" value={name} {...textFieldTrim(setName)} /></label><div><Tag>MySQL</Tag></div>
    <label>环境<AutoComplete aria-label="连接环境" placeholder="填写环境，或选择已有值" value={environment} onChange={setEnvironment} options={environmentSuggestions.map(value => ({ value }))} filterOption={(input, option) => String(option?.value || '').toLowerCase().includes(input.toLowerCase())} /></label>
    <div className="connections-form-pair connections-host-port"><label>主机<Input aria-label="连接主机" placeholder="mysql.example.invalid" value={host} {...codeFieldTrim(setHost)} /></label><label>端口<InputNumber aria-label="连接端口" min={1} max={65535} value={port} onChange={setPort} /></label></div>
    <label>用户<Input aria-label="连接用户" value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" /></label>
    <label>密码<Input.Password aria-label="连接密码" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" placeholder="本轮仅输入虚构密码" /></label>
    <label>默认数据库 · 可选<AutoComplete aria-label="默认数据库" placeholder="可留空" value={defaultDatabase} onChange={setDefaultDatabase} options={databases.map(value => ({ value }))} /></label>
    <div><Button onClick={() => setTestNotice(true)}>测试连接</Button></div>
    <p className="connections-muted">离线原型，请仅填写虚构信息；密码只保留本次页面内存，未连接实际系统。</p>
    {testNotice && <Alert type="info" showIcon message="离线原型：未发起实际连接测试。" />}{error && <Alert type="warning" showIcon message={error} />}
  </div></OfflineEditDrawer>;
}
