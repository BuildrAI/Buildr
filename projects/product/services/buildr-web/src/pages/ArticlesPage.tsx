import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, List, Tag, Typography } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';

const statusLabel: Record<string, string> = { published: '已发布', planned: '待发布', draft: '草稿' };
const platformLabel: Record<string, string> = { mowen: '墨问', wechat: '微信公众号', 'local-app': 'Buildr Web' };

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
          <Typography.Title level={2} style={{ margin: 0 }}>对外发布材料</Typography.Title>
          <p className="page-copy">项目内维护的文章源；Buildr Web 只读展示，不在这里编辑或发布。</p>
        </div>
        <div className="toolbar-actions">
          <span id="publications-state" className="count-label">{state}</span>
        </div>
      </section>
      <section className="resource-list-section">
        <div id="publications-list" className="publication-list">
          <List
            dataSource={publications}
            locale={{ emptyText: ' ' }}
            renderItem={(publication) => (
              <List.Item style={{ padding: 0, border: 'none', marginBottom: 12 }}>
                <Card className="publication-card" styles={{ body: { padding: 16 } }} style={{ width: '100%' }}>
                  <div className="publication-card-heading">
                    <h3>
                      <Link to={href(`/articles/${encodeURIComponent(publication.id)}`)}>{publication.title}</Link>
                    </h3>
                    <Tag className={`state publication-status ${publication.status}`}>
                      {statusLabel[publication.status] || publication.status}
                    </Tag>
                  </div>
                  <p className="publication-meta">{`${publication.kind} · ${publication.publishedAt || '未设置日期'}`}</p>
                  <div className="publication-targets">
                    {publication.targets.map((target) => (
                      <span key={`${target.platform}-${target.status}`}>
                        {`${platformLabel[target.platform] || target.platform} · ${statusLabel[target.status] || target.status}`}
                      </span>
                    ))}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        </div>
        <div id="publications-empty" className={`empty-state${empty ? '' : ' hidden'}`}>
          {empty ? (
            <Empty
              description={(
                <>
                  <Typography.Title level={4}>{emptyTitle}</Typography.Title>
                  <Typography.Paragraph type="secondary">{emptyCopy}</Typography.Paragraph>
                </>
              )}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
