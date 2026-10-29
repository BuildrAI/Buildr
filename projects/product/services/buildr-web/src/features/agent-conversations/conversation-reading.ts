/** Move only the conversation viewport and leave its surrounding work panes alone. */
export function locateConversationContent(target: HTMLElement, underContext = true) {
  const stream = target.closest<HTMLElement>('.ac-stream');
  if (!stream) return;
  /* The executing turn pins only its identity line; keep located content below that line. */
  const line = target.closest('.ac-turn')?.querySelector<HTMLElement>(':scope > .ac-turn-identity');
  const inset = underContext && line && getComputedStyle(line).position === 'sticky' && !line.contains(target) ? line.offsetHeight + 8 : 0;
  const top = stream.scrollTop + target.getBoundingClientRect().top - stream.getBoundingClientRect().top - inset;
  stream.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}
