import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Empty, Popover } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

type Props = { databases: string[]; visible: string[]; current: string; loading: boolean; saving: boolean; writable: boolean; active: boolean; onCurrent(database: string): void; onVisible(databases: string[]): void };

export function DatabaseResources({ databases, visible, current, loading, saving, writable, active, onCurrent, onVisible }: Props) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(visible);
  const openRef = useRef(false);
  function changeOpen(value: boolean) {
    if (value && !openRef.current) setDraft(visible);
    openRef.current = value; setOpen(value);
  }
  useEffect(() => { if (!active) changeOpen(false); }, [active]);
  const options = <div className="buildr-database-visibility"><Checkbox.Group aria-label="启用的数据库" value={draft} onChange={values => setDraft(values.map(String))} options={databases} /><small>选择资源列表与当前数据库中使用的库。</small><Button id="apply-enabled-databases" size="small" type="primary" disabled={!writable} loading={saving} onClick={() => { onVisible(draft); changeOpen(false); }}>应用</Button></div>;
  return <aside className="buildr-database-resources" aria-label="数据库资源管理器">
    <header><strong>数据库</strong><Popover title="启用数据库" trigger="click" content={options} open={open} onOpenChange={changeOpen}><Button id="enable-mysql-databases" type="text" size="small" aria-label="启用数据库" icon={<SettingOutlined />} disabled={!writable || !databases.length} /></Popover></header>
    {loading ? <p>正在读取…</p> : visible.length ? visible.map(database => <Button type="text" key={database} disabled={!writable} aria-pressed={database === current} onClick={() => onCurrent(database)} title={database}>{database}</Button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={databases.length ? '请先启用数据库' : '没有可访问的数据库'} />}
  </aside>;
}
