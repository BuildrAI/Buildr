import { Button, Empty, Input, Tabs } from "antd";
import {
  ArrowRightOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { KnowledgeIndex } from "../api/knowledge-api";
import { knowledgeEntries, type KnowledgeCategory } from "../knowledge-catalog";
type Props = {
  index: KnowledgeIndex | null;
  category: KnowledgeCategory;
  query: string;
  onFilter: (category: KnowledgeCategory, query: string) => void;
  onOpen: (id: string) => void;
  onConstruct: (kind: "construct" | "diagram") => void;
};
const groups = [
  { key: "documents", label: "架构知识", icon: <FileTextOutlined /> },
  { key: "diagrams", label: "技术图", icon: <ApartmentOutlined /> },
  { key: "maps", label: "代码地图", icon: <FolderOpenOutlined /> },
];
export function KnowledgeCatalog({
  index,
  category,
  query,
  onFilter,
  onOpen,
  onConstruct,
}: Props) {
  const entries = knowledgeEntries(index, category, query);
  return (
    <section className="knowledge-catalog">
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
        {category !== "maps" && (
          <Button
            type="primary"
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
        {entries.length} 项{query.trim() ? "匹配结果" : "内容"}
      </div>
      {entries.length ? (
        <div className="knowledge-catalog-list">
          {entries.map((a) => (
            <button
              key={a.id}
              className="knowledge-entry"
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
    </section>
  );
}
