import { useEffect, useState } from 'react';
import { Button } from 'antd';

export type UiPreviewPage = {
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

export type UiPreviewData = {
  taskId: string;
  previews: UiPreviewPage[];
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
  data: UiPreviewData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

function sourceLabel(preview: UiPreviewPage): string {
  return `${preview.project}/${preview.change} · ${preview.lifecycle === 'archived' ? '已归档' : '进行中'}`;
}

export function PreviewTab({ active, workspaceId, data, loading, error, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previews = data?.previews || [];

  useEffect(() => {
    if (!previews.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !previews.some((preview) => preview.id === selectedId)) setSelectedId(previews[0].id);
  }, [previews, selectedId]);

  const selected = previews.find((preview) => preview.id === selectedId) || previews[0] || null;
  const previewSource = selected && workspaceId
    ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(data?.taskId || '')}/ui-previews/${selected.id}`
    : undefined;

  return (
    <section id="task-preview-panel" className={active ? '' : 'hidden'} data-task-panel="preview" aria-live="polite">
      <article className="panel ui-preview-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">方案实施后的完整页面</p>
            <h2>界面预演稿（UI Preview）</h2>
            <p className="section-copy">用于正式开发前对齐页面预期；不是正式设计稿、生产原型或像素级验收标准。</p>
          </div>
          <Button id="task-preview-refresh" disabled={loading} onClick={onRefresh}>刷新预演</Button>
        </div>
        {error ? <div id="task-preview-error" className="environment-diagnostic"><p>{error}</p></div> : null}
      </article>

      <div id="task-preview-loading" className={`page-loading${loading ? '' : ' hidden'}`}>
        <span className="loader" />
        <p>正在读取任务关联的预演页面…</p>
      </div>

      {!loading && data && !previews.length ? (
        <section id="task-preview-empty" className="empty-state">
          <h2>这个任务还没有可查看的界面预演稿</h2>
          <p>Buildr 只读取任务关联 Change 中带 UI Preview 标记的完整 HTML；没有预演稿不会阻塞任务推进。</p>
        </section>
      ) : null}

      {!loading && selected && previewSource ? (
        <section className="ui-preview-layout">
          <aside className="panel ui-preview-browser" aria-label="预演页面列表">
            <div className="ui-preview-browser-heading">
              <span>预演页面</span>
              <strong>{previews.length}</strong>
            </div>
            <div className="ui-preview-page-list">
              {previews.map((preview) => (
                <Button
                  key={preview.id}
                  id={`task-preview-page-${previews.indexOf(preview)}`}
                  className={`ui-preview-page${preview.id === selected.id ? ' active' : ''}`}
                  type="text"
                  aria-pressed={preview.id === selected.id}
                  onClick={() => setSelectedId(preview.id)}
                >
                  <strong>{preview.title}</strong>
                  <span>{sourceLabel(preview)}</span>
                  <small>{preview.path}</small>
                </Button>
              ))}
            </div>
          </aside>

          <article className="panel ui-preview-stage">
            <div className="ui-preview-stage-heading">
              <div>
                <p className="eyebrow">当前页面</p>
                <h2 id="task-preview-title">{selected.title}</h2>
                <p id="task-preview-source" className="section-copy">{`${sourceLabel(selected)} · ${selected.path}`}</p>
              </div>
              <Button
                id="task-preview-open-window"
                onClick={() => {
                  if (previewSource) window.open(previewSource, '_blank', 'noopener,noreferrer');
                }}
              >
                新窗口打开
              </Button>
            </div>
            <div className="ui-preview-frame-shell">
              <iframe
                key={`${selected.id}:${selected.updatedAt}`}
                id="task-preview-frame"
                className="ui-preview-frame"
                title={selected.title}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                src={previewSource}
              />
            </div>
          </article>
        </section>
      ) : null}

      {data?.diagnostics?.length ? (
        <details id="task-preview-diagnostics" className="ui-preview-diagnostics">
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
