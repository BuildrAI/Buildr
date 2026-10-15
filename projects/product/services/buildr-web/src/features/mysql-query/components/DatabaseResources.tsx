import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Empty, Input, Popover } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';

type Props = { databases: string[]; visible: string[]; current: string; loading: boolean; saving: boolean; writable: boolean; active: boolean; onCurrent(database: string): void; onVisible(databases: string[]): void };

export function DatabaseResources({ databases, visible, current, loading, saving, writable, active, onCurrent, onVisible }: Props) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(visible), [search, setSearch] = useState('');
  const openRef = useRef(false), draftRef = useRef(visible), baselineRef = useRef(visible);
  const triggerRef = useRef<HTMLButtonElement>(null), contentRef = useRef<HTMLDivElement>(null);
  const editable = active && writable && !loading && !saving;
  function discard() { openRef.current = false; setOpen(false); }
  function changeOpen(value: boolean) {
    if (value === openRef.current) return;
    if (value) {
      if (!editable) return;
      baselineRef.current = visible;
      draftRef.current = visible; setDraft(visible); setSearch('');
      openRef.current = true; setOpen(true);
      return;
    }
    discard();
    const selected = draftRef.current, baseline = baselineRef.current;
    if (editable && (selected.length !== baseline.length || selected.some(database => !baseline.includes(database)))) onVisible(selected);
  }
  const latestChangeOpen = useRef(changeOpen);
  latestChangeOpen.current = changeOpen;
  useEffect(() => { if (!editable) discard(); }, [editable]);
  useEffect(() => {
    const document = triggerRef.current?.ownerDocument;
    if (!open || !editable || !document) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    function closeOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      // Let the clicked control finish; refresh or navigation may invalidate this draft.
      clearTimeout(pending);
      pending = setTimeout(() => latestChangeOpen.current(false), 0);
    }
    document.addEventListener('click', closeOutside, true);
    return () => { document.removeEventListener('click', closeOutside, true); clearTimeout(pending); };
  }, [open, editable]);
  function toggle(database: string, checked: boolean) {
    if (!editable) return;
    const selected = draftRef.current;
    const next = checked ? selected.includes(database) ? selected : [...selected, database] : selected.filter(value => value !== database);
    draftRef.current = next; setDraft(next);
  }
  const matches = databases.filter(database => database.toLowerCase().includes(search.trim().toLowerCase()));
  const options = <div ref={contentRef} id="mysql-database-picker" className="buildr-database-visibility" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); changeOpen(false); } }}>
    <header><strong>启用数据库</strong><span>已选 {draft.length} / {databases.length}</span></header>
    <div className="buildr-database-search"><Input aria-label="搜索数据库" placeholder="搜索数据库" prefix={<SearchOutlined />} allowClear value={search} onChange={event => setSearch(event.target.value)} /></div>
    <div className="buildr-database-options" role="group" aria-label="启用的数据库">
      {matches.length ? matches.map(database => <Checkbox key={database} className={`buildr-database-option${draft.includes(database) ? ' is-selected' : ''}`} checked={draft.includes(database)} disabled={!editable} onChange={event => toggle(database, event.target.checked)}><span className="buildr-database-name" title={database}>{database}</span></Checkbox>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的数据库" />}
    </div>
    <footer><span>仅影响资源列表和当前库选项</span><small>关闭后自动保存</small></footer>
  </div>;
  return <aside className="buildr-database-resources" aria-label="数据库资源管理器">
    <header><strong>数据库</strong><Popover placement="bottom" classNames={{ root: 'buildr-database-popover' }} trigger={[]} content={options} open={open && editable} onOpenChange={changeOpen}><Button ref={triggerRef} id="enable-mysql-databases" type="text" size="small" aria-label="启用数据库" aria-expanded={open && editable} icon={<SettingOutlined />} loading={saving} disabled={!editable || !databases.length} onClick={() => changeOpen(!openRef.current)} /></Popover></header>
    {loading ? <p>正在读取…</p> : visible.length ? visible.map(database => <Button type="text" key={database} disabled={!writable} aria-pressed={database === current} onClick={() => onCurrent(database)} title={database}>{database}</Button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={databases.length ? '请先启用数据库' : '没有可访问的数据库'} />}
  </aside>;
}
