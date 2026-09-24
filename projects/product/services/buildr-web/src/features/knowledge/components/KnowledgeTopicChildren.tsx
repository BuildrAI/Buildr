import type { KnowledgeTopic } from "../api/knowledge-api";

export function KnowledgeTopicChildren({ topics, parent, onSelect }: { topics: KnowledgeTopic[]; parent: string; onSelect: (id: string) => void }) {
  const children = topics.filter(topic => topic.parent === parent);
  if (!children.length) return null;
  return <section className="knowledge-topic-children" aria-label="子主题">
    {children.map(topic => <button type="button" key={topic.id} data-knowledge-subtopic={topic.id} onClick={() => onSelect(topic.id)}>
      <strong>{topic.title}</strong><span>{topic.summary}</span>
    </button>)}
  </section>;
}
