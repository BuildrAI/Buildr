// Only successful, sanitized local-renderer output enters this bounded cache.
// Synchronous reuse avoids layout shifts when a reading pane is remounted.
const cache = new Map<string, string>();
const blockSvgs = new WeakMap<object, string>();
let characters = 0;
let instance = 0;

const FORBIDDEN_DIAGRAM_TAGS = new Set([
  'a',
  'image',
  'foreignobject',
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
]);
const FORBIDDEN_DIAGRAM_ATTRS = new Set(['href', 'xlink:href', 'src', 'formaction']);

function safeDiagramCssValue(value: string): boolean {
  if (/@import|\\/i.test(value)) return false;
  for (const match of value.matchAll(/url\s*\([^)]*\)/gi)) {
    if (!/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(match[0])) return false;
  }
  return true;
}

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

export function rememberBlockDiagramSvg(block: object, svg: string) {
  blockSvgs.set(block, svg);
}

export function readBlockDiagramSvg(block: object): string | undefined {
  return blockSvgs.get(block);
}

/** Validate serialized SVG markup before placing it in an enlarged preview surface. */
export function sanitizeDiagramSvg(svg: string): string | null {
  if (typeof svg !== 'string' || !svg.trim() || typeof DOMParser !== 'function' || typeof XMLSerializer !== 'function') {
    return null;
  }
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || parsed.querySelector('parsererror') || root.localName.toLowerCase() !== 'svg') return null;
  const elements = [root, ...root.querySelectorAll('*')];
  for (const element of elements) {
    if (FORBIDDEN_DIAGRAM_TAGS.has(element.localName.toLowerCase())) return null;
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      const localName = attribute.localName.toLowerCase();
      if (name.startsWith('on') || FORBIDDEN_DIAGRAM_ATTRS.has(name) || FORBIDDEN_DIAGRAM_ATTRS.has(localName)) {
        return null;
      }
      if (!safeDiagramCssValue(attribute.value)) return null;
    }
    if (element.localName.toLowerCase() === 'style' && !safeDiagramCssValue(element.textContent || '')) {
      return null;
    }
  }
  return new XMLSerializer().serializeToString(root);
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
