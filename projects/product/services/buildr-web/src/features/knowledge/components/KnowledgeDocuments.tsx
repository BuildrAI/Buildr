import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Spin } from "antd";
import { DownOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { MarkdownHost } from "../../../components/MarkdownHost";
import { knowledgeApi, type KnowledgeDocument, type KnowledgeDocumentResponse, type KnowledgeDocumentsResponse, type KnowledgeScope } from "../api/knowledge-api";
import { knowledgeDocumentSections, linkedKnowledgeDocument } from "../knowledge-documents";
import "./knowledge-documents.css";

type Props = {
  scope: KnowledgeScope;
  workspaceId: string;
  documentId?: string | null;
  artifactId?: string | null;
  query: string;
  refresh: number;
  active?: boolean;
  onQuery: (value: string) => void;
  onOpen: (id: string | null, title?: string) => void;
  onArtifact: (id: string, title: string) => void;
  onLoadingChange?: (value: boolean) => void;
  onTitleChange?: (value: string) => void;
};

/** File discovery and ordinary Markdown reading shared by the full page and side reader. */
export function KnowledgeDocuments({ scope, workspaceId, documentId, artifactId, query, refresh, active = true, onQuery, onOpen, onArtifact, onLoadingChange, onTitleChange }: Props) {
  const identity = `${workspaceId}:${scope.kind}:${scope.id}`;
  const [catalog, setCatalog] = useState<{ identity: string; data: KnowledgeDocumentsResponse | null; loading: boolean; error: string }>({ identity, data: null, loading: true, error: "" });
  const [reading, setReading] = useState<{ key: string; data: KnowledgeDocumentResponse | null; loading: boolean; error: string }>({ key: "", data: null, loading: false, error: "" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedSection, setSelectedSection] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { setExpanded({}); }, [identity, query]);
  useEffect(() => { setSelectedSection(""); }, [identity]);
  const callbacks = useRef({ onLoadingChange, onTitleChange });
  callbacks.current = { onLoadingChange, onTitleChange };
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setCatalog(previous => ({ identity, data: previous.identity === identity ? previous.data : null, loading: true, error: "" }));
    void knowledgeApi.documents(scope, controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalog({ identity, data, loading: false, error: "" });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setCatalog(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : "读取文档目录失败。" }));
    });
    return () => controller.abort();
  }, [identity, refresh, active]);
  const readingKey = `${identity}:${documentId || ""}`;
  useEffect(() => {
    setNotice("");
    if (!active || !documentId) return;
    const controller = new AbortController();
    setReading({ key: readingKey, data: null, loading: true, error: "" });
    void knowledgeApi.document(scope, documentId, controller.signal).then(data => {
      if (!controller.signal.aborted) setReading({ key: readingKey, data, loading: false, error: "" });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setReading({ key: readingKey, data: null, loading: false, error: error instanceof Error ? error.message : "读取文档失败。" });
    });
    return () => controller.abort();
  }, [readingKey, refresh, active]);
  const data = catalog.identity === identity ? catalog.data : null;
  const documents = data?.documents || [];
  const current = reading.key === readingKey ? reading.data : null;
  const loading = documentId ? reading.key !== readingKey || reading.loading : catalog.identity !== identity || catalog.loading;
  useEffect(() => { if (active) callbacks.current.onLoadingChange?.(loading); }, [active, loading]);
  const readingTitle = artifactId ? documents.find(document => document.artifactId === artifactId)?.title || "" : current?.document.title || "文档目录";
  useEffect(() => { if (active) callbacks.current.onTitleChange?.(readingTitle); }, [active, readingTitle, documentId, artifactId]);
  const sections = useMemo(() => knowledgeDocumentSections(documents, data?.sections || [], query), [data, query]);
  const matchingCount = sections.reduce((count, section) => count + section.count, 0);
  const selected = sections.find(section => section.id === selectedSection) || sections[0];
  const visibleSections = query.trim() ? sections : selected ? [selected] : [];
  const open = (document: KnowledgeDocument) => document.artifactId ? onArtifact(document.artifactId, document.title) : onOpen(document.id, document.title);
  const entries = (items: KnowledgeDocument[]) => <ul className="knowledge-document-entries">
    {items.map(document => <li key={document.id}>
      <button type="button" className="knowledge-document-entry" data-knowledge-document={document.id} onClick={() => open(document)}>
        <strong>{document.title}</strong>
        {document.summary && <span>{document.summary}</span>}
      </button>
    </li>)}
  </ul>;
  return <section className="knowledge-documents" data-knowledge-documents>
    {documentId ? <>
      <Button type="link" className="knowledge-document-back" onClick={() => onOpen(null)}>← 返回文档目录</Button>
      {loading ? <Spin /> : reading.error ? <Alert type="error" message={reading.error} /> : current && <>
        <p className="knowledge-document-location">{current.document.group} · {current.document.path}</p>
        {notice && <Alert type="info" message={notice} closable onClose={() => setNotice("")} />}
        <MarkdownHost markdown={current.content.replace(/^# [^\n]*\n/, "")} className="markdown-body" options={{ allowRelativeLinks: true, allowParentRelativeLinks: true,
          onRelativeLinkClick: href => {
            const target = linkedKnowledgeDocument(documents, current.document, href);
            if (target) open(target);
            else setNotice("这个链接不在当前可阅读的文档目录中。可以从主题阅读查看已登记的图示与来源。");
          },
        }} />
      </>}
    </> : <>
      <div className="knowledge-document-tools">
      <Input prefix={<SearchOutlined />} value={query} allowClear aria-label="检索文档目录" placeholder="搜索章节、文档或关键词" onChange={event => onQuery(event.target.value)} />
      <p className="knowledge-results-count" aria-live="polite">{loading ? "正在读取文档目录…" : !data ? "文档数量暂不可用" : `${catalog.error ? "上次读取" : data.truncated ? "已发现" : "共"} ${data.totalCount} 份文档${query.trim() ? ` · 匹配 ${matchingCount} 份` : ""}`}</p>
      </div>
      <p className="knowledge-documents-description">按阅读目的整理，选择章节开始阅读；补充材料也可搜索。</p>
      {catalog.error && <Alert type="error" message={catalog.error} />}
      {data?.truncated && <Alert type="warning" message="目录未完整读取，当前数量仅为已发现文档。" />}
      {data?.diagnostics.map(message => <Alert key={message} type="warning" message={message} />)}
      {loading && !data ? <Spin /> : sections.length ? <div className="knowledge-document-library">
        {!query.trim() && sections.length > 1 && <nav className="knowledge-document-chapters" aria-label="文档章节">
          {sections.map(section => <button type="button" key={section.id} data-knowledge-chapter={section.id}
            aria-current={selected?.id === section.id ? "true" : undefined} onClick={() => setSelectedSection(section.id)}>
            <span>{section.title}</span><small>{section.count}</small>
          </button>)}
        </nav>}
        {visibleSections.map(section => {
          const supplementsOpen = expanded[section.id] ?? Boolean(query.trim());
          return <section key={section.id} className="knowledge-document-section" data-knowledge-document-section={section.id}>
            <header><h2>{section.title}</h2><span className="knowledge-document-section-count">{section.count}</span></header>
            {section.summary && <p className="knowledge-document-section-summary">{section.summary}</p>}
            {entries(section.documents)}
            {section.supplementary.length > 0 && <div className="knowledge-document-supplementary">
              <button type="button" className="knowledge-document-supplementary-toggle" data-knowledge-supplementary={section.id}
                aria-expanded={supplementsOpen} onClick={() => setExpanded(previous => ({ ...previous, [section.id]: !supplementsOpen }))}>
                {supplementsOpen ? <DownOutlined /> : <RightOutlined />}<span>补充阅读</span><small>{section.supplementary.length}</small>
              </button>
              {supplementsOpen && entries(section.supplementary)}
            </div>}
          </section>;
        })}
      </div>
        : !catalog.error && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() ? "没有匹配文档，试试其他关键词。" : "当前范围没有可阅读的普通文档。"} />}
    </>}
  </section>;
}
