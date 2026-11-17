import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { copyText } from '../lib/copyText';
import { sanitizeDiagramSvg, setDiagramSvg } from '../lib/markdownDiagramSvg';

type Props = {
  svg: string;
  source: string;
  onClose(): void;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 6;
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/** Fullscreen vector preview modal for rendered Mermaid diagrams with zoom, pan, and PNG export. */
export function MarkdownDiagramPreview({ svg, source, onClose }: Props) {
  const sanitized = useMemo(() => sanitizeDiagramSvg(svg), [svg]);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const naturalRef = useRef({ width: 800, height: 480 });
  const fitModeRef = useRef(true);
  const [fitMode, setFitMode] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const viewRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const commitView = useCallback((nextScale: number, nextOffset: { x: number; y: number }, fit: boolean) => {
    const clamped = clampScale(nextScale);
    fitModeRef.current = fit;
    setFitMode(fit);
    viewRef.current = { scale: clamped, offset: nextOffset };
    setScale(clamped);
    setOffset(nextOffset);
  }, []);

  const applyFit = useCallback(() => {
    const stage = stageRef.current;
    const { width, height } = naturalRef.current;
    if (!stage) {
      commitView(1, { x: 0, y: 0 }, true);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const usableW = Math.max(120, rect.width - 48);
    const usableH = Math.max(120, rect.height - 48);
    const next = Math.min(2.5, Math.max(MIN_SCALE, Math.min(usableW / Math.max(1, width), usableH / Math.max(1, height))));
    commitView(next, { x: 0, y: 0 }, true);
  }, [commitView]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(copyTimerRef.current);
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sanitized) return;
    try {
      setDiagramSvg(canvas, sanitized);
      const drawing = canvas.querySelector('svg');
      if (drawing) {
        const vb = drawing.viewBox?.baseVal;
        const rect = drawing.getBoundingClientRect();
        const width = vb && vb.width > 0 ? vb.width : rect.width || Number.parseFloat(drawing.getAttribute('width') || '') || 800;
        const height = vb && vb.height > 0 ? vb.height : rect.height || Number.parseFloat(drawing.getAttribute('height') || '') || 480;
        naturalRef.current = { width, height };
        drawing.style.width = `${width}px`;
        drawing.style.height = `${height}px`;
        drawing.style.maxWidth = 'none';
      }
      applyFit();
    } catch {
      canvas.replaceChildren();
    }
  }, [sanitized, applyFit]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !sanitized) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const px = event.clientX - (rect.left + rect.width / 2);
      const py = event.clientY - (rect.top + rect.height / 2);
      const factor = Math.exp(-event.deltaY * 0.0018);
      const prev = viewRef.current;
      const nextScale = clampScale(prev.scale * factor);
      if (nextScale === prev.scale) return;
      const ratio = nextScale / prev.scale;
      commitView(nextScale, {
        x: px - (px - prev.offset.x) * ratio,
        y: py - (py - prev.offset.y) * ratio,
      }, false);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (fitModeRef.current) applyFit(); })
      : null;
    observer?.observe(stage);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      observer?.disconnect();
    };
  }, [sanitized, applyFit, commitView]);

  const zoomBy = (factor: number) => {
    const prev = viewRef.current;
    const nextScale = clampScale(prev.scale * factor);
    const ratio = nextScale / prev.scale;
    commitView(nextScale, { x: prev.offset.x * ratio, y: prev.offset.y * ratio }, false);
  };

  const handleCopySource = async () => {
    if (!source) return;
    clearTimeout(copyTimerRef.current);
    const ok = await copyText(source);
    setCopyState(ok ? 'copied' : 'failed');
    copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2500);
  };

  const handleExportPng = async () => {
    if (!sanitized || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const parsed = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
      const root = parsed.documentElement;
      const { width, height } = naturalRef.current;
      const exportW = Math.max(1, Math.ceil(width));
      const exportH = Math.max(1, Math.ceil(height));
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      root.setAttribute('width', String(exportW));
      root.setAttribute('height', String(exportH));
      root.removeAttribute('style');
      const markup = new XMLSerializer().serializeToString(root);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('导出图片失败'));
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
      });
      const ratio = Math.min(2, 4096 / Math.max(exportW, exportH, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(exportW * ratio));
      canvas.height = Math.max(1, Math.round(exportH * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器不支持导出画布');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('生成 PNG 图片失败')), 'image/png');
      });
      const downloadUrl = URL.createObjectURL(pngBlob);
      try {
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = 'mermaid-diagram.png';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    } catch (failure) {
      setExportError(failure instanceof Error ? failure.message : '导出图片失败，可尝试复制源码。');
    } finally {
      setExporting(false);
    }
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !sanitized) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: viewRef.current.offset.x,
      origY: viewRef.current.offset.y,
    };
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    commitView(viewRef.current.scale, {
      x: drag.origX + event.clientX - drag.startX,
      y: drag.origY + event.clientY - drag.startY,
    }, false);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const dialog = (
    <div
      className="markdown-diagram-preview-backdrop"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="markdown-diagram-preview-dialog" role="dialog" aria-modal="true" aria-label="流程图预览">
        <header className="markdown-diagram-preview-toolbar">
          <h2 className="markdown-diagram-preview-title">流程图预览</h2>
          <div className="markdown-diagram-preview-actions">
            {sanitized && (
              <>
                <button type="button" className="markdown-diagram-preview-btn" aria-label="缩小流程图" onClick={() => zoomBy(1 / 1.25)} disabled={scale <= MIN_SCALE + 0.001}>缩小</button>
                <span className="markdown-diagram-preview-zoom" aria-label="当前缩放比例">{Math.round(scale * 100)}%</span>
                <button type="button" className="markdown-diagram-preview-btn" aria-label="放大流程图" onClick={() => zoomBy(1.25)} disabled={scale >= MAX_SCALE - 0.001}>放大</button>
                <button type="button" className="markdown-diagram-preview-btn" onClick={applyFit} aria-pressed={fitMode}>适应窗口</button>
                <button type="button" className="markdown-diagram-preview-btn" onClick={() => commitView(1, { x: 0, y: 0 }, false)} aria-pressed={!fitMode && Math.abs(scale - 1) < 0.01}>实际大小</button>
                <button type="button" className="markdown-diagram-preview-btn" onClick={() => void handleExportPng()} disabled={exporting}>{exporting ? '导出中…' : '导出图片'}</button>
              </>
            )}
            {source && (
              <button type="button" className="markdown-diagram-preview-btn" onClick={() => void handleCopySource()}>
                {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制源码'}
              </button>
            )}
            <button ref={closeRef} type="button" className="markdown-diagram-preview-btn is-primary" aria-label="关闭流程图预览" onClick={onClose}>关闭预览</button>
          </div>
        </header>
        {sanitized ? (
          <div
            ref={stageRef}
            className={'markdown-diagram-preview-stage' + (dragging ? ' is-dragging' : '')}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={() => { if (fitMode) commitView(1, { x: 0, y: 0 }, false); else applyFit(); }}
            title="滚轮缩放，按住左键拖拽平移，双击切换适应窗口与实际大小"
          >
            <div
              ref={canvasRef}
              className="markdown-diagram-preview-canvas"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            />
          </div>
        ) : (
          <div className="markdown-diagram-preview-fallback" role="alert">图示内容无法在安全预览中显示，可复制 Mermaid 源码核对。</div>
        )}
        {exportError && <div className="markdown-diagram-preview-status" role="status">{exportError}</div>}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
