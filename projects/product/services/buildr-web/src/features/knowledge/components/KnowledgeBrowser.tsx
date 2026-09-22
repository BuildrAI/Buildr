import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Modal, Space, Spin } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { RefreshButton } from '../../../components/RefreshButton';
import { useResourcePreview } from '../../../app/resource-preview';
import { workspaceHref } from '../../../lib/labels';
import type { KnowledgeResponse, KnowledgeScope } from '../api/knowledge-api';
import type { KnowledgeCategory } from '../knowledge-catalog';
import { resolveKnowledgePath } from '../knowledge-navigation';
import { useCompleteKnowledgeReading } from '../useCompleteKnowledgeReading';
import { useKnowledgeCatalog } from '../useKnowledgeCatalog';
import { KnowledgeArtifactReader } from './KnowledgeArtifactReader';
import { KnowledgeCatalog } from './KnowledgeCatalog';
import { KnowledgeSource } from './KnowledgeSource';
import { KnowledgePreviewNotice } from './KnowledgePreviewNotice';
import '../knowledge.css';
import './knowledge-browser.css';

type Target = { kind: 'catalog' | 'artifact' | 'object' | 'source'; id?: string; title?: string; description?: string; scope?: KnowledgeScope };
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
    if (target.kind === current.kind && target.id === current.id && nextScope.kind === currentScope.kind && nextScope.id === currentScope.id) return;
    const scrollTop = scrollContainer()?.scrollTop || 0;
    setHistory(items => [...items.map(item => item.key === current.key ? { ...item, scrollTop } : item), { ...target, key: ++serial.current, scrollTop: 0, refresh: 0, loading: true }]);
  };
  const back = () => {
    if (history.length > 1) setHistory(items => items.slice(0, -1));
    else onBack?.();
  };
  const setTitle = (key: number, title: string) => setHistory(items => items.some(item => item.key === key && item.title !== title) ? items.map(item => item.key === key ? { ...item, title } : item) : items);
  const setLoading = (key: number, loading: boolean) => setHistory(items => items.some(item => item.key === key && item.loading !== loading) ? items.map(item => item.key === key ? { ...item, loading } : item) : items);
  const refreshEntry = (key: number) => setHistory(items => items.map(item => item.key === key ? { ...item, refresh: item.refresh + 1, loading: true } : item));
  return <div ref={root} className="knowledge-browser" data-knowledge-browser={`${scope.kind}:${scope.id}`}>
    <div className="knowledge-browser-toolbar">
      {(history.length > 1 || onBack) && <Button type="text" onClick={back}>← {history.length > 1 ? `返回${history[history.length - 2].title || '上一级'}` : backLabel}</Button>}
      <RefreshButton size="small" label="刷新当前知识" loading={current.loading} onClick={() => refreshEntry(current.key)} />
    </div>
    {history.map(entry => <div key={entry.key} hidden={entry.key !== current.key}>
      <KnowledgeBrowserView entry={entry} refresh={entry.refresh + refresh} active={entry.key === current.key} workspaceId={workspaceId} scope={entry.scope || scope} onOpen={open} onTitle={setTitle} onLoadingChange={setLoading} onRefresh={() => refreshEntry(entry.key)} onObserved={entry.key === 0 ? onObserved : undefined} />
    </div>)}
  </div>;
}

type ViewProps = { entry: Entry; refresh: number; active: boolean; workspaceId: string; scope: KnowledgeScope; onOpen: (target: Target) => void; onTitle: (key: number, title: string) => void; onLoadingChange: (key: number, loading: boolean) => void; onRefresh: () => void; onObserved?: (data: KnowledgeResponse) => void };
function KnowledgeBrowserView({ entry, refresh, active, workspaceId, scope, onOpen, onTitle, onLoadingChange, onRefresh, onObserved }: ViewProps) {
  const isCatalog = entry.kind === 'catalog';
  const [category, setCategory] = useState<KnowledgeCategory>('documents'), [query, setQuery] = useState('');
  const catalog = useKnowledgeCatalog({ workspaceId, scope, category, query, refresh, enabled: isCatalog && active });
  const part = isCatalog ? undefined : entry.kind === 'artifact' ? 'artifacts' : entry.kind === 'source' ? 'sources' : 'objects';
  const result = useCompleteKnowledgeReading(workspaceId, scope, part, entry.id, refresh, !isCatalog);
  const { data, sourceReading } = result;
  const readingData = entry.kind === 'source' ? sourceReading?.data : data;
  const index = readingData?.index || null, readingScope = sourceReading?.scope || scope;
  const pageScope = data?.scope || catalog.data?.scope;
  const loading = isCatalog ? catalog.loading : result.loading;
  const [notice, setNotice] = useState(''), [choices, setChoices] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null), callbacks = useRef({ onOpen, onTitle, onObserved, onLoadingChange });
  callbacks.current = { onOpen, onTitle, onObserved, onLoadingChange };
  useLayoutEffect(() => { callbacks.current.onLoadingChange(entry.key, loading); }, [entry.key, loading]);
  const { openAgentAction } = useAppShell(), previews = useResourcePreview(), location = useLocation();
  const artifact = data?.artifacts?.find(item => item.id === entry.id);
  const source = data?.observations.find(item => item.id === entry.id);
  const sourceMeta = data?.index?.sources.find(item => item.id === entry.id);
  const object = index?.objects.find(item => item.id === entry.id);
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
  const construct = (mode: 'construct' | 'diagram' | 'improve') => {
    if (!pageScope) return;
    const search = new URLSearchParams();
    if (entry.kind === 'artifact' && entry.id) search.set('artifact', entry.id);
    if (entry.kind === 'object' && entry.id) search.set('object', entry.id);
    openAgentAction('knowledge', {
      mode, readingPath: workspaceHref(workspaceId, `/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}`) + (search.size ? `?${search}` : ''),
      topic: title, scope: pageScope, objectId: entry.kind === 'object' ? entry.id : undefined,
      artifactId: artifact?.id, artifactKind: artifact?.kind, indexRevision: isCatalog ? catalog.data?.revision : data?.revision,
      articles: (isCatalog ? catalog.data?.items : index?.artifacts)?.filter(item => item.kind === 'document').map(item => ({ id: item.id, title: item.title, path: item.path, objects: item.objects })),
      observations: data?.observations.map(item => ({ id: item.id, digest: item.digest, status: item.status })),
      artifacts: data?.artifacts?.map(item => ({ id: item.id, digest: item.digest })),
      selectedSource: entry.kind === 'source' ? entry.id : undefined,
    });
  };
  const reader = {
    index, workspaceId, scope: readingScope,
    onLink: (base: string, href: string) => follow(base, href),
    onFile: (base: string, href: string, description?: string) => follow(base, href, true, description),
    onSource: openSource, onOpen: openArtifact,
    onObject: (id: string) => { const target = index?.objects.find(item => item.id === id); if (target) callbacks.current.onOpen({ kind: 'object', id, title: target.title, scope: readingScope }); },
  };
  const shownArtifacts = entry.kind === 'artifact' ? artifact ? [artifact] : [] : (data?.artifacts || []).filter(item => item.kind === 'document');
  const unavailableSources = data?.observations.filter(item => ['missing', 'unreadable'].includes(item.status)) || [];
  return <div ref={root} className="knowledge-side-reader knowledge-browser-view" data-knowledge-view={entry.kind}>
    {!isCatalog && result.loading ? <Spin /> : !isCatalog && result.error ? <Alert type="error" message={result.error} /> : (isCatalog || data) && <>
      <header className="knowledge-browser-heading"><div><p className="eyebrow">{scope.kind === 'service' ? '服务知识' : '项目知识'}</p><h2>{title}</h2></div>{entry.kind !== 'catalog' && <Button size="small" onClick={() => construct('improve')}>完善当前内容</Button>}</header>
      <KnowledgePreviewNotice sourceDirectory={sourceReading?.data.scope.directory || pageScope?.directory} />
      {notice && <Alert type="info" closable message={notice} onClose={() => setNotice('')} />}
      {result.relatedErrors.map(error => <Alert key={error} type="warning" message={error} />)}
      {isCatalog ? <KnowledgeCatalog
        entries={catalog.data?.items || []} matchingCount={catalog.data?.matchingCount || 0}
        loading={catalog.loading} loadingMore={catalog.loadingMore} hasMore={catalog.data?.hasMore || false}
        error={catalog.error} loadMoreError={catalog.loadMoreError} changed={catalog.changed} canConstruct={Boolean(pageScope)}
        category={category} query={query} onFilter={(view, text) => { setCategory(view); setQuery(text); }}
        onOpen={openArtifact} onConstruct={construct} onLoadMore={catalog.loadMore} onRetry={catalog.retryLoadMore} onRefresh={onRefresh}
      /> : entry.kind === 'source' ? <>
        <section className="knowledge-file-summary"><h3>文件说明</h3><p>{sourceMeta?.summary || entry.description || '这份来源尚未提供总体说明，可根据源文件补充。'}</p></section>
        <p className="knowledge-source-location">{source?.location?.title || source?.skill?.id || data?.scope.title} · {source?.path || sourceMeta?.path}</p>
        {source?.content != null ? <KnowledgeSource sourceId={entry.id || ''} content={source.content} path={source.path || ''} line={sourceMeta?.line} reading={{ ...reader, artifacts: sourceReading?.data.artifacts || [], artifact: sourceReading?.artifact || { id: `source:${entry.id}`, title, kind: 'document', path: source.path || '', objects: [], sources: [], content: source.content, digest: source.digest, status: source.status, diagnostic: source.diagnostic, diagramSize: null, graph: null } }} /> : <Alert type="warning" message={source?.diagnostic || '文件不可读'} />}
      </> : <>
        {object?.summary && <p className="knowledge-summary">{object.summary}</p>}
        {unavailableSources.length > 0 && <Alert type="warning" data-knowledge-unavailable-sources message="部分来源缺失或暂不可读，其余内容仍可查看。" description={<Space wrap>{unavailableSources.map(item => <Button key={item.id} size="small" type="link" onClick={() => openSource(item.id)}>{index?.sources.find(source => source.id === item.id)?.title || item.id} · {item.status === 'missing' ? '缺失' : '不可读'}</Button>)}</Space>} />}
        {(shownArtifacts.length ? shownArtifacts : data?.artifacts || []).map(item => <KnowledgeArtifactReader key={item.id} {...reader} showTitle={entry.kind !== 'artifact'} artifact={item} artifacts={data?.artifacts || []} />)}
      </>}
      <Modal open={choices.length > 0} title="选择对应文件" footer={null} onCancel={() => setChoices([])}>{choices.map(id => <p key={id}><Button onClick={() => { setChoices([]); openSource(id); }}>{index?.sources.find(item => item.id === id)?.title || id}</Button></p>)}</Modal>
    </>}
  </div>;
}
