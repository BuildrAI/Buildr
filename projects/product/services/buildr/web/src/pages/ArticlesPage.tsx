import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';

const statusLabel: Record<string, string> = { published: '已发布', planned: '待发布', draft: '草稿' };
const platformLabel: Record<string, string> = { mowen: '墨问', wechat: '微信公众号', 'local-app': 'Local App' };

type Publication = {
  id: string;
  title: string;
  status: string;
  kind: string;
  publishedAt?: string;
  targets: Array<{ platform: string; status: string }>;
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

export function ArticlesPage() {
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [state, setState] = useState('正在读取');
  const [empty, setEmpty] = useState(false);
  const [emptyTitle, setEmptyTitle] = useState('暂无文章');
  const [emptyCopy, setEmptyCopy] = useState('当前 Product Project 还没有有效的对外文章材料。');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api('/api/v1/publications') as Promise<{ publications: Publication[]; empty?: boolean }>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '文章']);
        setPublications(data.publications);
        setState(`${data.publications.length} 篇文章`);
        setEmpty(Boolean(data.empty));
        setEmptyTitle('暂无文章');
        setEmptyCopy('当前 Product Project 还没有有效的对外文章材料。');
      } catch (err) {
        if (!cancelled) {
          setState('读取失败');
          setEmpty(true);
          setEmptyTitle('文章不可用');
          setEmptyCopy(err instanceof Error ? err.message : '读取失败');
          setPublications([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts]);

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <p className="eyebrow">文章</p>
          <h1>对外发布材料</h1>
          <p className="page-copy">项目内维护的文章源；Local App 只读展示，不在这里编辑或发布。</p>
        </div>
        <div className="toolbar-actions">
          <span id="publications-state" className="count-label">{state}</span>
        </div>
      </section>
      <section className="resource-list-section">
        <div className="section-heading">
          <div>
            <h2>文章目录</h2>
            <p className="section-copy">正文与配图来自 Product Project 的 docs/publications/。</p>
          </div>
        </div>
        <div id="publications-list" className="publication-list">
          {publications.map((publication) => (
            <article className="publication-card" key={publication.id}>
              <div className="publication-card-heading">
                <h3>
                  <Link to={href(`/articles/${encodeURIComponent(publication.id)}`)}>{publication.title}</Link>
                </h3>
                <span className={`state publication-status ${publication.status}`}>
                  {statusLabel[publication.status] || publication.status}
                </span>
              </div>
              <p className="publication-meta">{`${publication.kind} · ${publication.publishedAt || '未设置日期'}`}</p>
              <div className="publication-targets">
                {publication.targets.map((target) => (
                  <span key={`${target.platform}-${target.status}`}>
                    {`${platformLabel[target.platform] || target.platform} · ${statusLabel[target.status] || target.status}`}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
        <div id="publications-empty" className={`empty-state${empty ? '' : ' hidden'}`}>
          <h2>{emptyTitle}</h2>
          <p>{emptyCopy}</p>
        </div>
      </section>
    </>
  );
}
