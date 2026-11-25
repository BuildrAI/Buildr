/** Compare pointermove coordinates; the first move may have zero movementX/Y in Chromium. */
export function createMouseMoveIntent() {
  let previous: { x: number; y: number } | undefined;
  return (event: Pick<PointerEvent, 'pointerType' | 'clientX' | 'clientY' | 'movementX' | 'movementY' | 'buttons'>) => {
    if (event.pointerType !== 'mouse') return false;
    const moved = previous?.x !== event.clientX || previous?.y !== event.clientY || event.movementX !== 0 || event.movementY !== 0;
    previous = { x: event.clientX, y: event.clientY };
    return moved && event.buttons === 0;
  };
}

export function canShowOverlay(document: Pick<Document, 'hidden' | 'hasFocus'>) {
  return !document.hidden && document.hasFocus();
}

/** Start once per dwell; subsequent motion inside the trigger must not postpone it. */
export function createOverlayDelay() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    start(delay: number, run: () => void) {
      if (timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; run(); }, delay);
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
