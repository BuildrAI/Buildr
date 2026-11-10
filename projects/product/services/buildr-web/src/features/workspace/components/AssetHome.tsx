import { AssetDocumentList } from './AssetDocumentList';
import { AssetHomeView } from './AssetHomeView';
import { ResourceActions } from '../../workbench/components/ResourceActions';
import { useRepositoryLocalConfig } from './useRepositoryLocalConfig';
import { AssetDeleteDialog } from './AssetDeleteDialog';
import { RepositoryStatus } from './RepositoryStatus';
import { InsideResourcePreview, ProjectPreviewContext, useResourcePreview } from '../../../app/resource-preview';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Space } from 'antd';
import { BranchesOutlined, FileTextOutlined, RightOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs, WorkspaceViewActiveContext, WorkspaceViewTransientContext } from '../../../app/pageTabs';
import { useWorkspacePaneHost } from '../../../app/WorkspacePaneHost';
import { WorkspaceStage, type WorkspaceObjectContentState } from '../../../components/WorkspaceStage';
import { DrawerShell } from '../../../components/DrawerShell';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { workspaceHref } from '../../../lib/labels';
import { CopyButton } from '../../../components/CopyButton';
import { assetCatalogApi, repositoryBranch } from '../api/asset-catalog-api';
import { useAssetCatalog } from './useAssetCatalog';
import { CatalogMigration } from './CatalogMigration';
import { AssetEditDrawer } from './AssetEditDrawer';
import { KnowledgeBrowser } from '../../knowledge/components/KnowledgeBrowser';
import { useKnowledgeReading } from '../../knowledge/useKnowledgeReading';
import { ServiceRuntimeSection } from '../../service-runtime/components/ServiceRuntimeSection';
import '../../service-runtime/service-runtime.css';
import './asset-home.css';

export function AssetHome({ kind, previewId, knowledge, initialEditing, initialView }: { kind: 'service' | 'repository'; previewId?: string; knowledge?: { artifactId?: string; objectId?: string }; initialEditing?: boolean; initialView?: 'detail' | 'runtime' }) {
  const projectContext = useContext(ProjectPreviewContext);
  const embedded = useContext(InsideResourcePreview);
  const previews = useResourcePreview(), location = useLocation();
  const paneHost = useWorkspacePaneHost(), inheritedTransient = useContext(WorkspaceViewTransientContext);
  const lastKnowledge = useRef(knowledge);
  if (knowledge) lastKnowledge.current = knowledge;
  const params = useParams();
  const assetId = previewId ?? params.assetId ?? '';
  const { workspaceId } = useAppShell();
  const catalog = useAssetCatalog(), tabs = useWorkspacePageTabs(workspaceId);
  const requestedView = initialView ?? (new URLSearchParams(location.search).get('view') === 'runtime' ? 'runtime' : 'detail');
  const [view, setView] = useState<'detail' | 'runtime'>(requestedView);
  useEffect(() => { setView(requestedView); }, [assetId, requestedView]);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false), [prepareOpen, setPrepareOpen] = useState(false);
  useEffect(() => { if (initialEditing) setEditing(true); }, [initialEditing]);
  const [prompt, setPrompt] = useState(''), [promptError, setPromptError] = useState('');
  const [documents, setDocuments] = useState<string[]>([]), [activeDocument, setActiveDocument] = useState<string | null>(null);
  const data = catalog.data;
  const service = data?.services.find(s => s.id === assetId || s.code === assetId);
  const [knowledgeRefresh, setKnowledgeRefresh] = useState(0);
  const knowledgeRead = useKnowledgeReading({ kind: 'service', id: service?.id || assetId }, undefined, undefined, knowledgeRefresh, kind === 'service' && Boolean(service));
  const knowledgeCount = knowledgeRead.data?.index?.artifacts.length || 0;
  const knowledgeDiagnostic = knowledgeRead.error || knowledgeRead.data?.diagnostics.join('；') || '';
  const repository = data?.repositories.find(r => r.id === (kind === 'service' ? service?.repositoryId : assetId) || kind === 'repository' && r.code === assetId);
  const localConfig = useRepositoryLocalConfig(kind === 'repository' ? repository?.id : undefined, data?.revision || '');
  const actualRemote = localConfig.data?.remotes.find(remote => remote.name === localConfig.data?.selectedRemote);
  const item = kind === 'service' ? service : repository;
  const label = kind === 'service' ? '服务' : '代码库', area = kind === 'service' ? 'services' : 'repositories';
  const href = (route: string) => workspaceHref(workspaceId, route);
  const loadDocument = useCallback(async (file: string) => { const result = await assetCatalogApi.serviceDocument(assetId, file); return { path: result.path || file, exists: Boolean(result.exists), content: result.content ?? null }; }, [assetId]);
  useEffect(() => { if (item) tabs.register({ key: `${kind}:${item.id}`, kind: 'svc', title: item.name, path: workspaceHref(workspaceId, `/${area}/${item.id}`) }); }, [item?.id, item?.name, workspaceId]);
  const openDocument = (file: string) => { setDocuments(current => current.includes(file) ? current : [...current, file]); setActiveDocument(file); paneHost?.revealContent(location.pathname, embedded ? undefined : file); };
  const closeDocument = (file: string) => {
    setDocuments(current => { const next = current.filter(value => value !== file); setActiveDocument(active => active === file ? next.at(-1) || null : active); return next; });
  };
  const prepare = async () => {
    if (!repository) return;
    setPrepareOpen(true); setPromptError(''); setPrompt('');
    try { setPrompt((await assetCatalogApi.preparePrompt(repository.id)).prompt); } catch (error) { setPromptError((error as Error).message); }
  };
  if (catalog.error) return <Alert type="error" message={catalog.error} />;
  if (!data) return <Card loading />;
  if (!item) return <Alert type="error" message={`${label}不存在`} />;
  const related = kind === 'service' ? data.projects.filter(p => p.serviceIds?.includes(item.id)) : data.services.filter(s => s.repositoryId === item.id);
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}
    objectTabs={documents.map(file => ({ key: file, kind: 'doc', title: file, identity: `${kind}:${assetId}:${file}`, contentLayout: 'reading', contentLabel: file }))} activeObject={knowledge ? null : activeDocument} onActivateObject={setActiveDocument} onCloseObject={closeDocument}
    objectContent={({ displayedKey, visible, transient }: WorkspaceObjectContentState) => <WorkspaceViewTransientContext.Provider value={inheritedTransient || transient}>{documents.map(file => <WorkspaceViewActiveContext.Provider key={file} value={visible && displayedKey === file}><div hidden={file !== displayedKey}><ResourceDocumentPane file={file} load={loadDocument} onOpen={openDocument} /></div></WorkspaceViewActiveContext.Provider>)}</WorkspaceViewTransientContext.Provider>}>
    {lastKnowledge.current && <div hidden={!knowledge}><KnowledgeBrowser workspaceId={workspaceId || ''} scope={{ kind: 'service', id: assetId }} initialArtifactId={lastKnowledge.current.artifactId} initialObjectId={lastKnowledge.current.objectId} onBack={() => previews?.open(location.pathname, href(`/services/${encodeURIComponent(assetId)}`))} backLabel="返回服务" /></div>}
    <AssetHomeView view={view} onViewChange={next => { setView(next); if (kind === 'service' && embedded) previews?.open(location.pathname, href(`/services/${encodeURIComponent(assetId)}?view=${next}`)); }} kind={kind} item={item} hidden={Boolean(knowledge)} hideRelated={Boolean(kind === 'service' && projectContext)} related={related} relationHref={object => href(kind === 'service' ? `/projects/${object.code}` : `/services/${object.id}`)} actions={<Space wrap className="resource-home-actions"><ResourceActions size="middle" resource={{ kind: kind === "service" ? "service" : "repository", key: kind + ":" + item.id, label: item.name, href: workspaceHref(workspaceId, "/" + (kind === "service" ? "services" : "repositories") + "/" + encodeURIComponent(item.id)) }} /><Button disabled={data.migrationRequired} onClick={() => setDeleting(true)}>移除</Button><Button disabled={data.migrationRequired} onClick={() => setEditing(true)}>编辑{label}</Button></Space>} runtimeContent={kind === 'service' && service ? <ServiceRuntimeSection serviceCode={service.code} serviceName={service.name} /> : null} notices={<>      <CatalogMigration catalog={data} onSaved={catalog.setData} />
      {data.diagnostics.filter(d => d.objectId === item.id || d.objectId === repository?.id).map(d => <Alert key={d.code + d.objectId} type="warning" showIcon message={d.message} />)}
</>} documents={<>      {service && <section className="resource-section" data-service-knowledge-state={knowledgeRead.loading ? 'loading' : knowledgeDiagnostic ? 'unavailable' : knowledgeCount ? 'available' : 'empty'}><div className="resource-section-head"><h2>文档</h2></div>
        <AssetDocumentList active={activeDocument} onOpen={openDocument} />
        {knowledgeCount > 0 && <Link id="service-knowledge-entry" aria-label="服务知识" className="resource-document-row" to={href(`/knowledge/service/${encodeURIComponent(assetId)}${projectContext ? `?fromProject=${encodeURIComponent(projectContext)}` : ''}`)}><span className="resource-row-icon"><FileTextOutlined /></span><span className="resource-row-text"><strong>服务知识</strong><small>{knowledgeCount} 项已有资料</small></span><RightOutlined /></Link>}
        {knowledgeDiagnostic && <div className="asset-knowledge-notice" role="status"><span title={knowledgeDiagnostic}>服务知识暂时无法读取</span><Button type="link" size="small" onClick={() => setKnowledgeRefresh(value => value + 1)}>重试</Button></div>}
      </section>}
</>} repositoryContent={<>      <section className="resource-section"><div className="resource-section-head"><h2>{kind === 'service' ? '代码库' : '代码来源'}</h2>{kind === 'repository' && <Button size="small" onClick={() => void prepare()}>准备代码</Button>}</div>
        {!repository ? <Alert type="warning" message="代码库引用缺失，请核对清单。" /> : kind === 'service' ? <div className="resource-repository-summary asset-repository-summary">
          <Link to={href(`/repositories/${repository.id}`)}><span className="resource-row-icon"><BranchesOutlined /></span><strong>{repository.name}</strong><RightOutlined /></Link>
          <dl className="asset-facts"><div><dt>目录</dt><dd><code title={repository.location}>{repository.source.path}</code></dd></div>{service?.modulePath && <div><dt>服务模块</dt><dd><code>{service.modulePath}</code></dd></div>}<div><dt>集成分支</dt><dd><code>{repositoryBranch(repository)}</code></dd></div></dl>
          <RepositoryStatus key={repository.id} id={repository.id} revision={data.revision} onAlign={() => void prepare()} />
          {!repository.present && <Button type="text" onClick={() => void prepare()}>准备代码</Button>}
        </div> : <div className="resource-facts asset-repository-facts">
          <dl className="asset-facts">
            <div><dt>目录</dt><dd><code title={repository.location}>{repository.source.path}</code></dd></div>
            <div><dt>集成分支</dt><dd><code>{repositoryBranch(repository)}</code></dd></div>
            <div><dt>远端（Remote）</dt><dd>{actualRemote?.name || localConfig.data?.remotes.map(remote => remote.name).join('、') || '未读取或未配置'}</dd></div>
            <div><dt>Git 地址</dt><dd>{localConfig.loading ? '读取本地配置…' : actualRemote?.url ? <code>{actualRemote.url}</code> : localConfig.data?.available ? localConfig.data.remotes.length ? localConfig.data.remotes.map(remote => <code key={remote.name} className="asset-remote-url">{remote.url}</code>) : '本地未配置远端' : localConfig.error || localConfig.data?.diagnostic || '尚未读取'}</dd></div>
            {(repository.source.git as { url?: string } | undefined)?.url && (repository.source.git as { url?: string }).url !== actualRemote?.url && <div><dt>声明地址</dt><dd><code>{String((repository.source.git as { url?: string }).url)}</code></dd></div>}
          </dl>
          <RepositoryStatus key={repository.id} id={repository.id} revision={data.revision} showRemote={false} onAlign={() => void prepare()} onRefresh={localConfig.reload} />
        </div>}
      </section>
</>} />
    {deleting && <AssetDeleteDialog kind={kind} id={item.id} onClose={() => setDeleting(false)} />}
    {editing && <AssetEditDrawer catalog={data} kind={kind} id={item.id} onClose={() => { setEditing(false); if (initialEditing) previews?.open(location.pathname, href(`/${area}/${encodeURIComponent(assetId)}`)); }} />}
    {prepareOpen && <DrawerShell open title="代码对齐指引" sub={repository?.name} onClose={() => setPrepareOpen(false)} footer={<Space style={{ display: 'flex', justifyContent: 'space-between' }}><span className="page-copy" role="status">尚未执行</span><CopyButton type="primary" size="middle" text={prompt} disabled={!prompt} failureMessage="无法自动复制，请在上方选择文本复制。">复制指令</CopyButton></Space>}>
      <p className="page-copy">这里提供后续处理指引，尚未执行对齐。智能体（Agent）可核对声明与实际差异，在授权内处理并保留已有改动。</p>
      {promptError ? <Alert type="error" message={promptError} /> : <Input.TextArea aria-label="代码准备指令" readOnly value={prompt} placeholder="正在准备指令…" autoSize={{ minRows: 12, maxRows: 24 }} />}
    </DrawerShell>}
  </WorkspaceStage>;
}
