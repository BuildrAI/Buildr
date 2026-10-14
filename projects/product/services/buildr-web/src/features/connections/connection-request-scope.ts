/** A cancelled request may still resolve; identity also protects the visible draft. */
export function createConnectionRequestScope() {
  let current: AbortController | undefined;
  return {
    invalidate() { current?.abort(); current = undefined; },
    begin() {
      current?.abort();
      const controller = new AbortController(); current = controller;
      return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted };
    },
  };
}

export type ConnectionRequestScope = ReturnType<typeof createConnectionRequestScope>;
