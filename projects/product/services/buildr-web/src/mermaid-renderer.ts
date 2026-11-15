import mermaid from 'mermaid';
import DOMPurify from 'dompurify';

// This entry runs only in the local, CSP-restricted rendering frame.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  maxTextSize: 20_000,
  maxEdges: 300,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  theme: 'default',
  fontFamily: 'system-ui, sans-serif',
});

let queue = Promise.resolve();
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  const { type, id, source } = event.data || {};
  if (type !== 'buildr:mermaid:render' || typeof id !== 'string' || !/^buildr-mermaid-\d+$/.test(id) || typeof source !== 'string') return;
  queue = queue.then(async () => {
    try {
      if (source.length > 20_000) throw new Error('图示过大，请查看源码。');
      // Document directives may customize security, CSS or resource behavior.
      // Keep these out of this read-only renderer, rather than reinterpreting them.
      if (/^\s*---/.test(source) || /%%\s*\{/.test(source)) throw new Error('此阅读器不支持内嵌绘图配置，请查看源码。');
      const result = await mermaid.render(id, source);
      const svg = DOMPurify.sanitize(result.svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['a', 'image', 'foreignobject', 'script', 'animate', 'animatemotion', 'animatetransform', 'set'],
        FORBID_ATTR: ['href', 'xlink:href'],
      });
      // DOMPurify does not sanitize CSS. Resource CSS was blocked in the frame;
      // prevent it from becoming active when the SVG enters the reading page.
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const checkCss = (value: string) => {
        if (/@import|\\/i.test(value)) throw new Error('不支持的图示样式');
        for (const match of value.matchAll(/url\s*\([^)]*\)/gi)) {
          if (!/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(match[0])) throw new Error('不支持外部图示资源');
        }
      };
      for (const element of parsed.querySelectorAll('*')) {
        for (const attribute of element.attributes) checkCss(attribute.value);
        if (element.localName === 'style') checkCss(element.textContent || '');
      }
      // Do not bind Mermaid callbacks. Only inert SVG is returned to the reader.
      parent.postMessage({ type: 'buildr:mermaid:result', id, svg: new XMLSerializer().serializeToString(parsed.documentElement) }, location.origin);
    } catch {
      parent.postMessage({ type: 'buildr:mermaid:result', id, error: '图示暂时无法渲染，请查看或复制源码。' }, location.origin);
    }
  });
});
parent.postMessage({ type: 'buildr:mermaid:ready' }, location.origin);
