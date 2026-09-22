import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Segmented } from 'antd';
import { ArrowRightOutlined, FileTextOutlined, StarFilled } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { useWorkbenchPreferences } from '../hooks/useWorkbenchPreferences';

export function WorkbenchResources() {
  const { workspaceId } = useAppShell();
  const { preferences, error, has, set, remove } = useWorkbenchPreferences(workspaceId);
  const [tab, setTab] = useState('saved-resource');
  const [actionError, setActionError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState('');
  const all = (preferences?.items || []).filter(item => item.kind === tab);
  const items = expanded ? all : all.slice(0, 5);
  const toggle = async (key: string, label: string, href: string) => {
    setBusy(key); setActionError('');
    try {
      if (has('saved-resource', key)) await remove('saved-resource', key);
      else await set('saved-resource', key, { label, href });
    } catch (err) { setActionError(err instanceof Error ? err.message : '收藏未保存'); }
    finally { setBusy(''); }
  };
  return <section className="workbench-rail-card" id="workbench-resources">
    <div className="workbench-section-heading"><h2>常用入口</h2>{all.length > 5 ? <Button size="small" type="text" onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '查看全部'}</Button> : null}</div>
    <Segmented size="small" value={tab} onChange={value => setTab(value)} options={[{ label: '已收藏', value: 'saved-resource' }, { label: '最近打开', value: 'recent-resource' }]} />
    {error || actionError ? <Alert type="warning" message={actionError || error} /> : null}
    {items.length ? <div className="workbench-resource-list">
      {items.map(item => <div className="workbench-resource-row" key={item.key}>
        <FileTextOutlined />
        <Link to={item.href}><strong>{item.label}</strong><small>{tab === 'saved-resource' ? '已收藏的工作资料' : '最近访问'}</small></Link>
        <Button size="small" type="text" loading={busy === item.key} icon={has('saved-resource', item.key) ? <StarFilled /> : <ArrowRightOutlined />} aria-label={(has('saved-resource', item.key) ? '取消收藏：' : '收藏：') + item.label} onClick={() => void toggle(item.key, item.label, item.href)} />
      </div>)}
    </div> : <div className="workbench-rail-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === 'saved-resource' ? '还没有收藏' : '还没有访问记录'} /><p>阅读资料时，可以收藏到这里。</p><Link className="workbench-link" to={workspaceHref(workspaceId, '/projects')}>浏览工作空间 <ArrowRightOutlined /></Link></div>}
  </section>;
}
