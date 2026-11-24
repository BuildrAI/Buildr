export type ScrollableStream = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  getBoundingClientRect(): { top: number; bottom: number };
};
export type MeasurableBox = {
  getBoundingClientRect(): { top: number; bottom: number; height?: number };
};

/** Keep newly expanded question answer input (and its card margin) visible without breaking bottom pinning. */
export function revealConversationAnswer(
  stream: ScrollableStream,
  anchor: MeasurableBox,
  wasAtBottom: boolean,
  container: MeasurableBox = anchor,
): boolean {
  const maxTop = Math.max(0, stream.scrollHeight - stream.clientHeight);
  const streamRect = stream.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  if (wasAtBottom) {
    const deltaToBottom = maxTop - stream.scrollTop;
    if (deltaToBottom <= 0 || anchorRect.top - deltaToBottom >= streamRect.top) {
      stream.scrollTop = maxTop;
      return true;
    }
  }
  const marginBottom =
    typeof getComputedStyle === 'function' && (typeof Element === 'undefined' || container instanceof Element)
      ? Number.parseFloat(getComputedStyle(container as Element).marginBottom) || 0
      : 0;
  const clearance = Math.max(18, marginBottom);
  const containerRect = container.getBoundingClientRect();
  const overflow = containerRect.bottom - streamRect.bottom + clearance;
  if (overflow > 0) {
    const anchorHeight = anchorRect.height ?? (anchorRect.bottom - anchorRect.top);
    const viewportHeight = streamRect.bottom - streamRect.top;
    const maxSafeScroll = anchorHeight > viewportHeight ? overflow : Math.max(0, anchorRect.top - streamRect.top);
    stream.scrollTop = Math.min(maxTop, stream.scrollTop + Math.min(overflow, maxSafeScroll));
  }
  const distance = stream.scrollHeight - stream.scrollTop - stream.clientHeight;
  if (distance <= 24) {
    stream.scrollTop = maxTop;
    return true;
  }
  return false;
}

/** Move only the conversation viewport and leave its surrounding work panes alone. */
export function locateConversationContent(target: HTMLElement, underContext = true) {
  const stream = target.closest<HTMLElement>('.ac-stream');
  if (!stream) return;
  /* Keep located content below any sticky stream header and executing turn head. */
  const header = stream.querySelector<HTMLElement>(':scope > .ac-thread-header-in-stream');
  const headerInset = header && getComputedStyle(header).position === 'sticky' && !header.contains(target) ? header.offsetHeight : 0;
  const head = target.closest('.ac-turn')?.querySelector<HTMLElement>(':scope > .ac-turn-head');
  const contextInset = underContext && head && getComputedStyle(head).position === 'sticky' && !head.contains(target) ? head.offsetHeight + 8 : 0;
  const inset = headerInset + contextInset;
  const top = stream.scrollTop + target.getBoundingClientRect().top - stream.getBoundingClientRect().top - inset;
  stream.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}
