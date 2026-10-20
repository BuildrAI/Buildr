import { ProjectHomeEntries, type ProjectHomeEntryRef } from '../components/ProjectHomeEntries';
import { ProjectHomeHeader } from '../components/ProjectHomeHeader';
import { ResourceActions } from '../../workbench/components/ResourceActions';
import { AssetDeleteDialog } from '../../workspace/components/AssetDeleteDialog';
import { useLocation } from 'react-router-dom';
import { ProjectServicesPanel } from '../components/ProjectServicesPanel';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { projectApi, projectDocumentImage, type ProjectDocument } from '../api/project-api';
import { useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Dropdown, Tabs } from 'antd';
import { WorkspaceComposition } from '../../workspace/components/WorkspaceComposition';
import { useWorkspaceComposition } from '../../workspace/components/useWorkspaceComposition';
import { useResourcePreview } from '../../../app/resource-preview';
import { FileTextOutlined, RightOutlined, MoreOutlined } from '@ant-design/icons';

import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { FileEditingPane } from '../../../components/file-editing/FileEditingPane';
import type { FileEditingDocument } from '../../../components/file-editing/file-editing-types';
import { useFileEditingContext } from '../../../app/FileEditingContext';
import { codeApi } from '../../code/api/code-api';
import { editableDocument, fileSnapshot } from '../../code/hooks/useEditableFile';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { updateMarkdownImageFailures, type MarkdownImageFailures, type MarkdownImageContext } from '../../../lib/markdownImages';
import { workspaceHref } from '../../../lib/labels';
import { KnowledgeBrowser } from '../../knowledge/components/KnowledgeBrowser';
import { useMarkdownDocumentViewer } from '../../../lib/useMarkdownDocumentViewer';
import { ProjectEditDrawer } from '../components/ProjectEditDrawer';
import { useWorkspacePageTabs, WorkspaceViewActiveContext, WorkspaceViewTransientContext } from '../../../app/pageTabs';
import { useWorkspacePaneHost } from '../../../app/WorkspacePaneHost';
import { useKnowledgeNavigation } from '../../knowledge/useKnowledgeNavigation';
import { canInitializeKnowledge, knowledgeInitializationContext } from '../../knowledge/knowledge-initialize';
import { WorkspaceStage, type WorkspaceObjectContentState, type WorkspaceObjectTab } from '../../../components/WorkspaceStage';
import { consumeProjectDocumentReturn, isProjectDocumentRef, projectDocumentRoot, readProjectDocumentReturn, withProjectDocumentReturn, type ProjectDocumentPosition, type ProjectDocumentPositions, type ProjectDocumentRef } from '../project-document-navigation';
import '../project-home.css';

type ObjTab = { key: string; kind: 'doc'; ref: string };
type ProjectDocumentPaneState = { dirty: boolean; contentLayout: 'reading' | 'fill'; identity: string };

const projectDocumentMissingMessage = (path: string) => `项目内未找到 ${path}`;
type EditableProjectDocument = ProjectDocument & { editingFile?: FileEditingDocument; readOnlyReason?: string };

const DOC_ROWS: { ref: string; name: string; hint: string }[] = [
  { ref: 'readme', name: '项目文档', hint: '使用、开发与参考 · README.md' },
  { ref: 'agents', name: 'AGENTS.md', hint: '规则与授权边界' },
];

const ENTRY_TITLES: Record<ProjectHomeEntryRef, string> = { knowledge: '项目知识', articles: '项目文章' };

/** 右组项目文档对象。 */
function ProjectDocObjectView({ workspaceId, projectCode, objectKey, documentRef, position, positions, navigationRequest, onPosition, onPaneState }: { workspaceId: string | null; projectCode: string; objectKey: string; documentRef: ProjectDocumentRef; position?: ProjectDocumentPosition; positions: ProjectDocumentPositions; navigationRequest: number; onPosition(ref: ProjectDocumentRef, position: ProjectDocumentPosition): void; onPaneState(key: string, state: ProjectDocumentPaneState): void }) {
  const editing = useFileEditingContext();
  const navigate = useNavigate(), location = useLocation(), { message } = App.useApp();
  const active = useContext(WorkspaceViewActiveContext);
  const fetchDocument = useCallback(async (path: string, signal?: AbortSignal): Promise<EditableProjectDocument> => {
    if (!workspaceId) throw new Error('当前工作空间身份不可确认，请重新打开项目。');
    const snapshot = await codeApi.editorFile(workspaceId, { kind: 'project', projectCode, path }, signal);
    if (snapshot.kind === 'unsupported') {
      // Preserve the existing read-only presentation without making its decoded text a save baseline.
      const document = await projectApi.projectDocument(projectCode, encodeProjectDocumentPath(path), { signal }, workspaceId);
      return { ...document, readOnlyReason: snapshot.readonlyReason || '当前文件只支持阅读。' };
    }
    return { path: snapshot.path, name: snapshot.path, exists: true, content: snapshot.content, editingFile: editableDocument(workspaceId, snapshot), imageContext: snapshot.imageContext };
  }, [workspaceId, projectCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, projectDocumentMissingMessage);
  const rememberPosition = useRef(onPosition); rememberPosition.current = onPosition;
  const [failedImages, setFailedImages] = useState<MarkdownImageFailures>({ version: '', urls: [] });
  const currentDocument = documents.document as EditableProjectDocument | null;
  const editorFile = currentDocument?.editingFile;
  const session = editorFile ? editing.sessions[editorFile.id] : undefined;
  const dirty = Boolean(session && session.content !== session.diskContent);
  const contentLayout = editorFile ? 'fill' : 'reading';
  const documentIdentity = editorFile?.id || `${workspaceId}:project:${projectCode}:${documents.path}`;
  useEffect(() => { onPaneState(objectKey, { dirty, contentLayout, identity: documentIdentity }); }, [objectKey, dirty, contentLayout, documentIdentity, onPaneState]);
  const [imageObservation, setImageObservation] = useState<{ revision: string; context?: MarkdownImageContext }>();
  const imageContext = session?.file.imageContext
    || (imageObservation?.revision === session?.revision ? imageObservation?.context : undefined)
    || (!session || editorFile?.revision === session.revision ? currentDocument?.imageContext : undefined);
  useEffect(() => {
    if (!active || !workspaceId || !editorFile || !session || session.file.imageContext || editorFile.revision === session.revision) return;
    const selector = fileSnapshot(editorFile).selector;
    const abort = new AbortController();
    void codeApi.editorFile(workspaceId, selector, abort.signal).then(snapshot => {
      if (!abort.signal.aborted) setImageObservation({ revision: snapshot.revision, context: (snapshot as typeof snapshot & { imageContext?: MarkdownImageContext }).imageContext });
    }).catch(() => {});
    return () => abort.abort();
  }, [active, workspaceId, editorFile?.id, session?.revision, session?.file.imageContext]);
  const imageVersion = JSON.stringify([workspaceId, projectCode, documents.path, imageContext?.sourceIdentity, imageContext?.documentDigest]);
  const resolveImage = (href: string) => {
    const url = projectDocumentImage(workspaceId, projectCode, documents.path, href, imageContext);
    return url ? { href: url } : null;
  };
  const imageResult = (event: SyntheticEvent<HTMLElement>, failed: boolean) => {
    if (event.target instanceof HTMLImageElement) {
      const source = event.target.getAttribute('src');
      setFailedImages(current => updateMarkdownImageFailures(current, imageVersion, source, failed, resolveImage));
    }
  };

  useEffect(() => {
    void documents.open(position?.path || projectDocumentRoot(documentRef), { replaceHistory: true, restoredHistory: position?.history });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, projectCode, documentRef, navigationRequest]);
  useEffect(() => {
    if (!documents.loading && documents.document?.exists) rememberPosition.current(documentRef, { path: documents.path, history: documents.history });
  }, [documentRef, documents.loading, documents.document, documents.path, documents.history]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) { documents.setMessage('仅支持打开项目内的 .md 文档链接。'); return; }
    void documents.open(resolved, { pushHistory: true });
  };
  const openInExplorer = async () => {
    if (!workspaceId || !editorFile) return;
    try {
      const file = fileSnapshot(editorFile).absolutePath.replaceAll('\\', '/');
      const catalog = await codeApi.repositories(workspaceId);
      const candidates = catalog.worktrees.map(member => ({ ...member, path: member.path.replaceAll('\\', '/').replace(/\/$/, '') })).filter(member => member.available && file.startsWith(member.path + '/')).sort((a, b) => b.path.length - a.path.length);
      const member = candidates[0];
      if (!member || candidates[1]?.path.length === member.path.length) { message.info('此文件没有唯一可用的代码库目录，请从资源管理器（Explorer）选择来源。'); return; }
      const returnState = withProjectDocumentReturn(location.state, { returnId: crypto.randomUUID(), projectCode, ref: documentRef, path: documents.path, history: documents.history, positions });
      navigate(workspaceHref(workspaceId, '/code/explorer'), { state: { codeEntry: { origin: 'project', file: { repositoryId: member.repositoryId, checkoutId: member.id, path: file.slice(member.path.replace(/\/$/, '').length + 1) }, from: { pathname: location.pathname, search: location.search, hash: location.hash, state: returnState } } } });
    } catch (error) { message.error(error instanceof Error ? error.message : '无法打开资源管理器（Explorer）。'); }
  };

  return (
    <>
      <section className={'project-document-pane' + (editorFile ? ' project-document-editor' : '')} onErrorCapture={event => imageResult(event, true)} onLoadCapture={event => imageResult(event, false)}>
      {(!editorFile || documents.loading) && documents.history.length > 1 ? (
        <div className="project-document-toolbar">
          <button type="button" className="back-link project-document-back" onClick={documents.back}>← 返回上一篇</button>
          <span className="project-document-path">{documents.path}</span>
        </div>
      ) : null}
      {currentDocument?.readOnlyReason && <Alert type="info" showIcon message={currentDocument.readOnlyReason} />}
      {failedImages.version === imageVersion && failedImages.urls.length > 0 && <Alert type="warning" message="部分图片暂时不可读取，请重新打开正文后重试。" />}
      {documents.loading ? (
        <p className="page-copy">正在读取…</p>
      ) : editorFile ? (
        <FileEditingPane file={editorFile} editing={editing} active={active} markdownRevision={imageVersion}
          onOpenInExplorer={() => void openInExplorer()}
          toolbarEnd={documents.history.length > 1 ? <button type="button" className="back-link project-document-back" onClick={documents.back}>← 返回上一篇</button> : undefined}
          markdownOptions={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick, imageResolver: resolveImage }} />
      ) : documents.document?.exists && documents.document.content != null ? (
        <MarkdownHost
          markdown={documents.document.content}
          renderVersion={imageVersion}
          className="project-document-content markdown-body"
          options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick, imageResolver: resolveImage }}
        />
      ) : (
        <p className="artifact-missing">{documents.message || `项目根目录未找到 ${documents.path}`}</p>
      )}
      </section>
    </>
  );
}

export function ProjectDetailPage() {
  const { projectCode = '' } = useParams();
  const navigate = useNavigate();
  const { workspaceId, workspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [deleting, setDeleting] = useState<string | null>(null);
  const pageTabs = useWorkspacePageTabs(workspaceId);
  const catalog = useAssetCatalog(), data = catalog.data;
  const active = useContext(WorkspaceViewActiveContext);
  const inheritedTransient = useContext(WorkspaceViewTransientContext), paneHost = useWorkspacePaneHost();
  const composition = useWorkspaceComposition(active);
  const project = (!catalog.error && data?.projects.find(item => item.workspaceId === workspaceId && item.code === projectCode)) || composition.data?.projects.find(item => item.code === projectCode);
  const previews = useResourcePreview();
  const knowledge = useKnowledgeNavigation(workspaceId, { kind: 'project', id: project?.id || projectCode }, 0, Boolean(project) && active);
  const needsKnowledge = canInitializeKnowledge(knowledge);
  const error = composition.error || catalog.error || (!composition.loading && composition.data && !project ? '项目不存在' : null);
  const editLocation = useLocation();
  const view = new URLSearchParams(editLocation.search).get('view') === 'composition' ? 'composition' : 'overview';
  const reload = () => { catalog.reload(); composition.reload(); };
  const selectView = (key: string) => {
    const search = new URLSearchParams(editLocation.search);
    if (key === 'composition') search.set('view', key); else search.delete('view');
    navigate({ pathname: editLocation.pathname, search: search.toString() }, { state: editLocation.state });
  };
  const [editOpen, setEditOpen] = useState(Boolean(editLocation.state?.editResource));
  useEffect(() => { if (editLocation.state?.editResource) setEditOpen(true); }, [editLocation.key]);
  const workspaceName = workspace?.name || '工作空间';
  const initialDocumentReturn = readProjectDocumentReturn(editLocation.state, projectCode);
  const [objects, setObjects] = useState<ObjTab[]>(() => initialDocumentReturn ? Object.keys(initialDocumentReturn.positions).map(ref => ({ key: `doc:${ref}`, kind: 'doc', ref })) : []);
  const [activeObj, setActiveObj] = useState<string | null>(() => initialDocumentReturn ? `doc:${initialDocumentReturn.ref}` : null);
  const [documentPositions, setDocumentPositions] = useState<ProjectDocumentPositions>(() => initialDocumentReturn?.positions || {});
  const [documentRequests, setDocumentRequests] = useState<Partial<Record<ProjectDocumentRef, number>>>({});
  const [documentPaneStates, setDocumentPaneStates] = useState<Record<string, ProjectDocumentPaneState>>({});
  const reportDocumentPaneState = useCallback((key: string, state: ProjectDocumentPaneState) => {
    setDocumentPaneStates(current => {
      const previous = current[key];
      return previous?.dirty === state.dirty && previous.contentLayout === state.contentLayout && previous.identity === state.identity ? current : { ...current, [key]: state };
    });
  }, []);
  const consumedDocumentReturns = useRef(new Set(initialDocumentReturn ? [initialDocumentReturn.returnId] : []));
  const rememberDocumentPosition = useCallback((ref: ProjectDocumentRef, position: ProjectDocumentPosition) => {
    setDocumentPositions(current => JSON.stringify(current[ref]) === JSON.stringify(position) ? current : { ...current, [ref]: position });
  }, []);
  useEffect(() => {
    const restored = consumeProjectDocumentReturn(editLocation.state, projectCode, consumedDocumentReturns.current);
    if (!restored) return;
    setDocumentPositions(current => ({ ...current, ...restored.positions }));
    setObjects(current => [...current, ...Object.keys(restored.positions).filter(ref => !current.some(tab => tab.key === `doc:${ref}`)).map(ref => ({ key: `doc:${ref}`, kind: 'doc' as const, ref }))]);
    setActiveObj(`doc:${restored.ref}`);
    setDocumentRequests(current => ({ ...current, [restored.ref]: (current[restored.ref] || 0) + 1 }));
    paneHost?.revealContent(editLocation.pathname, `doc:${restored.ref}`);
  }, [editLocation.key, editLocation.state, projectCode]);

  useEffect(() => {
    if (!project || !workspaceId) return;
    setBreadcrumbParts([workspaceName, '项目', project.name]);
    pageTabs.register({
      key: `proj:${projectCode}`,
      kind: 'proj',
      title: project.name,
      path: href(`/projects/${encodeURIComponent(projectCode)}`),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.name, projectCode, workspaceId, workspaceName, setBreadcrumbParts]);

  const openObject = (tab: ObjTab) => {
    if (isProjectDocumentRef(tab.ref)) {
      const ref = tab.ref;
      rememberDocumentPosition(ref, { path: projectDocumentRoot(ref), history: [projectDocumentRoot(ref)] });
      setDocumentRequests(current => ({ ...current, [ref]: (current[ref] || 0) + 1 }));
    }
    setObjects((current) => current.some((o) => o.key === tab.key) ? current : [...current, tab]);
    setActiveObj(tab.key);
    paneHost?.revealContent(editLocation.pathname, tab.key);
  };
  const closeObject = (key: string) => {
    setDocumentPaneStates(current => { if (!(key in current)) return current; const next = { ...current }; delete next[key]; return next; });
    const ref = objects.find(tab => tab.key === key)?.ref;
    if (isProjectDocumentRef(ref)) {
      setDocumentPositions(current => { const next = { ...current }; delete next[ref]; return next; });
    }
    setObjects((current) => {
      const index = current.findIndex((o) => o.key === key);
      const next = current.filter((o) => o.key !== key);
      setActiveObj(activeKey => activeKey === key ? next.length ? next[Math.max(0, index - 1)].key : null : activeKey);
      return next;
    });
  };

  const objectTitle = (tab: ObjTab): string => {
    return ENTRY_TITLES[tab.ref as ProjectHomeEntryRef] ?? DOC_ROWS.find((d) => d.ref === tab.ref)?.name ?? tab.ref;
  };

  const openEntry = (ref: ProjectHomeEntryRef, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // 项目文章直接跳转「文章」菜单页，链接已带 ?project= 筛选条件
    if (ref === 'articles') return;
    if (ref === 'knowledge' && needsKnowledge) {
      if (!knowledge.data) return;
      event.preventDefault();
      openAgentAction('knowledge', knowledgeInitializationContext(knowledge.data, href(`/knowledge/project/${encodeURIComponent(projectCode)}`)));
      return;
    }
    event.preventDefault();
    openObject({ key: `entry:${ref}`, kind: 'doc', ref });
  };

  if (!project && error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">项目</p>
          <h1>{error === '项目不存在' ? error : '项目暂时无法读取'}</h1>
          <p className="page-copy">{error}</p><Button onClick={reload}>重试</Button>
        </section>
        <Link className="ant-btn-link-wrap" to={href('/projects')}>返回项目目录</Link>
      </>
    );
  }

  if (!project) {
    return (
      <div className="page-loading">
        <span className="loader" />
        <p>正在读取真实信息…</p>
      </div>
    );
  }

  const objectTabs: WorkspaceObjectTab[] = objects.map((o) => ({ key: o.key, kind: o.kind, title: objectTitle(o), contentLabel: objectTitle(o), dirty: documentPaneStates[o.key]?.dirty, contentLayout: documentPaneStates[o.key]?.contentLayout || 'reading', identity: documentPaneStates[o.key]?.identity || `${workspaceId}:project:${projectCode}:${o.key}` }));

  return (
    <>
      <WorkspaceStage
        pageTabs={pageTabs.tabs}
        onClosePageTab={pageTabs.close}
        objectTabs={objectTabs}
        activeObject={activeObj}
        onActivateObject={setActiveObj}
        onCloseObject={closeObject}
        objectContent={({ displayedKey, visible, transient }: WorkspaceObjectContentState) => <WorkspaceViewTransientContext.Provider value={inheritedTransient || transient}>{objects.map(tab => <WorkspaceViewActiveContext.Provider key={tab.key} value={visible && displayedKey === tab.key}><div hidden={displayedKey !== tab.key} style={documentPaneStates[tab.key]?.contentLayout === 'fill' ? { height: '100%' } : undefined}>{tab.ref === 'knowledge' ? (
            <KnowledgeBrowser
              workspaceId={workspaceId || ''}
              scope={{ kind: 'project', id: project?.id || projectCode }}
              navLayout="full"
              onBack={() => closeObject(tab.key)}
              backLabel="返回项目"
            />
        ) : (
            <ProjectDocObjectView
              workspaceId={workspaceId}
              projectCode={projectCode}
              objectKey={tab.key}
              documentRef={tab.ref === 'agents' ? 'agents' : 'readme'}
              position={documentPositions[tab.ref === 'agents' ? 'agents' : 'readme']}
              positions={documentPositions}
              navigationRequest={documentRequests[tab.ref === 'agents' ? 'agents' : 'readme'] || 0}
              onPosition={rememberDocumentPosition}
              onPaneState={reportDocumentPaneState}
            />
        )}</div></WorkspaceViewActiveContext.Provider>)}</WorkspaceViewTransientContext.Provider>}
      >
        <div className="project-home">
        {deleting && <AssetDeleteDialog kind="project" id={deleting} onClose={() => setDeleting(null)} />}
        <ProjectHomeHeader project={project} workspaceName={workspaceName} serviceCount={composition.data?.sources.projects !== 'complete' && !data ? null : project.serviceIds?.length || 0} href={href} onWork={() => navigate(href('/tasks?project=' + encodeURIComponent(projectCode)))} actions={<>
              <ResourceActions size="middle" projectCode={projectCode} resource={{ kind: "project", key: "project:" + projectCode, label: project.name, href: href("/projects/" + encodeURIComponent(projectCode)) }} />
              <Button id="project-edit-button" onClick={() => setEditOpen(true)}>编辑项目</Button>
              <Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', label: '移除' }], onClick: () => setDeleting(projectCode) }}>
                <Button aria-label="更多项目操作" icon={<MoreOutlined />} />
              </Dropdown>
            </>} />
        <Tabs activeKey={view} onChange={selectView} items={[{ key: 'overview', label: '概览' }, { key: 'composition', label: '项目组成' }]} />
        {view === 'composition' ? <>
          {composition.data ? <WorkspaceComposition data={composition.data} projectId={project.id}
            toolbarAction={data ? <ProjectServicesPanel projectCode={projectCode} data={data} setData={catalog.setData} onReload={reload} compact /> : undefined}
            error={composition.error || composition.data.diagnostics.map(item => item.message).join('；') || undefined} onRetry={reload}
            onOpen={(kind, id) => { if (kind !== 'project') previews?.open(editLocation.pathname, href(`/${kind === 'service' ? 'services' : 'repositories'}/${encodeURIComponent(id)}`)); }} /> : <Alert type="info" message={composition.error || '正在读取项目组成…'} action={composition.error && <Button onClick={reload}>重试</Button>} />}
          {!data && catalog.error && <Alert type="warning" message="关联暂时不能编辑" description={catalog.error} action={<Button onClick={reload}>重新读取</Button>} />}
        </> : <>
        <ProjectHomeEntries projectCode={projectCode} href={href} needsKnowledge={needsKnowledge} onEntry={openEntry} />
        <div className="project-home-details">
          <section className="resource-section" aria-label="文档">
            <div className="ws-section-head"><h2>项目资料 <span className="ws-count">{DOC_ROWS.length} 个入口</span></h2></div>
            <div className="ws-obj-list">
              {DOC_ROWS.map((doc) => (
                <button
                  key={doc.ref}
                  type="button"
                  className="ws-obj-row"
                  data-doc-row={doc.ref}
                  onClick={() => openObject({ key: `doc:${doc.ref}`, kind: 'doc', ref: doc.ref })}
                >
                  <span className="ws-obj-ico"><FileTextOutlined /></span>
                  <span className="ws-obj-name">{doc.name}</span>
                  <small>{doc.hint}</small>
                  <RightOutlined className="ws-go" aria-hidden />
                </button>
              ))}
            </div>
          </section>
          {data ? <ProjectServicesPanel projectCode={projectCode} data={data} setData={catalog.setData} onReload={reload} /> : <Alert type="warning" message={catalog.error || '正在读取关联服务…'} action={<Button onClick={reload}>重新读取</Button>} />}
        </div>
        </>}
        </div>
      </WorkspaceStage>

      <ProjectEditDrawer
        open={editOpen}
        projectCode={editOpen ? projectCode : null}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          reload();
          setBreadcrumbParts([workspaceName || '工作空间', '项目', saved.name]);
          pageTabs.register({
            key: `proj:${projectCode}`,
            kind: 'proj',
            title: saved.name,
            path: href(`/projects/${encodeURIComponent(projectCode)}`),
          });
        }}
      />
    </>
  );
}
