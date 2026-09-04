import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tabs } from 'antd';
import { workspaceApi, type ProjectResponse } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { serviceTypeLabel, workspaceHref } from '../../../lib/labels';
import { useMarkdownDocumentViewer, type MarkdownDocument } from '../../shared/hooks/useMarkdownDocumentViewer';
import { ServiceEditModal } from '../components/ServiceEditModal';

type ServiceDetail = ProjectResponse & { revision: string; service: NonNullable<ProjectResponse['service']> };

const DOC_TABS = [
  { key: 'README.md', label: 'README.md' },
  { key: 'AGENTS.md', label: 'AGENTS.md' },
] as const;

const serviceDocumentMissingMessage = (path: string) => `服务内未找到 ${path}`;

export function ServiceDetailPage() {
  const { projectCode = '', serviceCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [activeTab, setActiveTab] = useState<string>('README.md');

  const fetchDocument = useCallback(async (docPath: string): Promise<MarkdownDocument> => {
    return workspaceApi.serviceDocument(projectCode, serviceCode, encodeProjectDocumentPath(docPath));
  }, [projectCode, serviceCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, serviceDocumentMissingMessage);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, detail, readme] = await Promise.all([
          workspaceApi.read(),
          workspaceApi.service(projectCode, serviceCode) as Promise<ServiceDetail>,
          workspaceApi.serviceDocument(projectCode, serviceCode, 'README.md') as Promise<MarkdownDocument>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceName(workspace.workspace.name);
        setBreadcrumbParts([workspace.workspace.name, '项目', detail.project?.name || projectCode, '服务', detail.service.name]);
        setData(detail);
        documents.reset(readme);
        setActiveTab('README.md');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '服务不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, serviceCode, setWorkspace, setBreadcrumbParts, documents.reset]);

  const onTabChange = (key: string) => {
    setActiveTab(key);
    void documents.open(key, { replaceHistory: true, pushHistory: false });
  };

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) {
      documents.setMessage('仅支持打开服务内的 .md 文档链接。');
      return;
    }
    void documents.open(resolved, { pushHistory: true });
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
  const showBack = documents.history.length > 1;
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
        {showBack ? (
          <div className="project-document-toolbar">
            <button type="button" className="back-link project-document-back" id="service-document-back" onClick={documents.back}>
              ← 返回上一篇
            </button>
            <span className="project-document-path" id="service-document-path">{documents.path}</span>
          </div>
        ) : null}
        <div
          id={`service-document-${activeTab.replace('.', '-')}`}
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
              {documents.message || `服务根目录未找到 ${documents.path}`}
            </p>
          )}
          {documents.message && documents.document?.exists ? (
            <p className="page-copy project-document-hint" role="status">{documents.message}</p>
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
