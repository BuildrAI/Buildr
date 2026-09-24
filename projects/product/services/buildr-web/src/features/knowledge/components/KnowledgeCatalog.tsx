import { useEffect, useRef } from "react";
import { Alert, Button, Empty, Input, Spin, Tabs } from "antd";
import {
  ArrowRightOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { KnowledgeCatalogItem } from "../api/knowledge-api";
import type { KnowledgeActionMode } from "../knowledge-request";
import { knowledgeCatalogPrefetchId, type KnowledgeCategory } from "../knowledge-catalog";
type Props = {
  entries: KnowledgeCatalogItem[];
  matchingCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  loadMoreError: string;
  changed: boolean;
  canConstruct: boolean;
  category: KnowledgeCategory;
  query: string;
  onFilter: (category: KnowledgeCategory, query: string) => void;
  onOpen: (id: string) => void;
  onConstruct: (kind: KnowledgeActionMode) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onRefresh: () => void;
};
const groups = [
  { key: "documents", label: "说明文档", icon: <FileTextOutlined /> },
  { key: "diagrams", label: "技术图", icon: <ApartmentOutlined /> },
  { key: "maps", label: "代码地图", icon: <FolderOpenOutlined /> },
];
export function KnowledgeCatalog({
  entries,
  matchingCount,
  loading,
  loadingMore,
  hasMore,
  error,
  loadMoreError,
  changed,
  canConstruct,
  category,
  query,
  onFilter,
  onOpen,
  onConstruct,
  onLoadMore,
  onRetry,
  onRefresh,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const prefetchId = knowledgeCatalogPrefetchId(entries, hasMore);
  useEffect(() => {
    if (!prefetchId || loading || loadingMore || loadMoreError || typeof IntersectionObserver === "undefined") return;
    const row = root.current?.querySelector<HTMLElement>('[data-knowledge-prefetch="true"]');
    const host = root.current?.closest<HTMLElement>(".pane-body");
    if (!row || !host) return;
    const observer = new IntersectionObserver((items) => {
      if (items.some((item) => item.isIntersecting)) onLoadMore();
    }, { root: host, threshold: 0.1 });
    observer.observe(row);
    return () => observer.disconnect();
  }, [prefetchId, loading, loadingMore, loadMoreError, onLoadMore]);
  return (
    <section ref={root} className="knowledge-catalog">
      <Tabs
        activeKey={category}
        items={groups}
        onChange={(key) => onFilter(key as KnowledgeCategory, query)}
      />
      <div className="knowledge-catalog-tools">
        <Input
          prefix={<SearchOutlined />}
          value={query}
          allowClear
          aria-label="检索知识"
          placeholder="检索标题、主题说明或文件路径"
          onChange={(e) => onFilter(category, e.target.value)}
        />
        <Button disabled={!canConstruct} onClick={() => onConstruct("explore")}>
          了解与探索
        </Button>
        {category !== "maps" && (
          <Button
            type="primary"
            disabled={!canConstruct}
            icon={<PlusOutlined />}
            onClick={() =>
              onConstruct(category === "diagrams" ? "diagram" : "construct")
            }
          >
            {category === "diagrams" ? "构建技术图" : "构建架构知识"}
          </Button>
        )}
      </div>
      <p className="knowledge-catalog-caption">
        {category === "maps"
          ? "这里收录专题代码地图；项目全景地图尚未建设。"
          : category === "diagrams"
            ? "从关系、过程和协作理解系统，也可以单独提出一个图示主题。"
            : "从一个问题开始，理解职责、关键协作、约束与修改影响。"}
      </p>
      <div aria-live="polite" className="knowledge-results-count">
        {loading ? "正在读取…" : `已加载 ${entries.length} / 共 ${matchingCount} 项${query.trim() ? "匹配结果" : "内容"}`}
      </div>
      {error ? <Alert type="error" message={error} action={<Button onClick={onRefresh}>重新读取</Button>} /> : loading ? <Spin /> : entries.length ? (
        <div className="knowledge-catalog-list">
          {entries.map((a) => (
            <button
              key={a.id}
              type="button"
              className="knowledge-entry"
              data-knowledge-entry={a.id}
              data-knowledge-prefetch={a.id === prefetchId ? "true" : undefined}
              onClick={() => onOpen(a.id)}
            >
              <span className="knowledge-entry-heading">
                <strong>{a.title}</strong>
                <ArrowRightOutlined />
              </span>
              <span>{a.summary || "查看当前范围内的这份成果及其关联。"}</span>
              <small>{a.path}</small>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            query.trim()
              ? "没有匹配内容，试试其他关键词。"
              : "当前分类尚未建设内容。"
          }
        >
          {query.trim() && (
            <Button onClick={() => onFilter(category, "")}>清除检索</Button>
          )}
        </Empty>
      )}
      <div className="knowledge-load-more" aria-live="polite">
        {loadingMore ? "正在继续读取…" : null}
        {loadMoreError ? <Alert type="warning" message={loadMoreError} action={changed
          ? <Button onClick={onRefresh}>刷新目录</Button>
          : <Button onClick={onRetry}>继续读取失败，重试</Button>} /> : null}
        {hasMore && !loading && !loadingMore && !loadMoreError ? <Button onClick={onLoadMore}>查看更多内容</Button> : null}
      </div>
    </section>
  );
}
