import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spin } from 'antd';
import { workspaceHref } from '../../../lib/labels';
import { KnowledgeBrowser } from '../../knowledge/components/KnowledgeBrowser';
import { usePublication } from '../hooks/usePublication';
import { ArticleBody } from './ArticleBody';
export type ArticleRelated = { key: string; kind: 'article' | 'knowledge'; id: string; title: string; projectCode: string };
export function ArticleRelatedPane({ item, workspaceId }: { item: ArticleRelated; workspaceId: string }) {
  return item.kind === 'knowledge'
    ? <KnowledgeBrowser workspaceId={workspaceId} scope={{ kind: 'project', id: item.projectCode }} initialArtifactId={item.id} />
    : <RelatedArticleReader key={`${workspaceId}:${item.projectCode}:${item.id}`} item={item} workspaceId={workspaceId} />;
}

function RelatedArticleReader({ item, workspaceId }: { item: ArticleRelated; workspaceId: string }) {
  const { data: article, error, loading } = usePublication(workspaceId, item.projectCode, item.id);
  const [notice, setNotice] = useState('');
  const target = `/articles/${encodeURIComponent(item.projectCode)}/${encodeURIComponent(item.id)}`;
  return <section className="publication-related-pane"><header><span className="eyebrow">同项目文章</span><h2>{item.title}</h2><Link to={workspaceHref(workspaceId, target)}><Button size="small">查看文章</Button></Link></header>{loading ? <Spin /> : error ? <Alert type="error" message={error} /> : article && <ArticleBody content={article.content} workspaceId={workspaceId} projectCode={item.projectCode} publicationId={item.id} onRelativeLink={() => setNotice('这条相对链接不在当前文章资源内，请从所属项目查看对应材料。')} />}{notice && <Alert type="info" closable message={notice} onClose={() => setNotice('')} />}</section>;
}
