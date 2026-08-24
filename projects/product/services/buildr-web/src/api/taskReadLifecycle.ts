type PendingTaskRead = {
  taskId: string;
  controller: AbortController;
  promise: Promise<unknown>;
};

export type TaskReadLifecycle = {
  run<T>(taskId: string, operation: string, request: (signal: AbortSignal) => Promise<T>): Promise<T>;
  abortTask(taskId: string): void;
  abortAll(): void;
};

export function isTaskReadCancelled(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

export function createTaskReadLifecycle(): TaskReadLifecycle {
  const pending = new Map<string, PendingTaskRead>();

  function run<T>(taskId: string, operation: string, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const key = `${taskId}\u0000${operation}`;
    const existing = pending.get(key);
    if (existing) return existing.promise as Promise<T>;

    const controller = new AbortController();
    const entry: PendingTaskRead = {
      taskId,
      controller,
      promise: Promise.resolve().then(() => request(controller.signal)),
    };
    entry.promise = entry.promise.finally(() => {
      if (pending.get(key) === entry) pending.delete(key);
    });
    pending.set(key, entry);
    return entry.promise as Promise<T>;
  }

  function abortTask(taskId: string): void {
    for (const [key, entry] of pending) {
      if (entry.taskId !== taskId) continue;
      pending.delete(key);
      entry.controller.abort();
    }
  }

  function abortAll(): void {
    for (const [key, entry] of pending) {
      pending.delete(key);
      entry.controller.abort();
    }
  }

  return { run, abortTask, abortAll };
}
