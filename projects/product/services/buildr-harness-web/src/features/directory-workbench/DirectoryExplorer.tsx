import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Select, Spin, Tag } from 'antd';
import { FolderOpenOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useFileEditingContext } from '../../workbench/editor/FileEditingContext';
import { FileEditingPane } from '../../workbench/editor/FileEditingPane';
import type { MarkdownReadingPosition } from '../../workbench/editor/markdown-reading-position';
import { CodeExplorerNotices } from '../../workbench/explorer/CodeExplorerNotices';
import { CodeTreePane } from '../../workbench/explorer/CodeTreePane';
import { RepositoryFileBrowser, type RepositoryPreviewFile, type RepositoryTreeScope, type WorkbenchMarkdownInput } from '../../workbench/explorer/RepositoryFileBrowser';
import { codeRepositoryCode, codeRepositoryLabel } from '../../workbench/source-control/repository-labels';
import { sourceControlDecorations, type SourceControlDecorationCatalog } from '../../workbench/source-control/source-control-decorations';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import { ObjectTabStrip } from '../../workbench/ui/ObjectTabStrip';
import { ReadingToggle } from '../../workbench/ui/ReadingToggle';
import { selectPopupGuard } from '../../workbench/ui/select-popup';
import { tabElementId } from '../../workbench/ui/tab-navigation';
import { MarkdownHost } from '../../components/MarkdownHost';
import type { MarkdownRenderOptions } from '../../markdown';
import {
  directoryEditableDocument,
  type DirectoryCatalog,
  type DirectoryListing,
  type DirectoryRequest,
  type DirectoryScope,
  type DirectorySearchResult,
  type DirectorySelection,
  type EditableFileSnapshot,
  type WorkbenchFile,
} from './api';
import { collectExplorerLoadTargets } from './directory-catalog';

export type DirectoryOpenRequest = { source: DirectorySelection | null; path: string; line?: number; nonce: number };

type DirectoryTab = {
  key: string;
  browserId: string;
  repositoryId: string;
  checkoutId: string | null;
  path: string;
  line?: number;
  query?: string;
  focusRequest: number;
};

type BrowserSource = {
  id: string;
  repositoryId: string;
  repositoryPath: string;
  checkoutId: string | null;
  name: string;
  fullName?: string;
  locationLabel: string;
  location: string;
  branch?: string | null;
  selection: DirectorySelection | null;
};

function resolveRelativePath(documentPath: string, href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('\\') || raw.startsWith('@') || /[\0\\]/.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  let relative: string;
  try { relative = decodeURIComponent(raw.split(/[?#]/)[0]); } catch { return null; }
  if (!relative || relative.startsWith('/') || relative.startsWith('\\') || /[\0\\]/.test(relative)) return null;
  const segments = documentPath.split('/').slice(0, -1);
  for (const segment of relative.split('/')) {
    if (segment === '..') { if (!segments.length) return null; segments.pop(); }
    else if (segment && segment !== '.') segments.push(segment);
  }
  return segments.length ? segments.join('/') : null;
}

const folderKey = (browserId: string, relative: string) => `${browserId}::${relative}`;
const sourceName = (location: string, fallback: string) => location.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).at(-1) || fallback;

export function DirectoryExplorer({ workspaceId, scope, scopeKey, catalog, catalogError, catalogLoading, refreshCatalog, prioritizeRepository, choosingCheckout, onChooseCheckout, requestFor, active, opened, onSaved, initialTreeOpen }: {
  workspaceId: string;
  scope: DirectoryScope;
  scopeKey: string;
  catalog: DirectoryCatalog | null;
  catalogError: string;
  catalogLoading: boolean;
  refreshCatalog(): Promise<void>;
  prioritizeRepository?(repositoryPath: string): void;
  choosingCheckout: boolean;
  onChooseCheckout(value: boolean): void;
  requestFor: (selection: DirectorySelection | null) => DirectoryRequest;
  active: boolean;
  initialTreeOpen?: boolean;
  opened?: DirectoryOpenRequest;
  onSaved(): void;
}) {
  const panelId = useId();
  const { message } = App.useApp();
  const editing = useFileEditingContext();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [treeHidden, setTreeHidden] = useState(() => !initialTreeOpen && typeof window !== 'undefined' && window.innerWidth < 680);
  const [ignored, setIgnored] = useState(false);

  const repos = catalog?.repositories ?? [];
  const [repositoryPath, setRepositoryPath] = useState<string>();
  const [checkout, setCheckout] = useState<DirectorySelection | null>(null);
  const root = useMemo<BrowserSource>(() => ({
    id: `workspace:${scope.ref.id}`, repositoryId: scope.ref.id, repositoryPath: '', checkoutId: null,
    name: scope.name || sourceName(scope.rootPath, '工作空间目录'), locationLabel: '工作空间目录',
    location: scope.rootPath, selection: null,
  }), [scope.ref.id, scope.name, scope.rootPath]);
  const allSources = useMemo<BrowserSource[]>(() => [root, ...repos.flatMap(repo => repo.members.map(member => ({
    id: member.id, repositoryId: repo.id, repositoryPath: repo.path, checkoutId: member.id,
    name: member.isMain ? (repo.code || repo.name) : member.name,
    fullName: codeRepositoryLabel(repo), locationLabel: member.isMain ? '主工作树' : member.name,
    location: member.location, branch: member.branch,
    selection: { repositoryId: repo.id, checkoutId: member.id },
  })))], [root, repos]);
  const checkoutSource = checkout ? allSources.find(item => item.repositoryId === checkout.repositoryId && item.checkoutId === checkout.checkoutId) : undefined;
  const visibleSources = checkout ? (checkoutSource ? [checkoutSource] : []) : [root];
  const defaultCollapsedTree = false;

  const [tabs, setTabs] = useState<DirectoryTab[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [page, setPage] = useState<{ key: string; index: number; revision: string }>();
  const [version, bump] = useState(0);
  const [search, setSearch] = useState<{ query: string; mode: 'name' | 'content'; showIgnored: boolean }>({ query: '', mode: 'name', showIgnored: false });
  const [readQuery, setReadQuery] = useState('');
  const [selection, setSelection] = useState<{ key: string; lines: [number, number] | null }>({ key: '', lines: null });
  const [revealRequest, setRevealRequest] = useState(0);
  const [media, setMedia] = useState<Record<string, string>>({});
  const tabReadingPositions = useRef(new Map<string, MarkdownReadingPosition>());
  const requestForRef = useRef(requestFor); requestForRef.current = requestFor;

  const allSourcesRef = useRef(allSources); allSourcesRef.current = allSources;
  const visibleSourcesRef = useRef(visibleSources); visibleSourcesRef.current = visibleSources;

  const activeTab = useMemo(() => tabs.find(item => item.key === activeKey) ?? tabs.at(-1), [tabs, activeKey]);

  // Directory lazy loading across visible sources
  const [folders, setFolders] = useState<Record<string, DirectoryListing>>({});
  const [folderErrors, setFolderErrors] = useState<Record<string, string>>({});
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const folderRef = useRef(folders); folderRef.current = folders;
  const loads = useRef(new Map<string, AbortController>());

  const loadDirectory = useCallback(async (browserId: string, relative: string, force = false) => {
    const key = folderKey(browserId, relative);
    if (!force && (folderRef.current[key] || loads.current.has(key))) return;
    const src = allSourcesRef.current.find(item => item.id === browserId);
    if (!src) return;
    loads.current.get(key)?.abort();
    const controller = new AbortController();
    loads.current.set(key, controller);
    try {
      const result = await requestForRef.current(src.selection)<DirectoryListing>('directory', { path: relative, showIgnored: ignored }, controller.signal);
      if (!controller.signal.aborted) {
        setFolders(prev => ({ ...prev, [key]: result }));
        setFolderErrors(prev => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFolderErrors(prev => ({ ...prev, [key]: error instanceof Error ? error.message : '目录读取失败。' }));
      }
    } finally {
      if (loads.current.get(key) === controller) loads.current.delete(key);
    }
  }, [ignored]);

  const openFile = useCallback((browserId: string, relative: string, line?: number, matchQuery?: string) => {
    const src = allSourcesRef.current.find(item => item.id === browserId);
    if (!src || !relative) return;
    const key = JSON.stringify([scopeKey, src.id, relative]);
    setPage(undefined);
    setTabs(previous => {
      const existing = previous.find(item => item.key === key);
      const next: DirectoryTab = {
        key,
        browserId: src.id,
        repositoryId: src.repositoryId,
        checkoutId: src.checkoutId,
        path: relative,
        line,
        query: matchQuery,
        focusRequest: (existing?.focusRequest ?? 0) + (line ? 1 : 0),
      };
      return existing ? previous.map(item => item.key === key ? next : item) : [...previous, next];
    });
    setActiveKey(key);
    setRevealRequest(v => v + 1);
    if (typeof window !== 'undefined' && window.innerWidth < 680) setTreeHidden(true);
    void loadDirectory(src.id, '', false);
    const parents = relative.split('/').slice(0, -1);
    parents.forEach((_, index) => void loadDirectory(src.id, parents.slice(0, index + 1).join('/'), false));
  }, [loadDirectory, scopeKey]);

  const handledNonce = useRef(0);
  useEffect(() => {
    if (!opened || opened.nonce === handledNonce.current) return;
    const target = opened.source?.checkoutId
      ? allSources.find(item => item.repositoryId === opened.source!.repositoryId && item.checkoutId === opened.source!.checkoutId)
      : allSources[0];
    if (!target) return;
    handledNonce.current = opened.nonce;
    setCheckout(target.selection);
    setRepositoryPath(target.selection ? target.repositoryPath : undefined);
    openFile(target.id, opened.path, opened.line);
  }, [allSources, openFile, opened]);

  const visibleIdsSignature = visibleSources.map(item => item.id).join(',');
  const expandedKeysKey = expandedKeys.join('|');
  useEffect(() => {
    loads.current.forEach(controller => controller.abort());
    loads.current.clear();
    setFolders({});
    setFolderErrors({});
    return () => {
      loads.current.forEach(controller => controller.abort());
      loads.current.clear();
    };
  }, [scopeKey, ignored]);

  useEffect(() => {
    if (!active) return;
    const targets = collectExplorerLoadTargets({
      collapsed: defaultCollapsedTree,
      visibleBrowserIds: visibleSourcesRef.current.map(src => src.id),
      expandedKeys,
    });
    for (const target of targets) void loadDirectory(target.browserId, target.relative, false);
  }, [active, defaultCollapsedTree, visibleIdsSignature, expandedKeysKey, ignored, scopeKey, loadDirectory]);

  const refreshDirectories = useCallback(async () => {
    const targets = collectExplorerLoadTargets({
      collapsed: defaultCollapsedTree,
      visibleBrowserIds: visibleSourcesRef.current.map(src => src.id),
      expandedKeys,
    });
    const keepKeys = new Set(targets.map(target => folderKey(target.browserId, target.relative)));
    // Drop collapsed directory caches so they reload cleanly on next expand without eager fetches now.
    for (const [key, controller] of loads.current) {
      if (!keepKeys.has(key)) { controller.abort(); loads.current.delete(key); }
    }
    setFolders(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => keepKeys.has(key))));
    setFolderErrors(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => keepKeys.has(key))));
    await Promise.all([
      ...(checkout ? [refreshCatalog().catch(() => {})] : []),
      ...targets.map(target => loadDirectory(target.browserId, target.relative, true)),
    ]);
    bump(v => v + 1);
  }, [checkout, defaultCollapsedTree, expandedKeys, loadDirectory, refreshCatalog]);

  // Search across visible sources (if single source, send to its request; otherwise sequentially/concurrently)
  const searchLoader = useCallback(async (input: { query: string; mode: 'name' | 'content'; showIgnored: boolean; sourcesKey: string }, signal: AbortSignal) => {
    const results = await Promise.all(visibleSources.map(async src => {
      const res = await requestForRef.current(src.selection)<DirectorySearchResult>('search', { query: input.query, mode: input.mode, showIgnored: input.showIgnored }, signal);
      return { src, res };
    }));
    return results;
  }, [visibleIdsSignature]);

  const searchInput = useMemo(() => ({ ...search, sourcesKey: visibleIdsSignature }), [search, visibleIdsSignature]);
  const searchRead = useSourceControlRead(JSON.stringify([scopeKey, searchInput]), searchInput, searchLoader, active && !!search.query);
  const handleSearch = useCallback((query: string, mode: 'name' | 'content', showIgnored: boolean) => {
    setReadQuery(mode === 'content' ? query : '');
    setSearch({ query, mode, showIgnored });
  }, []);

  // Active file reading
  const activeSource = useMemo(() => activeTab ? allSources.find(item => item.id === activeTab.browserId) : undefined, [allSources, activeTab]);
  const fileLoader = useCallback((input: { path: string; line?: number; matchQuery?: string; page?: number; expectedRevision?: string }, signal: AbortSignal) => {
    const sel = activeTab?.checkoutId ? { repositoryId: activeTab.repositoryId, checkoutId: activeTab.checkoutId } : null;
    return requestForRef.current(sel)<WorkbenchFile>('file', input, signal);
  }, [activeTab?.repositoryId, activeTab?.checkoutId]);

  const activePage = activeTab && page?.key === activeTab.key ? page : undefined;
  const fileInput = useMemo(() => activeTab
    ? { path: activeTab.path, ...(activePage ? { page: activePage.index, expectedRevision: activePage.revision } : { line: activeTab.line, matchQuery: activeTab.query }) }
    : { path: '' }, [activeTab?.path, activeTab?.line, activeTab?.query, activePage]);
  const read = useSourceControlRead(activeTab ? `${activeTab.key}:${activeTab.browserId}` : '', fileInput, fileLoader, active && Boolean(activeTab), String(version));
  const file = activeTab ? read.data : null;

  // Editable file snapshot + fallback read
  const currentText = Boolean(activeTab && file && !file.page && !file.truncated && (file.kind === 'markdown' || file.kind === 'text') && !read.error);
  const [fallbackEditor, setFallbackEditor] = useState<{ key: string; snapshot?: EditableFileSnapshot; error?: string }>({ key: '' });
  const editorKey = activeTab && file ? `${activeTab.key}:${file.observedAt}:${version}` : '';
  useEffect(() => {
    if (!active || !activeTab || !currentText || file?.editorSnapshot) return;
    const ctrl = new AbortController();
    const sel = activeTab.checkoutId ? { repositoryId: activeTab.repositoryId, checkoutId: activeTab.checkoutId } : null;
    void requestForRef.current(sel)<EditableFileSnapshot>('editor', { path: activeTab.path }, ctrl.signal)
      .then(snapshot => { if (!ctrl.signal.aborted) setFallbackEditor({ key: editorKey, snapshot }); })
      .catch(error => { if (!ctrl.signal.aborted) setFallbackEditor({ key: editorKey, error: error instanceof Error ? error.message : '无法读取可编辑文件。' }); });
    return () => ctrl.abort();
  }, [active, activeTab?.key, activeTab?.path, activeTab?.repositoryId, activeTab?.checkoutId, currentText, editorKey, file?.editorSnapshot]);

  const editableSnapshot = file?.editorSnapshot ?? (fallbackEditor.key === editorKey ? fallbackEditor.snapshot : undefined);
  const editableDoc = useMemo(() => editableSnapshot ? directoryEditableDocument(workspaceId, editableSnapshot) : undefined, [workspaceId, editableSnapshot]);
  const editorSession = editableDoc ? editing.sessions[editableDoc.id] : undefined;
  const editableError = !file?.editorSnapshot && fallbackEditor.key === editorKey ? fallbackEditor.error : undefined;

  // Relative Markdown image preview resolution
  const markdownContent = editorSession?.content ?? file?.content ?? '';
  const imageHrefs = useMemo(() => [...new Set([...markdownContent.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[1]))].slice(0, 8), [markdownContent]);
  useEffect(() => {
    setMedia({});
    if (!activeTab || file?.kind !== 'markdown' || file.page || !imageHrefs.length) return;
    const controller = new AbortController();
    let alive = true;
    const sel = activeTab.checkoutId ? { repositoryId: activeTab.repositoryId, checkoutId: activeTab.checkoutId } : null;
    void Promise.allSettled(imageHrefs.map(async href => {
      const targetPath = resolveRelativePath(activeTab.path, href);
      if (!targetPath) return;
      const image = await requestForRef.current(sel)<WorkbenchFile>('file', { path: targetPath }, controller.signal);
      if (image.kind === 'image' && alive) setMedia(previous => ({ ...previous, [href]: image.content }));
    }));
    return () => { alive = false; controller.abort(); };
  }, [activeTab?.key, file?.kind, file?.page, imageHrefs.join('\n')]);

  const markdownOptions: MarkdownRenderOptions = {
    allowRelativeLinks: true,
    allowParentRelativeLinks: true,
    imageResolver: href => media[href] ? { href: media[href] } : null,
    onRelativeLinkClick: href => {
      if (!activeTab) return;
      const resolved = resolveRelativePath(activeTab.path, href);
      if (resolved) openFile(activeTab.browserId, resolved);
      else message.info('此链接不在当前目录范围内。');
    },
  };

  // Source control decorations mapped from catalog
  const decorationCatalog = useMemo<SourceControlDecorationCatalog | null>(() => catalog ? {
    repositories: catalog.repositories.map(repo => ({
      id: repo.id,
      worktrees: repo.members.map(member => ({
        worktreeId: member.worktreeId,
        fileCount: member.fileCount,
        changes: member.files,
      })),
    })),
  } : null, [catalog]);

  const treeRepositories = useMemo<RepositoryTreeScope[]>(() => visibleSources.map(src => {
    const prefix = folderKey(src.id, '');
    const loaded = Object.entries(folders).filter(([key]) => key.startsWith(prefix)).map(([, val]) => val);
    const items = new Map<string, RepositoryPreviewFile>();
    const decoration = src.checkoutId ? sourceControlDecorations(decorationCatalog, src.repositoryId, src.checkoutId, false) : { files: new Map(), directories: new Set<string>(), hasChanges: false };
    for (const listing of loaded) {
      for (const item of listing.entries) {
        items.set(item.path, {
          path: item.path,
          content: '',
          kind: 'text',
          directory: item.kind === 'directory',
          link: item.kind === 'link',
          ignored: item.ignored,
          status: item.kind === 'directory' ? undefined : decoration.files.get(item.path),
          hasChanges: item.kind === 'directory' && decoration.directories.has(item.path),
        });
      }
    }
    return {
      id: src.id,
      repositoryId: src.repositoryId,
      name: src.name,
      fullName: src.fullName,
      location: src.location,
      locationLabel: src.locationLabel,
      version: src.branch || undefined,
      files: [...items.values()],
      hasChanges: decoration.hasChanges,
    };
  }), [decorationCatalog, folders, visibleSources]);

  const loadedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const src of visibleSources) {
      const prefix = folderKey(src.id, '');
      for (const key of [...Object.keys(folders), ...Object.keys(folderErrors)]) {
        if (key.startsWith(prefix)) keys.add(key);
      }
    }
    return [...keys];
  }, [folders, folderErrors, visibleSources]);

  const files: RepositoryPreviewFile[] = file ? [{ path: file.path, kind: file.kind, content: file.content, image: file.kind === 'image' ? file.content : undefined }] : [];

  const searchResults = searchRead.data?.flatMap(({ src, res }) => res.matches.map(item => ({
    ...item,
    line: item.line ?? undefined,
    repositoryId: src.id,
    sourceRepositoryId: src.repositoryId,
    repositoryName: visibleSources.length > 1 ? `${src.name} · ${src.locationLabel}` : '',
    kind: 'text' as const,
    content: '',
  })));
  const searchPartial = Boolean(searchRead.data?.some(item => item.res.truncated));
  const searchDiagnosticDetails = searchRead.data?.flatMap(item => item.res.diagnostics.map(d => d.message)) ?? [];
  const partialTree = visibleSources.some(src => {
    const prefix = folderKey(src.id, '');
    return Object.entries(folders).some(([key, dir]) => key.startsWith(prefix) && dir.truncated);
  });
  const directoryFailureDetails = Object.entries(folderErrors).map(([key, err]) => {
    const sep = key.indexOf('::');
    const bid = sep >= 0 ? key.slice(0, sep) : key;
    const rel = sep >= 0 ? key.slice(sep + 2) : '';
    const src = allSources.find(item => item.id === bid);
    return (src ? `${src.name} · ${src.location}${rel ? '/' + rel : ''}：` : '') + err;
  });

  // Tabs presentation matching CodeExplorerPage
  const fileTabs = tabs.map(tab => {
    const name = tab.path.split('/').at(-1) ?? tab.path;
    const duplicate = tabs.some(other => other.key !== tab.key && (other.path.split('/').at(-1) ?? other.path) === name);
    const src = allSources.find(item => item.id === tab.browserId);
    const folderLabel = src ? sourceName(src.location, src.locationLabel) : '';
    const sameLocation = src && tabs.some(other => other.browserId !== tab.browserId
      && other.path.split('/').at(-1) === name
      && allSources.find(item => item.id === other.browserId)?.location === src.location);
    const disambiguation = duplicate ? (sameLocation ? `${folderLabel} · ${src.locationLabel}` : folderLabel) : '';
    return {
      key: tab.key,
      kind: /\.md$/i.test(tab.path) ? 'doc' as const : 'svc' as const,
      title: (src?.location ?? scope.rootPath) + '/' + tab.path,
      label: <>{name}{disambiguation && <Tag>{disambiguation}</Tag>}</>,
      accessibleLabel: disambiguation ? `${disambiguation} · ${tab.path}` : name,
      closeLabel: '关闭文件 ' + (disambiguation ? `${disambiguation} · ${name}` : name),
    };
  });

  // Source filters in CodeTreePane (right sidebar top)
  const repositoryOptions = repos.map(repo => {
    const displayCode = repo.path ? (repo.code || repo.name) : (scope.name || repo.code || repo.name);
    const displayName = repo.path ? repo.name : (scope.name || repo.name);
    return { value: repo.path, label: codeRepositoryCode({ name: displayName, code: displayCode }), title: codeRepositoryLabel({ name: displayName, code: displayCode }) };
  });
  const selectedRepo = repos.find(repo => repo.path === repositoryPath);
  const contextControl = <section className="code-root-selectors directory-browse-source" aria-label="浏览来源">
    <div className="directory-browse-source-row">
      <span className="directory-browse-source-current" title={checkoutSource?.location || scope.rootPath}>
        <FolderOpenOutlined aria-hidden /><span>{checkout ? checkoutSource?.locationLabel || '所选工作树' : '工作空间目录'}</span>
      </span>
      <Button size="small" type="text" aria-expanded={choosingCheckout} onClick={() => {
        if (choosingCheckout) { setCheckout(null); setRepositoryPath(undefined); }
        onChooseCheckout(!choosingCheckout);
      }}>{choosingCheckout ? (checkout ? '返回工作空间目录' : '取消选择') : '选择工作树'}</Button>
    </div>
    {choosingCheckout && <div className="directory-browse-source-fields">
      <label><span>代码库</span><Select showSearch optionFilterProp="title" aria-label="选择代码库" placeholder="选择代码库" value={repositoryPath} loading={catalogLoading}
        onChange={value => { setRepositoryPath(value); prioritizeRepository?.(value); }} options={repositoryOptions} popupRender={selectPopupGuard} /></label>
      <label><span>工作树</span><Select showSearch optionFilterProp="label" aria-label="选择工作树" placeholder={selectedRepo?.pending ? '正在核对' : '选择工作树'} disabled={!selectedRepo || Boolean(selectedRepo.pending)} loading={Boolean(selectedRepo?.pending)}
        value={checkout?.repositoryId === selectedRepo?.id ? checkout?.checkoutId : undefined}
        onChange={id => { if (selectedRepo) setCheckout({ repositoryId: selectedRepo.id, checkoutId: id }); }}
        options={selectedRepo?.members.map(member => ({ value: member.id, label: member.isMain ? '主工作树' : member.name, title: member.location }))} popupRender={selectPopupGuard} /></label>
    </div>}
  </section>;
  const inScope = Boolean(!activeTab || visibleSources.some(src => src.id === activeTab.browserId));
  const includeActive = () => {
    if (!activeSource) return;
    setCheckout(activeSource.selection);
    setRepositoryPath(activeSource.selection ? activeSource.repositoryPath : undefined);
    if (activeSource.selection) onChooseCheckout(true);
  };

  const openActiveFolder = activeTab && file && !read.error
    ? () => requestForRef.current(activeTab.checkoutId ? { repositoryId: activeTab.repositoryId, checkoutId: activeTab.checkoutId } : null)('open-folder', { path: activeTab.path })
    : undefined;

  const refreshFile = useCallback(() => {
    setPage(undefined);
    bump(value => value + 1);
    onSaved();
  }, [onSaved]);

  const closeTab = (closingKey: string) => {
    tabReadingPositions.current.delete(closingKey);
    const index = tabs.findIndex(item => item.key === closingKey);
    const rest = tabs.filter(item => item.key !== closingKey);
    setTabs(rest);
    if (activeTab?.key === closingKey) setActiveKey(rest[Math.min(index, rest.length - 1)]?.key ?? '');
  };

  return <div className="code-explorer-stage harness-directory-explorer">
    <div className="code-file-stage">
      <div className="code-file-tabstrip">
        <ObjectTabStrip panelId={panelId} className="code-open-files" label="打开的文件" tabs={fileTabs} active={activeTab?.key} onActivate={key => { setActiveKey(key); setPage(undefined); }} onClose={closeTab} />
        {(tabs.length > 0 || treeHidden) && <ReadingToggle iconOnly className="code-reading-toggle" expanded={treeHidden} onToggle={() => setTreeHidden(value => !value)} />}
      </div>
      {choosingCheckout && catalogError && <Alert type="warning" message={catalogError} action={<Button onClick={() => void refreshCatalog()}>重试</Button>} />}
      {activeTab && !inScope && <div className="code-range-outside">当前文件不在筛选范围内。<Button type="link" size="small" onClick={includeActive}>加入范围</Button></div>}
      {checkout && !checkoutSource && <Alert type="warning" message={catalogLoading ? '正在核对所选工作树…' : '所选工作树暂不可读取，请重新选择。'} />}
      <div className="object-tab-panel" id={panelId} role={activeTab ? 'tabpanel' : undefined} aria-labelledby={activeTab ? tabElementId(panelId, activeTab.key) : undefined} tabIndex={activeTab ? 0 : undefined}>
        <RepositoryFileBrowser
          global
          treeOnRight
          readerActive={active}
          defaultCollapsedTree={defaultCollapsedTree}
          revealSelectionRequest={revealRequest}
          sidebarHost={host}
          treeRepositories={treeRepositories}
          files={files}
          repositoryName={activeSource?.name}
          repositoryTitle={activeSource?.fullName ?? activeSource?.name}
          repositoryId={activeTab?.repositoryId}
          checkoutId={activeTab?.checkoutId ?? undefined}
          observedDigest={currentText ? undefined : file?.digest}
          observedRevision={currentText ? editorSession?.file.revision || editableDoc?.revision : file?.revision}
          observedAt={currentText ? editorSession?.file.observedAt || editableDoc?.observedAt : file?.observedAt}
          selectedRepositoryId={activeTab?.browserId}
          selectedPath={activeTab?.path ?? ''}
          selectionKey={activeTab?.key}
          context={contextControl}
          contextInTree
          location={file?.source.location || activeSource?.location || scope.rootPath}
          version={file?.source.version || activeSource?.branch || '当前文件'}
          focusLine={activeTab?.line}
          focusRequest={activeTab?.focusRequest}
          readLoading={Boolean(activeTab && read.loading)}
          readError={activeTab ? read.error : undefined}
          readMessage={file?.message || undefined}
          readPage={file?.page}
          readMatchQuery={readQuery || undefined}
          sizeBytes={file?.sizeBytes}
          onReadPage={index => { if (file?.revision && activeTab) setPage({ key: activeTab.key, index, revision: file.revision }); }}
          canModify={false}
          onOpenFolder={openActiveFolder}
          onSelect={(rel, line, matchQuery) => { if (activeSource) openFile(activeSource.id, rel, line, matchQuery); }}
          onSelectRepositoryFile={openFile}
          onLoadDirectory={loadDirectory}
          onDirectoryExpansionChange={setExpandedKeys}
          loadedDirectoryKeys={loadedKeys}
          onSearch={handleSearch}
          onShowIgnored={setIgnored}
          searchResults={searchResults}
          searchLoading={searchRead.loading}
          searchIncomplete={searchPartial || Boolean(searchRead.error)}
          onRefreshDirectories={refreshDirectories}
          onRetry={refreshFile}
          onViewCurrent={refreshFile}
          onHideTree={() => setTreeHidden(true)}
          markdownRevision={Object.keys(media).join(',')}
          markdownOptions={markdownOptions}
          renderMarkdown={(input: WorkbenchMarkdownInput) => <MarkdownHost markdown={input.markdown} className={input.className} renderVersion={input.renderVersion} options={input.options as MarkdownRenderOptions | undefined} />}
          readerContent={currentText ? editorSession?.content : undefined}
          readerSelectedLines={activeTab && selection.key === activeTab.key ? selection.lines : null}
          readerSurface={currentText ? editableDoc ? <FileEditingPane
            file={{ ...editableDoc, locationLabel: activeSource?.locationLabel ?? editableDoc.locationLabel }}
            editing={editing}
            active={active}
            htmlPreview={editableDoc.kind === 'text' && /\.html?$/i.test(editableDoc.path)}
            focusLine={activeTab?.line}
            focusRequest={activeTab?.focusRequest}
            searchQuery={readQuery}
            onSelectLines={lines => { if (activeTab) setSelection({ key: activeTab.key, lines }); }}
            onOpenFolder={openActiveFolder}
            toolbarEnd={<Button size="small" type="text" aria-label="刷新当前文件" icon={<ReloadOutlined />} loading={read.loading} onClick={refreshFile} />}
            markdownRevision={Object.keys(media).join(',')}
            markdownOptions={markdownOptions}
            markdownReadingPosition={activeTab ? { positions: tabReadingPositions.current, key: activeTab.key } : undefined}
          /> : editableError ? <Alert type="error" showIcon message={editableError} action={<Button onClick={refreshFile}>重试</Button>} /> : <div className="repository-reading-empty"><Spin /> 正在准备编辑…</div> : undefined}
          treeNotice={<>
            {(searchPartial || partialTree) && <div className="code-tree-coverage" role="status"><InfoCircleOutlined /><span>{searchPartial ? '搜索未完整返回。每个工作树最多 100 个文件、200 条匹配行，请缩小关键词或范围。' : '目录达到读取上限，显示部分文件。'}</span></div>}
            <CodeExplorerNotices notices={[
              { kind: 'sources', title: '部分来源信息未能确认', details: choosingCheckout ? [catalogError, catalog?.diagnostic || ''].filter(Boolean) : [] },
              { kind: 'search', title: '部分搜索范围未完整读取', details: [searchRead.error, ...searchDiagnosticDetails].filter(Boolean) },
              { kind: 'directories', title: '部分目录暂不可读取', details: directoryFailureDetails },
            ]} onRetry={kind => {
              if (kind === 'sources') void refreshCatalog();
              else if (kind === 'search') void searchRead.refresh();
              else void refreshDirectories();
            }} />
          </>}
        />
      </div>
    </div>
    <CodeTreePane side="right" hidden={treeHidden} onHost={setHost} storageKey={`buildr.harness.tree-width.${workspaceId}`} />
  </div>;
}
