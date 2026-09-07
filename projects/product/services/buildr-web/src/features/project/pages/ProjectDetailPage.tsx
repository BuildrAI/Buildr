import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tabs } from 'antd';
import { workspaceApi, type ProjectResponse } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { workspaceHref } from '../../../lib/labels';
import { DailyProgressPanel } from '../../project-daily-progress/components/DailyProgressPanel';
import { useMarkdownDocumentViewer, type MarkdownDocument } from '../../../lib/useMarkdownDocumentViewer';
import { ProjectEditModal } from '../components/ProjectEditModal';

type ProjectDetail = ProjectResponse & { revision: string; project: NonNullable<ProjectResponse['project']> };

const DOC_TABS = [
  { key: 'README.md', label: 'README.md' },
  { key: 'AGENTS.md', label: 'AGENTS.md' },
  { key: 'daily-progress', label: '每日演进' },
] as const;

const projectDocumentMissingMessage = (path: string) => `项目内未找到 ${path}`;

export function ProjectDetailPage() {
  const { projectCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [serviceCount, setServiceCount] = useState('—');
  const [activeTab, setActiveTab] = useState<string>('README.md');
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');

  const fetchDocument = useCallback(async (docPath: string): Promise<MarkdownDocument> => {
    return workspaceApi.projectDocument(projectCode, encodeProjectDocumentPath(docPath));
  }, [projectCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, projectDocumentMissingMessage);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, projectData, servicesData, readme] = await Promise.all([
          workspaceApi.read(),
          workspaceApi.project(projectCode) as Promise<ProjectDetail>,
          workspaceApi.services(projectCode),
          workspaceApi.projectDocument(projectCode, 'README.md') as Promise<MarkdownDocument>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceName(workspace.workspace.name);
        setBreadcrumbParts([workspace.workspace.name, '项目', projectData.project.name]);
        setData(projectData);
        setServiceCount(`${(servicesData.services ?? []).length} 个已登记服务`);
        documents.reset(readme);
        setActiveTab('README.md');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '项目不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, setWorkspace, setBreadcrumbParts, documents.reset]);

  const onTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'daily-progress') return;
    void documents.open(key, { replaceHistory: true, pushHistory: false });
  };

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) {
      documents.setMessage('仅支持打开项目内的 .md 文档链接。');
      return;
    }
    void documents.open(resolved, { pushHistory: true });
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
  const showBack = documents.history.length > 1;
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
            <button type="button" className="back-link project-document-back" id="project-document-back" onClick={documents.back}>
              ← 返回上一篇
            </button>
            <span className="project-document-path" id="project-document-path">{documents.path}</span>
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
          {documents.loading ? (
            <p className="page-copy">正在读取…</p>
          ) : documents.document?.exists && documents.document.content != null ? (
            <MarkdownHost
              markdown={documents.document.content}
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
              {documents.message || `项目根目录未找到 ${documents.path}`}
            </p>
          )}
          {documents.message && documents.document?.exists ? (
            <p className="page-copy project-document-hint" role="status">{documents.message}</p>
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
