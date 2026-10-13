import { useState } from 'react';
import { Button, Checkbox, Popover } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { Connection } from './models';
type Props = { connection: Connection; current: string; onCurrent(database: string): void; onVisible(databases: string[]): void };
export function DatabaseList({ connection, current, onCurrent, onVisible }: Props) {
  const visible = connection.visibleDatabases || connection.databases;
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(visible);
  const content = <div className="database-visibility"><Checkbox.Group value={draft} onChange={values => setDraft(values.map(String))} options={connection.databases} /><small>勾选只影响列表显示。</small><Button size="small" type="primary" onClick={() => { onVisible(draft); setOpen(false); }}>应用</Button></div>;
  return <aside className="database-list"><header><strong>数据库</strong><Popover title="选择显示的数据库" content={content} trigger="click" open={open} onOpenChange={value => { if (value) setDraft(visible); setOpen(value); }}><Button size="small" type="text" icon={<SettingOutlined />} aria-label="选择显示的数据库" title="选择显示的数据库" /></Popover></header>{visible.length ? visible.map(database => <Button key={database} type="text" className={database === current ? 'is-current' : ''} onClick={() => onCurrent(database)}>{database}</Button>) : <small>未显示数据库</small>}</aside>;
}
