import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Empty, Input, Spin } from "antd";
import { DownOutlined, FileTextOutlined, FolderOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { MarkdownHost } from "../../../components/MarkdownHost";
import { knowledgeApi, type KnowledgeDocument, type KnowledgeDocumentResponse, type KnowledgeDocumentsResponse, type KnowledgeScope } from "../api/knowledge-api";
import { knowledgeDocumentTree, linkedKnowledgeDocument, type KnowledgeDocumentNode } from "../knowledge-documents";
import "./knowledge-documents.css";

type Props = {
  scope: KnowledgeScope;
  workspaceId: string;
  documentId?: string | null;
  query: string;
  refresh: number;
  active?: boolean;
  onQuery: (value: string) => void;
  onOpen: (id: string | null, title?: string) => void;
  onArtifact: (id: string) => void;
  onLoadingChange?: (value: boolean) => void;
  onTitleChange?: (value: string) => void;
};

/** File discovery and ordinary Markdown reading shared by the full page and side reader. */
export function KnowledgeDocuments({ scope, workspaceId, documentId, query, refresh, active = true, onQuery, onOpen, onArtifact, onLoadingChange, onTitleChange }: Props) {
  const identity = `${workspaceId}:${scope.kind}:${scope.id}`;
  const [catalog, setCatalog] = useState<{ identity: string; data: KnowledgeDocumentsResponse | null; loading: boolean; error: string }>({ identity, data: null, loading: true, error: "" });
  const [reading, setReading] = useState<{ key: string; data: KnowledgeDocumentResponse | null; loading: boolean; error: string }>({ key: "", data: null, loading: false, error: "" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  useEffect(() => { setExpanded({}); }, [identity, query]);
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
  useEffect(() => { if (active) callbacks.current.onTitleChange?.(current?.document.title || "文档目录"); }, [active, current?.document.title, documentId]);
  const tree = useMemo(() => knowledgeDocumentTree(documents, query), [data, query]);
  const matchingCount = tree.reduce((count, node) => count + node.count, 0);
  const open = (document: KnowledgeDocument) => document.artifactId ? onArtifact(document.artifactId) : onOpen(document.id, document.title);
  const branch = (nodes: KnowledgeDocumentNode[], depth = 0): ReactNode => <ul>
    {nodes.map(node => node.document ? <li key={node.key}>
      <button type="button" className="knowledge-document-entry" data-knowledge-document={node.document.id} onClick={() => open(node.document!)}>
        <FileTextOutlined /><span><strong>{node.title}</strong><small>{node.document.path.split("/").at(-1)}</small></span>
      </button>
    </li> : <li key={node.key}>
      <button type="button" className="knowledge-document-folder" data-knowledge-document-folder={node.key}
        aria-expanded={expanded[node.key] ?? (Boolean(query.trim()) || depth < 2)}
        onClick={() => setExpanded(previous => ({ ...previous, [node.key]: !(previous[node.key] ?? (Boolean(query.trim()) || depth < 2)) }))}>
        {(expanded[node.key] ?? (Boolean(query.trim()) || depth < 2)) ? <DownOutlined /> : <RightOutlined />}<FolderOutlined /><span>{node.title}</span><small>{node.count}</small>
      </button>
      {(expanded[node.key] ?? (Boolean(query.trim()) || depth < 2)) && branch(node.children, depth + 1)}
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
      <Input prefix={<SearchOutlined />} value={query} allowClear aria-label="检索文档目录" placeholder="检索文档标题或文件路径" onChange={event => onQuery(event.target.value)} />
      <p className="knowledge-documents-description">按实际文件查看说明、指南与参考。规范、技能、规则和生成文件不计入此目录。</p>
      <p className="knowledge-results-count" aria-live="polite">{loading ? "正在读取文档目录…" : !data ? "文档数量暂不可用" : `${catalog.error ? "上次读取" : data.truncated ? "已发现" : "共"} ${data.totalCount} 份文档${query.trim() ? ` · 匹配 ${matchingCount} 份` : ""}`}</p>
      {catalog.error && <Alert type="error" message={catalog.error} />}
      {data?.truncated && <Alert type="warning" message="目录未完整读取，当前数量仅为已发现文档。" />}
      {data?.diagnostics.map(message => <Alert key={message} type="warning" message={message} />)}
      {loading && !data ? <Spin /> : tree.length ? <nav className="knowledge-document-tree" aria-label="文档目录树">{branch(tree)}</nav>
        : !catalog.error && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() ? "没有匹配文档，试试其他关键词。" : "当前范围没有可阅读的普通文档。"} />}
    </>}
  </section>;
}
