import { useDeferredValue, useMemo } from 'react';
import DOMPurify from 'dompurify';

function previewDocument(html: string): string {
  const root = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    RETURN_DOM: true,
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['base', 'link', 'meta', 'script', 'iframe', 'frame', 'object', 'embed', 'template'],
    FORBID_ATTR: ['action', 'formaction', 'ping', 'target', 'download', 'srcset', 'background', 'poster', 'autofocus'],
  });
  if (!(root instanceof HTMLElement)) return '';
  const head = root.querySelector('head');
  if (!head) return '';
  for (const element of root.querySelectorAll('[href], [src]')) {
    const href = element.getAttribute('href');
    if (href?.startsWith('#') && element.localName === 'a') {
      // srcdoc otherwise resolves relative URLs against the host document.
      element.setAttribute('href', `about:srcdoc${href}`);
    } else {
      element.removeAttribute('href');
    }
    const src = element.getAttribute('src');
    if (src !== null && !(element.localName === 'img' && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(src))) {
      element.removeAttribute('src');
    }
  }
  const policy = head.ownerDocument.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
  head.prepend(policy);
  return `<!doctype html>${root.outerHTML}`;
}

/** Static view of repository content; never give this frame any sandbox permissions. */
export function HtmlFilePreview({ html }: { html: string }) {
  const deferredHtml = useDeferredValue(html);
  const srcDoc = useMemo(() => previewDocument(deferredHtml), [deferredHtml]);
  return <iframe className="file-editing-html-frame" title="HTML 静态预览" sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} />;
}
