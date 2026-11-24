import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Spin } from 'antd';
import { ApartmentOutlined, CloseOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { FileEditingProvider } from '../../workbench/editor/FileEditingContext';
import { FileEditingSessionStore } from '../../workbench/editor/file-editing-session';
import type { FileEditingOperations } from '../../workbench/editor/file-editing-types';
import { WorkspaceFileEditingStores } from '../../workbench/editor/file-editing-workspaces';
import { WorkspaceViewActiveContext } from '../../workbench/ui/view-activity';
import type { EditableFileSnapshot } from '../../workbench/source-control/read-contracts';
import type { SourceControlFileTarget } from '../../workbench/source-control/source-control-model';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import { workspaceScopeKey } from '../../workspace-scopes';
import {
  directoryClient,
  directoryEditableDocument,
  directoryFileBinding,
  observeWorkspaceDirectory,
  post,
  type DirectoryCatalog,
  type DirectoryRequest,
  type DirectoryScope,
  type DirectorySelection,
} from './api';
import { DirectoryExplorer, type DirectoryOpenRequest } from './DirectoryExplorer';
import { DirectorySourceControl } from './DirectorySourceControl';
import { loadDirectoryCatalog } from './directory-catalog';
import {desktopNotify} from '../../dsh-desktop';
import './directory-workbench.css';

const unfinishedWorkspaces = new WorkspaceFileEditingStores();
const recentCatalogs = new Map<string, DirectoryCatalog>();

type Content = { id: string; title: string; icon?: ReactNode; render(active: boolean): ReactNode };

/** Presentation host: content can be assembled without knowing how chat or directories work. */
type ModuleTabs = { ids: string[]; selected: string; home: boolean };
const emptyTabs: ModuleTabs = { ids: [], selected: '', home: true };
function openModule(tabs: ModuleTabs, id: string): ModuleTabs {
  return { ids: tabs.ids.includes(id) ? tabs.ids : [...tabs.ids, id], selected: id, home: false };
}

function WorkspaceContent({ contents, active, tabs, setTabs, scope }: {
  contents: readonly Content[];
  active: boolean;
  tabs: ModuleTabs;
  setTabs(update: (old: ModuleTabs) => ModuleTabs): void;
  scope: DirectoryScope;
}) {
  const prefix = useId();
  const bar = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const { ids, selected: selectedContent, home } = tabs;
  const find = (id: string) => contents.find(content => content.id === id)!;
  const focus = (target: 'tab' | 'home' | 'add') => requestAnimationFrame(() => {
    const button = target === 'home'
      ? homeRef.current?.querySelector('button')
      : bar.current?.querySelector<HTMLButtonElement>(target === 'tab' ? '[role="tab"][aria-selected="true"]' : 'button.harness-workspace-add');
    button?.focus();
  });
  const select = (id: string, moveFocus = false) => {
    setTabs(old => openModule(old, id));
    if (moveFocus) focus('tab');
  };
  const close = (id: string) => {
    const index = ids.indexOf(id), next = ids.filter(value => value !== id);
    const target = id === selectedContent ? next[index] ?? next.at(-1) ?? '' : selectedContent;
    setTabs(() => ({ ids: next, selected: target, home: home || !target }));
    focus(home || !target ? 'add' : 'tab');
  };
  return <div className="harness-workspace-content">
    <header className="harness-workspace-bar" ref={bar}>
      {!ids.length ? <span className="harness-workspace-view-label">工作区</span> : <div className="harness-workspace-tabs" role="tablist" aria-label="已打开的工作区模块">
        {ids.map((id, index) => {
          const content = find(id), selected = id === selectedContent && !home;
          return <div className={'harness-workspace-tab' + (selected ? ' is-active' : '')} key={id}>
            <button type="button" role="tab" aria-label={content.title} id={prefix + '-tab-' + id} aria-controls={prefix + '-pane-' + id} aria-selected={selected} tabIndex={id === selectedContent ? 0 : -1} onClick={() => select(id)} onKeyDown={event => {
              const next = event.key === 'ArrowLeft' ? ids[(index + ids.length - 1) % ids.length] : event.key === 'ArrowRight' ? ids[(index + 1) % ids.length] : event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : undefined;
              if (next) { event.preventDefault(); select(next, true); } else if (event.key === 'Delete') { event.preventDefault(); close(id); }
            }}><span aria-hidden="true">{content.icon}</span><span>{content.title}</span></button>
            <Button type="text" size="small" tabIndex={selected ? 0 : -1} aria-label={'关闭' + content.title + '标签'} title={'关闭' + content.title + '标签'} icon={<CloseOutlined />} onClick={() => close(id)} />
          </div>;
        })}
      </div>}
      <Button className="harness-workspace-add" type="text" size="small" aria-label="打开工作区模块" title="打开工作区模块" icon={<PlusOutlined />} aria-expanded={home} aria-controls={home ? prefix + '-home' : undefined} onClick={() => { setTabs(old => ({ ...old, home: true })); focus('home'); }} />
      <span className="harness-workspace-location" title={scope.rootPath}>{scope.name}</span>
    </header>
    {home && <div className="harness-workspace-home" id={prefix + '-home'} ref={homeRef} onKeyDown={event => {
      if (event.key === 'Escape' && selectedContent) { event.preventDefault(); select(selectedContent, true); }
    }}>
      <h2>对话工作区</h2><p>在同一工作空间里浏览文件、查看变更。</p>
      <nav aria-label="工作区内容">{contents.map(content => <button type="button" key={content.id} onClick={() => select(content.id, true)}>
        <span aria-hidden="true">{content.icon}</span><strong>{content.title}</strong>{ids.includes(content.id) && <small aria-hidden="true">已打开</small>}
      </button>)}</nav>
    </div>}
    {ids.map(id => {
      const paneActive = active && !home && id === selectedContent;
      return <section className="harness-directory-workbench-pane" key={id} id={prefix + '-pane-' + id} role="tabpanel" aria-labelledby={prefix + '-tab-' + id} hidden={home || id !== selectedContent}>
        <WorkspaceViewActiveContext.Provider value={paneActive}>
          {find(id).render(paneActive)}
        </WorkspaceViewActiveContext.Provider>
      </section>;
    })}
  </div>;
}

export type DirectoryReveal = { workspaceId: string; revision: string; path: string; line?: number; checkout?: DirectorySelection };

export function HarnessDirectoryWorkbench({ active = true, workspaceId, workspaceName, onDirectoryAdded, reveal, module }: {
  active?: boolean;
  reveal?: DirectoryReveal;
  workspaceId?: string;
  workspaceName?: string;
  onDirectoryAdded(workspaceId: string): void;
  module?: 'explorer' | 'source-control';
}) {
  const [observation, setObservation] = useState<{ id: string; scope?: DirectoryScope; error?: string }>();
  const [attempt, retry] = useState(0), [choosing, setChoosing] = useState(false), [chooseError, setChooseError] = useState('');
  const [tabs, setTabs] = useState<ModuleTabs>(emptyTabs);
  const current = observation?.id === workspaceId ? observation : undefined;
  const workspaceRef = useRef(workspaceId); workspaceRef.current = workspaceId;
  useEffect(() => {
    if (!active || !workspaceId) return;
    const controller = new AbortController();
    void observeWorkspaceDirectory(workspaceId, controller.signal).then(scope => {
      if (!controller.signal.aborted) setObservation({ id: workspaceId, scope });
    }).catch(failure => {
      if (!controller.signal.aborted) setObservation({ id: workspaceId, error: failure instanceof Error ? failure.message : '无法读取此工作空间的目录。' });
    });
    return () => controller.abort();
  }, [active, workspaceId, attempt]);
  const add = async () => {
    if (choosing) return;
    setChoosing(true); setChooseError('');
    try {
      const result = await post<{ path: string | null }>('/api/v1/harness/directories/choose', {});
      if (!result.path || workspaceRef.current !== undefined) return;
      const entry = await post<DirectoryScope>('/api/v1/harness/directories', { path: result.path });
      if (workspaceRef.current === undefined) onDirectoryAdded(workspaceScopeKey(entry.ref));
    } catch (failure) { setChooseError(failure instanceof Error ? failure.message : '目录未添加。'); }
    finally { setChoosing(false); }
  };
  const observedScope = current?.scope;
  const scope = useMemo(() => observedScope && ({ ...observedScope, name: workspaceName || observedScope.name || '当前工作空间' }), [observedScope, workspaceName]);
  return <div className="harness-directory-workbench">
    {!workspaceId ? <Empty description="选择工作空间后即可浏览文件和变更，无需先发送消息。">
      <Button onClick={() => void add()} loading={choosing}>添加本机目录</Button>
      {chooseError && <Alert type="warning" message={chooseError} />}
    </Empty> : scope ? <DirectoryPanels key={workspaceId + ':' + scope.revision} scope={scope} workspaceId={workspaceId} reveal={reveal?.workspaceId === workspaceId && reveal.revision === scope.revision ? reveal : undefined} active={active} tabs={tabs} setTabs={setTabs} module={module} /> : current?.error ?
      <Alert type="warning" showIcon message="当前工作空间目录不可用" description={current.error} action={<Button size="small" onClick={() => retry(value => value + 1)}>重新读取</Button>} /> : <div className="harness-workspace-loading" role="status"><Spin size="small" /> 正在读取当前工作空间…</div>}
  </div>;
}

const noInput: {more?: boolean; keepDiscovery?: boolean} = {};

function DirectoryPanels({ scope, workspaceId, active, tabs, setTabs, reveal, module }: {
  scope: DirectoryScope;
  module?: 'explorer' | 'source-control';
  workspaceId: string;
  active: boolean;
  reveal?: DirectoryReveal;
  tabs: ModuleTabs;
  setTabs(update: (old: ModuleTabs) => ModuleTabs): void;
}) {
  const [opened, setOpened] = useState<DirectoryOpenRequest>();
  const [version, bump] = useState(0);
  const [selected, setSelected] = useState<DirectorySelection | null>();
  const catalogKey = workspaceId + ':' + scope.ref.id + ':' + scope.revision;
  const base = useMemo(() => directoryClient(scope, workspaceId), [scope, workspaceId]);
  const catalogRef = useRef<DirectoryCatalog | null>(recentCatalogs.get(catalogKey) ?? null);
  const priority = useRef<string | undefined>(undefined);
  const load = useCallback((input: typeof noInput, signal: AbortSignal, publish: (value: DirectoryCatalog) => void) =>
    loadDirectoryCatalog(base, catalogRef.current, !!input.more, !!input.keepDiscovery, () => priority.current, signal, publish), [base]);
  const catalog = useSourceControlRead(catalogKey, noInput, load, active, '', recentCatalogs);
  const repos = catalog.data?.repositories ?? [];
  catalogRef.current = catalog.data;
  const refreshCatalog = catalog.refresh;
  const [discoveringMore, setDiscoveringMore] = useState(false);
  const discoverMore = useCallback(async () => {
    if (discoveringMore) return;
    setDiscoveringMore(true);
    try { await refreshCatalog({ more: true }); }
    finally { setDiscoveringMore(false); }
  }, [discoveringMore, refreshCatalog]);
  const observingGit = active && (module === 'source-control' || !module && !tabs.home && tabs.selected === 'source-control');
  const observation = useRef({ catalog, observingGit });
  observation.current = { catalog, observingGit };
  useEffect(() => {
    if (!observingGit) return;
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function observe() {
      try {
        const before = observation.current.catalog;
        if (document.visibilityState === 'hidden' || before.loading || !before.data?.topologyPaths) return;
        const { repositoryRevisions } = await base<{repositoryRevisions: Array<{path:string;revision:string}>}>('git-topology', { repositoryPaths: before.data.topologyPaths }, stop.signal);
        const revisions = new Map(repositoryRevisions.map(item => [item.path,item.revision]));
        const changed = before.data.repositories.some(repo => revisions.has(repo.path) && revisions.get(repo.path) !== repo.topologyRevision);
        const latest = observation.current;
        if (!stop.signal.aborted && latest.observingGit && document.visibilityState === 'visible' && !latest.catalog.loading
            && latest.catalog.data === before.data && changed) await refreshCatalog({keepDiscovery:true});
      } catch { /* Retain the last read; a later tick or manual refresh can recover. */ }
      finally { if (!stop.signal.aborted) timer = setTimeout(observe, 3500); }
    }
    timer = setTimeout(observe, 500);
    return () => { stop.abort(); clearTimeout(timer); };
  }, [observingGit, base, refreshCatalog]);
  const first = repos.find(item => item.path === '') ?? repos.find(item => item.pending || item.checkouts.defaultId);
  const rootRepo = first?.pending ? undefined : first;
  const defaultSelection: DirectorySelection | null = rootRepo
    ? { repositoryId: rootRepo.id, checkoutId: rootRepo.checkouts.defaultId ?? rootRepo.members[0]?.id ?? '' }
    : null;
  const current = selected === undefined ? (defaultSelection?.checkoutId ? defaultSelection : null) : selected;
  const requestFor = useCallback((selection: DirectorySelection | null): DirectoryRequest => {
    if (!selection?.checkoutId) return base;
    const repo = catalogRef.current?.repositories.find(item => item.id === selection.repositoryId);
    return directoryClient(scope, workspaceId, selection.checkoutId, repo?.path ?? '');
  }, [base, scope, workspaceId]);

  const operations = useMemo<FileEditingOperations>(() => {
    const requestForBinding = (snapshot: EditableFileSnapshot): DirectoryRequest => {
      const sel = snapshot.selector;
      if (sel.kind === 'code') {
        const repo = catalogRef.current?.repositories.find(item => item.id === sel.repositoryId);
        if (repo) return directoryClient(scope, workspaceId, sel.checkoutId, repo.path);
      }
      return base;
    };
    return {
      read: async file => {
        const binding = directoryFileBinding(file);
        if (!binding) throw new Error('文件来源身份不完整，请重新打开。');
        const next = await requestForBinding(binding.snapshot)<EditableFileSnapshot>('editor', { path: binding.snapshot.path });
        return directoryEditableDocument(workspaceId, next);
      },
      save: async (file, content, expectedRevision) => {
        const binding = directoryFileBinding(file);
        if (!binding) throw new Error('文件来源身份不完整，请重新打开。');
        try {
          const saved = await requestForBinding(binding.snapshot)<EditableFileSnapshot>('save', {
            path: binding.snapshot.path,
            content,
            expectedFileId: binding.snapshot.fileId,
            expectedSourceRevision: binding.snapshot.sourceRevision,
            expectedRevision,
          });
          void refreshCatalog({keepDiscovery:true});
          return directoryEditableDocument(workspaceId, saved);
        } catch (error) {
          const failure = error as { code?: string; details?: unknown };
          const currentSnapshot = (failure.details as { current?: EditableFileSnapshot } | undefined)?.current;
          if (failure.code === 'file_revision_conflict' && currentSnapshot) {
            failure.details = { current: directoryEditableDocument(workspaceId, currentSnapshot) };
          }
          throw error;
        }
      },
    };
  }, [base, refreshCatalog, scope, workspaceId]);

  const [store] = useState(() => unfinishedWorkspaces.take(workspaceId) || new FileEditingSessionStore(operations));
  useEffect(() => () => { void unfinishedWorkspaces.suspend(workspaceId, store); }, [workspaceId, store]);
  // Ensure operations are updated cleanly inside useFileEditingController by passing store to FileEditingProvider,
  // while keeping FileEditingProvider inside DirectoryPanels so open/save events share one session store.
  const open = useCallback((target: DirectorySelection | null, path: string, line?: number) => {
    setSelected(target);
    setOpened(previous => ({ source: target, path, line, nonce: (previous?.nonce ?? 0) + 1 }));
    setTabs(old => openModule(old, 'explorer'));
  }, [setTabs]);
  const ready = Boolean(catalog.data || catalog.error);
  const revealedRef = useRef('');
  useEffect(() => {
    if (!reveal || !ready) return;
    const signature = JSON.stringify([reveal.workspaceId, reveal.revision, reveal.path, reveal.line ?? null,reveal.checkout]);
    if (revealedRef.current === signature) return;
    if (reveal.checkout) {
      const repo = catalog.data?.repositories.find(item => item.id === reveal.checkout!.repositoryId);
      if (!repo?.members.some(member => member.id === reveal.checkout!.checkoutId)) return;
    }
    revealedRef.current = signature;
    open(reveal.checkout ?? (defaultSelection?.checkoutId ? defaultSelection : null), reveal.path, reveal.line);
  }, [open, reveal, ready, catalog.data, defaultSelection?.repositoryId, defaultSelection?.checkoutId]);
  const openFromGit = useCallback((target: SourceControlFileTarget) => {
    const checkout = target.worktreeId ? { repositoryId: target.repositoryId, checkoutId: target.worktreeId } : undefined;
    if (module === 'source-control') desktopNotify({ kind:'reveal', file:{workspaceId,revision:scope.revision,path:target.path,checkout} });
    else open(checkout ?? null, target.path);
  }, [open, module, workspaceId, scope.revision]);
  const selectSource = useCallback((target: DirectorySelection | null) => {
    setSelected(target);
  }, []);

  return <FileEditingProvider operations={operations} store={store}>
    <ModuleContents scope={scope} active={active} tabs={tabs} setTabs={setTabs} module={module} contents={[
      {
        id: 'explorer',
        title: '资源管理器',
        icon: <FolderOpenOutlined />,
        render: paneActive => !ready
          ? <div className="harness-workspace-loading" role="status"><Spin size="small" /> 正在读取目录…</div>
          : <DirectoryExplorer
              workspaceId={workspaceId}
              scope={scope}
              scopeKey={scope.ref.id + ':' + scope.revision}
              catalog={catalog.data}
              catalogError={catalog.error}
              catalogLoading={catalog.loading}
              refreshCatalog={refreshCatalog}
              prioritizeRepository={repositoryPath => { priority.current = repositoryPath; }}
              source={current}
              requestFor={requestFor}
              active={paneActive}
              initialTreeOpen={module==='explorer'}
              opened={opened}
              onSaved={() => bump(value => value + 1)}
            />,
      },
      {
        id: 'source-control',
        title: '源代码管理',
        icon: <ApartmentOutlined />,
        render: paneActive => <DirectorySourceControl
          workspaceId={workspaceId}
          scope={scope}
          baseRequest={base}
          requestFor={requestFor}
          active={paneActive && ready}
          version={version}
          current={current}
          explicitSelection={selected}
          catalog={catalog.data}
          catalogError={catalog.error}
          catalogLoading={catalog.loading}
          refreshCatalog={async () => { await refreshCatalog(); bump(v => v + 1); }}
          discoverMore={discoverMore}
          discoveringMore={discoveringMore}
          prioritizeRepository={repositoryPath => { priority.current = repositoryPath; }}
          onSelectCheckout={selectSource}
          onOpenCurrent={openFromGit}
        />,
      },
    ]} />
  </FileEditingProvider>;
}

function ModuleContents({module,...props}: Parameters<typeof WorkspaceContent>[0] & {module?: 'explorer'|'source-control'}) {
  if(!module)return <WorkspaceContent {...props}/>;
  return <section className="harness-directory-workbench-pane" aria-label={props.contents.find(content=>content.id===module)?.title}>
    <WorkspaceViewActiveContext.Provider value={props.active}>
      {props.contents.find(content=>content.id===module)?.render(props.active)}
    </WorkspaceViewActiveContext.Provider>
  </section>;
}
