import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Drawer, Dropdown, Empty, Segmented, Space, Spin, Tag, message } from 'antd';
import { CopyOutlined, DownloadOutlined, EditOutlined, MoreOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { InsideResourcePreview, useResourcePreview } from '../../../app/resource-preview';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { workspaceHref } from '../../../lib/labels';
import { ResourceActions } from '../../workbench/components/ResourceActions';
import { knowledgeApi } from '../../knowledge/api/knowledge-api';
import { publicationApi } from '../api/publication-api';
import { usePublication } from '../hooks/usePublication';
import { ArticleBody, type ArticleHeading } from '../components/ArticleBody';
import { useArticleEditor } from '../components/ArticleEditorProvider';
import { ArticleDeleteModal } from '../components/ArticleDeleteModal';
import { ArticleRelatedPane, type ArticleRelated } from '../components/ArticleRelatedPane';
import { ArticleWritingDrawer } from '../components/ArticleWritingDrawer';
import { articlePath, articleResourceKey, displayArticleDate, downloadMarkdown, publicationAssetUrl, publicationPlatform, publicationStatus, referencedAssets } from '../publication-model';
import '../publication.css';

type Props = {
  preview?: { projectCode: string; publicationId: string };
  initialView?: 'rendered' | 'source'; initialEditing?: boolean;
};

export function ArticleDetailPage({ preview, initialView, initialEditing = false }: Props = {}) {
  const params = useParams();
  const projectCode = preview?.projectCode || params.projectCode || 'product';
  const publicationId = preview?.publicationId || params.publicationId || '';
  const embedded = useContext(InsideResourcePreview), previews = useResourcePreview();
  const { workspaceId, workspace, setBreadcrumbParts } = useAppShell();
  const tabs = useWorkspacePageTabs(workspaceId), location = useLocation(), navigate = useNavigate();
  const { data, error, loading, reload } = usePublication(workspaceId, projectCode, publicationId);
  const [view, setView] = useState<'rendered' | 'source'>(initialView || (location.state?.articleView === 'source' ? 'source' : 'rendered'));
  const [writingMethod, setWritingMethod] = useState('润色表达');
  const openEditor = useArticleEditor();
  const [writing, setWriting] = useState(false), [deleting, setDeleting] = useState(false), [records, setRecords] = useState(false);
  const [headings, setHeadings] = useState<ArticleHeading[]>([]), [related, setRelated] = useState<ArticleRelated[]>([]), [panes, setPanes] = useState<ArticleRelated[]>([]), [activePane, setActivePane] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState('');
  const scrollTo = useRef<(index: number) => void>(() => {});
  const [messages, holder] = message.useMessage();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const listSearch = typeof location.state?.articleListSearch === 'string' ? location.state.articleListSearch : '';
  useEffect(() => { if (initialView) setView(initialView); else if (location.state?.articleView === 'source') setView('source'); }, [initialView, location.key]);
  useEffect(() => {
    if (!initialEditing || !data) return;
    openEditor({ projectCode, publicationId });
    // Consume old edit links at entry; closing the stable editor needs no reader callback.
    const path = href(articlePath(data.publication));
    if (embedded) previews?.open(location.pathname, path);
    else if (location.pathname.endsWith('/edit')) navigate(path, { replace: true, state: { articleListSearch: listSearch } });
  }, [initialEditing, data?.publication.id, projectCode, publicationId, embedded, openEditor]);
  useEffect(() => {
    if (!data || embedded) return;
    setBreadcrumbParts([workspace?.name || '工作空间', '文章', data.publication.title]);
    tabs.register({ key: `publication:${projectCode}:${publicationId}`, kind: 'proj', title: data.publication.title, path: href(articlePath(data.publication)) });
  }, [data?.publication.title, workspaceId, projectCode, publicationId, embedded]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([publicationApi.list(controller.signal), knowledgeApi.read({ kind: 'project', id: projectCode }, undefined, undefined, controller.signal)]).then(([articles, knowledge]) => {
      if (controller.signal.aborted) return;
      const items: ArticleRelated[] = [];
      if (knowledge.status === 'fulfilled') for (const artifact of (knowledge.value.index?.artifacts || []).filter(item => item.kind === 'document').slice(0, 3)) items.push({ key: `knowledge:${artifact.id}`, kind: 'knowledge', id: artifact.id, title: artifact.title, projectCode });
      if (articles.status === 'fulfilled') for (const article of articles.value.publications.filter(item => item.projectCode === projectCode && item.id !== publicationId).slice(0, 3)) items.push({ key: `article:${article.id}`, kind: 'article', id: article.id, title: article.title, projectCode });
      setRelated(items);
    });
    return () => controller.abort();
  }, [workspaceId, projectCode, publicationId]);
  const copy = (text: string) => { void navigator.clipboard.writeText(text).then(() => messages.success('已复制')).catch(() => messages.error('自动复制失败，请选择文本复制')); };
  const openRelated = (item: ArticleRelated) => { setPanes(current => current.some(pane => pane.key === item.key) ? current : [...current, item]); setActivePane(item.key); };
  const jump = (index: number) => { setView('rendered'); requestAnimationFrame(() => scrollTo.current(index)); };
  const toc = <nav className="publication-toc-links" aria-label="本文目录">{headings.length ? headings.map(heading => <button type="button" key={heading.index} className={heading.level > 2 ? 'nested' : ''} onClick={() => jump(heading.index)}>{heading.text}</button>) : <span className="publication-muted">本文暂无章节标题</span>}</nav>;
  const article = data?.publication;
  const resources = article && data ? referencedAssets(data.content).map(path => ({ path, asset: data.assets?.find(asset => asset.relativePath === path) })) : [];
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close} objectTabs={panes.map(pane => ({ key: pane.key, title: pane.title, kind: 'doc' }))} activeObject={activePane} onActivateObject={setActivePane} onCloseObject={key => { const next = panes.filter(pane => pane.key !== key); setPanes(next); if (activePane === key) setActivePane(next.at(-1)?.key || null); }} objectContent={<>{panes.map(pane => <div key={pane.key} hidden={activePane !== pane.key}><ArticleRelatedPane item={pane} workspaceId={workspaceId || ''} /></div>)}</>}>
    <div className="publication-page publication-reader">{holder}{embedded ? <Button className="publication-back" type="link" onClick={() => previews?.close(location.pathname, 'article')}>← 返回</Button> : <Link className="publication-back" to={href('/articles') + listSearch}>← 返回文章列表</Link>}
      {error && <Alert type="error" message={data ? '正文暂时无法更新，仍显示上次读取的内容。' : '文章不可用'} description={error} action={<Button size="small" onClick={reload}>重试</Button>} />}
      {!data ? loading ? <div className="publication-loading"><Spin /><p>正在读取文章…</p></div> : <Empty description="这篇文章目前不可用" /> : article && <>
        <header className="publication-reader-head"><div className="publication-reader-topline"><Link to={href(`/projects/${encodeURIComponent(projectCode)}`)}>{article.projectName}</Link><span>/</span><span>文章</span><Tag id="publication-status" className={`publication-state ${article.status}`}>{publicationStatus[article.status] || article.status}</Tag></div><h1 id="publication-title">{article.title}</h1>{article.summary && <p id="publication-copy" className="publication-deck">{article.summary}</p>}<div className="publication-reader-meta"><span>更新于 {displayArticleDate(article.updatedAt || article.publishedAt)}</span><span>约 {Math.max(1, Math.ceil(data.content.length / 400))} 分钟阅读</span><Space wrap className="publication-reader-actions"><ResourceActions resource={{ kind: 'article', key: articleResourceKey(article), label: article.title, href: href(articlePath(article)) }} size="middle" /><Button icon={<EditOutlined />} onClick={() => openEditor({ projectCode, publicationId })}>编辑文章</Button><Button type="primary" onClick={() => { setWritingMethod('润色表达'); setWriting(true); }}>交给智能体（Agent）完善</Button><Dropdown trigger={['click']} menu={{ items: [{ key: 'source', label: view === 'source' ? '阅读正文' : '查看原文' }, { key: 'copy', label: '复制链接' }, { key: 'export', label: '导出 Markdown' }, { key: 'records', label: '发布记录' }, { type: 'divider' }, { key: 'delete', label: '删除文章', danger: true }], onClick: ({ key }) => {
          if (key === 'source') setView(current => current === 'source' ? 'rendered' : 'source');
          if (key === 'copy') copy(new URL(href(articlePath(article)), window.location.origin).href);
          if (key === 'export') downloadMarkdown(data.source || data.content, article.sourcePath);
          if (key === 'records') setRecords(true);
          if (key === 'delete') setDeleting(true);
        } }}><Button type="text" icon={<MoreOutlined />} aria-label="更多文章操作" /></Dropdown></Space></div></header>
        {data.assetDiagnostics.length > 0 && <Alert type="warning" message="部分文章资源暂时不可用" description={data.assetDiagnostics.map(item => item.message).join('；')} />}
        <details className="publication-mobile-toc"><summary>文章目录</summary>{toc}<Button type="link" onClick={() => setRecords(true)}>查看发布记录</Button></details>
        <div className="publication-reading-layout"><aside className="publication-toc"><p className="eyebrow">本文目录</p>{toc}<section className="publication-record-summary"><h2>发布记录</h2><div id="publication-targets">{article.targets.length ? article.targets.map((target, index) => <div key={`${target.platform}:${index}`}><span>{publicationPlatform[target.platform] || target.platform}</span><Tag className={`publication-state ${target.status}`}>{publicationStatus[target.status] || target.status}</Tag></div>) : <span className="publication-muted">暂无发布记录</span>}</div><Button type="link" onClick={() => setRecords(true)}>查看发布记录 →</Button></section></aside>
          <article id="publication-content-panel" className="publication-reading-content"><div className="publication-content-actions"><Segmented value={view} onChange={value => setView(value as 'rendered' | 'source')} options={[{ label: '正文', value: 'rendered' }, { label: '原文', value: 'source' }]} /><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(data.source || data.content)}>复制原文</Button><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => downloadMarkdown(data.source || data.content, article.sourcePath)}>导出</Button></div><div hidden={view !== 'rendered'}><ArticleBody content={data.content} workspaceId={workspaceId || ''} projectCode={projectCode} publicationId={publicationId} onHeadings={setHeadings} onScrollToReady={scroll => { scrollTo.current = scroll; }} onRelativeLink={() => setLinkNotice('这条相对链接不在当前文章资源内，请从所属项目查看对应材料。')} /></div>{view === 'source' && <pre className="publication-source" data-view="source">{data.source || data.content}</pre>}
            {linkNotice && <Alert type="info" closable onClose={() => setLinkNotice('')} message={linkNotice} />}
            {resources.length > 0 && <section className="publication-reading-assets"><h2>文章资源</h2>{resources.map(({ path, asset }) => <a key={path} href={publicationAssetUrl(workspaceId || '', projectCode, publicationId, path) || undefined} target="_blank" rel="noopener noreferrer">{asset?.name || path}<span>{asset?.isImage ? '查看图片 ↗' : '下载附件 ↗'}</span></a>)}</section>}
            <section className="publication-related"><h2>相关资料</h2>{related.map(item => <button type="button" key={item.key} onClick={() => openRelated(item)}><span><strong>{item.title}</strong><small>{item.kind === 'knowledge' ? '项目知识 · 理解当前职责与协作关系' : '同项目文章 · 延伸阅读'}</small></span><span>→</span></button>)}<Link to={href(`/knowledge/project/${encodeURIComponent(projectCode)}`)}>阅读 {article.projectName} 的项目知识 →</Link></section>
            <footer className="publication-list-foot"><span>正文由所属项目统一维护</span><Button type="text" icon={<ReloadOutlined />} loading={loading} onClick={reload}>刷新正文</Button></footer>
          </article>
        </div>
        {writing && <ArticleWritingDrawer projects={[{ code: projectCode, name: article.projectName }]} article={article} revision={data.revision} initialMethod={writingMethod} onClose={() => setWriting(false)} />}
        {deleting && <ArticleDeleteModal article={article} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); if (embedded) previews?.remove('article', `${projectCode}:${publicationId}`); else { tabs.close(`publication:${projectCode}:${publicationId}`); navigate(href('/articles') + listSearch); } }} />}
        <Drawer open={records} width={460} title="发布记录" onClose={() => setRecords(false)}><div className="publication-context"><strong>{article.title}</strong><span>当前稿件：{publicationStatus[article.status] || article.status}</span></div><p className="publication-hint">这里记录各平台的发布情况。修改稿件后，平台内容不会自动同步。</p>{article.targets.length ? article.targets.map((target, index) => <section className="publication-record-card" key={`${target.platform}:${index}`}><div><strong>{publicationPlatform[target.platform] || target.platform}</strong><Tag className={`publication-state ${target.status}`}>{publicationStatus[target.status] || target.status}</Tag></div>{target.url && <a href={target.url} target="_blank" rel="noopener noreferrer">查看已发布原文 ↗</a>}</section>) : <Empty description="暂无发布记录" />}<Button onClick={() => { setRecords(false); setWritingMethod('改写平台版'); setWriting(true); }}>准备平台改写请求</Button></Drawer>
      </>}
    </div>
  </WorkspaceStage>;
}
