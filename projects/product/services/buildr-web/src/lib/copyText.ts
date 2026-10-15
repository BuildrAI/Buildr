/** Copy only the supplied text from a user gesture; retain focus and any reading selection. */
export async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; } }
  catch { /* Sandboxed readers can still use the browser's user-initiated copy command. */ }
  const previousFocus = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
  document.body.append(field);
  let copied = false;
  try { field.focus(); field.select(); copied = document.execCommand('copy'); }
  catch { copied = false; }
  finally {
    field.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); for (const range of ranges) if (range.commonAncestorContainer.isConnected) selection.addRange(range); }
  }
  return copied;
}
