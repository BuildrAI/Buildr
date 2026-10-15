/** Bounded Host observation; a browser never elects a separate business owner. */
import type { ActivationStatus } from './src/types.ts';

export type ActivationView = { kind: 'checking' | 'active' | 'conflict' | 'unavailable'; ownerPackage?: string };
interface Dependencies {
  read(): Promise<ActivationStatus>;
  mount(): Promise<() => void | Promise<void>>;
  publish(value: ActivationView): void;
  timeoutMs?: number;
}

export function createActivationMonitor(dependencies: Dependencies) {
  let disposed = false, generation = 0;
  let features: (() => void | Promise<void>) | undefined;
  let pending: Promise<void> | undefined;
  let cancelRead: (() => void) | undefined;
  let repeat = false;
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending !== undefined) { repeat = true; return pending; }
    const epoch = generation;
    const run = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([dependencies.read(), new Promise<never>((_, reject) => {
          cancelRead = () => reject(new Error('activation-disposed'));
          timer = setTimeout(() => reject(new Error('activation-timeout')), dependencies.timeoutMs ?? 5_000);
        })]);
        if (disposed || epoch !== generation) return;
        if (status.active) {
          if (features === undefined) {
            const release = await dependencies.mount();
            if (disposed || epoch !== generation) { await release(); return; }
            features = release;
          }
          dependencies.publish({ kind: 'active' });
        } else {
          const release = features; features = undefined; await release?.();
          if (disposed || epoch !== generation) return;
          dependencies.publish({ kind: status.code === 'plugin-conflict' ? 'conflict' : 'unavailable',
            ...status.ownerPackage === undefined ? {} : { ownerPackage: status.ownerPackage } });
        }
      } catch {
        // A transport failure is not evidence that an established owner lost its qualification.
        if (!disposed && epoch === generation) dependencies.publish({ kind: 'unavailable' });
      } finally { cancelRead = undefined; if (timer !== undefined) clearTimeout(timer); }
    };
    pending = run().finally(() => {
      pending = undefined;
      if (repeat && !disposed) { repeat = false; void refresh(); }
    });
    return pending;
  };
  return { refresh, async dispose(): Promise<void> {
    disposed = true; generation++; cancelRead?.();
    const release = features; features = undefined; await release?.();
  } };
}
