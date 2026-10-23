import { SplitDivider } from './SplitDivider';
import { Button } from 'antd';
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { CloseOutlined, DoubleLeftOutlined, DoubleRightOutlined } from '@ant-design/icons';
import { ReadingToggle } from './ReadingToggle';
import { PaneToggleButton } from './PaneToggleButton';
import { CollapsedPaneTabs } from './CollapsedPaneTabs';
import { usePanePeek } from './usePanePeek';
import { ObjectTabStrip, type WorkspaceObjectTab } from './ObjectTabStrip';
import { useWorkspacePageTabs, WorkspaceViewActiveContext, WorkspaceViewTransientContext, type WorkspacePageTab } from '../app/pageTabs';
import { PageTabRowContext, useWorkspacePaneRegistration } from '../app/WorkspacePaneContext';

import { InsideResourcePreview, ProjectPreviewContext, useResourcePreview } from '../app/resource-preview';
import { paneDimensions } from '../app/workspace-pages';
import { tabElementId } from '../lib/tab-navigation';
import './workspace-stage.css';

/** 对象级页签：领域内点开的服务/文档/变更，页内对照，全关时右组退场。 */
export type { ObjectTabKind, WorkspaceObjectTab } from './ObjectTabStrip';

export type WorkspaceObjectContentState = {
  displayedKey: string | null;
  dockedKey: string | null;
  transient: boolean;
  visible: boolean;
};

type WorkspaceStageProps = Omit<WorkspacePaneStageProps, 'objectContent'> & {
  objectContent?: ReactNode | ((state: WorkspaceObjectContentState) => ReactNode);
};

export function WorkspaceStage(props: WorkspaceStageProps) {
  const inside = useContext(InsideResourcePreview);
  const viewActive = useContext(WorkspaceViewActiveContext);
  const inheritedTransient = useContext(WorkspaceViewTransientContext);
  const previews = useResourcePreview(), location = useLocation();
  const state = previews?.states[location.pathname];
  const previewRoot = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<string, number>>({});
  const [pageTarget] = useState(() => document.createElement('div'));
  const [contentTarget] = useState(() => document.createElement('div'));
  pageTarget.dataset.workspacePaneOwner = location.pathname;
  contentTarget.dataset.workspacePaneOwner = location.pathname;
  const resourceTabs: WorkspaceObjectTab[] = (inside ? [] : state?.items || []).map(item => ({ key: 'preview:' + item.kind, kind: 'svc', title: item.title, identity: item.kind + ':' + item.id, contentLayout: 'reading' }));
  const active = !inside && state?.active ? 'preview:' + state.active : props.activeObject || null;
  const activate = (key: string) => {
    if (key.startsWith('preview:')) previews?.activate(location.pathname, key.slice(8));
    else { previews?.activate(location.pathname, ''); props.onActivateObject?.(key); }
  };
  const close = (key: string) => { if (key.startsWith('preview:')) previews?.close(location.pathname, key.slice(8)); else props.onCloseObject?.(key); };
  const paneView = useWorkspacePaneRegistration(inside ? null : {
    ownerPath: location.pathname,
    pageKey: props.pageTabs.find(tab => tab.path === location.pathname)?.key || location.pathname,
    pageTarget, contentTarget,
    objectTabs: [...(props.objectTabs || []), ...resourceTabs].map(tab => ({ ...tab, identity: tab.identity || tab.key })),
    activeObject: active,
    objectContentLayout: props.objectContentLayout,
    objectLabel: props.objectLabel,
    retainObjectContent: props.retainObjectContent,
    onActivateObject: activate,
    onCloseObject: close,
    onCloseAll: () => { previews?.clear(location.pathname); for (const tab of props.objectTabs || []) props.onCloseObject?.(tab.key); },
  });
  const displayed = paneView ? paneView.displayedObject : active;
  const resourceKind = displayed?.startsWith('preview:') ? displayed.slice(8) : null;
  const transient = inheritedTransient || Boolean(paneView?.transient);
  const contentVisible = paneView ? paneView.contentVisible : viewActive;
  const ownState: WorkspaceObjectContentState = { displayedKey: resourceKind ? null : displayed, dockedKey: props.activeObject || null, transient, visible: contentVisible && !resourceKind };
  const ownContent = typeof props.objectContent === 'function' ? props.objectContent(ownState) : props.objectContent;
  const readingKey = props.activeObject || '$main';
  useLayoutEffect(() => {
    if (!inside) return;
    const host = previewRoot.current?.closest('.pane-body, .ant-drawer-body');
    if (!host) return;
    host.scrollTop = positions.current[readingKey] || 0;
    const remember = () => { positions.current[readingKey] = host.scrollTop; };
    host.addEventListener('scroll', remember);
    return () => host.removeEventListener('scroll', remember);
  }, [inside, readingKey]);
  if (inside) return <div ref={previewRoot} className="resource-preview-content" onClickCapture={() => {
    const host = previewRoot.current?.closest('.pane-body, .ant-drawer-body');
    if (host) positions.current[readingKey] = host.scrollTop;
  }}>
    <div hidden={Boolean(props.activeObject)}>{props.children}</div>
    <div hidden={!props.activeObject}><Button type="text" className="resource-preview-back" onClick={() => { for (const tab of props.objectTabs || []) props.onCloseObject?.(tab.key); }}>← 返回详情</Button>{ownContent}</div>
  </div>;
  const projectPath = location.pathname.match(/\/projects\/([^/]+)$/);
  const projectContext = projectPath && projectPath[1] !== 'new' ? decodeURIComponent(projectPath[1]) : null;
  const resources = <ProjectPreviewContext.Provider value={projectContext}><InsideResourcePreview.Provider value={true}>{(state?.items || []).map(item => <div key={item.kind + ':' + item.id} data-workspace-resource-kind={item.kind} hidden={item.kind !== resourceKind}>
    <WorkspaceViewActiveContext.Provider value={contentVisible && item.kind === resourceKind}>{previews?.render(item)}</WorkspaceViewActiveContext.Provider>
  </div>)}</InsideResourcePreview.Provider></ProjectPreviewContext.Provider>;
  const pageContent = <div className="resource-main-content" onClickCapture={event => { if ((event.target as HTMLElement).closest('[data-doc-row]')) previews?.activate(location.pathname, ''); }}>{props.children}</div>;
  const objectContent = <WorkspaceViewTransientContext.Provider value={transient}><div className="workspace-object-content" hidden={Boolean(resourceKind)}><WorkspaceViewActiveContext.Provider value={ownState.visible}>{ownContent}</WorkspaceViewActiveContext.Provider></div><div className="workspace-resource-stack" hidden={!resourceKind}>{resources}</div></WorkspaceViewTransientContext.Provider>;
  if (paneView) return <>{createPortal(pageContent, pageTarget)}{createPortal(objectContent, contentTarget)}</>;
  return <WorkspacePaneStage {...props}
    onCloseAll={() => { previews?.clear(location.pathname); for (const tab of props.objectTabs || []) props.onCloseObject?.(tab.key); }}
    objectTabs={[...(props.objectTabs || []), ...resourceTabs]} activeObject={active}
    objectContentLayout={state?.active ? 'reading' : props.objectContentLayout}
    objectLabel={state?.active ? undefined : props.objectLabel}
    onActivateObject={activate} onCloseObject={close} objectContent={objectContent}>
    {pageContent}
  </WorkspacePaneStage>;
}

const STEP = 16;
const COLLAPSED_WIDTH = 48;

type ReadingFocus = {
  key: string;
  element: HTMLElement;
  start?: number | null;
  end?: number | null;
  direction?: 'forward' | 'backward' | 'none' | null;
  range?: Range;
};
type ScrollPositions = Map<HTMLElement, { top: number; left: number }>;

function captureScroll(root: HTMLElement): ScrollPositions {
  return new Map([root, ...root.querySelectorAll<HTMLElement>('*')]
    .filter(element => element === root || element.clientHeight > 0 && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth))
    .map(element => [element, { top: element.scrollTop, left: element.scrollLeft }]));
}
function restoreScroll(root: HTMLElement, positions?: ScrollPositions) {
  for (const [element, position] of positions || []) {
    if (element.isConnected && root.contains(element)) { element.scrollTop = position.top; element.scrollLeft = position.left; }
  }
}
function captureEditingFocus(root: HTMLElement, key: string): ReadingFocus | null {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || !root.contains(element) || !(element.isContentEditable || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return null;
  const snapshot: ReadingFocus = { key, element };
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    snapshot.start = element.selectionStart; snapshot.end = element.selectionEnd; snapshot.direction = element.selectionDirection;
  }
  const selection = window.getSelection();
  if (selection?.rangeCount && root.contains(selection.getRangeAt(0).commonAncestorContainer)) snapshot.range = selection.getRangeAt(0).cloneRange();
  return snapshot;
}
function restoreEditingFocus(root: HTMLElement, snapshot: ReadingFocus | null, key: string) {
  if (snapshot?.key !== key || !snapshot.element.isConnected || !root.contains(snapshot.element)) return;
  snapshot.element.focus({ preventScroll: true });
  if ((snapshot.element instanceof HTMLInputElement || snapshot.element instanceof HTMLTextAreaElement) && snapshot.start !== undefined && snapshot.end !== undefined) {
    try { snapshot.element.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction || undefined); } catch { /* Some input types do not expose a text cursor. */ }
  }
  if (snapshot.range?.startContainer.isConnected && snapshot.range.endContainer.isConnected) {
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(snapshot.range);
  }
}

export type WorkspacePaneStageProps = {
  /** 左组页面级页签。 */
  pageTabs: WorkspacePageTab[];
  activePage?: string | null;
  onActivatePage?: (key: string) => void;
  onClosePageTab: (key: string) => void;
  /** 左组内容。 */
  children: ReactNode;
  /** 右组对象页签；为空或 undefined 时右组退场。 */
  objectTabs?: WorkspaceObjectTab[];
  activeObject?: string | null;
  objectIdentity?: string;
  className?: string;
  onActivateObject?: (key: string) => void;
  onCloseObject?: (key: string) => void;
  /** 当前激活对象的内容。 */
  objectContent?: ReactNode;
  /** 功能工作面占满右组；阅读内容保持原有留白。 */
  objectContentLayout?: 'reading' | 'fill';
  objectLabel?: string;
  /** 关闭右组时保留局部草稿；调用方须使隐藏内容失活。 */
  retainObjectContent?: boolean;
  /** 可选的受控收起；保留已打开对象及其局部状态。 */
  objectCollapse?: { collapsed: boolean; onChange: (collapsed: boolean) => void; dirty?: boolean };
  /** 与内容栏使用同款就地开关；无对象内容时保持页面展开。 */
  pageCollapse?: { collapsed: boolean; onChange: (collapsed: boolean) => void; label?: string };
  /** 收起后保留窄栏，或完全让出空间并在标题行提供恢复入口。 */
  collapsePresentation?: 'rail' | 'header' | 'peek';
  /** 临时浮窗的可选受控显示状态；不改变页面折叠与分屏比例。 */
  pagePeek?: { open: boolean; onChange: (open: boolean) => void };
  objectPeek?: { open: boolean; onChange: (open: boolean) => void };
  onCloseAll?: () => void;
};

/**
 * 双栏组工作台：左组（页面级页签 + 限宽居中内容）+ 贯连可拖分隔线 + 右组（对象级页签 + 内容）。
 * 两组独立滚动；宽区域并排，窄区域使用覆盖式副屏。
 */
export function WorkspacePaneStage({
  pageTabs,
  activePage,
  onActivatePage,
  children,
  objectTabs,
  activeObject,
  objectIdentity,
  className = '',
  onActivateObject,
  onCloseObject,
  objectContent,
  objectContentLayout = 'reading',
  objectLabel = '阅读材料',
  retainObjectContent = false,
  objectCollapse,
  pageCollapse,
  collapsePresentation = 'rail',
  pagePeek,
  objectPeek,
  onCloseAll,
}: WorkspacePaneStageProps) {
  const hasRight = Boolean(objectTabs && objectTabs.length > 0);
  const peekPresentation = collapsePresentation === 'peek';
  const headerPresentation = collapsePresentation === 'header' || peekPresentation;
  const unified = Boolean(objectCollapse || pageCollapse || headerPresentation);
  const [localObjectCollapsed, setLocalObjectCollapsed] = useState(false);
  const [localPageCollapsed, setLocalPageCollapsed] = useState(false);
  const collapsed = hasRight && (objectCollapse?.collapsed ?? localObjectCollapsed);
  const pageCollapsed = hasRight && !collapsed && (pageCollapse?.collapsed ?? localPageCollapsed);
  const pageKey = activePage || pageTabs.at(-1)?.key || '$page';
  const objectKey = objectIdentity || activeObject || '$reading';
  const currentPageKey = useRef(pageKey); currentPageKey.current = pageKey;
  const currentObjectKey = useRef(objectKey); currentObjectKey.current = objectKey;
  const previousDockedPage = useRef(pageKey);
  const previousDockedObject = useRef(objectKey);
  const panelId = useId();
  const pagePanelId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageBody = useRef<HTMLDivElement>(null);
  const pageRail = useRef<HTMLDivElement>(null);
  const objectRail = useRef<HTMLDivElement>(null);
  const peekScroll = useRef<Record<string, ScrollPositions>>({});
  const peekInitialScroll = useRef<Record<string, { top: number; left: number }>>({});
  const peekScrolled = useRef(new Set<string>());
  const previousPeekPage = useRef<string | null>(null);
  const readingRef = useRef<HTMLElement>(null);
  const readingBody = useRef<HTMLDivElement>(null);
  const readingContent = useRef<HTMLDivElement>(null);
  const objectPeekScroll = useRef<Record<string, ScrollPositions>>({});
  const objectPeekInitialScroll = useRef<Record<string, ScrollPositions>>({});
  const previousPeekObject = useRef<string | null>(null);
  const collapseScroll = useRef<Record<string, ScrollPositions>>({});
  const pageScroll = useRef<Record<string, ScrollPositions>>({});
  const pageBeforeSplit = useRef<Record<string, ScrollPositions>>({});
  const previousHasRight = useRef(hasRight);
  const splitPageInteraction = useRef(false);
  const pageFocus = useRef<Record<string, ReadingFocus | null>>({});
  const readingFocus = useRef<ReadingFocus | null>(null);
  const previouslyCollapsed = useRef(collapsed);
  const previouslyPageCollapsed = useRef(pageCollapsed);
  const readingWasPageCollapsed = useRef(pageCollapsed);
  const pageCollapseReadingScroll = useRef<Record<string, ScrollPositions>>({});
  const pageCollapseReadingInitial = useRef<Record<string, ScrollPositions>>({});
  const splitScroll = useRef<Record<string, number>>({});
  const pendingReadingPosition = useRef<{ top?: number; anchor?: HTMLElement; offset?: number } | null>(null);
  const previousContent = useRef<{ left: number; width: number } | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { ratio, setRatio, reportPaneWidth } = useWorkspacePageTabs();
  const pageTabRow = useContext(PageTabRowContext);
  const [stageWidth, setStageWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (!hasRight) setExpanded(false); }, [hasRight]);
  useEffect(() => {
    if (hasRight) return;
    setLocalPageCollapsed(false); setLocalObjectCollapsed(false);
    if (pageCollapse?.collapsed) pageCollapse.onChange(false);
  }, [hasRight, pageCollapse?.collapsed, pageCollapse?.onChange]);
  const overlay = hasRight && !collapsed && !pageCollapsed && stageWidth > 0 && stageWidth < 860;
  const readingOrigin = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (hasRight && !wasOpen.current) readingOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!hasRight && wasOpen.current) readingOrigin.current?.focus({ preventScroll: true });
    wasOpen.current = hasRight;
  }, [hasRight]);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef<number | null>(null);
  const pagePeekState = usePanePeek({ enabled: peekPresentation && pageCollapsed, paneRef: pageBody, railRef: pageRail, control: pagePeek, beforeClose: () => rememberPeekState() });
  const objectPeekState = usePanePeek({ enabled: peekPresentation && collapsed, paneRef: readingBody, railRef: objectRail, control: objectPeek, beforeClose: () => rememberObjectPeekState() });
  const peekOpen = pagePeekState.open;
  const objectPeekOpen = objectPeekState.open;
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setStageWidth(entry.contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const location = useLocation();
  const dimensions = paneDimensions(stageWidth, ratio);
  const rightWidth = draftWidth ?? dimensions.right;
  useLayoutEffect(() => { if (stageRef.current?.getClientRects().length) reportPaneWidth(location.pathname, pageCollapsed ? headerPresentation && !peekPresentation ? stageWidth : Math.max(0, stageWidth - COLLAPSED_WIDTH) : unified && overlay ? Math.max(0, stageWidth - COLLAPSED_WIDTH) : collapsed ? headerPresentation && !peekPresentation ? 0 : COLLAPSED_WIDTH : hasRight && !overlay ? expanded && !unified ? stageWidth : rightWidth + 9 : 0); });

  const rememberReadingState = (includeFocus = false) => {
    const body = readingBody.current;
    if (!body || collapsed) return;
    const key = objectKey;
    collapseScroll.current[key] = captureScroll(body);
    if (includeFocus) readingFocus.current = captureEditingFocus(body, key);
  };
  useEffect(() => {
    const body = readingBody.current;
    if (!unified || !body || !hasRight || collapsed) return;
    const key = objectKey;
    const rememberScroll = (event: Event) => {
      if (currentObjectKey.current !== key || !body.getClientRects().length) return;
      if (event.target instanceof HTMLElement) (collapseScroll.current[key] ||= new Map()).set(event.target, { top: event.target.scrollTop, left: event.target.scrollLeft });
    };
    body.addEventListener('scroll', rememberScroll, { passive: true, capture: true });
    return () => { body.removeEventListener('scroll', rememberScroll, true); };
  }, [unified, hasRight, collapsed, objectKey]);
  useLayoutEffect(() => {
    const wasCollapsed = previouslyCollapsed.current;
    previouslyCollapsed.current = collapsed;
    const previous = previousDockedObject.current;
    if (collapsed || !hasRight) return;
    previousDockedObject.current = objectKey;
    if (!wasCollapsed && previous === objectKey) return;
    const body = readingBody.current, key = objectKey;
    if (!body) return;
    if (!collapseScroll.current[key]) body.scrollTop = 0;
    restoreScroll(body, collapseScroll.current[key]);
    if (wasCollapsed) { restoreEditingFocus(body, readingFocus.current, key); readingFocus.current = null; }
    restoreScroll(body, collapseScroll.current[key]);
  }, [collapsed, hasRight, objectKey]);
  const changeCollapsed = (next: boolean) => {
    if (headerPresentation && next && pageCollapsed) return;
    if (next) { rememberReadingState(); objectPeekScroll.current = {}; objectPeekInitialScroll.current = {}; }
    if (!next && peekPresentation) objectPeekState.close();
    if (objectCollapse) objectCollapse.onChange(next); else setLocalObjectCollapsed(next);
    if (next && !pageCollapse) setLocalPageCollapsed(false);
  };
  const rememberPageState = (includeFocus = false) => {
    const body = pageBody.current;
    if (!body || pageCollapsed) return;
    pageScroll.current[pageKey] = captureScroll(body);
    if (includeFocus) pageFocus.current[pageKey] = captureEditingFocus(body, pageKey);
  };
  const rememberPeekState = () => {
    const body = pageBody.current, content = contentRef.current;
    if (!body || !content || !peekOpen || !body.getClientRects().length) return;
    peekScroll.current[pageKey] = captureScroll(body);
    const positions = pageScroll.current[pageKey] ||= new Map();
    // A narrower temporary view can clamp its scroll range without a user scroll.
    // Keep the docked position until the user actually moves within the flyout.
    const initial = peekInitialScroll.current[pageKey];
    if (initial && (content.scrollTop !== initial.top || content.scrollLeft !== initial.left)) peekScrolled.current.add(pageKey);
    if (peekScrolled.current.has(pageKey)) {
      positions.set(body, { top: content.scrollTop, left: content.scrollLeft });
    }
    for (const [element, position] of peekScroll.current[pageKey]) if (element !== body && element !== content) positions.set(element, position);
    pageFocus.current[pageKey] = captureEditingFocus(body, pageKey);
  };
  const rememberObjectPeekState = () => {
    const body = readingBody.current, content = readingContent.current;
    if (!body || !content || !objectPeekOpen || !body.getClientRects().length) return;
    const positions = objectPeekScroll.current[objectKey] = captureScroll(body);
    const docked = collapseScroll.current[objectKey] ||= new Map();
    const initial = objectPeekInitialScroll.current[objectKey];
    for (const [element, position] of positions) {
      const before = initial?.get(element);
      if (!before || position.top === before.top && position.left === before.left) continue;
      if (element === content) docked.set(body, position);
      else if (element !== body) docked.set(element, position);
    }
    readingFocus.current = captureEditingFocus(body, objectKey);
  };
  const activatePage = (key: string) => { if (peekOpen) rememberPeekState(); else if (!pageCollapsed) rememberPageState(); onActivatePage?.(key); };
  const activateObject = (key: string) => { if (objectPeekOpen) rememberObjectPeekState(); else if (!collapsed) rememberReadingState(); onActivateObject?.(key); };
  const changePageCollapsed = (next: boolean) => {
    if (next && (!hasRight || headerPresentation && collapsed)) return;
    if (next) {
      rememberPageState();
      if (readingBody.current) pageCollapseReadingScroll.current[objectKey] = captureScroll(readingBody.current);
      peekScroll.current = {}; peekInitialScroll.current = {}; peekScrolled.current.clear();
    }
    if (!next && pageCollapsed && readingBody.current) {
      const initial = pageCollapseReadingInitial.current[objectKey];
      const stored = pageCollapseReadingScroll.current[objectKey] ||= new Map();
      for (const [element, position] of captureScroll(readingBody.current)) {
        const before = initial?.get(element);
        if (before && (position.top !== before.top || position.left !== before.left)) stored.set(element, position);
      }
    }
    if (!next && peekPresentation) pagePeekState.close();
    if (pageCollapse) pageCollapse.onChange(next); else setLocalPageCollapsed(next);
    if (next && !objectCollapse) setLocalObjectCollapsed(false);
  };
  useEffect(() => {
    const body = pageBody.current;
    if (!unified || !body) return;
    const beforeOpen = () => { if (!hasRight) pageBeforeSplit.current[pageKey] = captureScroll(body); };
    const pointerDown = (event: Event) => { beforeOpen(); if (hasRight && event.target === body) splitPageInteraction.current = true; };
    const scrolling = () => { if (hasRight) splitPageInteraction.current = true; };
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Enter') beforeOpen();
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable="true"]')) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) scrolling();
    };
    body.addEventListener('click', beforeOpen, true);
    body.addEventListener('pointerdown', pointerDown, true);
    body.addEventListener('wheel', scrolling, { capture: true, passive: true });
    body.addEventListener('touchmove', scrolling, { capture: true, passive: true });
    body.addEventListener('keydown', keyDown, true);
    return () => {
      body.removeEventListener('click', beforeOpen, true); body.removeEventListener('pointerdown', pointerDown, true); body.removeEventListener('wheel', scrolling, true);
      body.removeEventListener('touchmove', scrolling, true); body.removeEventListener('keydown', keyDown, true);
    };
  }, [unified, hasRight, pageKey]);
  useLayoutEffect(() => {
    const previous = previousHasRight.current; previousHasRight.current = hasRight;
    if (!previous && hasRight) splitPageInteraction.current = false;
    if (previous && !hasRight && pageBody.current) restoreScroll(pageBody.current, pageBeforeSplit.current[pageKey]);
  }, [hasRight, pageKey]);
  useLayoutEffect(() => {
    const previous = readingWasPageCollapsed.current;
    readingWasPageCollapsed.current = pageCollapsed;
    if (pageCollapsed && readingBody.current) pageCollapseReadingInitial.current[objectKey] = captureScroll(readingBody.current);
    if (previous && !pageCollapsed && readingBody.current) restoreScroll(readingBody.current, pageCollapseReadingScroll.current[objectKey]);
  }, [pageCollapsed, objectKey]);
  useEffect(() => {
    const body = pageBody.current;
    if (!unified || !body || pageCollapsed) return;
    const remember = (event: Event) => {
      if (currentPageKey.current !== pageKey || !body.getClientRects().length) return;
      if (event.target instanceof HTMLElement) {
        const position = { top: event.target.scrollTop, left: event.target.scrollLeft };
        (pageScroll.current[pageKey] ||= new Map()).set(event.target, position);
        if (hasRight && splitPageInteraction.current) (pageBeforeSplit.current[pageKey] ||= new Map()).set(event.target, position);
      }
    };
    body.addEventListener('scroll', remember, { capture: true, passive: true });
    return () => body.removeEventListener('scroll', remember, true);
  }, [unified, pageCollapsed, pageKey, hasRight]);
  useEffect(() => {
    if (!peekOpen) return;
    const body = pageBody.current;
    const remember = () => { if (currentPageKey.current === pageKey && body?.getClientRects().length) rememberPeekState(); };
    body?.addEventListener('scroll', remember, { capture: true, passive: true });
    return () => body?.removeEventListener('scroll', remember, true);
  }, [peekOpen, pageKey]);
  useLayoutEffect(() => {
    const previous = previousPeekPage.current; previousPeekPage.current = peekOpen ? pageKey : null;
    const body = pageBody.current, content = contentRef.current;
    if (!peekOpen || previous === pageKey || !body || !content) return;
    if (peekScroll.current[pageKey]) restoreScroll(body, peekScroll.current[pageKey]);
    else { const position = pageScroll.current[pageKey]?.get(body); content.scrollTop = position?.top || 0; content.scrollLeft = position?.left || 0; }
    peekInitialScroll.current[pageKey] = { top: content.scrollTop, left: content.scrollLeft };
    peekScrolled.current.delete(pageKey);
  }, [peekOpen, pageKey]);
  useEffect(() => {
    if (!objectPeekOpen) return;
    const body = readingBody.current;
    const remember = () => { if (currentObjectKey.current === objectKey && body?.getClientRects().length) rememberObjectPeekState(); };
    body?.addEventListener('scroll', remember, { capture: true, passive: true });
    return () => body?.removeEventListener('scroll', remember, true);
  }, [objectPeekOpen, objectKey]);
  useLayoutEffect(() => {
    const previous = previousPeekObject.current; previousPeekObject.current = objectPeekOpen ? objectKey : null;
    const body = readingBody.current, content = readingContent.current;
    if (!objectPeekOpen || previous === objectKey || !body || !content) return;
    const positions = objectPeekScroll.current[objectKey] || collapseScroll.current[objectKey];
    restoreScroll(body, positions);
    if (!objectPeekScroll.current[objectKey]) { const position = collapseScroll.current[objectKey]?.get(body); content.scrollTop = position?.top || 0; content.scrollLeft = position?.left || 0; }
    objectPeekInitialScroll.current[objectKey] = captureScroll(body);
  }, [objectPeekOpen, objectKey]);
  useLayoutEffect(() => {
    const wasCollapsed = previouslyPageCollapsed.current;
    previouslyPageCollapsed.current = pageCollapsed;
    const previous = previousDockedPage.current;
    const body = pageBody.current;
    if (!body || pageCollapsed) return;
    previousDockedPage.current = pageKey;
    if (!wasCollapsed && previous === pageKey) return;
    if (!pageScroll.current[pageKey]) body.scrollTop = 0;
    restoreScroll(body, pageScroll.current[pageKey]);
    if (wasCollapsed) { restoreEditingFocus(body, pageFocus.current[pageKey] || null, pageKey); pageFocus.current[pageKey] = null; }
    restoreScroll(body, pageScroll.current[pageKey]);
  }, [pageCollapsed, pageKey]);
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || !node.getClientRects().length) return;
    node.getAnimations().forEach((animation) => animation.cancel());
    const rect = node.getBoundingClientRect();
    const previous = previousContent.current;
    if (previous && !resizing && Math.abs(previous.width - rect.width) < 1 && Math.abs(previous.left - rect.left) > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.animate([{ transform: `translateX(${previous.left - rect.left}px)` }, { transform: 'translateX(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    previousContent.current = { left: rect.left, width: rect.width };
  }, [hasRight, rightWidth, stageWidth, resizing, collapsed]);
  const closeReading = () => { if (onCloseAll) onCloseAll(); else for (const tab of objectTabs || []) onCloseObject?.(tab.key); };
  useEffect(() => {
    if (overlay && readingRef.current && !readingRef.current.contains(document.activeElement) && !document.querySelector('.ant-drawer-open, .ant-modal-wrap')) {
      readingRef.current.querySelector<HTMLButtonElement>('.pane-overlay-close')?.focus();
    }
  }, [overlay]);
  const readingKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const root = readingRef.current;
    if (!overlay || !root?.contains(event.target as Node)) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeReading(); return; }
    if (event.key !== 'Tab' || unified) return;
    const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const toggleReading = () => {
    const body = readingBody.current;
    if (body) {
      const key = activeObject || '$reading';
      if (!expanded) splitScroll.current[key] = body.scrollTop;
      if (expanded && splitScroll.current[key] !== undefined) pendingReadingPosition.current = { top: splitScroll.current[key] };
      else {
        const top = body.getBoundingClientRect().top;
        const anchor = [...body.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,tr,pre,figure')].find(node => node.getClientRects().length && node.getBoundingClientRect().bottom > top);
        pendingReadingPosition.current = anchor ? { anchor, offset: anchor.getBoundingClientRect().top - top } : { top: body.scrollTop };
      }
    }
    setExpanded(value => !value);
  };
  useLayoutEffect(() => {
    const pending = pendingReadingPosition.current, body = readingBody.current;
    if (!pending || !body) return;
    if (pending.top !== undefined) body.scrollTop = pending.top;
    else if (pending.anchor?.isConnected) body.scrollTop += pending.anchor.getBoundingClientRect().top - body.getBoundingClientRect().top - (pending.offset || 0);
    pendingReadingPosition.current = null;
  }, [expanded]);
  const clampWidth = (value: number) => Math.min(dimensions.max, Math.max(dimensions.min, value));
  const currentWidth = () => rightWidth;
  const commitWidth = (value: number) => {
    const next = clampWidth(value);
    widthRef.current = next;
    setDraftWidth(next);
    return next;
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: currentWidth() };
    setResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    commitWidth(drag.startWidth + (drag.startX - event.clientX));
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizing(false);
    if (widthRef.current && stageWidth) setRatio(widthRef.current / stageWidth);
    setDraftWidth(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = commitWidth(currentWidth() + (event.key === 'ArrowLeft' ? STEP : -STEP));
    if (stageWidth) setRatio(next / stageWidth);
    setDraftWidth(null);
  };

  const pageTitle = pageTabs.find(tab => tab.key === pageKey)?.title || pageCollapse?.label || '页面';
  const contentTitle = objectTabs?.find(tab => tab.key === activeObject)?.title || objectLabel;
  return (
    <div ref={stageRef} style={{ '--workspace-content-width': `${dimensions.content}px`, '--workspace-stage-width': `${stageWidth}px` } as CSSProperties} className={`pane-stage ${className}${hasRight && !overlay && !collapsed && !pageCollapsed ? ' split' : ''}${overlay ? ' reading-overlay' : ''}${expanded && !unified && !overlay && hasRight && !collapsed ? ' reading-expanded' : ''}${collapsed ? ' reading-collapsed' : ''}${pageCollapsed ? ' page-collapsed' : ''}${unified ? ' unified-collapse' : ''}${headerPresentation ? ' header-collapse' : ''}${peekPresentation ? ' peek-collapse' : ''}${peekOpen ? ' page-peek-open' : ''}${objectPeekOpen ? ' object-peek-open' : ''}${resizing ? ' resizing' : ''}`}>
      {headerPresentation && !peekPresentation && (pageCollapsed || collapsed) && <div className="pane-restore-actions">
        {pageCollapsed ? <Button size="small" type="text" icon={<DoubleRightOutlined />} aria-label="展开页面" title="展开页面" aria-controls={pagePanelId} data-prototype-position="page-restore" onClick={() => changePageCollapsed(false)}>展开页面</Button>
          : <Button size="small" type="text" icon={<DoubleLeftOutlined />} aria-label="展开内容" title={`展开内容 · ${objectTabs?.length || 0} 个打开对象${objectCollapse?.dirty ? ' · 有未保存修改' : ''}`} aria-controls={panelId} data-prototype-position="content-restore" onClick={() => changeCollapsed(false)}>展开内容 <span className="pane-restore-count">{objectTabs?.length || 0}</span>{objectCollapse?.dirty && <span className="pane-restore-dirty" aria-label="有未保存修改">●</span>}</Button>}
      </div>}
      <section hidden={headerPresentation && !peekPresentation && pageCollapsed} className="pane-group pane-left" inert={!unified && overlay || undefined}>
        {unified && (!headerPresentation || hasRight && !pageCollapsed && !collapsed) && (() => {
          const toggle = <PaneToggleButton className="pane-page-toggle" collapsed={pageCollapsed} label="页面" disabled={!hasRight} controls={pagePanelId} position="page-toggle" onPointerDown={() => rememberPageState(true)} onToggle={() => changePageCollapsed(!pageCollapsed)} />;
          // With a host-provided tab row the toggle takes a fixed trailing slot instead of floating over scrolling tabs.
          return pageTabRow ? createPortal(toggle, pageTabRow) : toggle;
        })()}
        {pageCollapsed && !headerPresentation && <div className="pane-page-rail" data-prototype-position="page-rail"><span className="pane-collapsed-title" title={pageTitle}>{pageTitle}</span></div>}
        {peekPresentation && pageCollapsed && <CollapsedPaneTabs railRef={pageRail} tabs={pageTabs.length ? pageTabs : [{ key: pageKey, title: pageTitle }]} active={pageKey} noun="页面" side="left" controls={pagePanelId} position="page-rail" peek={pagePeekState} onActivate={activatePage} onExpand={key => { activatePage(key); changePageCollapsed(false); }} />}
        <div ref={pageBody} id={pagePanelId} hidden={pageCollapsed && !peekOpen} inert={unified && (overlay && !pageCollapsed || pageCollapsed && !peekOpen) || undefined} className="pane-body"
          role={peekOpen ? 'region' : undefined} aria-label={peekOpen ? `暂时查看${pageTitle}` : undefined} data-prototype-position={peekPresentation && pageCollapsed ? 'page-peek' : undefined}
          onPointerEnter={event => { if (peekOpen) pagePeekState.enter('panel', event.pointerType); }} onPointerLeave={event => { if (peekOpen) pagePeekState.exit('panel', event.pointerType); }} onFocusCapture={() => { if (peekOpen) pagePeekState.cancel(); }} onBlurCapture={() => { if (peekOpen) pagePeekState.leave(); }}
          onKeyDown={event => { if (peekOpen && event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); pagePeekState.close(true); } }}>
          <div ref={contentRef} className="pane-body-inner">{children}</div>
        </div>
      </section>
      {hasRight || retainObjectContent ? (
        <>
          {overlay && <div className="pane-reading-mask" onClick={closeReading} aria-hidden="true" />}
          <SplitDivider
            hidden={!hasRight || collapsed || pageCollapsed}
            className="pane-divider"
            children={<span className="split-divider-header-marker" aria-hidden="true" />}
            aria-label="拖拽调整两侧宽度"
            role="separator"
            aria-valuemin={Math.round(dimensions.min)}
            aria-valuemax={Math.round(dimensions.max)}
            aria-valuenow={Math.round(rightWidth)}
            aria-orientation="vertical"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          />
          <section
            ref={readingRef}
            hidden={!hasRight || headerPresentation && !peekPresentation && collapsed}
            className={`pane-group pane-right${objectContentLayout === 'fill' ? ' pane-content-fill' : ''}${unified ? ' can-collapse' : ''}`}
            role={overlay ? unified ? 'region' : 'dialog' : undefined}
            aria-modal={!unified && overlay || undefined}
            aria-label={overlay ? objectLabel : undefined}
            onKeyDown={readingKeyDown}
            style={collapsed ? { width: COLLAPSED_WIDTH, flexBasis: COLLAPSED_WIDTH } : pageCollapsed ? { width: headerPresentation && !peekPresentation ? stageWidth : stageWidth - COLLAPSED_WIDTH, flexBasis: headerPresentation && !peekPresentation ? stageWidth : stageWidth - COLLAPSED_WIDTH } : overlay ? { width: Math.min(720, Math.max(280, stageWidth - 20)) } : expanded && !unified ? { width: '100%', flexBasis: '100%' } : rightWidth ? { width: rightWidth, flexBasis: rightWidth } : undefined}
          >
            {unified && (!headerPresentation || !pageCollapsed && !collapsed) && <PaneToggleButton className="pane-content-toggle" collapsed={collapsed} label="内容" side="right" controls={panelId} position="content-toggle" onPointerDown={() => rememberReadingState(true)} onToggle={() => changeCollapsed(!collapsed)} />}
            {peekPresentation && collapsed && <CollapsedPaneTabs railRef={objectRail} tabs={objectTabs || []} active={activeObject} noun="内容" side="right" controls={panelId} position="content-rail" peek={objectPeekState} onActivate={activateObject} onExpand={key => { activateObject(key); changeCollapsed(false); }} />}
            {collapsed && !headerPresentation && <div className="pane-collapsed-rail" data-prototype-position="content-rail" aria-label={`${contentTitle}，${objectTabs?.length || 0} 个打开对象${objectCollapse?.dirty ? '，有未保存修改' : ''}`}>
              <span className="pane-collapsed-count" title={`${objectTabs?.length || 0} 个打开对象`}>{objectTabs?.length || 0}</span>
              <span className="pane-collapsed-title" title={contentTitle}>{contentTitle}</span>
              {objectCollapse?.dirty && <span className="pane-collapsed-dirty" title="有未保存修改" aria-hidden="true">●</span>}
            </div>}
            <div className="pane-overlay-heading"><strong>{objectLabel}</strong><Button className="pane-overlay-close" type="text" aria-label={objectContentLayout === 'fill' ? `关闭${objectLabel}` : '关闭阅读'} icon={<CloseOutlined />} onClick={closeReading} /></div>
            {!unified && <ReadingToggle className="pane-reading-toggle" expanded={expanded} onToggle={toggleReading} expandLabel={objectContentLayout === 'fill' ? `展开${objectLabel}` : undefined} />}
            <ObjectTabStrip scrollToStartOnActivate panelId={panelId} tabs={objectTabs ?? []} active={activeObject} onActivate={activateObject} onClose={onCloseObject} />
            <div ref={readingBody} id={panelId} hidden={collapsed && !objectPeekOpen} role={objectPeekOpen ? 'region' : 'tabpanel'} aria-label={objectPeekOpen ? `暂时查看${contentTitle}` : undefined} aria-labelledby={!objectPeekOpen && activeObject ? tabElementId(panelId, activeObject) : undefined} tabIndex={0} className="pane-body" data-prototype-position={peekPresentation && collapsed ? 'content-peek' : undefined}
              onPointerEnter={event => { if (objectPeekOpen) objectPeekState.enter('panel', event.pointerType); }} onPointerLeave={event => { if (objectPeekOpen) objectPeekState.exit('panel', event.pointerType); }} onFocusCapture={() => { if (objectPeekOpen) objectPeekState.cancel(); }} onBlurCapture={() => { if (objectPeekOpen) objectPeekState.leave(); }}
              onKeyDown={event => { if (objectPeekOpen && event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); objectPeekState.close(true); } }}><div ref={readingContent} className="pane-body-inner">{objectContent}</div></div>
          </section>
        </>
      ) : null}
    </div>
  );
}
