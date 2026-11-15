// Only successful, sanitized local-renderer output enters this bounded cache.
// Synchronous reuse avoids layout shifts when a reading pane is remounted.
const cache = new Map<string, string>();
let characters = 0;
let instance = 0;

export function cachedDiagramSvg(source: string): string | undefined {
  return cache.get(source);
}

export function rememberDiagramSvg(source: string, svg: string) {
  if (cache.has(source) || source.length + svg.length > 1_000_000) return;
  cache.set(source, svg);
  characters += source.length + svg.length;
  while (cache.size > 24 || characters > 1_000_000) {
    const [key, value] = cache.entries().next().value!;
    characters -= key.length + value.length;
    cache.delete(key);
  }
}

export function setDiagramSvg(graph: HTMLElement, svg: string) {
  graph.innerHTML = svg;
  const drawing = graph.querySelector('svg');
  if (!drawing) throw new Error('没有图示');
  const prefix = `buildr-diagram-${++instance}-`;
  const ids = new Map<string, string>();
  for (const node of graph.querySelectorAll('[id]')) {
    const previous = node.getAttribute('id')!;
    const next = `${prefix}${ids.size}`;
    ids.set(previous, next);
    node.setAttribute('id', next);
  }
  const rewrite = (value: string) => value.replace(/#([\w:.-]+)/g, (match, id) => ids.has(id) ? `#${ids.get(id)}` : match);
  for (const node of graph.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name === 'id') continue;
      node.setAttribute(attribute.name, attribute.name.startsWith('aria-')
        ? attribute.value.split(' ').map(id => ids.get(id) || id).join(' ')
        : rewrite(attribute.value));
    }
    if (node.localName === 'style') node.textContent = rewrite(node.textContent || '');
  }
  const width = drawing.viewBox.baseVal.width;
  if (width > 0) { drawing.style.width = `${width}px`; drawing.style.maxWidth = 'none'; }
}
