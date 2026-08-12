import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tabs } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { MarkdownHost } from '../components/MarkdownHost';
import { ServiceEditModal } from '../components/ServiceEditModal';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../lib/projectDocuments';
import { serviceTypeLabel, workspaceHref } from '../lib/labels';

type ServiceDetail = {
  revision: string;
  migrationRequired?: boolean;
  nextActions?: string[];
  project?: { name?: string };
  service: {
    code: string;
    name: string;
    description?: string;
    type: string;
  };
};

type ServiceDocument = {
  path?: string;
  name: string;
  exists: boolean;
  content: string | null;
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

const DOC_TABS = [
  { key: 'README.md', label: 'README.md' },
  { key: 'AGENTS.md', label: 'AGENTS.md' },
] as const;

export function ServiceDetailPage() {
  const { projectCode = '', serviceCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [activeTab, setActiveTab] = useState<string>('README.md');
  const [viewPath, setViewPath] = useState('README.md');
  const [viewHistory, setViewHistory] = useState<string[]>(['README.md']);
  const [viewDoc, setViewDoc] = useState<ServiceDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docMessage, setDocMessage] = useState<string | null>(null);

  async function fetchDocument(docPath: string): Promise<ServiceDocument> {
    return api(
      `/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}/documents/${encodeProjectDocumentPath(docPath)}`,
    ) as Promise<ServiceDocument>;
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
        setDocMessage(`服务内未找到 ${doc.path || docPath}`);
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
        const [workspace, detail, readme] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}`) as Promise<ServiceDetail>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}/documents/README.md`) as Promise<ServiceDocument>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceName(workspace.workspace.name);
        setBreadcrumbParts([workspace.workspace.name, '项目', detail.project?.name || projectCode, '服务', detail.service.name]);
        setData(detail);
        setViewDoc(readme);
        setViewPath(readme.path || 'README.md');
        setViewHistory([readme.path || 'README.md']);
        setActiveTab('README.md');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '服务不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, serviceCode, setWorkspace, setBreadcrumbParts]);

  const onTabChange = (key: string) => {
    setActiveTab(key);
    void openDocument(key, { replaceHistory: true, pushHistory: false });
  };

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(viewPath, linkHref);
    if (!resolved) {
      setDocMessage('仅支持打开服务内的 .md 文档链接。');
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
          <p className="eyebrow">服务</p>
          <h1>服务不存在</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link className="ant-btn-link-wrap" to={href('/services')}>返回服务目录</Link>
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

  const service = data.service;
  const showBack = viewHistory.length > 1;
  const entryMissingId = activeTab === 'README.md' || activeTab === 'AGENTS.md'
    ? `service-document-missing-${activeTab.replace('.', '-')}`
    : undefined;

  return (
    <>
      <section className="detail-page-header">
        <Link className="back-link" to={href(`/services?project=${encodeURIComponent(projectCode)}`)}>← 返回服务目录</Link>
      </section>
      <section className="panel project-basics-panel" aria-label="服务基本信息">
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">服务</p>
            <h1 id="service-detail-name">{service.name}</h1>
          </div>
          <Button id="service-edit-button" type="primary" onClick={() => setEditOpen(true)}>编辑服务</Button>
        </div>
        <dl className="read-facts detail-facts">
          <div>
            <dt>服务说明</dt>
            <dd id="service-detail-description">{service.description || '尚未填写服务说明。'}</dd>
          </div>
          <div>
            <dt>所属项目</dt>
            <dd id="service-detail-project">{`${data.project?.name || projectCode}（${projectCode}）`}</dd>
          </div>
          <div>
            <dt>服务类型</dt>
            <dd id="service-detail-type">{serviceTypeLabel(service.type)}</dd>
          </div>
        </dl>
      </section>
      <section className="panel project-documents-panel" id="service-document-tabs" aria-label="服务文档">
        <Tabs
          activeKey={activeTab}
          onChange={onTabChange}
          items={DOC_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
          }))}
        />
        <div className="project-document-toolbar">
          {showBack ? (
            <button type="button" className="back-link project-document-back" id="service-document-back" onClick={onDocumentBack}>
              ← 返回上一篇
            </button>
          ) : null}
          <span className="project-document-path" id="service-document-path">{viewPath}</span>
        </div>
        <div
          id={`service-document-${activeTab.replace('.', '-')}`}
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
              {docMessage || `服务根目录未找到 ${viewPath}`}
            </p>
          )}
          {docMessage && viewDoc?.exists ? (
            <p className="page-copy project-document-hint" role="status">{docMessage}</p>
          ) : null}
        </div>
      </section>
      <ServiceEditModal
        open={editOpen}
        projectCode={editOpen ? projectCode : null}
        serviceCode={editOpen ? serviceCode : null}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setData((current) => (
            current
              ? {
                  ...current,
                  revision: saved.revision,
                  service: {
                    ...current.service,
                    name: saved.name,
                    description: saved.description,
                    type: saved.type,
                  },
                }
              : current
          ));
          setBreadcrumbParts([
            workspaceName || '工作空间',
            '项目',
            data.project?.name || projectCode,
            '服务',
            saved.name,
          ]);
        }}
      />
    </>
  );
}
