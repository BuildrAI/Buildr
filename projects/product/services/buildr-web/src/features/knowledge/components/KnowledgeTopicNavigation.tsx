import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Alert, Button, Input, Spin, Tabs } from 'antd';
import { ApartmentOutlined, DownOutlined, FileTextOutlined, FolderOpenOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { filterReadingTree, readingAncestors, readingNodeCount, type ReadingNode, type ReadingPreferences, type ReadingTarget } from '../knowledge-reader-navigation';

type Props = {
  nodes: ReadingNode[];
  selected: ReadingTarget | null;
  documentsSelected: boolean;
  preferences: ReadingPreferences;
  onPreferences: (value: ReadingPreferences) => void;
  loading: boolean;
  error: string;
  notices?: string[];
  onSelect: (target: ReadingTarget, title: string) => void;
  onTopics: () => void;
  onDocuments: () => void;
  onRetry: () => void;
  children: ReactNode;
};

/** Both reading modes share one search, hierarchy and responsive navigation surface. */
export function KnowledgeTopicNavigation({ nodes, selected, documentsSelected, preferences, onPreferences, loading, error, notices = [], onSelect, onTopics, onDocuments, onRetry, children }: Props) {
  const mobile = useRef<HTMLDetailsElement>(null);
  const { query, filter, expanded } = preferences;
  const visible = useMemo(() => filterReadingTree(nodes, query, filter), [nodes, query, filter]);
  const searching = Boolean(query.trim()) || filter !== 'all';
  const ancestors = readingAncestors(nodes, selected);
  const ancestorKey = ancestors.join('\0');
  const current = useRef({ preferences, onPreferences });
  current.current = { preferences, onPreferences };
  useEffect(() => {
    if (!ancestorKey || searching) return;
    const { preferences: saved, onPreferences: update } = current.current;
    if (ancestorKey.split('\0').some(key => !saved.expanded[key])) update({ ...saved, expanded: { ...saved.expanded, ...Object.fromEntries(ancestorKey.split('\0').map(key => [key, true])) } });
  }, [ancestorKey]);
  const choose = (node: ReadingNode) => {
    if (!node.target) return;
    if (mobile.current) mobile.current.open = false;
    onSelect(node.target, node.title);
  };
  const branch = (items: ReadingNode[]): ReactNode => <ul>{items.map(node => {
    const open = searching || expanded[node.key] === true;
    const isCurrent = Boolean(node.target && selected && node.target.kind === selected.kind && node.target.id === selected.id);
    const toggle = () => { if (!searching) onPreferences({ ...preferences, expanded: { ...expanded, [node.key]: !open } }); };
    const icon = node.type === 'diagrams' ? <ApartmentOutlined /> : node.type === 'maps' ? <FolderOpenOutlined /> : <FileTextOutlined />;
    return <li key={node.key}>
      <div className={`knowledge-topic-row${node.supplementary ? ' knowledge-reader-supplementary' : ''}`}>
        {node.children.length ? <button type="button" className="knowledge-topic-toggle" data-knowledge-topic-toggle={node.target?.kind === 'object' ? node.target.id : undefined}
          data-knowledge-branch={node.key} aria-label={`${open ? '收起' : '展开'}${node.title}`} aria-expanded={open} disabled={searching} onClick={toggle}>
          {open ? <DownOutlined /> : <RightOutlined />}
        </button> : <span className="knowledge-topic-toggle-spacer">{node.type ? icon : null}</span>}
        <button type="button" className="knowledge-topic-link" title={node.summary || node.title} aria-current={isCurrent ? 'page' : undefined}
          data-knowledge-topic={node.target?.kind === 'object' ? node.target.id : undefined}
          data-knowledge-entry={node.target?.kind === 'artifact' ? node.target.id : undefined}
          data-knowledge-document={node.documentId}
          onClick={() => node.target ? choose(node) : toggle()}>
          <span>{node.title}</span>{!node.target && <small>{readingNodeCount(node.children)}</small>}
        </button>
      </div>
      {node.children.length > 0 && open && branch(node.children)}
    </li>;
  })}</ul>;
  const tools = () => <div className="knowledge-reader-search">
    <Input prefix={<SearchOutlined />} value={query} allowClear aria-label={documentsSelected ? '检索文档目录' : '检索知识'} placeholder="搜索标题或说明" onChange={event => onPreferences({ ...preferences, query: event.target.value })} />
    <div className="knowledge-reader-filters" role="group" aria-label="内容类型">
      {([['all', '全部'], ['documents', '说明'], ['diagrams', '图示'], ['maps', '代码地图']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key}
        disabled={key !== 'all' && !filterReadingTree(nodes, '', key).length} onClick={() => onPreferences({ ...preferences, filter: key })}>{label}</button>)}
    </div>
    {filter === "maps" && <p className="knowledge-reader-hint">代码地图按专题帮助定位实现。</p>}
    <p className="knowledge-reader-count" aria-live="polite">{loading && !nodes.length ? '正在读取目录…' : `${searching ? '匹配 ' : '共 '}${readingNodeCount(visible)} ${documentsSelected ? '份文档' : '项资料'}`}</p>
  </div>;
  const contents = () => <nav aria-label={documentsSelected ? '文档目录' : '知识主题目录'} data-knowledge-navigation>
    {loading && !nodes.length ? <Spin size="small" /> : visible.length ? branch(visible) : <p className="knowledge-topic-empty">{searching ? '没有匹配内容，试试其他关键词。' : '当前没有可阅读内容。'}</p>}
    {error && <Alert type="warning" message="目录暂不可读" description={error} action={<Button size="small" onClick={onRetry}>重试</Button>} />}
    {notices.map(notice => <Alert key={notice} type="warning" message={notice} />)}
  </nav>;
  return <div className="knowledge-navigation-container">
    <Tabs className="knowledge-reading-tabs" activeKey={documentsSelected ? 'documents' : 'topics'}
      items={[{ key: 'topics', label: <span data-knowledge-topics-entry>主题阅读</span> }, { key: 'documents', label: <span data-knowledge-documents-entry>文档目录</span> }]}
      onChange={key => { if (mobile.current) mobile.current.open = false; if (key === 'documents') onDocuments(); else onTopics(); }} />
    <div className="knowledge-navigation-layout" data-knowledge-reading-mode={documentsSelected ? 'documents' : 'topics'}>
      <aside className="knowledge-topic-desktop">{tools()}{contents()}</aside>
      <div className="knowledge-topic-mobile">{tools()}<details ref={mobile} data-knowledge-topic-disclosure>
        <summary>{documentsSelected ? '文档目录' : '主题目录'}<span>展开选择内容</span></summary>{contents()}
      </details></div>
      <div className="knowledge-navigation-content">{children}</div>
    </div>
  </div>;
}
