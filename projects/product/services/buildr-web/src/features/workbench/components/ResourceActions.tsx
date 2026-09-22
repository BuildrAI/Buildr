import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, notification, Tooltip } from 'antd';
import { PushpinFilled, PushpinOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkbenchPreferences } from '../hooks/useWorkbenchPreferences';
import type { WorkbenchVisitRequest } from '../api/workbench-api';

export type WorkbenchResource = WorkbenchVisitRequest;

export function ResourceActions({ resource, projectCode, size = 'small' }: { resource: WorkbenchResource | null; projectCode?: string; size?: 'small' | 'middle' }) {
  const { workspaceId } = useAppShell();
  const { has, set, remove, recordVisit, loading } = useWorkbenchPreferences(workspaceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ resource: string; message: string } | null>(null);
  const [notices, noticeHolder] = notification.useNotification({ maxCount: 1 });
  const location = useLocation();
  const anchor = useRef<HTMLSpanElement>(null);
  const key = resource?.key, label = resource?.label, href = resource?.href, kind = resource?.kind;
  const resourceIdentity = `${workspaceId || ''}:${key || ''}`;
  const currentResource = useRef(resourceIdentity);
  currentResource.current = resourceIdentity;
  useEffect(() => { setBusy(false); }, [resourceIdentity]);
  useEffect(() => {
    setError(null);
    if (!key || !label || !href || !anchor.current || anchor.current.closest('[hidden]')) return;
    let cancelled = false;
    void recordVisit({ key, label, href, ...(kind ? { kind } : {}) }).catch(err => {
      if (!cancelled) setError({ resource: resourceIdentity, message: err instanceof Error ? err.message : '最近访问记录未保存' });
    });
    return () => { cancelled = true; };
  }, [key, label, href, kind, resourceIdentity, location.key, recordVisit]);
  useEffect(() => {
    if (!key || !error || error.resource !== resourceIdentity) return;
    const noticeKey = `resource-actions:${resourceIdentity}`;
    notices.warning({
      key: noticeKey,
      message: '工作台记录未保存',
      description: error.message,
      placement: 'topRight',
      duration: 0,
      onClose: () => setError(current => current === error ? null : current),
    });
    return () => notices.destroy(noticeKey);
  }, [key, error, resourceIdentity, notices]);
  if (!resource) return null;
  const saved = has('saved-resource', resource.key);
  const following = projectCode ? has('followed-project', projectCode) : false;
  const toggle = async (follow = false) => {
    setBusy(true); setError(null);
    try {
      if (follow && projectCode) {
        if (following) await remove('followed-project', projectCode); else await set('followed-project', projectCode);
      } else if (saved) await remove('saved-resource', resource.key);
      else await set('saved-resource', resource.key, { label: resource.label, href: resource.href });
    } catch (err) {
      if (currentResource.current === resourceIdentity) setError({ resource: resourceIdentity, message: err instanceof Error ? err.message : '保存失败' });
    } finally {
      if (currentResource.current === resourceIdentity) setBusy(false);
    }
  };
  return <span ref={anchor} className="workbench-resource-actions">
    {noticeHolder}
    {projectCode ? <Tooltip title="在工作台快速进入此项目，并优先查看其每日演进"><Button size={size} disabled={loading} loading={busy} onClick={() => void toggle(true)} icon={following ? <PushpinFilled /> : <PushpinOutlined />} data-follow-project={projectCode}>{following ? '已关注项目' : '关注项目'}</Button></Tooltip> : null}
    {!projectCode && <Tooltip title={saved ? '从常用入口取消收藏' : '加入工作台常用入口'}>
      <Button size={size} disabled={loading} loading={busy} onClick={() => void toggle()} icon={saved ? <StarFilled /> : <StarOutlined />} aria-label={saved ? '取消收藏当前资料' : '收藏当前资料'} data-save-resource={resource.key}>{saved ? '已收藏' : '收藏'}</Button>
    </Tooltip>}
  </span>;
}
