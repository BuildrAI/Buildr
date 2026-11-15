import { rememberDiagramSvg, setDiagramSvg } from './markdownDiagramSvg.ts';

type Pending = {
  resolve: (svg: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
let nextId = 0;

// Each mounted document owns its frame. Unmounting also aborts rendering, not
// just insertion; stale streamed documents cannot leave an unbounded work queue.
export function renderMarkdownDiagrams(root: HTMLElement): () => void {
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-mermaid-source]')];
  if (!blocks.length) return () => {};
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return () => {};
  const frame = doc.createElement('iframe');
  frame.className = 'markdown-diagram-renderer';
  frame.title = '本地图示绘制';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.src = '/mermaid-renderer.html';
  const pending = new Map<string, Pending>();
  let disposed = false;
  let start: ReturnType<typeof setTimeout>;
  const stopFrame = () => {
    clearTimeout(start);
    view.removeEventListener('message', receive);
    frame.remove();
  };
  const releaseIfIdle = () => { if (!pending.size) stopFrame(); };
  const fail = () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('绘图未完成')); }
    pending.clear();
    stopFrame();
  };
  const receive = (event: MessageEvent) => {
    if (disposed || event.source !== frame.contentWindow || event.origin !== view.location.origin) return;
    const data = event.data;
    if (data?.type === 'buildr:mermaid:ready') {
      for (const [id] of pending) {
        const block = blocks.find(item => item.dataset.mermaidId === id);
        if (block) frame.contentWindow?.postMessage({ type: 'buildr:mermaid:render', id, source: block.dataset.mermaidSource }, view.location.origin);
      }
      return;
    }
    if (data?.type !== 'buildr:mermaid:result') return;
    const item = pending.get(data.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(data.id);
    if (typeof data.svg === 'string') item.resolve(data.svg);
    else item.reject(new Error('绘图失败'));
    releaseIfIdle();
  };
  view.addEventListener('message', receive);
  for (const block of blocks) {
    const id = `buildr-mermaid-${++nextId}`;
    block.dataset.mermaidId = id;
    const graph = block.querySelector<HTMLElement>('.markdown-diagram-view')!;
    const source = block.querySelector<HTMLDetailsElement>('details')!;
    const note = block.querySelector<HTMLElement>('.markdown-render-note')!;
    const origin = note.textContent?.match(/；原文件：.*?(?=。?$)/)?.[0] || '';
    void new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('绘图超时')); releaseIfIdle(); }, 20_000);
      pending.set(id, { resolve, reject, timer });
    }).then(svg => {
      if (disposed || !root.isConnected) return;
      setDiagramSvg(graph, svg);
      rememberDiagramSvg(block.dataset.mermaidSource!, svg);
      graph.hidden = false;
      note.hidden = true;
      source.open = false;
      block.dataset.mermaidState = 'rendered';
    }).catch(() => {
      if (disposed || !root.isConnected) return;
      graph.replaceChildren();
      graph.hidden = true;
      source.open = true;
      note.textContent = `图示暂时无法渲染，当前显示 Mermaid 源码。可复制源码或查看原文${origin}。`;
      block.dataset.mermaidState = 'fallback';
    });
  }
  frame.addEventListener('error', fail);
  // Coalesce rapid streamed text changes before loading the drawing engine.
  start = setTimeout(() => { if (!disposed) doc.body.append(frame); }, 180);
  return () => {
    disposed = true;
    fail();
  };
}
