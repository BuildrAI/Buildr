import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Empty, Modal, Space, Spin } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { RefreshButton } from '../../../components/RefreshButton';
import { useResourcePreview } from '../../../app/resource-preview';
import { workspaceHref } from '../../../lib/labels';
import type { KnowledgeResponse, KnowledgeScope } from '../api/knowledge-api';
import type { KnowledgeCategory } from '../knowledge-catalog';
import type { KnowledgeActionMode } from '../knowledge-request';
import { resolveKnowledgePath } from '../knowledge-navigation';
import { useCompleteKnowledgeReading } from '../useCompleteKnowledgeReading';
import { useKnowledgeCatalog } from '../useKnowledgeCatalog';
import { useKnowledgeNavigation } from '../useKnowledgeNavigation';
import { knowledgeReadingTopics, knowledgeSelectedTopic, knowledgeTopicArtifacts } from '../knowledge-topics';
import { KnowledgeArtifactReader } from './KnowledgeArtifactReader';
import { KnowledgeCatalog } from './KnowledgeCatalog';
import { KnowledgeSource } from './KnowledgeSource';
import { KnowledgePreviewNotice } from './KnowledgePreviewNotice';
import { KnowledgeTopicNavigation } from './KnowledgeTopicNavigation';
import { KnowledgeTopicStart } from './KnowledgeTopicStart';
import { KnowledgeTopicTabs } from './KnowledgeTopicTabs';
import { KnowledgeTopicChildren } from './KnowledgeTopicChildren';
import { KnowledgeInitialize } from './KnowledgeInitialize';
import { canInitializeKnowledge, knowledgeInitializationContext } from '../knowledge-initialize';
import '../knowledge.css';
import './knowledge-browser.css';

type Target = { kind: 'catalog' | 'artifact' | 'object' | 'source'; id?: string; title?: string; description?: string; scope?: KnowledgeScope; browseAll?: boolean };
type Entry = Target & { key: number; scrollTop: number; refresh: number; loading: boolean };
type Props = {
  workspaceId: string;
  scope: KnowledgeScope;
  initialArtifactId?: string;
  initialObjectId?: string;
  initialSourceId?: string;
  sourceDescription?: string;
  refresh?: number;
  onBack?: () => void;
  backLabel?: string;
  onTitleChange?: (title: string) => void;
  onObserved?: (data: KnowledgeResponse) => void;
};

/** A knowledge reading surface shared by service details and related article material. */
export function KnowledgeBrowser(props: Props) {
  return <KnowledgeBrowserContent key={JSON.stringify([props.workspaceId, props.scope, props.initialArtifactId, props.initialObjectId, props.initialSourceId])} {...props} />;
}

function KnowledgeBrowserContent({ workspaceId, scope, initialArtifactId, initialObjectId, initialSourceId, sourceDescription, refresh = 0, onBack, backLabel = '返回详情', onTitleChange, onObserved }: Props) {
  const initial: Target = initialSourceId ? { kind: 'source', id: initialSourceId, description: sourceDescription } : initialArtifactId ? { kind: 'artifact', id: initialArtifactId } : initialObjectId ? { kind: 'object', id: initialObjectId } : { kind: 'catalog' };
  const [history, setHistory] = useState<Entry[]>([{ ...initial, key: 0, scrollTop: 0, refresh: 0, loading: true }]);
  const serial = useRef(0), root = useRef<HTMLDivElement>(null);
  const current = history[history.length - 1];
  const titleChanged = useRef(onTitleChange);
  titleChanged.current = onTitleChange;
  useEffect(() => { if (current.title) titleChanged.current?.(current.title); }, [current.key, current.title]);
  const scrollContainer = () => root.current?.closest<HTMLElement>('.pane-body, .ant-drawer-body');
  const open = (target: Target) => {
    const currentScope = current.scope || scope, nextScope = target.scope || scope;
    if (target.kind === current.kind && target.id === current.id && target.browseAll === current.browseAll && nextScope.kind === currentScope.kind && nextScope.id === currentScope.id) return;
    const scrollTop = scrollContainer()?.scrollTop || 0;
    setHistory(items => [...items.map(item => item.key === current.key ? { ...item, scrollTop } : item), { ...target, key: ++serial.current, scrollTop: 0, refresh: 0, loading: true }]);
  };
  const back = () => {
    if (history.length > 1) setHistory(items => items.slice(0, -1));
    else onBack?.();
  };
  const setTitle = (key: number, title: string) => setHistory(items => items.some(item => item.key === key && item.title !== title) ? items.map(item => item.key === key ? { ...item, title } : item) : items);
  const setLoading = (key: number, loading: boolean) => setHistory(items => items.some(item => item.key === key && item.loading !== loading) ? items.map(item => item.key === key ? { ...item, loading } : item) : items);
  const setDefaultTopic = (key: number, id: string, title: string) => setHistory(items => items.map(item => item.key === key && item.kind === 'catalog' && !item.browseAll ? { ...item, kind: 'object', id, title, loading: true } : item));
  const refreshEntry = (key: number) => setHistory(items => items.map(item => item.key === key ? { ...item, refresh: item.refresh + 1, loading: true } : item));
  return <div ref={root} className="knowledge-browser" data-knowledge-browser={`${scope.kind}:${scope.id}`}>
    <div className="knowledge-browser-toolbar">
      {(history.length > 1 || onBack) && <Button type="text" onClick={back}>← {history.length > 1 ? `返回${history[history.length - 2].title || '上一级'}` : backLabel}</Button>}
      <RefreshButton size="small" label="刷新当前知识" loading={current.loading} onClick={() => refreshEntry(current.key)} />
    </div>
    {history.map(entry => <div key={entry.key} hidden={entry.key !== current.key}>
      <KnowledgeBrowserView entry={entry} refresh={entry.refresh + refresh} active={entry.key === current.key} workspaceId={workspaceId} scope={entry.scope || scope} onOpen={open} onTitle={setTitle} onDefault={setDefaultTopic} onLoadingChange={setLoading} onRefresh={() => refreshEntry(entry.key)} onObserved={entry.key === 0 ? onObserved : undefined} />
    </div>)}
  </div>;
}

type ViewProps = { entry: Entry; refresh: number; active: boolean; workspaceId: string; scope: KnowledgeScope; onOpen: (target: Target) => void; onTitle: (key: number, title: string) => void; onDefault: (key: number, id: string, title: string) => void; onLoadingChange: (key: number, loading: boolean) => void; onRefresh: () => void; onObserved?: (data: KnowledgeResponse) => void };
function KnowledgeBrowserView({ entry, refresh, active, workspaceId, scope, onOpen, onTitle, onDefault, onLoadingChange, onRefresh, onObserved }: ViewProps) {
  const isCatalog = entry.kind === 'catalog';
  const [category, setCategory] = useState<KnowledgeCategory>('documents'), [query, setQuery] = useState('');
  const part = isCatalog ? undefined : entry.kind === 'artifact' ? 'artifacts' : entry.kind === 'source' ? 'sources' : 'objects';
  const result = useCompleteKnowledgeReading(workspaceId, scope, part, entry.id, refresh, !isCatalog);
  const { data, sourceReading } = result;
  const readingData = entry.kind === 'source' ? sourceReading?.data : data;
  const index = readingData?.index || null, readingScope = sourceReading?.scope || scope;
  const navigation = useKnowledgeNavigation(workspaceId, readingScope, refresh, active);
  // Skill references narrow their link index to that skill; retain the owning scope's topic tree.
  const topicIndex = entry.kind === 'source' && data?.observations.find(item => item.id === entry.id)?.kind === 'skill' ? data.index : readingData ? readingData.index : data?.index;
  const topics = knowledgeReadingTopics(topicIndex, navigation.data?.topics || []);
  const showCatalog = isCatalog && (Boolean(entry.browseAll) || (!navigation.loading && !topics.length));
  const catalog = useKnowledgeCatalog({ workspaceId, scope, category, query, refresh, enabled: showCatalog && active });
  const needsInitialize = canInitializeKnowledge(navigation, readingData || data, catalog.data);
  const pageScope = data?.scope || catalog.data?.scope || navigation.data?.scope;
  const loading = isCatalog ? showCatalog ? catalog.loading : navigation.loading : result.loading;
  const [notice, setNotice] = useState(''), [choices, setChoices] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null), callbacks = useRef({ onOpen, onTitle, onDefault, onObserved, onLoadingChange });
  callbacks.current = { onOpen, onTitle, onDefault, onObserved, onLoadingChange };
  useEffect(() => {
    if (!active || !isCatalog || entry.browseAll || navigation.loading) return;
    const initialTopic = topics.find(topic => topic.id === navigation.data?.entryObject);
    if (initialTopic) callbacks.current.onDefault(entry.key, initialTopic.id, initialTopic.title);
  }, [active, isCatalog, entry.browseAll, entry.key, navigation.data, navigation.loading]);
  useLayoutEffect(() => { callbacks.current.onLoadingChange(entry.key, loading); }, [entry.key, loading]);
  const { openAgentAction } = useAppShell(), previews = useResourcePreview(), location = useLocation();
  const artifact = data?.artifacts?.find(item => item.id === entry.id);
  const source = data?.observations.find(item => item.id === entry.id);
  const sourceMeta = data?.index?.sources.find(item => item.id === entry.id);
  const object = index?.objects.find(item => item.id === entry.id);
  const selectedTopic = knowledgeSelectedTopic(topics, entry.kind === 'object' ? entry.id : null, artifact?.objects || sourceReading?.artifact.objects);
  const title = isCatalog ? `${pageScope?.title ? `${pageScope.title} · ` : ''}${scope.kind === 'service' ? '服务知识' : '项目知识'}` : artifact?.title || sourceMeta?.title || object?.title || entry.title || '相关知识';
  useEffect(() => { if (pageScope) callbacks.current.onTitle(entry.key, title); }, [pageScope, title, entry.key]);
  useEffect(() => { if (data) callbacks.current.onObserved?.(data); }, [data]);
  const catalogViewKey = JSON.stringify([category, query, refresh]);
  const previousCatalogView = useRef(catalogViewKey), resetCatalogScroll = useRef(false);
  if (previousCatalogView.current !== catalogViewKey) {
    previousCatalogView.current = catalogViewKey;
    resetCatalogScroll.current = true;
  }
  useLayoutEffect(() => {
    if (!active || loading) return;
    const top = isCatalog && resetCatalogScroll.current ? 0 : entry.scrollTop;
    resetCatalogScroll.current = false;
    const frame = requestAnimationFrame(() => root.current?.closest<HTMLElement>('.pane-body, .ant-drawer-body')?.scrollTo({ top }));
    return () => cancelAnimationFrame(frame);
  }, [active, loading, entry.key, catalogViewKey]);
  const openArtifact = (id: string) => {
    const target = isCatalog ? catalog.data?.items.find(item => item.id === id) : index?.artifacts.find(item => item.id === id);
    if (target) callbacks.current.onOpen({ kind: 'artifact', id, title: target.title, scope: readingScope });
  };
  const openSource = (id: string, description?: string) => {
    const target = index?.sources.find(item => item.id === id);
    if (!target) return;
    if (target.kind === 'skill' && target.skillId && target.path === 'SKILL.md' && previews?.open(location.pathname, workspaceHref(workspaceId, `/skills/${encodeURIComponent(target.skillId)}`))) return;
    callbacks.current.onOpen({ kind: 'source', id, title: target.title, description, scope: readingScope });
  };
  const follow = (base: string, href: string, file = false, description?: string) => {
    const path = resolveKnowledgePath(base, href);
    const sources = path ? index?.sources.filter(item => (item.link || item.path) === path) || [] : [];
    const target = path && index?.artifacts.find(item => item.path === path);
    if (file && sources.length === 1) openSource(sources[0].id, description);
    else if (target) openArtifact(target.id);
    else if (sources.length === 1) openSource(sources[0].id, description);
    else if (sources.length > 1) setChoices(sources.map(item => item.id));
    else setNotice('该文件尚未登记阅读关联，请在完善内容时补齐。');
  };
  const construct = (mode: KnowledgeActionMode) => {
    if (!pageScope) return;
    if (mode === 'initialize' && navigation.data) {
      openAgentAction('knowledge', knowledgeInitializationContext(navigation.data, workspaceHref(workspaceId, `/knowledge/${readingScope.kind}/${encodeURIComponent(readingScope.id)}`)));
      return;
    }
    const search = new URLSearchParams();
    if (entry.kind === 'artifact' && entry.id) search.set('artifact', entry.id);
    if (entry.kind === 'object' && entry.id) search.set('object', entry.id);
    openAgentAction('knowledge', {
      mode, readingPath: workspaceHref(workspaceId, `/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}`) + (search.size ? `?${search}` : ''),
      topic: title, scope: pageScope, objectId: entry.kind === 'object' ? entry.id : undefined,
      artifactId: artifact?.id, artifactKind: artifact?.kind, indexRevision: isCatalog ? catalog.data?.revision || navigation.data?.revision : data?.revision,
      articles: (isCatalog ? catalog.data?.items : index?.artifacts)?.filter(item => item.kind === 'document').map(item => ({ id: item.id, title: item.title, path: item.path, objects: item.objects })),
      observations: data?.observations.map(item => ({ id: item.id, digest: item.digest, status: item.status })),
      artifacts: data?.artifacts?.map(item => ({ id: item.id, digest: item.digest })),
      selectedSource: entry.kind === 'source' ? entry.id : undefined,
      sourceReading: sourceReading ? {
        scope: sourceReading.data.scope,
        artifactId: sourceReading.artifact.id,
        path: sourceReading.artifact.path,
        revision: sourceReading.data.revision,
        observations: sourceReading.data.observations.map(item => ({ id: item.id, digest: item.digest, status: item.status })),
      } : undefined,
    });
  };
  const reader = {
    index, workspaceId, scope: readingScope,
    onLink: (base: string, href: string) => follow(base, href),
    onFile: (base: string, href: string, description?: string) => follow(base, href, true, description),
    onSource: openSource, onOpen: openArtifact,
    onObject: (id: string) => { const target = index?.objects.find(item => item.id === id); if (target) callbacks.current.onOpen({ kind: 'object', id, title: target.title, scope: readingScope }); },
  };
  const shownArtifacts = entry.kind === 'artifact' ? artifact ? [artifact] : [] : knowledgeTopicArtifacts(data?.artifacts || [], category);
  const unavailableSources = data?.observations.filter(item => ['missing', 'unreadable'].includes(item.status)) || [];
  const openTopic = (id: string) => callbacks.current.onOpen({ kind: 'object', id, title: topics.find(topic => topic.id === id)?.title, scope: readingScope });
  return <div ref={root} className="knowledge-side-reader knowledge-browser-view" data-knowledge-view={entry.kind}>
    <KnowledgeTopicNavigation topics={topics} selected={selectedTopic} allSelected={showCatalog}
      loading={navigation.loading} error={navigation.error} onRetry={onRefresh} onSelect={openTopic}
      onAll={() => callbacks.current.onOpen({ kind: 'catalog', browseAll: true, scope: readingScope })}>
    {!isCatalog && result.loading ? <Spin /> : !isCatalog && result.error ? <Alert type="error" message={result.error} /> : (isCatalog || data) && <>
      <header className="knowledge-browser-heading"><div><p className="eyebrow">{scope.kind === 'service' ? '服务知识' : '项目知识'}</p><h2>{title}</h2></div>{entry.kind !== 'catalog' && <Space wrap>
        <Button size="small" disabled={!pageScope} onClick={() => construct('ask')}>追问当前内容</Button>
        <Button size="small" disabled={!pageScope} onClick={() => construct('improve')}>完善当前内容</Button>
      </Space>}</header>
      <KnowledgePreviewNotice sourceDirectory={sourceReading?.data.scope.directory || pageScope?.directory} />
      {needsInitialize && <KnowledgeInitialize kind={readingScope.kind} onInitialize={() => construct('initialize')} onExplore={() => construct('explore')} />}
      {notice && <Alert type="info" closable message={notice} onClose={() => setNotice('')} />}
      {result.relatedErrors.map(error => <Alert key={error} type="warning" message={error} />)}
      {showCatalog && !needsInitialize ? <KnowledgeCatalog
        entries={catalog.data?.items || []} matchingCount={catalog.data?.matchingCount || 0}
        loading={catalog.loading} loadingMore={catalog.loadingMore} hasMore={catalog.data?.hasMore || false}
        error={catalog.error} loadMoreError={catalog.loadMoreError} changed={catalog.changed} canConstruct={Boolean(pageScope)}
        category={category} query={query} onFilter={(view, text) => { setCategory(view); setQuery(text); }}
        onOpen={openArtifact} onConstruct={construct} onLoadMore={catalog.loadMore} onRetry={catalog.retryLoadMore} onRefresh={onRefresh}
      /> : isCatalog ? navigation.loading ? <Spin /> : !needsInitialize && <KnowledgeTopicStart topics={topics} onSelect={openTopic}
        onExplore={() => construct('explore')} onConstruct={() => construct('construct')} /> : entry.kind === 'source' ? <>
        <section className="knowledge-file-summary"><h3>文件说明</h3><p>{sourceMeta?.summary || entry.description || '这份来源尚未提供总体说明，可根据源文件补充。'}</p></section>
        <p className="knowledge-source-location">{source?.location?.title || source?.skill?.id || data?.scope.title} · {source?.path || sourceMeta?.path}</p>
        {source?.content != null ? <KnowledgeSource sourceId={entry.id || ''} content={source.content} path={source.path || ''} line={sourceMeta?.line} reading={{ ...reader, artifacts: sourceReading?.data.artifacts || [], artifact: sourceReading?.artifact || { id: `source:${entry.id}`, title, kind: 'document', path: source.path || '', objects: [], sources: [], content: source.content, digest: source.digest, status: source.status, diagnostic: source.diagnostic, diagramSize: null, graph: null } }} /> : <Alert type="warning" message={source?.diagnostic || '文件不可读'} />}
      </> : <section data-knowledge-topic-content={entry.kind === 'object' ? entry.id : undefined}>
        {object?.summary && <p className="knowledge-summary">{object.summary}</p>}
        {entry.kind === 'object' && entry.id && <KnowledgeTopicChildren topics={topics} parent={entry.id} onSelect={openTopic} />}
        {entry.kind === 'object' && <KnowledgeTopicTabs category={category} onChange={setCategory} />}
        {unavailableSources.length > 0 && <Alert type="warning" data-knowledge-unavailable-sources message="部分来源缺失或暂不可读，其余内容仍可查看。" description={<Space wrap>{unavailableSources.map(item => <Button key={item.id} size="small" type="link" onClick={() => openSource(item.id)}>{index?.sources.find(source => source.id === item.id)?.title || item.id} · {item.status === 'missing' ? '缺失' : '不可读'}</Button>)}</Space>} />}
        {shownArtifacts.map(item => <KnowledgeArtifactReader key={item.id} {...reader} showTitle={entry.kind !== 'artifact'} artifact={item} artifacts={data?.artifacts || []} />)}
        {!shownArtifacts.length && !needsInitialize && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这个主题下暂时没有此类资料。" />}
      </section>}
      <Modal open={choices.length > 0} title="选择对应文件" footer={null} onCancel={() => setChoices([])}>{choices.map(id => <p key={id}><Button onClick={() => { setChoices([]); openSource(id); }}>{index?.sources.find(item => item.id === id)?.title || id}</Button></p>)}</Modal>
    </>}
    </KnowledgeTopicNavigation>
  </div>;
}
