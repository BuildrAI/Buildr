import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Spin } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { KnowledgeTopic } from "../api/knowledge-api";
import { knowledgeTopicTrail } from "../knowledge-topics";

type Props = {
  topics: KnowledgeTopic[];
  selected: string | null;
  allSelected: boolean;
  loading: boolean;
  error: string;
  onSelect: (id: string) => void;
  onAll: () => void;
  onRetry: () => void;
  children: ReactNode;
};

export function KnowledgeTopicNavigation({ topics, selected, allSelected, loading, error, onSelect, onAll, onRetry, children }: Props) {
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
  const allMaterials = () => <button type="button" className="knowledge-topic-all" data-knowledge-all aria-current={allSelected ? "page" : undefined} onClick={() => choose(null)}>全部资料</button>;
  const contents = () => <nav aria-label="知识主题目录" data-knowledge-navigation>
    {loading && !topics.length ? <Spin size="small" /> : branch(null)}
    {error && <Alert type="warning" message="主题目录暂不可读" action={<Button size="small" onClick={onRetry}>重试</Button>} />}
    {!loading && !error && !topics.length && <p className="knowledge-topic-empty">尚未整理主题</p>}
  </nav>;
  return <div className="knowledge-navigation-container">
    <div className="knowledge-navigation-layout">
      <aside className="knowledge-topic-desktop">{allMaterials()}<p className="knowledge-topic-label">主题目录</p>{contents()}</aside>
      <div className="knowledge-topic-mobile">{allMaterials()}<details ref={mobile} data-knowledge-topic-disclosure>
        <summary>主题目录{selected ? ` · ${topics.find(topic => topic.id === selected)?.title || ""}` : ""}</summary>
        {contents()}
      </details></div>
      <div className="knowledge-navigation-content">{children}</div>
    </div>
  </div>;
}
