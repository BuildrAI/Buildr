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
