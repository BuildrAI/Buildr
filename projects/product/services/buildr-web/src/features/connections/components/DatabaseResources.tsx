import { useEffect, useState } from 'react';
import { Button, Checkbox, Empty, Popover } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

type Props = { databases: string[]; visible: string[]; current: string; loading: boolean; active: boolean; onCurrent(database: string): void; onVisible(databases: string[]): void };

export function DatabaseResources({ databases, visible, current, loading, active, onCurrent, onVisible }: Props) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(visible);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const options = <div className="buildr-database-visibility"><Checkbox.Group value={draft} onChange={values => setDraft(values.map(String))} options={databases} /><small>仅控制列表显示。</small><Button size="small" type="primary" onClick={() => { onVisible(draft); setOpen(false); }}>应用</Button></div>;
  return <aside className="buildr-database-resources" aria-label="数据库资源管理器">
    <header><strong>数据库</strong><Popover title="选择显示的数据库" trigger="click" content={options} open={open} onOpenChange={value => { if (value) setDraft(visible); setOpen(value); }}><Button type="text" size="small" aria-label="选择显示的数据库" icon={<SettingOutlined />} disabled={loading || !databases.length} /></Popover></header>
    {loading ? <p>正在读取…</p> : visible.length ? visible.map(database => <Button type="text" key={database} aria-pressed={database === current} onClick={() => onCurrent(database)} title={database}>{database}</Button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={databases.length ? '未显示数据库' : '没有可访问的数据库'} />}
  </aside>;
}
