/** Schedule passive reads after completion; visibility never changes business state. */
export function createVisiblePoller(options: {
  read: () => Promise<unknown>;
  interval: () => number;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  focusFreshMs?: number;
  resumeWhenFresh?: boolean;
}) {
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<unknown> | undefined;
  let completedAt = Date.now();
  const visible = () => options.document.visibilityState !== 'hidden';
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    clear();
    if (!disposed && visible() && !pending) timer = setTimeout(() => void request(), Math.max(0, options.interval() - (Date.now() - completedAt)));
  };
  const request = (): Promise<unknown> => {
    if (disposed || !visible()) return Promise.resolve();
    if (pending) return pending;
    clear();
    pending = Promise.resolve().then(options.read).catch(() => {}).finally(() => {
      pending = undefined; completedAt = Date.now(); schedule();
    });
    return pending;
  };
  const focus = () => {
    if (Date.now() - completedAt >= (options.focusFreshMs ?? 1000)) void request();
  };
  const visibility = () => {
    clear();
    if (!visible()) return;
    if (options.resumeWhenFresh !== false) void request();
    else { focus(); schedule(); }
  };
  options.window.addEventListener('focus', focus);
  options.document.addEventListener('visibilitychange', visibility);
  schedule();
  return {
    request,
    reschedule: schedule,
    observed() { completedAt = Date.now(); schedule(); },
    dispose() { disposed = true; clear(); options.window.removeEventListener('focus', focus); options.document.removeEventListener('visibilitychange', visibility); },
  };
}
