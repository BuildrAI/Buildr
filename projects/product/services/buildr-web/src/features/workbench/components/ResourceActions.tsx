import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Tooltip } from 'antd';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkbenchPreferences } from '../hooks/useWorkbenchPreferences';
import type { WorkbenchVisitRequest } from '../api/workbench-api';

export type WorkbenchResource = WorkbenchVisitRequest;

export function ResourceActions({ resource, projectCode }: { resource: WorkbenchResource | null; projectCode?: string }) {
  const { workspaceId } = useAppShell();
  const { has, set, remove, recordVisit, loading } = useWorkbenchPreferences(workspaceId);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const location = useLocation();
  const anchor = useRef<HTMLSpanElement>(null);
  const key = resource?.key, label = resource?.label, href = resource?.href, kind = resource?.kind;
  useEffect(() => {
    if (!key || !label || !href || !anchor.current || anchor.current.closest('[hidden]')) return;
    let cancelled = false;
    void recordVisit({ key, label, href, ...(kind ? { kind } : {}) }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : '最近访问记录未保存');
    });
    return () => { cancelled = true; };
  }, [key, label, href, kind, location.key, recordVisit]);
  if (!resource) return null;
  const saved = has('saved-resource', resource.key);
  const following = projectCode ? has('followed-project', projectCode) : false;
  const toggle = async (follow = false) => {
    setBusy(true); setError('');
    try {
      if (follow && projectCode) {
        if (following) await remove('followed-project', projectCode); else await set('followed-project', projectCode);
      } else if (saved) await remove('saved-resource', resource.key);
      else await set('saved-resource', resource.key, { label: resource.label, href: resource.href });
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setBusy(false); }
  };
  return <span ref={anchor} className="workbench-resource-actions">
    {projectCode ? <Button size="small" disabled={loading} loading={busy} onClick={() => void toggle(true)} icon={following ? <StarFilled /> : <StarOutlined />} data-follow-project={projectCode}>{following ? '已关注' : '关注项目'}</Button> : null}
    <Tooltip title={saved ? '从常用入口取消收藏' : '加入工作台常用入口'}>
      <Button size="small" disabled={loading} loading={busy} onClick={() => void toggle()} icon={saved ? <StarFilled /> : <StarOutlined />} aria-label={saved ? '取消收藏当前资料' : '收藏当前资料'} data-save-resource={resource.key}>{saved ? '已收藏' : '收藏'}</Button>
    </Tooltip>
    {error ? <Alert type="warning" message={error} closable onClose={() => setError('')} /> : null}
  </span>;
}
