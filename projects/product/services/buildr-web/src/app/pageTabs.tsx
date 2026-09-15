import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CloseOutlined } from '@ant-design/icons';

/** 页面级页签：目录（dir）与领域全景（proj/svc）皆为页签，跨页持久、可关闭。 */
export type PageTabKind = 'dir' | 'proj' | 'svc';
export type WorkspacePageTab = {
  key: string;
  kind: PageTabKind;
  title: string;
  /** 绝对路由路径（含 workspace 前缀）。 */
  path: string;
};

const storageKey = (workspaceId: string | null) => `buildr.web.page-tabs.${workspaceId ?? 'global'}`;

function readTabs(workspaceId: string | null): WorkspacePageTab[] {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is WorkspacePageTab => (
      Boolean(t) && typeof t.key === 'string' && typeof t.title === 'string' && typeof t.path === 'string'
      && (t.kind === 'dir' || t.kind === 'proj' || t.kind === 'svc')
    ));
  } catch {
    return [];
  }
}

function persistTabs(workspaceId: string | null, tabs: WorkspacePageTab[]): void {
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(tabs));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useWorkspacePageTabs(workspaceId: string | null) {
  const [tabs, setTabs] = useState<WorkspacePageTab[]>(() => readTabs(workspaceId));
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setTabs(readTabs(workspaceId));
  }, [workspaceId]);

  /** 页面挂载或标题就绪后登记自身页签；同 key 更新标题，保持既有顺序。 */
  const register = useCallback((tab: WorkspacePageTab) => {
    setTabs((current) => {
      const existing = current.find((t) => t.key === tab.key);
      if (existing && existing.title === tab.title && existing.path === tab.path) return current;
      const next = existing
        ? current.map((t) => (t.key === tab.key ? { ...t, title: tab.title, path: tab.path } : t))
        : [...current, tab];
      persistTabs(workspaceId, next);
      return next;
    });
  }, [workspaceId]);

  const close = useCallback((key: string) => {
    setTabs((current) => {
      const target = current.find((t) => t.key === key);
      const next = current.filter((t) => t.key !== key);
      persistTabs(workspaceId, next);
      if (target && target.path === location.pathname) {
        const fallback = next[next.length - 1];
        navigate(fallback ? fallback.path : `/workspaces/${workspaceId}/projects`, { replace: true });
      }
      return next;
    });
  }, [workspaceId, location.pathname, navigate]);

  return { tabs, register, close };
}

export function PageTabStrip({ tabs, onClose }: { tabs: WorkspacePageTab[]; onClose: (key: string) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  if (tabs.length === 0) return null;
  return (
    <div className="pane-tabstrip" role="tablist" aria-label="打开的页面">
      {tabs.map((tab) => {
        const active = tab.path === location.pathname;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`pane-tab${active ? ' on' : ''}`}
            title={tab.title}
            onClick={() => { if (!active) navigate(tab.path); }}
          >
            <span className={`pane-tab-dot ${tab.kind}`} aria-hidden />
            <span className="pane-tab-text">{tab.title}</span>
            <span
              className="pane-tab-x"
              role="button"
              aria-label={`关闭 ${tab.title}`}
              onClick={(event) => { event.stopPropagation(); onClose(tab.key); }}
            >
              <CloseOutlined />
            </span>
          </button>
        );
      })}
    </div>
  );
}
