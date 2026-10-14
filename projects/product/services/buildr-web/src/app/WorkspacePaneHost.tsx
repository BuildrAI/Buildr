import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { WorkspacePaneStage } from '../components/WorkspaceStage';
import type { WorkspaceObjectTab } from '../components/ObjectTabStrip';
import { PageTabStrip } from './PageTabStrip';
import { tabElementId, tabPanelId } from '../lib/tab-navigation';
import type { WorkspacePageTab } from './workspace-pages';
import { WorkspacePaneContext, type WorkspacePaneHostValue, type WorkspacePaneRegistration } from './WorkspacePaneContext';
import './workspace-pane-host.css';

export { useWorkspacePaneHost, useWorkspacePaneRegistration } from './WorkspacePaneContext';
export type { WorkspacePaneRegistration, WorkspacePaneView } from './WorkspacePaneContext';
export type WorkspacePageNavigationRequest = { sequence: number; destination: string };

type Selection = { ownerPath: string; localKey: string };
type RecordEntry = { latest: RefObject<WorkspacePaneRegistration | null>; signature: string; snapshot: WorkspacePaneRegistration };
type GlobalObject = WorkspaceObjectTab & Selection;
type Props = {
  children: ReactNode;
  workspaceId: string;
  currentPath: string;
  enabled: boolean;
  tabs: WorkspacePageTab[];
  paneWidth: number;
  navigationRequest?: WorkspacePageNavigationRequest;
  ensurePage: (key: string) => void;
  activatePage: (key: string) => void;
  closePage: (key: string) => void;
  reorderPage: (key: string, index: number) => void;
};
type HostState = Props & {
  records: WorkspacePaneRegistration[];
  objects: GlobalObject[];
  displayedPage: string;
  displayedObject: GlobalObject | undefined;
  pageCollapsed: boolean;
  contentCollapsed: boolean;
  pagePeekOpen: boolean;
  objectPeekOpen: boolean;
  selectPage: (key: string) => void;
  selectObject: (key: string) => void;
  collapsePage: (next: boolean) => void;
  collapseContent: (next: boolean) => void;
  setPagePeekOpen: (next: boolean) => void;
  setObjectPeekOpen: (next: boolean) => void;
  closeObject: (key: string) => void;
  closeAll: () => void;
};
const HostContext = createContext<HostState | null>(null);
const objectKey = ({ ownerPath, localKey }: Selection) => JSON.stringify([ownerPath, localKey]);
const sameSelection = (a: Selection | null, b: Selection | null) => a?.ownerPath === b?.ownerPath && a?.localKey === b?.localKey;
const signature = (record: WorkspacePaneRegistration) => JSON.stringify([
  record.pageKey, record.activeObject, record.objectContentLayout, record.objectLabel, record.retainObjectContent,
  record.objectTabs.map(tab => [tab.key, tab.kind, tab.title, tab.identity, tab.contentLayout, tab.contentLabel, tab.dirty, tab.accessibleLabel, tab.closeLabel]),
]);

/** Owns presentation and selection; all data, drafts and business operations stay in registered pages. */
export function WorkspacePaneHostProvider(props: Props) {
  const registry = useRef(new Map<string, RecordEntry>());
  const [revision, updateRevision] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const [peekSelection, setPeekSelection] = useState<Selection | null>(null);
  const peekSelectionRef = useRef(peekSelection); peekSelectionRef.current = peekSelection;
  const [peekPage, setPeekPage] = useState<string | null>(null);
  const peekPageRef = useRef(peekPage); peekPageRef.current = peekPage;
  const [pageCollapsed, setPageCollapsed] = useState(false);
  const [contentCollapsed, setContentCollapsed] = useState(false);
  const [pagePeekOpen, setPagePeekOpen] = useState(false);
  const [objectPeekOpen, setObjectPeekOpen] = useState(false);
  const pendingReveal = useRef<{ ownerPath: string; localKey?: string } | null>(null);
  const latest = useRef({ currentPath: props.currentPath, pageVisiblePath: props.currentPath });
  latest.current = { currentPath: props.currentPath, pageVisiblePath: pageCollapsed && pagePeekOpen ? peekPage || props.currentPath : props.currentPath };

  const commitSelection = useCallback((next: Selection | null) => {
    selectionRef.current = next;
    setSelection(previous => sameSelection(previous, next) ? previous : next);
  }, []);
  const revealContent = useCallback((ownerPath: string, localKey?: string) => {
    const record = registry.current.get(ownerPath)?.latest.current;
    const tab = localKey ? record?.objectTabs.find(item => item.key === localKey) : record?.objectTabs.find(item => item.key === record.activeObject) || record?.objectTabs.at(-1);
    if (!record || !tab) { pendingReveal.current = { ownerPath, localKey }; return; }
    pendingReveal.current = null;
    commitSelection({ ownerPath, localKey: tab.key });
    setContentCollapsed(false);
    setObjectPeekOpen(false);
    peekSelectionRef.current = null; setPeekSelection(null);
    if (record.activeObject !== tab.key) record.onActivateObject?.(tab.key);
  }, [commitSelection]);
  const publish = useCallback((ownerPath: string) => {
    const entry = registry.current.get(ownerPath), record = entry?.latest.current;
    if (!entry || !record) return;
    const next = signature(record);
    if (next === entry.signature) return;
    const previous = entry.signature ? entry.snapshot : null;
    entry.signature = next;
    entry.snapshot = { ...record, objectTabs: record.objectTabs.map(tab => ({ ...tab })) };
    updateRevision(value => value + 1);
    const pending = pendingReveal.current;
    if (pending?.ownerPath === ownerPath && (pending.localKey ? record.objectTabs.some(tab => tab.key === pending.localKey) : record.objectTabs.length > 0)) {
      revealContent(ownerPath, pending.localKey);
    } else if (previous && record.activeObject !== previous.activeObject && record.activeObject
      && (ownerPath === selectionRef.current?.ownerPath || ownerPath === latest.current.currentPath)
      && record.objectTabs.some(tab => tab.key === record.activeObject)) {
      commitSelection({ ownerPath, localKey: record.activeObject });
    } else if (!previous && ownerPath === latest.current.currentPath && !selectionRef.current && record.activeObject) {
      revealContent(ownerPath, record.activeObject);
    }
  }, [revealContent, commitSelection]);
  const register = useCallback((ownerPath: string, ref: RefObject<WorkspacePaneRegistration | null>) => {
    const record = ref.current;
    if (!record) return () => {};
    registry.current.set(ownerPath, { latest: ref, signature: '', snapshot: record });
    publish(ownerPath);
    return () => {
      if (registry.current.get(ownerPath)?.latest !== ref) return;
      registry.current.delete(ownerPath);
      if (pendingReveal.current?.ownerPath === ownerPath) pendingReveal.current = null;
      updateRevision(value => value + 1);
    };
  }, [publish]);
  const records = useMemo(() => [...registry.current.values()].map(entry => entry.snapshot), [revision]);
  const objects = records.flatMap(record => record.objectTabs.map(tab => ({ ...tab, key: objectKey({ ownerPath: record.ownerPath, localKey: tab.key }), ownerPath: record.ownerPath, localKey: tab.key })));
  const selected = selection ? objects.find(tab => objectKey(tab) === objectKey(selection)) || objects.find(tab => tab.ownerPath === selection.ownerPath && tab.localKey === registry.current.get(selection.ownerPath)?.snapshot.activeObject) || objects.at(-1) : undefined;
  const displayedObject = contentCollapsed && peekSelection ? objects.find(tab => objectKey(tab) === objectKey(peekSelection)) || selected : selected;
  const lastHostedPage = useRef(props.currentPath);
  const hostedCurrent = props.enabled && records.some(record => record.ownerPath === props.currentPath);
  if (hostedCurrent) lastHostedPage.current = props.currentPath;
  const displayedPage = pageCollapsed && peekPage ? peekPage : hostedCurrent ? props.currentPath : lastHostedPage.current;

  useEffect(() => {
    const current = selectionRef.current;
    if (!selected && current && registry.current.get(current.ownerPath)?.latest.current?.objectTabs.some(tab => tab.key === current.localKey)) return;
    if (selected) { if (!sameSelection(selectionRef.current, selected)) commitSelection({ ownerPath: selected.ownerPath, localKey: selected.localKey }); }
    else { commitSelection(null); setPageCollapsed(false); setContentCollapsed(false); setPagePeekOpen(false); setObjectPeekOpen(false); }
  }, [selected?.key, commitSelection]);
  useEffect(() => { if (!pagePeekOpen) { peekPageRef.current = null; setPeekPage(null); } }, [pagePeekOpen]);
  useEffect(() => { if (!objectPeekOpen) { peekSelectionRef.current = null; setPeekSelection(null); } }, [objectPeekOpen]);
  useEffect(() => {
    setPageCollapsed(false); setPagePeekOpen(false); peekPageRef.current = null; setPeekPage(null);
  }, [props.currentPath, props.navigationRequest?.sequence]);

  const selectPage = (key: string) => {
    const tab = props.tabs.find(item => item.key === key);
    if (!tab) return;
    props.ensurePage(key);
    if (pageCollapsed) { peekPageRef.current = tab.path; setPeekPage(tab.path); }
    else props.activatePage(key);
  };
  const selectObject = (key: string) => {
    const tab = objects.find(item => item.key === key);
    if (!tab) return;
    if (contentCollapsed) { const next = { ownerPath: tab.ownerPath, localKey: tab.localKey }; peekSelectionRef.current = next; setPeekSelection(next); }
    else revealContent(tab.ownerPath, tab.localKey);
  };
  const collapsePage = (next: boolean) => {
    if (next && !objects.length) return;
    if (!next && peekPageRef.current) {
      const tab = props.tabs.find(item => item.path === peekPageRef.current);
      if (tab) props.activatePage(tab.key);
    }
    setPageCollapsed(next); setPagePeekOpen(false);
    if (next) { setContentCollapsed(false); setObjectPeekOpen(false); }
    peekPageRef.current = null; setPeekPage(null);
  };
  const collapseContent = (next: boolean) => {
    if (!next && peekSelectionRef.current) revealContent(peekSelectionRef.current.ownerPath, peekSelectionRef.current.localKey);
    setContentCollapsed(next); setObjectPeekOpen(false);
    if (next) { setPageCollapsed(false); setPagePeekOpen(false); }
    peekSelectionRef.current = null; setPeekSelection(null);
  };
  const closeObject = (key: string) => {
    const tab = objects.find(item => item.key === key);
    if (tab) registry.current.get(tab.ownerPath)?.latest.current?.onCloseObject?.(tab.localKey);
  };
  const closeAll = () => { for (const entry of registry.current.values()) entry.latest.current?.onCloseAll?.(); };
  const viewFor = (ownerPath: string) => ({
    registered: registry.current.has(ownerPath),
    pageVisible: props.enabled && (pageCollapsed && pagePeekOpen ? peekPage || props.currentPath : props.currentPath) === ownerPath && (!pageCollapsed || pagePeekOpen),
    pageTransient: Boolean(props.enabled && pageCollapsed && pagePeekOpen && displayedPage === ownerPath),
    contentVisible: hostedCurrent && displayedObject?.ownerPath === ownerPath && (!contentCollapsed || objectPeekOpen),
    displayedObject: displayedObject?.ownerPath === ownerPath ? displayedObject.localKey : registry.current.get(ownerPath)?.snapshot.activeObject || null,
    transient: Boolean(props.enabled && contentCollapsed && objectPeekOpen && displayedObject?.ownerPath === ownerPath),
  });
  const publicValue: WorkspacePaneHostValue = { register, publish, revealContent, viewFor };
  return <WorkspacePaneContext.Provider value={publicValue}><HostContext.Provider value={{ ...props, records, objects, displayedPage, displayedObject, pageCollapsed, contentCollapsed, pagePeekOpen, objectPeekOpen, selectPage, selectObject, collapsePage, collapseContent, setPagePeekOpen, setObjectPeekOpen, closeObject, closeAll }}>{props.children}</HostContext.Provider></WorkspacePaneContext.Provider>;
}

function MountedContent({ target, hidden, id, labelledBy }: { target: HTMLElement; hidden: boolean; id?: string; labelledBy?: string }) {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { slot.current?.append(target); return () => { target.remove(); }; }, [target]);
  useLayoutEffect(() => { target.hidden = hidden; }, [target, hidden]);
  return <div ref={slot} className="workspace-pane-mount" hidden={hidden} id={id} role={id ? 'tabpanel' : undefined} aria-labelledby={labelledBy} />;
}

/** One shared shell; every owner target stays mounted in its original pane slot. */
export function WorkspacePaneHost() {
  const host = useContext(HostContext);
  if (!host || !host.records.length) return null;
  const page = host.tabs.find(tab => tab.path === host.displayedPage);
  const objectRecord = host.records.find(record => record.ownerPath === host.displayedObject?.ownerPath);
  const tab = host.displayedObject;
  const layout = tab?.contentLayout ?? objectRecord?.objectContentLayout;
  const headerWidth = host.pageCollapsed ? '48px' : `calc(100% - ${host.paneWidth}px)`;
  return <div className="workspace-pane-host" hidden={!host.enabled || !host.records.some(record => record.ownerPath === host.currentPath)} style={{ '--workspace-page-header-width': headerWidth } as CSSProperties}>
    <div className="workspace-page-tabs" style={{ width: headerWidth }}>
      {!host.pageCollapsed && <PageTabStrip idPrefix={`workspace-${host.workspaceId}`} tabs={host.tabs} onClose={host.closePage} onReorder={host.reorderPage} />}
    </div>
    <div className="workspace-page workspace-pane-stage">
      <WorkspacePaneStage pageTabs={host.tabs} activePage={page?.key} onActivatePage={host.selectPage} onClosePageTab={host.closePage}
        objectTabs={tab ? host.objects : []} activeObject={tab?.key || null} objectIdentity={tab ? JSON.stringify([tab.ownerPath, tab.identity || tab.localKey]) : undefined}
        onActivateObject={host.selectObject} onCloseObject={host.closeObject} onCloseAll={host.closeAll}
        objectContentLayout={layout} objectLabel={tab?.contentLabel ?? objectRecord?.objectLabel} retainObjectContent
        objectCollapse={{ collapsed: host.contentCollapsed, onChange: host.collapseContent, dirty: host.objects.some(item => item.dirty) }}
        pageCollapse={{ collapsed: host.pageCollapsed, onChange: host.collapsePage, label: page?.title }} collapsePresentation="peek"
        pagePeek={{ open: host.pagePeekOpen, onChange: host.setPagePeekOpen }} objectPeek={{ open: host.objectPeekOpen, onChange: host.setObjectPeekOpen }}
        objectContent={<>{host.records.map(record => <MountedContent key={record.ownerPath} target={record.contentTarget} hidden={record.ownerPath !== tab?.ownerPath} />)}</>}>
        {host.records.map(record => <MountedContent key={record.ownerPath} target={record.pageTarget} hidden={record.ownerPath !== host.displayedPage} id={tabPanelId(`workspace-${host.workspaceId}`, record.ownerPath)} labelledBy={tabElementId(`workspace-${host.workspaceId}`, record.pageKey)} />)}
      </WorkspacePaneStage>
    </div>
  </div>;
}
