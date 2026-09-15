import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { PageTabStrip, type WorkspacePageTab } from '../app/pageTabs';

/** 对象级页签：领域内点开的服务/文档/变更，页内对照，全关时右组退场。 */
export type ObjectTabKind = 'svc' | 'doc' | 'chg';
export type WorkspaceObjectTab = { key: string; kind: ObjectTabKind; title: string };

const RIGHT_MIN = 420;
const RIGHT_DEFAULT_RATIO = 0.44;
const RIGHT_MAX_RATIO = 0.62;
const WIDTH_KEY = 'buildr.web.pane-right-width';
const STEP = 16;

function readStoredWidth(): number | null {
  try {
    const value = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function persistWidth(value: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

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
 * 两组各自独立滚动；≤1440px 时右组由 CSS 降级为浮动层。
 */
export function WorkspaceStage({
  pageTabs,
  onClosePageTab,
  children,
  objectTabs,
  activeObject,
  onActivateObject,
  onCloseObject,
  objectContent,
}: Props) {
  const hasRight = Boolean(objectTabs && objectTabs.length > 0);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef<number | null>(null);
  const [rightWidth, setRightWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => { widthRef.current = readStoredWidth(); setRightWidth(widthRef.current); }, []);

  const clampWidth = useCallback((value: number) => {
    const stageWidth = stageRef.current?.getBoundingClientRect().width ?? 1600;
    const min = RIGHT_MIN;
    const max = Math.max(min, Math.round(stageWidth * RIGHT_MAX_RATIO));
    return Math.round(Math.min(max, Math.max(min, value)));
  }, []);

  const currentWidth = useCallback(() => {
    if (widthRef.current) return widthRef.current;
    const stageWidth = stageRef.current?.getBoundingClientRect().width ?? 1600;
    return clampWidth(Math.round(stageWidth * RIGHT_DEFAULT_RATIO));
  }, [clampWidth]);

  const commitWidth = useCallback((value: number) => {
    const next = clampWidth(value);
    widthRef.current = next;
    setRightWidth(next);
    return next;
  }, [clampWidth]);

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
    if (widthRef.current) persistWidth(widthRef.current);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = commitWidth(currentWidth() + (event.key === 'ArrowLeft' ? STEP : -STEP));
    persistWidth(next);
  };

  return (
    <div ref={stageRef} className={`pane-stage${hasRight ? ' split' : ''}${resizing ? ' resizing' : ''}`}>
      <section className="pane-group pane-left">
        <PageTabStrip tabs={pageTabs} onClose={onClosePageTab} />
        <div className="pane-body"><div className="pane-body-inner">{children}</div></div>
      </section>
      {hasRight ? (
        <>
          <button
            type="button"
            className="pane-divider"
            aria-label="拖拽调整两侧宽度"
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
