import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { CloseOutlined } from '@ant-design/icons';
import { useWorkspacePageTabs, type WorkspacePageTab } from '../app/pageTabs';

import { paneDimensions } from '../app/workspace-pages';

/** 对象级页签：领域内点开的服务/文档/变更，页内对照，全关时右组退场。 */
export type ObjectTabKind = 'svc' | 'doc' | 'chg';
export type WorkspaceObjectTab = { key: string; kind: ObjectTabKind; title: string };

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
};

/**
 * 双栏组工作台：左组（页面级页签 + 限宽居中内容）+ 贯连可拖分隔线 + 右组（对象级页签 + 内容）。
 * 两组独立滚动；桌面始终并排，极窄窗口上下排列。
 */
export function WorkspaceStage({
  children,
  objectTabs,
  activeObject,
  onActivateObject,
  onCloseObject,
  objectContent,
}: Props) {
  const hasRight = Boolean(objectTabs && objectTabs.length > 0);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousContent = useRef<{ left: number; width: number } | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { ratio, setRatio, reportPaneWidth } = useWorkspacePageTabs();
  const [stageWidth, setStageWidth] = useState(0);
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
  useEffect(() => { reportPaneWidth(location.pathname, hasRight && stageWidth > 620 ? rightWidth + 9 : 0); }, [location.pathname, hasRight, stageWidth, rightWidth, reportPaneWidth]);
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
    <div ref={stageRef} style={{ '--workspace-content-width': `${dimensions.content}px` } as CSSProperties} className={`pane-stage${hasRight ? ' split' : ''}${resizing ? ' resizing' : ''}`}>
      <section className="pane-group pane-left">
        <div className="pane-body"><div ref={contentRef} className="pane-body-inner">{children}</div></div>
      </section>
      {hasRight ? (
        <>
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
            className="pane-group pane-right"
            style={rightWidth ? { width: rightWidth, flexBasis: rightWidth } : undefined}
          >
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
            <div className="pane-body"><div className="pane-body-inner">{objectContent}</div></div>
          </section>
        </>
      ) : null}
    </div>
  );
}
