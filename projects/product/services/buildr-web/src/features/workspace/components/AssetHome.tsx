import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Descriptions, Input, Space, Tag } from 'antd';
import { AppstoreOutlined, BranchesOutlined, FileTextOutlined, FolderOutlined, RightOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { DrawerShell } from '../../../components/DrawerShell';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, repositoryBranch } from '../api/asset-catalog-api';
import { useAssetCatalog } from './useAssetCatalog';
import { CatalogMigration } from './CatalogMigration';
import { AssetEditDrawer } from './AssetEditDrawer';

export function AssetHome({ kind, previewId }: { kind: 'service' | 'repository'; previewId?: string }) {
  const params = useParams();
  const assetId = previewId ?? params.assetId ?? '';
  const { workspaceId } = useAppShell();
  const catalog = useAssetCatalog(), tabs = useWorkspacePageTabs(workspaceId);
  const [editing, setEditing] = useState(false), [prepareOpen, setPrepareOpen] = useState(false);
  const [prompt, setPrompt] = useState(''), [promptError, setPromptError] = useState(''), [copyState, setCopyState] = useState('');
  const [documents, setDocuments] = useState<string[]>([]), [activeDocument, setActiveDocument] = useState<string | null>(null);
  const data = catalog.data;
  const service = data?.services.find(s => s.id === assetId || s.code === assetId);
  const repository = data?.repositories.find(r => r.id === (kind === 'service' ? service?.repositoryId : assetId) || kind === 'repository' && r.code === assetId);
  const item = kind === 'service' ? service : repository;
  const label = kind === 'service' ? '服务' : '代码库', area = kind === 'service' ? 'services' : 'repositories';
  const href = (route: string) => workspaceHref(workspaceId, route);
  const loadDocument = useCallback(async (file: string) => { const result = await assetCatalogApi.serviceDocument(assetId, file); return { path: result.path || file, exists: Boolean(result.exists), content: result.content ?? null }; }, [assetId]);
  useEffect(() => { if (item) tabs.register({ key: `${kind}:${item.id}`, kind: 'svc', title: item.name, path: workspaceHref(workspaceId, `/${area}/${item.id}`) }); }, [item?.id, item?.name, workspaceId]);
  const openDocument = (file: string) => { setDocuments(current => current.includes(file) ? current : [...current, file]); setActiveDocument(file); };
  const closeDocument = (file: string) => {
    setDocuments(current => { const next = current.filter(value => value !== file); setActiveDocument(active => active === file ? next.at(-1) || null : active); return next; });
  };
  const prepare = async () => {
    if (!repository) return;
    setPrepareOpen(true); setPromptError(''); setCopyState(''); setPrompt('');
    try { setPrompt((await assetCatalogApi.preparePrompt(repository.id)).prompt); } catch (error) { setPromptError((error as Error).message); }
  };
  if (catalog.error) return <Alert type="error" message={catalog.error} />;
  if (!data) return <Card loading />;
  if (!item) return <Alert type="error" message={`${label}不存在`} />;
  const related = kind === 'service' ? data.projects.filter(p => p.serviceIds?.includes(item.id)) : data.services.filter(s => s.repositoryId === item.id);
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}
    objectTabs={documents.map(file => ({ key: file, kind: 'doc', title: file }))} activeObject={activeDocument} onActivateObject={setActiveDocument} onCloseObject={closeDocument}
    objectContent={documents.map(file => <div key={file} hidden={file !== activeDocument}><ResourceDocumentPane file={file} load={loadDocument} onOpen={openDocument} /></div>)}>
    <div className="resource-home">
      <header className="resource-home-head"><div><p className="resource-eyebrow">{label} <span> / {item.code}</span></p><h1 id={kind === 'service' ? 'service-detail-name' : 'repository-detail-name'}>{item.name}</h1><p id={kind === 'service' ? 'service-detail-description' : 'repository-detail-description'}>{item.description || '尚未填写说明。'}</p></div><Button disabled={data.migrationRequired} onClick={() => setEditing(true)}>编辑{label}</Button></header>
      <CatalogMigration catalog={data} onSaved={catalog.setData} />
      {data.diagnostics.filter(d => d.objectId === item.id || d.objectId === repository?.id).map(d => <Alert key={d.code + d.objectId} type="warning" showIcon message={d.message} />)}
      <section className="resource-section"><div className="resource-section-head"><h2>{kind === 'service' ? '关联项目' : '引用服务'} <span>{related.length}</span></h2></div>
        {related.length ? related.map(object => <Link key={object.id} className="resource-relation-row" to={href(kind === 'service' ? `/projects/${object.code}` : `/services/${object.id}`)}><span className="resource-row-icon">{kind === 'service' ? <FolderOutlined /> : <AppstoreOutlined />}</span><span className="resource-row-text"><strong>{object.name}</strong><small>{object.description || object.code}</small></span><RightOutlined /></Link>) : <p className="resource-empty-copy">{kind === 'service' ? '还没有项目引用此服务。可在项目主页建立关联。' : '还没有服务引用此代码库。'}</p>}
      </section>
      {service && <section className="resource-section"><div className="resource-section-head"><h2>文档 <span>2</span></h2></div>
        {['README.md', 'AGENTS.md'].map(file => <button type="button" key={file} className={`resource-document-row${file === activeDocument ? ' reading' : ''}`} data-doc-row={file === 'README.md' ? 'readme' : 'agents'} onClick={() => openDocument(file)}><span className="resource-row-icon"><FileTextOutlined /></span><span className="resource-row-text"><strong>{file}</strong><small>{file === 'README.md' ? '服务说明与使用入口' : '实现规则与协作边界'}</small></span><RightOutlined /></button>)}
      </section>}
      <section className="resource-section"><div className="resource-section-head"><h2>{kind === 'service' ? '代码库' : '代码来源'}</h2>{kind === 'repository' && <Button size="small" onClick={() => void prepare()}>准备代码</Button>}</div>
        {!repository ? <Alert type="warning" message="代码库引用缺失，请核对清单。" /> : kind === 'service' ? <div className="resource-repository-summary"><Link to={href(`/repositories/${repository.id}`)}><span className="resource-row-icon"><BranchesOutlined /></span><span><strong>{repository.name}</strong><small>{repositoryBranch(repository)}{service?.modulePath ? ` · ${service.modulePath}` : ''}</small></span><RightOutlined /></Link><Tag color={repository.available ? 'success' : 'warning'}>{repository.available ? '本地可用' : '待准备代码'}</Tag>{!repository.available && <Button type="text" onClick={() => void prepare()}>准备代码</Button>}</div> : <Descriptions className="resource-facts" column={1} colon={false} size="small" items={[{ key: 'url', label: 'Git 地址', children: String((repository.source.git as { url?: string } | undefined)?.url || '工作空间源码') }, { key: 'branch', label: '集成分支', children: <code>{repositoryBranch(repository)}</code> }, { key: 'path', label: '目录', children: <span title={repository.location}>{repository.source.path}</span> }, { key: 'state', label: '状态', children: <Tag color={repository.available ? 'success' : 'warning'}>{repository.available ? '本地可用' : '待准备代码'}</Tag> }]} />}
      </section>
    </div>
    {editing && <AssetEditDrawer catalog={data} kind={kind} id={item.id} onClose={() => setEditing(false)} />}
    {prepareOpen && <DrawerShell open title="准备代码" sub={repository?.name} onClose={() => setPrepareOpen(false)} footer={<Space style={{ display: 'flex', justifyContent: 'space-between' }}><span className="page-copy" role="status">{copyState || '尚未执行'}</span><Button type="primary" disabled={!prompt} onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopyState('已复制，交给智能体执行'); } catch { setCopyState('无法自动复制，请在上方选择文本复制'); } }}>复制指令</Button></Space>}>
      <p className="page-copy">智能体（Agent）将核对代码来源与目标目录，准备缺失代码并保留已有改动。</p>
      {promptError ? <Alert type="error" message={promptError} /> : <Input.TextArea aria-label="代码准备指令" readOnly value={prompt} placeholder="正在准备指令…" autoSize={{ minRows: 12, maxRows: 24 }} />}
    </DrawerShell>}
  </WorkspaceStage>;
}
