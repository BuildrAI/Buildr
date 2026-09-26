import { ProjectHomeEntries } from '../components/ProjectHomeEntries';
import { ProjectHomeHeader } from '../components/ProjectHomeHeader';
import { ResourceActions } from '../../workbench/components/ResourceActions';
import { AssetDeleteDialog } from '../../workspace/components/AssetDeleteDialog';
import { useLocation } from 'react-router-dom';
import { ProjectServicesPanel } from '../components/ProjectServicesPanel';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { projectApi } from '../api/project-api';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Dropdown, Tabs } from 'antd';
import { WorkspaceComposition } from '../../workspace/components/WorkspaceComposition';
import { useWorkspaceComposition } from '../../workspace/components/useWorkspaceComposition';
import { useResourcePreview } from '../../../app/resource-preview';
import { FileTextOutlined, RightOutlined, MoreOutlined } from '@ant-design/icons';

import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { workspaceHref } from '../../../lib/labels';
import { legacyDailyProgressPath } from '../../project-daily-progress/dailyProgressNavigation';
import { useMarkdownDocumentViewer, type MarkdownDocument } from '../../../lib/useMarkdownDocumentViewer';
import { ProjectEditDrawer } from '../components/ProjectEditDrawer';
import { useWorkspacePageTabs, WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { useKnowledgeNavigation } from '../../knowledge/useKnowledgeNavigation';
import { canInitializeKnowledge, knowledgeInitializationContext } from '../../knowledge/knowledge-initialize';
import { WorkspaceStage, type WorkspaceObjectTab } from '../../../components/WorkspaceStage';
import '../project-home.css';

type ObjTab = { key: string; kind: 'doc'; ref: string };

const projectDocumentMissingMessage = (path: string) => `项目内未找到 ${path}`;

const DOC_ROWS: { ref: string; name: string; hint: string }[] = [
  { ref: 'readme', name: 'README.md', hint: '项目治理根与入口' },
  { ref: 'agents', name: 'AGENTS.md', hint: '规则与授权边界' },
];

/** 右组项目文档对象。 */
function ProjectDocObjectView({ projectCode, docPath, title, hint }: { projectCode: string; docPath: string; title: string; hint: string }) {
  const fetchDocument = useCallback(async (path: string): Promise<MarkdownDocument> => {
    return projectApi.projectDocument(projectCode, encodeProjectDocumentPath(path));
  }, [projectCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, projectDocumentMissingMessage);

  useEffect(() => {
    void documents.open(docPath, { pushHistory: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode, docPath]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) { documents.setMessage('仅支持打开项目内的 .md 文档链接。'); return; }
    void documents.open(resolved, { pushHistory: true });
  };

  return (
    <>
      <div className="ws-obj-head"><h2>{title}</h2></div>
      <p className="ws-obj-sub">{hint}</p>
      {documents.history.length > 1 ? (
        <div className="project-document-toolbar">
          <button type="button" className="back-link project-document-back" onClick={documents.back}>← 返回上一篇</button>
          <span className="project-document-path">{documents.path}</span>
        </div>
      ) : null}
      {documents.loading ? (
        <p className="page-copy">正在读取…</p>
      ) : documents.document?.exists && documents.document.content != null ? (
        <MarkdownHost
          markdown={documents.document.content}
          className="project-document-content markdown-body"
          options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick }}
        />
      ) : (
        <p className="artifact-missing">{documents.message || `项目根目录未找到 ${documents.path}`}</p>
      )}
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
  const [objects, setObjects] = useState<ObjTab[]>([]);
  const [activeObj, setActiveObj] = useState<string | null>(null);

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
    setObjects((current) => current.some((o) => o.key === tab.key) ? current : [...current, tab]);
    setActiveObj(tab.key);
  };
  useEffect(() => {
    const activityPath = legacyDailyProgressPath(projectCode, editLocation.search);
    if (activityPath) navigate(workspaceHref(workspaceId, activityPath), { replace: true });
  }, [editLocation.search, projectCode, workspaceId, navigate]);
  const closeObject = (key: string) => {
    setObjects((current) => {
      const index = current.findIndex((o) => o.key === key);
      const next = current.filter((o) => o.key !== key);
      if (activeObj === key) setActiveObj(next.length ? next[Math.max(0, index - 1)].key : null);
      return next;
    });
  };

  const objectTitle = (tab: ObjTab): string => {
    return DOC_ROWS.find((d) => d.ref === tab.ref)?.name ?? tab.ref;
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

  const objectTabs: WorkspaceObjectTab[] = objects.map((o) => ({ key: o.key, kind: o.kind, title: objectTitle(o) }));
  const activeTab = objects.find((o) => o.key === activeObj) ?? null;

  return (
    <>
      <WorkspaceStage
        pageTabs={pageTabs.tabs}
        onClosePageTab={pageTabs.close}
        objectTabs={objectTabs}
        activeObject={activeObj}
        onActivateObject={setActiveObj}
        onCloseObject={closeObject}
        objectContent={activeTab ? (
            <ProjectDocObjectView
              key={activeTab.ref}
              projectCode={projectCode}
              docPath={activeTab.ref === 'agents' ? 'AGENTS.md' : 'README.md'}
              title={activeTab.ref === 'agents' ? 'AGENTS.md' : 'README.md'}
              hint={activeTab.ref === 'agents' ? '规则与授权边界' : '项目治理根与入口'}
            />
        ) : null}
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
          {data ? <ProjectServicesPanel projectCode={projectCode} data={data} setData={catalog.setData} onReload={reload} compact /> : <Alert type="warning" message="关联暂时不能编辑" description={catalog.error} action={<Button onClick={reload}>重新读取</Button>} />}
          {composition.data ? <WorkspaceComposition data={composition.data} projectId={project.id}
            error={composition.error || composition.data.diagnostics.map(item => item.message).join('；') || undefined} onRetry={reload}
            onOpen={(kind, id) => { if (kind !== 'project') previews?.open(editLocation.pathname, href(`/${kind === 'service' ? 'services' : 'repositories'}/${encodeURIComponent(id)}`)); }} /> : <Alert type="info" message={composition.error || '正在读取项目组成…'} action={composition.error && <Button onClick={reload}>重试</Button>} />}
        </> : <>
        <ProjectHomeEntries projectCode={projectCode} href={href} needsKnowledge={needsKnowledge} onKnowledge={event => {
          if (!needsKnowledge || !knowledge.data || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); openAgentAction('knowledge', knowledgeInitializationContext(knowledge.data, href(`/knowledge/project/${encodeURIComponent(projectCode)}`)));
        }} />
        <div className="project-home-details">
          {data ? <ProjectServicesPanel projectCode={projectCode} data={data} setData={catalog.setData} onReload={reload} /> : <Alert type="warning" message={catalog.error || '正在读取关联服务…'} action={<Button onClick={reload}>重新读取</Button>} />}

          <section className="resource-section" aria-label="文档">
            <div className="ws-section-head"><h2>项目资料 <span className="ws-count">{DOC_ROWS.length} 个入口</span></h2></div>
            <div className="ws-obj-list">
              {DOC_ROWS.map((doc) => (
                <button
                  key={doc.ref}
                  type="button"
                  className={`ws-obj-row${objects.some((o) => o.key === `doc:${doc.ref}`) ? ' reading' : ''}`}
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
