export type MarkdownReadingPosition = {
  top: number;
  block: number;
  offset: number;
};

/** Keep the same body block in view when illustrations change the height above it. */
export function trackMarkdownReadingPosition(
  host: HTMLElement, body: HTMLElement, positions: Map<string, MarkdownReadingPosition>, key: string,
) {
  let saved = positions.get(key);
  let appliedTop = 0;
  let scrollHeight = 0;
  let viewportHeight = 0;

  const restore = () => {
    if (!host.clientHeight) return;
    const block = saved && body.children.item(saved.block);
    host.scrollTop = block && saved
      ? host.scrollTop + block.getBoundingClientRect().top - host.getBoundingClientRect().top - saved.offset
      : saved?.top ?? 0;
    appliedTop = host.scrollTop;
    scrollHeight = host.scrollHeight;
    viewportHeight = host.clientHeight;
  };
  const remember = () => {
    if (!host.clientHeight || host.scrollTop === appliedTop) return;
    if (host.scrollHeight !== scrollHeight || host.clientHeight !== viewportHeight) {
      // Layout can clamp scrollTop before the resize observer runs. Do not save the clamp.
      restore();
      return;
    }
    const top = host.scrollTop;
    const edge = host.getBoundingClientRect().top;
    let index = -1;
    if (top > 0) {
      let first = 0, end = body.children.length;
      while (first < end) {
        const middle = (first + end) >>> 1;
        if (body.children[middle].getBoundingClientRect().bottom <= edge) first = middle + 1;
        else end = middle;
      }
      if (first < body.children.length) index = first;
    }
    saved = { top, block: index, offset: index < 0 ? 0 : body.children[index].getBoundingClientRect().top - edge };
    positions.set(key, saved);
    appliedTop = top;
  };
  restore();
  const observer = new ResizeObserver(restore);
  observer.observe(host);
  observer.observe(body);
  host.addEventListener('scroll', remember, { passive: true });
  return () => {
    remember();
    observer.disconnect();
    host.removeEventListener('scroll', remember);
  };
}
