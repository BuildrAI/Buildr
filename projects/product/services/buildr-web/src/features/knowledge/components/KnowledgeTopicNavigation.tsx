import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Spin, Tabs } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { KnowledgeTopic } from "../api/knowledge-api";
import { knowledgeTopicTrail } from "../knowledge-topics";

type Props = {
  topics: KnowledgeTopic[];
  selected: string | null;
  allSelected: boolean;
  documentsSelected?: boolean;
  loading: boolean;
  error: string;
  onSelect: (id: string) => void;
  onAll: () => void;
  onTopics: () => void;
  onDocuments: () => void;
  onRetry: () => void;
  children: ReactNode;
};

export function KnowledgeTopicNavigation({ topics, selected, allSelected, documentsSelected, loading, error, onSelect, onAll, onTopics, onDocuments, onRetry, children }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const mobile = useRef<HTMLDetailsElement>(null);
  const ancestorKey = knowledgeTopicTrail(topics, selected).slice(0, -1).map(topic => topic.id).join("\0");
  useEffect(() => {
    if (ancestorKey) setExpanded(previous => ({ ...previous, ...Object.fromEntries(ancestorKey.split("\0").map(id => [id, true])) }));
  }, [ancestorKey]);
  const choose = (id: string | null) => {
    if (mobile.current) mobile.current.open = false;
    if (id) onSelect(id); else onAll();
  };
  const branch = (parent: string | null): ReactNode => <ul>
    {topics.filter(topic => (topic.parent || null) === parent).map(topic => {
      const hasChildren = topics.some(child => child.parent === topic.id);
      const open = expanded[topic.id] ?? !topic.parent;
      return <li key={topic.id}>
        <div className="knowledge-topic-row">
          {hasChildren ? <button type="button" className="knowledge-topic-toggle" data-knowledge-topic-toggle={topic.id}
            aria-label={`${open ? "收起" : "展开"}${topic.title}`} aria-expanded={open}
            onClick={() => setExpanded(previous => ({ ...previous, [topic.id]: !open }))}>
            {open ? <DownOutlined /> : <RightOutlined />}
          </button> : <span className="knowledge-topic-toggle-spacer" />}
          <button type="button" data-knowledge-topic={topic.id} aria-current={selected === topic.id ? "page" : undefined}
            className="knowledge-topic-link" onClick={() => choose(topic.id)}>{topic.title}</button>
        </div>
        {hasChildren && open && branch(topic.id)}
      </li>;
    })}
  </ul>;
  const allTopics = () => <button type="button" className="knowledge-topic-all" data-knowledge-all aria-current={allSelected ? "page" : undefined} onClick={() => choose(null)}>全部主题资料</button>;
  const contents = () => <nav aria-label="知识主题目录" data-knowledge-navigation>
    {loading && !topics.length ? <Spin size="small" /> : branch(null)}
    {error && <Alert type="warning" message="主题目录暂不可读" action={<Button size="small" onClick={onRetry}>重试</Button>} />}
    {!loading && !error && !topics.length && <p className="knowledge-topic-empty">尚未整理主题</p>}
  </nav>;
  return <div className="knowledge-navigation-container">
    <Tabs className="knowledge-reading-tabs" activeKey={documentsSelected ? "documents" : "topics"}
      items={[
        { key: "topics", label: <span data-knowledge-topics-entry>主题阅读</span> },
        { key: "documents", label: <span data-knowledge-documents-entry>文档目录</span> },
      ]}
      onChange={key => { if (mobile.current) mobile.current.open = false; if (key === "documents") onDocuments(); else onTopics(); }} />
    <div className={`knowledge-navigation-layout${documentsSelected ? " knowledge-navigation-documents" : ""}`} data-knowledge-reading-mode={documentsSelected ? "documents" : "topics"}>
      {!documentsSelected && <aside className="knowledge-topic-desktop">{allTopics()}<p className="knowledge-topic-label">主题目录</p>{contents()}</aside>}
      {!documentsSelected && <div className="knowledge-topic-mobile">{allTopics()}<details ref={mobile} data-knowledge-topic-disclosure>
        <summary>主题目录{selected ? ` · ${topics.find(topic => topic.id === selected)?.title || ""}` : ""}</summary>
        {contents()}
      </details></div>}
      <div className="knowledge-navigation-content">{children}</div>
    </div>
  </div>;
}
