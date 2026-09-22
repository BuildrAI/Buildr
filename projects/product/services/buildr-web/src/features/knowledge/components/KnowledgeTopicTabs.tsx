import { Tabs } from "antd";
import type { KnowledgeCategory } from "../knowledge-catalog";

export function KnowledgeTopicTabs({ category, onChange }: { category: KnowledgeCategory; onChange: (category: KnowledgeCategory) => void }) {
  return <Tabs activeKey={category} onChange={key => onChange(key as KnowledgeCategory)} items={[
    { key: "documents", label: "说明" },
    { key: "diagrams", label: "技术图" },
    { key: "maps", label: "代码地图" },
  ]} />;
}
