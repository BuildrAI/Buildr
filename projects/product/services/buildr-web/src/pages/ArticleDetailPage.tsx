import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Segmented } from 'antd';
import { runtimeSystemApi, workspaceApi, type PublicationDetail } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';
import { renderMarkdown } from '../markdown';

const statusLabel: Record<string, string> = { published: '已发布', planned: '待发布', draft: '草稿' };
const platformLabel: Record<string, string> = { mowen: '墨问', wechat: '微信公众号', 'buildr-web': 'Buildr Web', 'local-app': 'Buildr Web' };

export function ArticleDetailPage() {
  const { publicationId = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<PublicationDetail | null>(null);
  const [workspaceUuid, setWorkspaceUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'rendered' | 'source'>('rendered');
  const renderedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, detail] = await Promise.all([
          workspaceApi.read(),
          runtimeSystemApi.publication(publicationId),
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceUuid(workspace.workspace.id);
        setBreadcrumbParts([workspace.workspace.name, '文章', detail.publication.title]);
        setData(detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '文章不可用');
      }
    })();
    return () => { cancelled = true; };
  }, [publicationId, setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    if (!data || !workspaceUuid || !renderedRef.current) return;
    const rendered = renderMarkdown(data.content, {
      headingOffset: 1,
      allowRelativeLinks: true,
      imageResolver(assetHref: string) {
        if (!/^assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(assetHref) || assetHref.includes('..') || assetHref.includes('\\')) {
          return null;
        }
        return {
          href: `/api/v1/workspaces/${encodeURIComponent(workspaceUuid)}/publications/${encodeURIComponent(data.publication.id)}/assets/${assetHref.split('/').map(encodeURIComponent).join('/')}`,
        };
      },
    });
    rendered.classList.add('publication-content', 'content-view-pane', 'is-active');
    rendered.setAttribute('data-view', 'rendered');
    renderedRef.current.replaceChildren(rendered);
  }, [data, workspaceUuid]);

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">文章</p>
          <h1>文章不可用</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link to={href('/articles')}><Button>返回文章目录</Button></Link>
      </>
    );
  }

  if (!data) {
    return (
      <div className="page-loading">
        <span className="loader" />
        <p>正在读取真实信息…</p>
      </div>
    );
  }

  const publication = data.publication;

  return (
    <>
      <section className="page-header publication-detail-header">
        <Link className="back-link" to={href('/articles')}>← 返回文章目录</Link>
        <div className="page-header-row">
          <div>
            <p className="eyebrow">文章</p>
            <h1 id="publication-title">{publication.title}</h1>
            <p id="publication-copy" className="page-copy">
              {`${publication.kind} · ${publication.publishedAt || '未设置发布日期'} · ${publication.sourcePath || ''}`}
            </p>
          </div>
          <span id="publication-status" className={`state publication-status ${publication.status}`}>
            {statusLabel[publication.status] || publication.status}
          </span>
        </div>
      </section>
      <section className="panel publication-target-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">发布目标</p>
            <h2>平台状态</h2>
          </div>
          <span className="state">只读</span>
        </div>
        <div id="publication-targets" className="publication-targets">
          {publication.targets.map((target) => {
            const label = `${platformLabel[target.platform] || target.platform} · ${statusLabel[target.status] || target.status}`;
            if (target.url) {
              return (
                <a key={`${target.platform}-${target.status}`} href={target.url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              );
            }
            return <span key={`${target.platform}-${target.status}`}>{label}</span>;
          })}
        </div>
      </section>
      <section id="publication-content-panel" className="panel publication-content-panel">
        <div className="content-view">
          <div className="content-view-toggle" role="group" aria-label="内容视图">
            <Segmented
              value={view}
              onChange={(value) => setView(value as 'rendered' | 'source')}
              options={[
                { label: '渲染', value: 'rendered' },
                { label: '原文', value: 'source' },
              ]}
            />
          </div>
          <div ref={renderedRef} hidden={view !== 'rendered'} />
          <pre
            className="publication-content content-view-pane content-view-source"
            data-view="source"
            hidden={view === 'rendered'}
          >
            {data.content ?? ''}
          </pre>
        </div>
      </section>
    </>
  );
}
