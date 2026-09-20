import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spin } from 'antd';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { workspaceHref } from '../../../lib/labels';
import { knowledgeApi } from '../../knowledge/api/knowledge-api';
import { publicationApi, type PublicationDetail } from '../api/publication-api';
import { ArticleBody } from './ArticleBody';
export type ArticleRelated = { key: string; kind: 'article' | 'knowledge'; id: string; title: string; projectCode: string };
export function ArticleRelatedPane({ item, workspaceId }: { item: ArticleRelated; workspaceId: string }) {
  const [article, setArticle] = useState<PublicationDetail | null>(null), [knowledge, setKnowledge] = useState<string | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const run = async () => {
      if (item.kind === 'article') {
        const detail = await publicationApi.detail(item.id, controller.signal, item.projectCode);
        if (!controller.signal.aborted) setArticle(detail);
      } else {
        const result = await knowledgeApi.read({ kind: 'project', id: item.projectCode }, 'artifacts', item.id, controller.signal);
        if (!controller.signal.aborted) setKnowledge(result.artifacts?.find(artifact => artifact.id === item.id)?.content || '这份资料暂无可阅读正文。');
      }
    };
    void run().catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '相关资料读取失败'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, item.key]);
  const target = item.kind === 'article' ? `/articles/${encodeURIComponent(item.projectCode)}/${encodeURIComponent(item.id)}` : `/knowledge/project/${encodeURIComponent(item.projectCode)}?artifact=${encodeURIComponent(item.id)}`;
  return <section className="publication-related-pane"><header><span className="eyebrow">{item.kind === 'article' ? '同项目文章' : '项目知识'}</span><h2>{item.title}</h2><Link to={workspaceHref(workspaceId, target)}><Button size="small">独立查看</Button></Link></header>{loading ? <Spin /> : error ? <Alert type="error" message={error} /> : article ? <ArticleBody content={article.content} workspaceId={workspaceId} projectCode={item.projectCode} publicationId={item.id} /> : <MarkdownHost markdown={knowledge || ''} />}</section>;
}
