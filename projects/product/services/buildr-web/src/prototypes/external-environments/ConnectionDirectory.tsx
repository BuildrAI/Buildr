import { useState } from 'react';
import { Button, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { MySqlConnectionForm } from './MySqlConnectionForm';
import { connectionEndpoint, environmentTagClass, type Connection } from './models';
type Props = { connections: Connection[]; onQuery(connection: Connection, database: string): void; onSave(connection: Connection): void };
export function ConnectionDirectory({ connections, onQuery, onSave }: Props) {
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<Connection>();
  return <section className="connections-directory connections-page"><header className="page-header"><div><h1>连接</h1><p>管理 MySQL 连接，选择要查看的数据库。</p></div><Button icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setOpen(true); }}>新增连接</Button></header><div data-prototype-position="connection-list"><Table size="middle" rowKey="id" pagination={false} dataSource={connections} columns={[
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '环境', dataIndex: 'environment', width: 90, render: value => <Tag className={environmentTagClass(value)}>{value}</Tag> },
    { title: '地址 / 默认数据库', render: (_, connection) => <div className="connection-address"><code>{connectionEndpoint(connection)}</code><small>默认：{connection.defaultDatabase || '未设置'}</small></div> },
    { title: '类型', width: 90, render: () => 'MySQL' },
    { title: '操作', width: 150, render: (_, connection) => <div className="connection-row-actions"><Button type="link" onClick={() => onQuery(connection, connection.databases[0])}>查询</Button><Button type="link" onClick={() => { setEditing(connection); setOpen(true); }}>编辑</Button></div> },
  ]} scroll={{ x: 720 }} /></div><p className="connections-muted">离线原型，仅使用虚构地址和数据，未连接实际系统。</p><MySqlConnectionForm open={open} connection={editing} newId={`demo-mysql-${connections.length + 1}`} environmentSuggestions={[...new Set(connections.map(item => item.environment))]} onCancel={() => setOpen(false)} onSave={value => { onSave(value); setOpen(false); }} /></section>;
}
