import { useEffect, useState } from 'react';
import { Button } from 'antd';

export type UiPrototypePage = {
  id: string;
  project: string;
  change: string;
  lifecycle: 'active' | 'archived';
  provenance: string;
  path: string;
  title: string;
  sizeBytes: number;
  updatedAt: string;
};

export type UiPrototypeData = {
  taskId: string;
  prototypes: UiPrototypePage[];
  diagnostics: Array<{
    code: string;
    message: string;
    project?: string;
    change?: string;
    path?: string;
  }>;
};

type Props = {
  active: boolean;
  workspaceId: string | null;
  data: UiPrototypeData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

function sourceLabel(prototype: UiPrototypePage): string {
  return `${prototype.project}/${prototype.change} · ${prototype.lifecycle === 'archived' ? '已归档' : '进行中'}`;
}

export function PrototypeTab({ active, workspaceId, data, loading, error, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const prototypes = data?.prototypes || [];

  useEffect(() => {
    if (!prototypes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !prototypes.some((prototype) => prototype.id === selectedId)) setSelectedId(prototypes[0].id);
  }, [prototypes, selectedId]);

  const selected = prototypes.find((prototype) => prototype.id === selectedId) || prototypes[0] || null;
  const prototypeSource = selected && workspaceId
    ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(data?.taskId || '')}/ui-prototypes/${selected.id}`
    : undefined;

  return (
    <section id="task-prototype-panel" className={active ? '' : 'hidden'} data-task-panel="prototype" aria-live="polite">
      <article className="panel ui-prototype-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">方案实施后的完整页面</p>
            <h2>界面原型</h2>
            <p className="section-copy">用于约束后续页面和交互开发；不是正式设计稿、规范或像素级验收标准。</p>
          </div>
          <Button id="task-prototype-refresh" disabled={loading} onClick={onRefresh}>刷新原型</Button>
        </div>
        {error ? <div id="task-prototype-error" className="environment-diagnostic"><p>{error}</p></div> : null}
      </article>

      <div id="task-prototype-loading" className={`page-loading${loading ? '' : ' hidden'}`}>
        <span className="loader" />
        <p>正在读取任务关联的原型页面…</p>
      </div>

      {!loading && data && !prototypes.length ? (
        <section id="task-prototype-empty" className="empty-state">
          <h2>这个任务还没有可查看的界面原型</h2>
          <p>Buildr 只读取任务关联变更中带原型标记的完整 HTML；没有原型不会阻塞任务推进。</p>
        </section>
      ) : null}

      {!loading && selected && prototypeSource ? (
        <section className="ui-prototype-layout">
          <aside className="panel ui-prototype-browser" aria-label="原型页面列表">
            <div className="ui-prototype-browser-heading">
              <span>原型页面</span>
              <strong>{prototypes.length}</strong>
            </div>
            <div className="ui-prototype-page-list">
              {prototypes.map((prototype) => (
                <Button
                  key={prototype.id}
                  id={`task-prototype-page-${prototypes.indexOf(prototype)}`}
                  className={`ui-prototype-page${prototype.id === selected.id ? ' active' : ''}`}
                  type="text"
                  aria-pressed={prototype.id === selected.id}
                  onClick={() => setSelectedId(prototype.id)}
                >
                  <strong>{prototype.title}</strong>
                  <span>{sourceLabel(prototype)}</span>
                  <small>{prototype.path}</small>
                </Button>
              ))}
            </div>
          </aside>

          <article className="panel ui-prototype-stage">
            <div className="ui-prototype-stage-heading">
              <div>
                <p className="eyebrow">当前页面</p>
                <h2 id="task-prototype-title">{selected.title}</h2>
                <p id="task-prototype-source" className="section-copy">{`${sourceLabel(selected)} · ${selected.path}`}</p>
              </div>
              <Button
                id="task-prototype-open-window"
                onClick={() => {
                  if (prototypeSource) window.open(prototypeSource, '_blank', 'noopener,noreferrer');
                }}
              >
                新窗口打开
              </Button>
            </div>
            <div className="ui-prototype-frame-shell">
              <iframe
                key={`${selected.id}:${selected.updatedAt}`}
                id="task-prototype-frame"
                className="ui-prototype-frame"
                title={selected.title}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                src={prototypeSource}
              />
            </div>
          </article>
        </section>
      ) : null}

      {data?.diagnostics?.length ? (
        <details id="task-prototype-diagnostics" className="ui-prototype-diagnostics">
          <summary>{`读取诊断（${data.diagnostics.length}）`}</summary>
          <ul>
            {data.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}:${diagnostic.project || ''}:${diagnostic.change || ''}:${diagnostic.path || ''}:${index}`}>
                <strong>{diagnostic.code}</strong>
                <span>{diagnostic.message}</span>
                {diagnostic.project && diagnostic.change ? <small>{`${diagnostic.project}/${diagnostic.change}${diagnostic.path ? ` · ${diagnostic.path}` : ''}`}</small> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
