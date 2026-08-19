import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tabs } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { MarkdownHost } from '../components/MarkdownHost';
import { ProjectEditModal } from '../components/ProjectEditModal';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../lib/projectDocuments';
import { workspaceHref } from '../lib/labels';
import { DailyProgressPanel } from './project-detail/DailyProgressPanel';

type ProjectDetail = {
  revision: string;
  migrationRequired?: boolean;
  nextActions?: string[];
  project: {
    code: string;
    name: string;
    description?: string;
  };
};

type ProjectDocument = {
  path?: string;
  name: string;
  exists: boolean;
  content: string | null;
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

const DOC_TABS = [
  { key: 'README.md', label: 'README.md' },
  { key: 'AGENTS.md', label: 'AGENTS.md' },
  { key: 'daily-progress', label: '每日演进' },
] as const;

export function ProjectDetailPage() {
  const { projectCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [serviceCount, setServiceCount] = useState('—');
  const [activeTab, setActiveTab] = useState<string>('README.md');
  const [viewPath, setViewPath] = useState('README.md');
  const [viewHistory, setViewHistory] = useState<string[]>(['README.md']);
  const [viewDoc, setViewDoc] = useState<ProjectDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docMessage, setDocMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');

  async function fetchDocument(docPath: string): Promise<ProjectDocument> {
    return api(
      `/api/v1/projects/${encodeURIComponent(projectCode)}/documents/${encodeProjectDocumentPath(docPath)}`,
    ) as Promise<ProjectDocument>;
  }

  async function openDocument(docPath: string, options: { pushHistory?: boolean; replaceHistory?: boolean } = {}) {
    setDocLoading(true);
    setDocMessage(null);
    try {
      const doc = await fetchDocument(docPath);
      setViewDoc(doc);
      setViewPath(doc.path || docPath);
      if (options.replaceHistory) {
        setViewHistory([doc.path || docPath]);
      } else if (options.pushHistory !== false) {
        setViewHistory((history) => {
          const nextPath = doc.path || docPath;
          if (history[history.length - 1] === nextPath) return history;
          return [...history, nextPath];
        });
      }
      if (!doc.exists || doc.content == null) {
        setDocMessage(`项目内未找到 ${doc.path || docPath}`);
      }
    } catch (err) {
      setViewDoc(null);
      setDocMessage(err instanceof Error ? err.message : `无法打开 ${docPath}`);
    } finally {
      setDocLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, projectData, servicesData, readme] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as Promise<ProjectDetail>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`) as Promise<{ services: unknown[] }>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}/documents/README.md`) as Promise<ProjectDocument>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceName(workspace.workspace.name);
        setBreadcrumbParts([workspace.workspace.name, '项目', projectData.project.name]);
        setData(projectData);
        setServiceCount(`${servicesData.services.length} 个已登记服务`);
        setViewDoc(readme);
        setViewPath(readme.path || 'README.md');
        setViewHistory([readme.path || 'README.md']);
        setActiveTab('README.md');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '项目不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, setWorkspace, setBreadcrumbParts]);

  const onTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'daily-progress') return;
    void openDocument(key, { replaceHistory: true, pushHistory: false });
  };

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(viewPath, linkHref);
    if (!resolved) {
      setDocMessage('仅支持打开项目内的 .md 文档链接。');
      return;
    }
    void openDocument(resolved, { pushHistory: true });
  };

  const onDocumentBack = () => {
    if (viewHistory.length <= 1) return;
    const nextHistory = viewHistory.slice(0, -1);
    const previous = nextHistory[nextHistory.length - 1];
    setViewHistory(nextHistory);
    void openDocument(previous, { pushHistory: false });
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

  if (!data) {
    return (
      <div className="page-loading">
        <span className="loader" />
        <p>正在读取真实信息…</p>
      </div>
    );
  }

  const project = data.project;
  const showBack = viewHistory.length > 1;
  const entryMissingId = activeTab === 'README.md' || activeTab === 'AGENTS.md'
    ? `project-document-missing-${activeTab.replace('.', '-')}`
    : undefined;

  return (
    <>
      <section className="detail-title-row project-detail-header">
        <h1 id="project-detail-name">{project.name}</h1>
        <Button id="project-edit-button" type="primary" onClick={() => setEditOpen(true)}>编辑项目</Button>
      </section>
      <section className="panel project-basics-panel" aria-label="项目基本信息">
        <dl className="read-facts detail-facts">
          <div>
            <dt>项目说明</dt>
            <dd id="project-detail-description">{project.description || '尚未填写项目说明。'}</dd>
          </div>
          <div>
            <dt>服务登记</dt>
            <dd id="project-service-summary">{serviceCount}</dd>
          </div>
        </dl>
      </section>
      <section className="panel project-documents-panel" id="project-document-tabs" aria-label="项目文档">
        <Tabs
          activeKey={activeTab}
          onChange={onTabChange}
          items={DOC_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
          }))}
        />
        {showBack && activeTab !== 'daily-progress' ? (
          <div className="project-document-toolbar">
            <button type="button" className="back-link project-document-back" id="project-document-back" onClick={onDocumentBack}>
              ← 返回上一篇
            </button>
            <span className="project-document-path" id="project-document-path">{viewPath}</span>
          </div>
        ) : null}
        {activeTab === 'daily-progress' ? (
          <DailyProgressPanel
            projectCode={projectCode}
            workspaceId={workspaceId}
            onAskAgent={() => openAgentAction('daily-progress', { projectCode, date: new Date().toISOString().slice(0, 10) })}
          />
        ) : (
        <div
          id={`project-document-${activeTab.replace('.', '-')}`}
          className="project-document-body"
        >
          {docLoading ? (
            <p className="page-copy">正在读取…</p>
          ) : viewDoc?.exists && viewDoc.content != null ? (
            <MarkdownHost
              markdown={viewDoc.content}
              className="project-document-content markdown-body"
              options={{
                headingOffset: 1,
                allowRelativeLinks: true,
                allowParentRelativeLinks: true,
                onRelativeLinkClick,
              }}
            />
          ) : (
            <p className="artifact-missing" id={entryMissingId}>
              {docMessage || `项目根目录未找到 ${viewPath}`}
            </p>
          )}
          {docMessage && viewDoc?.exists ? (
            <p className="page-copy project-document-hint" role="status">{docMessage}</p>
          ) : null}
        </div>
        )}
      </section>
      <ProjectEditModal
        open={editOpen}
        projectCode={editOpen ? projectCode : null}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setData((current) => (
            current
              ? {
                  ...current,
                  revision: saved.revision,
                  project: {
                    ...current.project,
                    name: saved.name,
                    description: saved.description,
                  },
                }
              : current
          ));
          setBreadcrumbParts([workspaceName || '工作空间', '项目', saved.name]);
        }}
      />
    </>
  );
}
