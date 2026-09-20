import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Dropdown, Empty, Input, Select, Space, Table, Tabs, Tag, Tooltip, message } from 'antd';
import { EditOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { useResourcePreview } from '../../../app/resource-preview';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { workspaceHref } from '../../../lib/labels';
import { projectApi } from '../../project/api/project-api';
import { useWorkbenchPreferences } from '../../workbench/hooks/useWorkbenchPreferences';
import { publicationApi, publicationsChanged, type ArticleProject, type Publication, type PublicationList } from '../api/publication-api';
import { ArticleCreateModal } from '../components/ArticleCreateModal';
import { useArticleEditor } from '../components/ArticleEditorProvider';
import { ArticleDeleteModal } from '../components/ArticleDeleteModal';
import { ArticleWritingDrawer } from '../components/ArticleWritingDrawer';
import { articlePath, articleResourceKey, displayArticleDate, downloadMarkdown, publicationStatus, selectPublications } from '../publication-model';
import '../publication.css';

export function ArticlesPage() {
  const { workspaceId, workspace, setBreadcrumbParts } = useAppShell();
  const previews = useResourcePreview();
  const tabs = useWorkspacePageTabs(workspaceId), preferences = useWorkbenchPreferences(workspaceId);
  const location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = { query: params.get('q') || '', project: params.get('project') || '', status: params.get('status') || '', sort: params.get('sort') || 'updated', saved: params.get('scope') === 'saved' };
  const [data, setData] = useState<PublicationList | null>(null), [projects, setProjects] = useState<ArticleProject[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [projectError, setProjectError] = useState(''), [readAt, setReadAt] = useState('');
  const openEditor = useArticleEditor();
  const editArticle = (article: Publication) => openEditor({ projectCode: article.projectCode, publicationId: article.id });
  const [refresh, setRefresh] = useState(0), [creating, setCreating] = useState(false), [writing, setWriting] = useState(false), [deleting, setDeleting] = useState<Publication | null>(null), [saving, setSaving] = useState('');
  const [messages, holder] = message.useMessage();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const returnState = { articleListSearch: location.search };
  const openArticle = (article: Publication, view?: 'source') => {
    const path = href(articlePath(article)) + (view ? '?view=source' : '');
    if (!previews?.open(location.pathname, path)) navigate(path, { state: { ...returnState, articleView: view } });
  };
  const change = (name: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(name, value); else next.delete(name); setParams(next, { replace: true }); };
  useEffect(() => {
    tabs.register({ key: 'dir:articles', kind: 'dir', title: '文章', path: href('/articles') });
    setBreadcrumbParts([workspace?.name || '工作空间', '文章']);
  }, [workspaceId, workspace?.name]);
  // Search changes are local; returning from a reader refreshes via the shared mutation event or refresh control.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    publicationApi.list(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setData(result); setReadAt(new Date().toLocaleTimeString('zh-CN'));
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '文章读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    projectApi.listProjects({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) {
        setProjects((result.projects || []).filter(project => project.source.root !== 'attached' && !project.source.path.startsWith('/')).map(project => ({ code: project.code, name: project.name })));
        setProjectError('');
      }
    }).catch(err => { if (!controller.signal.aborted) setProjectError(err instanceof Error ? err.message : '项目目录暂时不可用'); });
    return () => controller.abort();
  }, [workspaceId, refresh]);
  useEffect(() => {
    const changed = () => setRefresh(value => value + 1);
    window.addEventListener(publicationsChanged, changed);
    return () => window.removeEventListener(publicationsChanged, changed);
  }, []);
  const publications = data?.publications || [];
  const isSaved = (key: string) => preferences.has('saved-resource', key);
  const visible = selectPublications(publications, filters, isSaved);
  const knownProjects = [...new Map([...projects, ...publications.map(article => ({ code: article.projectCode, name: article.projectName }))].map(project => [project.code, project])).values()];
  const toggleSaved = async (article: Publication) => {
    const key = articleResourceKey(article); setSaving(key);
    try { if (isSaved(key)) await preferences.remove('saved-resource', key); else await preferences.set('saved-resource', key, { label: article.title, href: href(articlePath(article)) }); }
    catch (err) { messages.error(err instanceof Error ? err.message : '收藏未保存'); }
    finally { setSaving(''); }
  };
  const exportArticle = async (article: Publication) => {
    try { const detail = await publicationApi.detail(article.id, undefined, article.projectCode); downloadMarkdown(detail.source || detail.content, article.sourcePath); }
    catch (err) { messages.error(err instanceof Error ? err.message : '导出失败'); }
  };
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}><div className="publication-page publication-directory">
    {holder}
    <header className="publication-page-head"><div><p className="eyebrow">工作空间</p><h1>文章</h1><p className="page-copy">从一篇草稿开始，把想法写清楚，让成果被看见。</p></div><Space wrap><Button onClick={() => setWriting(true)} disabled={!projects.length}>交给智能体（Agent）写作</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} disabled={!projects.length}>新建文章</Button></Space></header>
    <Tabs activeKey={filters.saved ? 'saved' : 'all'} onChange={key => change('scope', key === 'saved' ? key : '')} items={[{ key: 'all', label: `全部文章 ${publications.length}` }, { key: 'saved', label: `我的收藏 ${publications.filter(article => isSaved(articleResourceKey(article))).length}` }]} />
    <div className="publication-filterbar"><Input id="articles-search" prefix={<SearchOutlined />} allowClear placeholder="搜索文章标题或摘要" aria-label="搜索文章标题或摘要" value={filters.query} onChange={event => change('q', event.target.value)} /><Select aria-label="筛选项目" value={filters.project} options={[{ value: '', label: '全部项目' }, ...knownProjects.map(project => ({ value: project.code, label: project.name }))]} onChange={value => change('project', value)} /><Select aria-label="筛选稿件状态" value={filters.status} options={[{ value: '', label: '全部状态' }, ...Object.entries(publicationStatus).map(([value, label]) => ({ value, label }))]} onChange={value => change('status', value)} /><Select aria-label="排序方式" value={filters.sort} options={[{ value: 'updated', label: '最近更新' }, { value: 'title', label: '按标题排序' }]} onChange={value => change('sort', value)} /><span id="publications-state" className="publication-list-count">{visible.length} 篇文章</span><Tooltip title="刷新文章"><Button type="text" aria-label="刷新文章" icon={<ReloadOutlined />} loading={loading} onClick={() => setRefresh(value => value + 1)} /></Tooltip></div>
    {error && <Alert type="error" showIcon message={data ? '文章暂时无法更新，仍显示上次读取的内容。' : '文章读取失败'} description={error} action={<Button size="small" onClick={() => setRefresh(value => value + 1)}>重试</Button>} />}
    {projectError && <Alert type="warning" message="暂时无法读取可写项目，新建与写作入口稍后重试。" description={projectError} />}
    {Boolean(data?.diagnostics?.length) && <Alert type="warning" message="部分项目的文章暂时不可用" description={data?.diagnostics?.map(item => `${item.projectCode || '项目'}：${item.message}`).join('；')} />}
    <div id="publications-list" className="publication-table"><Table<Publication> loading={loading && !data} dataSource={visible} rowKey={articleResourceKey} pagination={false} size="middle" scroll={{ x: 700 }} onRow={article => ({ onClick: event => { if (!(event.target as HTMLElement).closest('button,a')) openArticle(article); } })} locale={{ emptyText: <div id="publications-empty"><Empty description={publications.length ? '没有找到匹配的文章' : '暂无文章'} />{publications.length ? <Button onClick={() => setParams({}, { replace: true })}>清除筛选</Button> : <Button type="primary" disabled={!projects.length} onClick={() => setCreating(true)}>新建文章</Button>}</div> }} columns={[
      { title: '文章 / 摘要', key: 'article', render: (_, article) => <div className="publication-title-cell"><Link to={href(articlePath(article))} state={returnState}>{article.title}</Link><p>{article.summary || '暂无摘要'}</p></div> },
      { title: '所属项目', width: 150, key: 'project', render: (_, article) => <Link className="publication-project-label" to={href(`/projects/${encodeURIComponent(article.projectCode)}`)}>{article.projectName}</Link> },
      { title: '稿件状态', width: 95, key: 'status', render: (_, article) => <Tag className={`publication-state ${article.status}`}>{publicationStatus[article.status] || article.status}</Tag> },
      { title: '最近更新', width: 120, key: 'updated', render: (_, article) => <span className="publication-muted">{displayArticleDate(article.updatedAt || article.publishedAt)}</span> },
      { title: '操作', width: 94, align: 'right', key: 'actions', render: (_, article) => <Space size={0}><Button type="text" icon={isSaved(articleResourceKey(article)) ? <StarFilled /> : <StarOutlined />} loading={saving === articleResourceKey(article)} disabled={preferences.loading} aria-label={`${isSaved(articleResourceKey(article)) ? '取消收藏' : '收藏'}：${article.title}`} onClick={() => void toggleSaved(article)} /><Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: '编辑文章', icon: <EditOutlined /> }, { key: 'source', label: '查看原文' }, { key: 'copy', label: '复制链接' }, { key: 'export', label: '导出 Markdown' }, { type: 'divider' }, { key: 'delete', label: '删除文章', danger: true }], onClick: ({ key }) => {
        if (key === 'edit') editArticle(article);
        if (key === 'source') openArticle(article, 'source');
        if (key === 'delete') setDeleting(article);
        if (key === 'export') void exportArticle(article);
        if (key === 'copy') void navigator.clipboard.writeText(new URL(href(articlePath(article)), window.location.origin).href).then(() => messages.success('文章链接已复制')).catch(() => messages.error('自动复制失败'));
      } }}><Button type="text" icon={<MoreOutlined />} aria-label={`更多操作：${article.title}`} /></Dropdown></Space> },
    ]} /></div>
    <footer className="publication-list-foot"><span>文章归属项目，工作空间统一汇总。</span><span>{readAt ? `读取于 ${readAt}` : '正在读取'}</span></footer>
    {creating && <ArticleCreateModal projects={projects} defaultProject={filters.project} onClose={() => setCreating(false)} onCreated={detail => { setCreating(false); editArticle(detail.publication); }} />}
    {writing && <ArticleWritingDrawer projects={projects} defaultProject={filters.project} onClose={() => setWriting(false)} />}
    {deleting && <ArticleDeleteModal article={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setRefresh(value => value + 1); messages.success('文章已删除，资源文件已保留'); }} />}
  </div></WorkspaceStage>;
}
