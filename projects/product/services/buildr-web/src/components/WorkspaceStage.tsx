import { Button } from 'antd';
import { useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { CloseOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useWorkspacePageTabs, WorkspaceViewActiveContext, type WorkspacePageTab } from '../app/pageTabs';

import { InsideResourcePreview, ProjectPreviewContext, useResourcePreview } from '../app/resource-preview';
import { paneDimensions } from '../app/workspace-pages';
import './workspace-stage.css';

/** 对象级页签：领域内点开的服务/文档/变更，页内对照，全关时右组退场。 */
export type ObjectTabKind = 'svc' | 'doc' | 'chg';
export type WorkspaceObjectTab = { key: string; kind: ObjectTabKind; title: string };

export function WorkspaceStage(props: Props) {
  const inside = useContext(InsideResourcePreview);
  const viewActive = useContext(WorkspaceViewActiveContext);
  const previews = useResourcePreview(), location = useLocation();
  const state = previews?.states[location.pathname];
  const previewRoot = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<string, number>>({});
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
    <div hidden={!props.activeObject}><Button type="text" className="resource-preview-back" onClick={() => { for (const tab of props.objectTabs || []) props.onCloseObject?.(tab.key); }}>← 返回详情</Button>{props.objectContent}</div>
  </div>;
  const resourceTabs = (state?.items || []).map(item => ({ key: `preview:${item.kind}`, kind: 'svc' as const, title: item.title }));
  const active = state?.active ? `preview:${state.active}` : props.activeObject;
  const projectPath = location.pathname.match(/\/projects\/([^/]+)$/);
  const projectContext = projectPath && projectPath[1] !== 'new' ? decodeURIComponent(projectPath[1]) : null;
  const resources = <ProjectPreviewContext.Provider value={projectContext}><InsideResourcePreview.Provider value={true}>{(state?.items || []).map(item => <div key={`${item.kind}:${item.id}`} hidden={item.kind !== state?.active}>
    <WorkspaceViewActiveContext.Provider value={viewActive && item.kind === state?.active}>{previews?.render(item)}</WorkspaceViewActiveContext.Provider>
  </div>)}</InsideResourcePreview.Provider></ProjectPreviewContext.Provider>;
  const normalStage = <SplitWorkspaceStage {...props} onCloseAll={() => { previews?.clear(location.pathname); for (const tab of props.objectTabs || []) props.onCloseObject?.(tab.key); }} objectTabs={[...(props.objectTabs || []), ...resourceTabs]} activeObject={active}
    onActivateObject={key => { if (key.startsWith('preview:')) previews?.activate(location.pathname, key.slice(8)); else { previews?.activate(location.pathname, ''); props.onActivateObject?.(key); } }}
    onCloseObject={key => { if (key.startsWith('preview:')) previews?.close(location.pathname, key.slice(8)); else props.onCloseObject?.(key); }}
    objectContent={<><div hidden={Boolean(state?.active)}>{props.objectContent}</div><div hidden={!state?.active}>{resources}</div></>}>
    <div className="resource-main-content" onClickCapture={event => { if ((event.target as HTMLElement).closest('[data-doc-row]')) previews?.activate(location.pathname, ''); }}>{props.children}</div>
  </SplitWorkspaceStage>;
  return normalStage;
}

const STEP = 16;

type Props = {
  /** 左组页面级页签。 */
  pageTabs: WorkspacePageTab[];
  onClosePageTab: (key: string) => void;
  /** 左组内容。 */
  children: ReactNode;
  /** 右组对象页签；为空或 undefined 时右组退场。 */
  objectTabs?: WorkspaceObjectTab[];
  activeObject?: string | null;
  onActivateObject?: (key: string) => void;
  onCloseObject?: (key: string) => void;
  /** 当前激活对象的内容。 */
  objectContent?: ReactNode;
  onCloseAll?: () => void;
};

/**
 * 双栏组工作台：左组（页面级页签 + 限宽居中内容）+ 贯连可拖分隔线 + 右组（对象级页签 + 内容）。
 * 两组独立滚动；宽区域并排，窄区域使用覆盖式副屏。
 */
function SplitWorkspaceStage({
  children,
  objectTabs,
  activeObject,
  onActivateObject,
  onCloseObject,
  objectContent,
  onCloseAll,
}: Props) {
  const hasRight = Boolean(objectTabs && objectTabs.length > 0);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef<HTMLElement>(null);
  const readingBody = useRef<HTMLDivElement>(null);
  const splitScroll = useRef<Record<string, number>>({});
  const pendingReadingPosition = useRef<{ top?: number; anchor?: HTMLElement; offset?: number } | null>(null);
  const previousContent = useRef<{ left: number; width: number } | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { ratio, setRatio, reportPaneWidth } = useWorkspacePageTabs();
  const [stageWidth, setStageWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (!hasRight) setExpanded(false); }, [hasRight]);
  const overlay = hasRight && stageWidth > 0 && stageWidth < 860;
  const readingOrigin = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (hasRight && !wasOpen.current) readingOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!hasRight && wasOpen.current) readingOrigin.current?.focus();
    wasOpen.current = hasRight;
  }, [hasRight]);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef<number | null>(null);
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
  useLayoutEffect(() => { if (stageRef.current?.getClientRects().length) reportPaneWidth(location.pathname, hasRight && !overlay ? expanded ? stageWidth : rightWidth + 9 : 0); });
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
  }, [hasRight, rightWidth, stageWidth, resizing]);
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
    if (event.key !== 'Tab') return;
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

  return (
    <div ref={stageRef} style={{ '--workspace-content-width': `${dimensions.content}px` } as CSSProperties} className={`pane-stage${hasRight && !overlay ? ' split' : ''}${overlay ? ' reading-overlay' : ''}${expanded && !overlay && hasRight ? ' reading-expanded' : ''}${resizing ? ' resizing' : ''}`}>
      <section className="pane-group pane-left" inert={overlay || undefined}>
        <div className="pane-body"><div ref={contentRef} className="pane-body-inner">{children}</div></div>
      </section>
      {hasRight ? (
        <>
          {overlay && <div className="pane-reading-mask" onClick={closeReading} aria-hidden="true" />}
          <button
            type="button"
            className="pane-divider"
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
            className="pane-group pane-right"
            role={overlay ? 'dialog' : undefined}
            aria-modal={overlay || undefined}
            aria-label={overlay ? '阅读材料' : undefined}
            onKeyDown={readingKeyDown}
            style={overlay ? { width: Math.min(720, Math.max(280, stageWidth - 20)) } : expanded ? { width: '100%', flexBasis: '100%' } : rightWidth ? { width: rightWidth, flexBasis: rightWidth } : undefined}
          >
            <div className="pane-overlay-heading"><strong>阅读材料</strong><Button className="pane-overlay-close" type="text" aria-label="关闭阅读" icon={<CloseOutlined />} onClick={closeReading} /></div>
            <Button className="pane-reading-toggle" size="small" type="text" icon={expanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleReading} aria-label={expanded ? '恢复分屏' : '展开阅读'}>{expanded ? '恢复分屏' : '展开阅读'}</Button>
            <div className="pane-tabstrip" role="tablist" aria-label="打开的对象">
              {(objectTabs ?? []).map((tab) => {
                const active = tab.key === activeObject;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`pane-tab${active ? ' on' : ''}`}
                    title={tab.title}
                    onClick={() => onActivateObject?.(tab.key)}
                  >
                    <span className={`pane-tab-dot ${tab.kind}`} aria-hidden />
                    <span className="pane-tab-text">{tab.title}</span>
                    <span
                      className="pane-tab-x"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onCloseObject?.(tab.key); } }}
                      aria-label={`关闭 ${tab.title}`}
                      onClick={(event) => { event.stopPropagation(); onCloseObject?.(tab.key); }}
                    >
                      <CloseOutlined />
                    </span>
                  </button>
                );
              })}
            </div>
            <div ref={readingBody} className="pane-body"><div className="pane-body-inner">{objectContent}</div></div>
          </section>
        </>
      ) : null}
    </div>
  );
}
