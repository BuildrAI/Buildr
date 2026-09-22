import { Button, Space } from "antd";
import type { KnowledgeTopic } from "../api/knowledge-api";

export function KnowledgeTopicStart({ topics, onSelect, onExplore, onConstruct }: {
  topics: KnowledgeTopic[];
  onSelect: (id: string) => void;
  onExplore: () => void;
  onConstruct: () => void;
}) {
  return <section className="knowledge-topic-start">
    <p className="knowledge-summary">从一个主题了解目标、关键过程与设计取舍，也可以直接提出问题。</p>
    <Space wrap><Button onClick={onExplore}>了解与探索</Button><Button onClick={onConstruct}>构建架构知识</Button></Space>
    <div className="knowledge-topic-start-list">{topics.filter(topic => !topic.parent).map(topic => <button type="button" key={topic.id}
      className="knowledge-entry" data-knowledge-topic-start={topic.id} onClick={() => onSelect(topic.id)}>
      <strong>{topic.title}</strong><span>{topic.summary}</span>
    </button>)}</div>
  </section>;
}
