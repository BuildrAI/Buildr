import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Empty, Modal, Space, Spin } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { RefreshButton } from '../../../components/RefreshButton';
import { useResourcePreview } from '../../../app/resource-preview';
import { workspaceHref } from '../../../lib/labels';
import type { KnowledgeResponse, KnowledgeScope, KnowledgeReference } from '../api/knowledge-api';
import { KnowledgeReferenceReader } from './KnowledgeReferenceReader';
import type { KnowledgeActionMode } from '../knowledge-request';
import { resolveKnowledgePath } from '../knowledge-navigation';
import { useCompleteKnowledgeReading } from '../useCompleteKnowledgeReading';
import { useKnowledgeNavigation } from '../useKnowledgeNavigation';
import { useKnowledgeDocuments } from '../useKnowledgeDocuments';
import { documentReadingTree, emptyReadingPreferences, topicReadingTree, type ReadingPreferences, type ReadingTarget } from '../knowledge-reader-navigation';
import { knowledgeReadingTopics, knowledgeTopicArtifacts } from '../knowledge-topics';
import { KnowledgeArtifactReader } from './KnowledgeArtifactReader';
import { KnowledgeActions } from './KnowledgeActions';
import { KnowledgeDocuments } from './KnowledgeDocuments';
import { KnowledgeSource } from './KnowledgeSource';
import { KnowledgePreviewNotice } from './KnowledgePreviewNotice';
import { KnowledgeTopicNavigation } from './KnowledgeTopicNavigation';
import { KnowledgeTopicChildren } from './KnowledgeTopicChildren';
import { KnowledgeInitialize } from './KnowledgeInitialize';
import { canInitializeKnowledge, knowledgeInitializationContext } from '../knowledge-initialize';
import '../knowledge.css';
import './knowledge-browser.css';

type Target = { kind: 'catalog' | 'documents' | 'artifact' | 'object' | 'source' | 'reference'; id?: string; title?: string; description?: string; scope?: KnowledgeScope; browseAll?: boolean; documentsMode?: boolean; query?: string; reference?: KnowledgeReference; fragment?: string };
type Entry = Target & { key: number; scrollTop: number; refresh: number; loading: boolean; preferences?: ReadingPreferences };
type Props = {
  workspaceId: string;
  scope: KnowledgeScope;
  initialArtifactId?: string;
  initialObjectId?: string;
  initialSourceId?: string;
  initialReference?: KnowledgeReference;
  initialFragment?: string;
  sourceDescription?: string;
  refresh?: number;
  onBack?: () => void;
  backLabel?: string;
  onTitleChange?: (title: string) => void;
  onObserved?: (data: KnowledgeResponse) => void;
};

/** A knowledge reading surface shared by service details and related article material. */
export function KnowledgeBrowser(props: Props) {
  return <KnowledgeBrowserContent key={JSON.stringify([props.workspaceId, props.scope, props.initialArtifactId, props.initialObjectId, props.initialSourceId, props.initialReference, props.initialFragment])} {...props} />;
}

function KnowledgeBrowserContent({ workspaceId, scope, initialArtifactId, initialObjectId, initialSourceId, initialReference, initialFragment, sourceDescription, refresh = 0, onBack, backLabel = '返回详情', onTitleChange, onObserved }: Props) {
  const initial: Target = initialReference ? { kind: 'reference', id: JSON.stringify(initialReference), reference: initialReference, fragment: initialFragment, title: initialReference.links.at(-1)?.split(/[?#]/)[0].split('/').at(-1) } : initialSourceId ? { kind: 'source', id: initialSourceId, description: sourceDescription } : initialArtifactId ? { kind: 'artifact', id: initialArtifactId } : initialObjectId ? { kind: 'object', id: initialObjectId } : { kind: 'catalog' };
  const [history, setHistory] = useState<Entry[]>([{ ...initial, key: 0, scrollTop: 0, refresh: 0, loading: true }]);
  const serial = useRef(0), root = useRef<HTMLDivElement>(null);
  const current = history[history.length - 1];
  const [preferences, setPreferences] = useState<Record<string, ReadingPreferences>>({});
  const modeEntries = useRef<Record<string, Entry>>({});
  const preferenceKey = (entry: Target) => JSON.stringify([entry.scope || scope, entry.kind === 'documents' || entry.documentsMode ? 'documents' : 'topics']);
  useEffect(() => { modeEntries.current[preferenceKey(current)] = current; }, [current]);
  const switchMode = (documents: boolean, targetScope: KnowledgeScope) => {
    const fallback: Target = { kind: documents ? 'documents' : 'catalog', scope: targetScope };
    const saved = modeEntries.current[preferenceKey(fallback)];
    open(saved || fallback, Boolean(saved));
  };
  const titleChanged = useRef(onTitleChange);
  titleChanged.current = onTitleChange;
  useEffect(() => { if (current.title) titleChanged.current?.(current.title); }, [current.key, current.title]);
  const scrollContainer = () => root.current?.closest<HTMLElement>('.pane-body, .ant-drawer-body');
  const open = (target: Target, restore = false) => {
    const currentScope = current.scope || scope, nextScope = target.scope || scope;
    if (target.kind === current.kind && target.id === current.id && target.browseAll === current.browseAll && Boolean(target.documentsMode) === Boolean(current.documentsMode) && nextScope.kind === currentScope.kind && nextScope.id === currentScope.id) return;
    const scrollTop = scrollContainer()?.scrollTop || 0;
    const previous = { ...current, scrollTop, preferences: preferences[preferenceKey(current)] || emptyReadingPreferences() };
    modeEntries.current[preferenceKey(current)] = previous;
    const saved = restore ? target as Entry : null;
    if (saved?.preferences) setPreferences(values => ({ ...values, [preferenceKey(saved)]: saved.preferences! }));
    setHistory(items => [...items.map(item => item.key === current.key ? previous : item), { ...target, key: ++serial.current, scrollTop: saved?.scrollTop || 0, refresh: 0, loading: true }]);
  };
  const back = () => {
    if (history.length > 1) {
      const previous = history[history.length - 2];
      modeEntries.current[preferenceKey(current)] = { ...current, scrollTop: scrollContainer()?.scrollTop || 0, preferences: preferences[preferenceKey(current)] || emptyReadingPreferences() };
      if (previous.preferences) setPreferences(values => ({ ...values, [preferenceKey(previous)]: previous.preferences! }));
      setHistory(items => items.slice(0, -1));
    }
    else onBack?.();
  };
  const setTitle = (key: number, title: string) => setHistory(items => items.some(item => item.key === key && item.title !== title) ? items.map(item => item.key === key ? { ...item, title } : item) : items);
  const setLoading = (key: number, loading: boolean) => setHistory(items => items.some(item => item.key === key && item.loading !== loading) ? items.map(item => item.key === key ? { ...item, loading } : item) : items);
  const setDefault = (key: number, target: Target) => setHistory(items => items.map(item => item.key === key && !item.id ? { ...item, ...target, loading: true } : item));
  const refreshEntry = (key: number) => setHistory(items => items.map(item => item.key === key ? { ...item, refresh: item.refresh + 1, loading: true } : item));
  return <div ref={root} className="knowledge-browser" data-knowledge-browser={`${scope.kind}:${scope.id}`}>
    <div className="knowledge-browser-toolbar">
      {(history.length > 1 || onBack) && <Button type="text" onClick={back}>← {history.length > 1 ? `返回${history[history.length - 2].title || '上一级'}` : backLabel}</Button>}
      <RefreshButton size="small" label="刷新当前知识" loading={current.loading} onClick={() => refreshEntry(current.key)} />
    </div>
    {history.map(entry => <div key={entry.key} hidden={entry.key !== current.key}>
      <KnowledgeBrowserView entry={entry} refresh={entry.refresh + refresh} active={entry.key === current.key} workspaceId={workspaceId} scope={entry.scope || scope} onOpen={open} onMode={switchMode} preferences={preferences[preferenceKey(entry)] || emptyReadingPreferences()} onPreferences={value => { if (entry.key === current.key) setPreferences(previous => ({ ...previous, [preferenceKey(entry)]: value })); }} onTitle={setTitle} onDefault={setDefault} onLoadingChange={setLoading} onRefresh={() => refreshEntry(entry.key)} onObserved={entry.key === 0 ? onObserved : undefined} />
    </div>)}
  </div>;
}

type ViewProps = { entry: Entry; refresh: number; active: boolean; workspaceId: string; scope: KnowledgeScope; onOpen: (target: Target) => void; onMode: (documents: boolean, scope: KnowledgeScope) => void; preferences: ReadingPreferences; onPreferences: (value: ReadingPreferences) => void; onTitle: (key: number, title: string) => void; onDefault: (key: number, target: Target) => void; onLoadingChange: (key: number, loading: boolean) => void; onRefresh: () => void; onObserved?: (data: KnowledgeResponse) => void };
function KnowledgeBrowserView({ entry, refresh, active, workspaceId, scope, onOpen, onMode, preferences, onPreferences, onTitle, onDefault, onLoadingChange, onRefresh, onObserved }: ViewProps) {
  const isCatalog = entry.kind === 'catalog';
  const isDocuments = entry.kind === 'documents';
  const isReference = entry.kind === 'reference';
  const documentsMode = isDocuments || Boolean(entry.documentsMode);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentTitle, setDocumentTitle] = useState(entry.title || '');
  const category = 'documents' as const;
  const part = isCatalog ? undefined : entry.kind === 'artifact' ? 'artifacts' : entry.kind === 'source' ? 'sources' : 'objects';
  const result = useCompleteKnowledgeReading(workspaceId, scope, part, entry.id, refresh, !isCatalog && !isDocuments && !isReference);
  const { data, sourceReading } = result;
  const readingData = entry.kind === 'source' ? sourceReading?.data : data;
  const index = readingData?.index || null, readingScope = sourceReading?.scope || scope;
  const navigation = useKnowledgeNavigation(workspaceId, readingScope, refresh, active);
  // Skill references narrow their link index to that skill; retain the owning scope's topic tree.
  const topicIndex = entry.kind === 'source' && data?.observations.find(item => item.id === entry.id)?.kind === 'skill' ? data.index : readingData ? readingData.index : data?.index;
  const topics = knowledgeReadingTopics(topicIndex, navigation.data?.topics || []);
  const documentCatalog = useKnowledgeDocuments(workspaceId, readingScope, refresh, documentsMode && active);
  const needsInitialize = canInitializeKnowledge(navigation, readingData || data);
  const pageScope = data?.scope || navigation.data?.scope;
  const loading = isDocuments ? documentLoading || documentCatalog.loading : isCatalog ? navigation.loading : result.loading;
  const [notice, setNotice] = useState(''), [choices, setChoices] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null), callbacks = useRef({ onOpen, onTitle, onDefault, onObserved, onLoadingChange });
  callbacks.current = { onOpen, onTitle, onDefault, onObserved, onLoadingChange };
  useEffect(() => {
    if (!active || !isCatalog || navigation.loading) return;
    const initialTopic = topics.find(topic => topic.id === navigation.data?.entryObject);
    if (initialTopic) callbacks.current.onDefault(entry.key, { kind: 'object', id: initialTopic.id, title: initialTopic.title });
  }, [active, isCatalog, entry.key, navigation.data, navigation.loading]);
  useEffect(() => {
    if (!active || !isDocuments || entry.id || documentCatalog.loading) return;
    const initialDocument = documentCatalog.data?.documents.find(item => item.id === documentCatalog.data?.entryDocumentId);
    if (initialDocument) callbacks.current.onDefault(entry.key, { kind: initialDocument.artifactId ? 'artifact' : 'documents', id: initialDocument.artifactId || initialDocument.id, title: initialDocument.title, documentsMode: true });
  }, [active, isDocuments, entry.id, entry.key, documentCatalog.data, documentCatalog.loading]);
  useLayoutEffect(() => { callbacks.current.onLoadingChange(entry.key, loading); }, [entry.key, loading]);
  const { openAgentAction } = useAppShell(), previews = useResourcePreview(), location = useLocation();
  const artifact = data?.artifacts?.find(item => item.id === entry.id);
  const source = data?.observations.find(item => item.id === entry.id);
  const sourceMeta = data?.index?.sources.find(item => item.id === entry.id);
  const object = index?.objects.find(item => item.id === entry.id);
  const title = isCatalog || (isDocuments && !entry.id) ? `${pageScope?.title ? `${pageScope.title} · ` : ''}${scope.kind === 'service' ? '服务知识' : '项目知识'}` : (isDocuments && documentTitle ? documentTitle : null) || (documentsMode && entry.kind === 'artifact' ? documentCatalog.data?.documents.find(item => item.artifactId === entry.id)?.title : null) || artifact?.title || sourceMeta?.title || object?.title || entry.title || '相关知识';
  useEffect(() => { if (pageScope) callbacks.current.onTitle(entry.key, title); }, [pageScope, title, entry.key]);
  useEffect(() => { if (data) callbacks.current.onObserved?.(data); }, [data]);
  useLayoutEffect(() => {
    if (!active || loading) return;
    const frame = requestAnimationFrame(() => root.current?.closest<HTMLElement>('.pane-body, .ant-drawer-body')?.scrollTo({ top: entry.scrollTop }));
    return () => cancelAnimationFrame(frame);
  }, [active, loading, entry.key]);
  const navigationArtifacts = topicIndex ? topicIndex.artifacts : topicIndex === null ? [] : navigation.data?.artifacts || [];
  const nodes = documentsMode ? documentReadingTree(documentCatalog.data, navigationArtifacts) : topicReadingTree(topics, navigationArtifacts);
  const readingTarget: ReadingTarget | null = entry.id && ['object', 'artifact', 'documents'].includes(entry.kind) ? { kind: entry.kind === 'documents' ? 'document' : entry.kind as 'object' | 'artifact', id: entry.id } : null;
  const selectReading = (target: ReadingTarget, title?: string) => callbacks.current.onOpen({ kind: target.kind === 'document' ? 'documents' : target.kind, id: target.id, title, scope: readingScope, documentsMode });
  const openArtifact = (id: string) => {
    const target = index?.artifacts.find(item => item.id === id) || navigation.data?.artifacts.find(item => item.id === id);
    if (target) callbacks.current.onOpen({ kind: 'artifact', id, title: target.title, scope: readingScope, documentsMode });
  };
  const openReference = (reference: KnowledgeReference, title: string, fragment?: string) => callbacks.current.onOpen({ kind: 'reference', id: JSON.stringify(reference), reference, fragment, title, scope: readingScope, documentsMode });
  const openSource = (id: string, description?: string) => {
    const target = index?.sources.find(item => item.id === id);
    if (!target) return;
    if (target.kind === 'skill' && target.skillId && target.path === 'SKILL.md' && previews?.open(location.pathname, workspaceHref(workspaceId, `/skills/${encodeURIComponent(target.skillId)}`))) return;
    callbacks.current.onOpen({ kind: 'source', id, title: target.title, description, scope: readingScope, documentsMode });
  };
  const follow = (base: string, href: string, file = false, description?: string) => {
    const path = resolveKnowledgePath(base, href);
    const sources = path ? index?.sources.filter(item => (item.link || item.path) === path) || [] : [];
    const target = path && index?.artifacts.find(item => item.path === path);
    if (file && sources.length === 1) openSource(sources[0].id, description);
    else if (target) openArtifact(target.id);
    else if (sources.length === 1) openSource(sources[0].id, description);
    else if (sources.length > 1) setChoices(sources.map(item => item.id));
    else {
      const origin = index?.artifacts.find(item => item.path === base);
      if (origin) openReference({ kind: 'artifact', id: origin.id, links: [href] }, description || path?.split('/').at(-1) || '引用文件');
      else if (entry.kind === 'source' && entry.id) openReference({ kind: 'source', id: entry.id, links: [href] }, description || '引用文件');
      else setNotice('无法确定该引用的来源，请刷新原文后重试。');
    }
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
      artifactId: artifact?.id, artifactKind: artifact?.kind, indexRevision: isCatalog ? navigation.data?.revision : data?.revision,
      articles: (index?.artifacts || navigation.data?.artifacts)?.filter(item => item.kind === 'document').map(item => ({ id: item.id, title: item.title, path: item.path, objects: item.objects })),
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
    onReference: openReference,
    onObject: (id: string) => { const target = index?.objects.find(item => item.id === id); if (target) callbacks.current.onOpen({ kind: 'object', id, title: target.title, scope: readingScope }); },
  };
  const shownArtifacts = entry.kind === 'artifact' ? artifact ? [artifact] : [] : knowledgeTopicArtifacts(data?.artifacts || [], category);
  const unavailableSources = data?.observations.filter(item => ['missing', 'unreadable'].includes(item.status)) || [];
  const openTopic = (id: string) => selectReading({ kind: 'object', id }, topics.find(topic => topic.id === id)?.title);
  return <div ref={root} className="knowledge-side-reader knowledge-browser-view" data-knowledge-view={entry.kind}>
    <div className="knowledge-browser-actions"><KnowledgeActions disabled={!pageScope} onAction={construct} /></div>
    <KnowledgeTopicNavigation compact nodes={nodes} selected={readingTarget} documentsSelected={documentsMode}
      prose={isDocuments || (shownArtifacts.length > 0 && shownArtifacts.every(item => item.kind === 'document'))}
      preferences={preferences} onPreferences={onPreferences}
      loading={documentsMode ? documentCatalog.loading : navigation.loading} error={documentsMode ? documentCatalog.error : navigation.error}
      notices={documentsMode ? [...(documentCatalog.data?.diagnostics || []), ...(documentCatalog.data?.truncated ? ['目录未完整读取，当前数量仅为已发现文档。'] : [])] : []}
      onRetry={onRefresh} onSelect={selectReading} onTopics={() => onMode(false, readingScope)} onDocuments={() => onMode(true, readingScope)}>
    {!isCatalog && !isDocuments && !isReference && result.loading ? <Spin /> : !isCatalog && !isDocuments && !isReference && result.error ? <Alert type="error" message={result.error} /> : (isCatalog || isDocuments || isReference || data) && <>
      <header className="knowledge-browser-heading"><div><p className="eyebrow">{scope.kind === 'service' ? '服务知识' : '项目知识'}</p><h2>{title}</h2></div>
        {!isCatalog && !isDocuments && !isReference && <KnowledgeActions reading disabled={!pageScope} onAction={construct} />}
      </header>
      <KnowledgePreviewNotice sourceDirectory={sourceReading?.data.scope.directory || pageScope?.directory} />
      {needsInitialize && !isDocuments && <KnowledgeInitialize kind={readingScope.kind} onInitialize={() => construct('initialize')} onExplore={() => construct('explore')} />}
      {notice && <Alert type="info" closable message={notice} onClose={() => setNotice('')} />}
      {result.relatedErrors.map(error => <Alert key={error} type="warning" message={error} />)}
      {isDocuments && <KnowledgeDocuments scope={readingScope} workspaceId={workspaceId} documentId={entry.id} documents={documentCatalog.data?.documents || []} refresh={refresh} active={active}
        onReference={openReference}
        onOpen={(id, title) => selectReading({ kind: 'document', id }, title)}
        onArtifact={(id, title) => selectReading({ kind: 'artifact', id }, title)} onLoadingChange={setDocumentLoading} onTitleChange={setDocumentTitle} />}
      {isReference && entry.reference ? <KnowledgeReferenceReader workspaceId={workspaceId} scope={readingScope} reference={entry.reference} fragment={entry.fragment} refresh={refresh} onReference={openReference} /> : isDocuments ? null : isCatalog ? navigation.loading ? <Spin /> : !needsInitialize && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从目录选择一个主题或内容开始阅读。" /> : entry.kind === 'source' ? <>
        <section className="knowledge-file-summary"><h3>文件说明</h3><p>{sourceMeta?.summary || entry.description || '这份来源尚未提供总体说明，可根据源文件补充。'}</p></section>
        <p className="knowledge-source-location">{source?.location?.title || source?.skill?.id || data?.scope.title} · {source?.path || sourceMeta?.path}</p>
        {source?.content != null ? <KnowledgeSource sourceId={entry.id || ''} content={source.content} path={source.path || ''} line={sourceMeta?.line} reading={{ ...reader, artifacts: sourceReading?.data.artifacts || [], artifact: sourceReading?.artifact || { id: `source:${entry.id}`, title, kind: 'document', path: source.path || '', objects: [], sources: [], content: source.content, digest: source.digest, status: source.status, diagnostic: source.diagnostic, diagramSize: null, graph: null } }} /> : <Alert type="warning" message={source?.diagnostic || '文件不可读'} />}
      </> : <section data-knowledge-topic-content={entry.kind === 'object' ? entry.id : undefined}>
        {object?.summary && <p className="knowledge-summary">{object.summary}</p>}
        {entry.kind === 'object' && entry.id && <KnowledgeTopicChildren topics={topics} parent={entry.id} onSelect={openTopic} />}
        {unavailableSources.length > 0 && <Alert type="warning" data-knowledge-unavailable-sources message="部分来源缺失或暂不可读，其余内容仍可查看。" description={<Space wrap>{unavailableSources.map(item => <Button key={item.id} size="small" type="link" onClick={() => openSource(item.id)}>{index?.sources.find(source => source.id === item.id)?.title || item.id} · {item.status === 'missing' ? '缺失' : '不可读'}</Button>)}</Space>} />}
        {shownArtifacts.map(item => <KnowledgeArtifactReader key={item.id} {...reader} showTitle={entry.kind !== 'artifact'} artifact={item} artifacts={data?.artifacts || []} />)}
        {!shownArtifacts.length && !needsInitialize && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这个主题下暂时没有此类资料。" />}
      </section>}
      <Modal open={choices.length > 0} title="选择对应文件" footer={null} onCancel={() => setChoices([])}>{choices.map(id => <p key={id}><Button onClick={() => { setChoices([]); openSource(id); }}>{index?.sources.find(item => item.id === id)?.title || id}</Button></p>)}</Modal>
    </>}
    </KnowledgeTopicNavigation>
  </div>;
}
