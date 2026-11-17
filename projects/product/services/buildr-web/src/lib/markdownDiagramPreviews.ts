import { readBlockDiagramSvg } from './markdownDiagramSvg.ts';

export type MarkdownDiagramTarget = {
  svg: string;
  source: string;
};

const EXPAND_ICON_PATH = 'M396 598L192 802V656c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v216c0 17.7 14.3 32 32 32h216c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H222l204-204c3.1-3.1 3.1-8.2 0-11.3l-18.7-18.7a8.03 8.03 0 00-11.3 0zM872 120H656c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h146L598 396c-3.1 3.1-3.1 8.2 0 11.3l18.7 18.7c3.1 3.1 8.2 3.1 11.3 0L832 222v146c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V152c0-17.7-14.3-32-32-32z';

function createZoomButton(doc: Document): HTMLButtonElement {
  const button = doc.createElement('button');
  button.className = 'markdown-zoom-diagram';
  button.setAttribute('type', 'button');
  button.setAttribute('data-zoom-diagram', '');
  button.setAttribute('aria-label', '放大查看流程图');
  button.setAttribute('title', '放大查看');
  const icon = doc.createElement('span');
  icon.className = 'markdown-zoom-diagram-icon';
  icon.setAttribute('aria-hidden', 'true');
  const svg = typeof doc.createElementNS === 'function'
    ? doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    : doc.createElement('svg');
  svg.setAttribute('viewBox', '64 64 896 896');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  const path = typeof doc.createElementNS === 'function'
    ? doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    : doc.createElement('path');
  path.setAttribute('d', EXPAND_ICON_PATH);
  svg.append(path);
  icon.append(svg);
  const label = doc.createElement('span');
  label.className = 'markdown-zoom-diagram-label';
  label.textContent = '放大查看';
  button.append(icon, label);
  return button;
}

/** Attach zoom triggers to rendered Mermaid diagram blocks without altering non-interactive surfaces. */
export function bindMarkdownDiagramPreviews(
  root: Pick<ParentNode, 'querySelectorAll'>,
  currentHandler: () => ((diagram: MarkdownDiagramTarget) => void) | undefined,
) {
  for (const block of root.querySelectorAll('.markdown-diagram')) {
    const doc = (block as Element).ownerDocument ?? globalThis.document;
    const graph = block.querySelector('.markdown-diagram-view') as HTMLElement | null;
    const open = (event: Event, fromButton: boolean) => {
      if (block.getAttribute('data-mermaid-state') !== 'rendered') return;
      const svg = readBlockDiagramSvg(block);
      if (!svg) return;
      if (!fromButton && graph) {
        const mouse = event as Partial<MouseEvent>;
        if (typeof mouse.offsetX === 'number' && typeof mouse.offsetY === 'number'
          && graph.clientWidth > 0 && graph.clientHeight > 0
          && (mouse.offsetX > graph.clientWidth || mouse.offsetY > graph.clientHeight)) {
          return;
        }
        const selection = doc?.defaultView?.getSelection?.();
        if (selection && !selection.isCollapsed && String(selection).trim()) return;
      }
      event.preventDefault();
      event.stopPropagation();
      const source = block.querySelector('pre code')?.textContent || '';
      currentHandler()?.({ svg, source });
    };
    if (doc && !block.querySelector('button[data-zoom-diagram]')) {
      const zoom = createZoomButton(doc);
      const copy = block.querySelector('button[data-copy-code]');
      if (copy && copy.parentNode === block) block.insertBefore(zoom, copy);
      else block.prepend(zoom);
      zoom.addEventListener('click', event => open(event, true));
    }
    if (graph) {
      graph.classList.add('markdown-zoomable-diagram');
      graph.setAttribute('title', '点击放大查看流程图');
      graph.setAttribute('aria-label', 'Mermaid 图示，点击放大查看');
      graph.addEventListener('click', event => open(event, false));
      graph.addEventListener('keydown', event => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') open(event, false);
      });
    }
  }
}
