import { ResourceActions } from '../../workbench/components/ResourceActions';
import { AssetDeleteDialog } from '../../workspace/components/AssetDeleteDialog';
import { useLocation } from 'react-router-dom';
import { ProjectServicesPanel } from '../components/ProjectServicesPanel';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { projectApi } from '../api/project-api';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Dropdown } from 'antd';
import { FileTextOutlined, RightOutlined, HistoryOutlined, ReadOutlined, MoreOutlined, ArrowRightOutlined } from '@ant-design/icons';

import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { workspaceHref } from '../../../lib/labels';
import { dailyProgressActivityPath, legacyDailyProgressPath } from '../../project-daily-progress/dailyProgressNavigation';
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
  const project = data?.projects.find(item => item.workspaceId === workspaceId && item.code === projectCode);
  const active = useContext(WorkspaceViewActiveContext);
  const knowledge = useKnowledgeNavigation(workspaceId, { kind: 'project', id: project?.id || projectCode }, 0, Boolean(project) && active);
  const needsKnowledge = canInitializeKnowledge(knowledge);
  const services = data?.services.filter(service => service.workspaceId === workspaceId && project?.serviceIds?.includes(service.id)) || [];
  const error = catalog.error || (data && !catalog.loading && !project ? '项目不存在' : null);
  const editLocation = useLocation();
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

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">项目</p>
          <h1>项目不存在</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link className="ant-btn-link-wrap" to={href('/projects')}>返回项目目录</Link>
      </>
    );
  }

  if (!data || !project) {
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
        <header className="project-home-header">
          <div className="project-home-topline">
            <Link className="project-home-back" to={href('/projects')} aria-label="返回项目列表">← 项目列表</Link>
            <div className="project-home-actions">
              <ResourceActions size="middle" projectCode={projectCode} resource={{ kind: "project", key: "project:" + projectCode, label: project.name, href: href("/projects/" + encodeURIComponent(projectCode)) }} />
              <Button id="project-edit-button" onClick={() => setEditOpen(true)}>编辑项目</Button>
              <Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', label: '移除项目登记', danger: true }], onClick: () => setDeleting(projectCode) }}>
                <Button aria-label="更多项目操作" icon={<MoreOutlined />} />
              </Dropdown>
            </div>
          </div>
          <h1 id="project-detail-name">{project.name}</h1>
          <p className="project-home-description" id="project-detail-description">{project.description || '尚未填写项目说明。'}</p>
          <div className="project-home-context">
            <span>{workspaceName || '工作空间'}<span className="project-home-dot">·</span><b id="project-service-count">{services.length}</b> 个关联服务</span>
            <Button type="primary" className="project-home-work" onClick={() => navigate(href('/tasks?project=' + encodeURIComponent(projectCode)))}>查看项目工作 <ArrowRightOutlined /></Button>
          </div>
        </header>

        <nav className="project-home-entries" aria-label="项目内容">
          <Link className="project-home-entry" to={href(`/knowledge/project/${encodeURIComponent(projectCode)}`)}
            data-knowledge-initialize={needsKnowledge || undefined} data-knowledge-initialize-action={needsKnowledge || undefined}
            onClick={event => {
              if (!needsKnowledge || !knowledge.data || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              openAgentAction('knowledge', knowledgeInitializationContext(knowledge.data, href(`/knowledge/project/${encodeURIComponent(projectCode)}`)));
            }}>
            <span className="project-home-entry-icon knowledge"><ReadOutlined /></span>
            <span><strong>{needsKnowledge ? '建立项目知识' : '项目知识'}</strong><small>{needsKnowledge ? '先建立对项目的整体认识' : '理解目标、主要部分与关键过程'}</small></span>
            <RightOutlined />
          </Link>
          <Link className="project-home-entry" to={href('/articles?project=' + encodeURIComponent(projectCode))}>
            <span className="project-home-entry-icon"><FileTextOutlined /></span>
            <span><strong>项目文章</strong><small>继续写作，整理与分享项目成果</small></span>
            <RightOutlined />
          </Link>
          <Link id="project-activity-link" className="project-home-entry" to={href(dailyProgressActivityPath(projectCode))}>
            <span className="project-home-entry-icon"><HistoryOutlined /></span>
            <span><strong>项目动态</strong><small>查看每日演进、提交与变化影响</small></span>
            <RightOutlined />
          </Link>
        </nav>
        <div className="project-home-details">
          <ProjectServicesPanel projectCode={projectCode} data={data} setData={catalog.setData} />

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
        </div>
      </WorkspaceStage>

      <ProjectEditDrawer
        open={editOpen}
        projectCode={editOpen ? projectCode : null}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          catalog.reload();
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
