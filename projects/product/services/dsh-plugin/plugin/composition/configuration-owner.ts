/** Use the real Include entry and Loader lifecycle so official forms keep their configuration owner. */
import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import type {} from '@deepseek-ai/dsh-hmr';

const FIBER_DISPOSED = 4;
const FIBER_UNLOADING = 5;
const DEFAULT_RELEASE_TIMEOUT_MS = 5_000;

export function isContextDisposing(ctx: Context): boolean {
  const self = ctx as unknown as {
    fiber?: { uid?: number | null; state?: number; parent?: { fiber?: { uid?: number | null; state?: number } } };
    root?: { fiber?: { uid?: number | null; state?: number } };
    get?: (name: string) => unknown;
  };
  if (self.fiber?.uid === null || self.fiber?.state === FIBER_DISPOSED || self.fiber?.state === FIBER_UNLOADING) return true;
  if (self.root?.fiber?.uid === null || self.root?.fiber?.state === FIBER_DISPOSED || self.root?.fiber?.state === FIBER_UNLOADING) return true;
  if (self.fiber?.parent?.fiber?.uid === null || self.fiber?.parent?.fiber?.state === FIBER_DISPOSED || self.fiber?.parent?.fiber?.state === FIBER_UNLOADING) return true;
  const loader = typeof self.get === 'function'
    ? self.get('loader') as { ctx?: { fiber?: { uid?: number | null; state?: number } } } | undefined
    : undefined;
  if (loader?.ctx?.fiber?.uid === null || loader?.ctx?.fiber?.state === FIBER_DISPOSED || loader?.ctx?.fiber?.state === FIBER_UNLOADING) return true;
  return false;
}

export async function boundedAwait<T>(promise: Promise<T> | undefined, timeoutMs: number): Promise<T | undefined> {
  if (promise === undefined) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Call only from lifecycle work that the enclosing Loader reconciliation awaits, never a detached event. */
export async function withinReload<T>(ctx: Context, operation: () => Promise<T>): Promise<T> {
  if (isContextDisposing(ctx)) return operation();
  const hmr = ctx.get('hmr');
  if (hmr === undefined) return operation();
  let started = false;
  try { return await hmr.runExclusive(() => { started = true; return operation(); }); }
  catch (error) {
    // Loader awaits these lifecycle callers; this public rejection identifies its enclosing transaction.
    if (!started && error instanceof Error && error.message === 'HMR transactions cannot be nested') return operation();
    throw error;
  }
}
interface Binding { entry: Entry; fiber: Fiber; declaration: string; implementation: string }
export class NativeConfigurationOwner {
  private binding: Binding | undefined;
  constructor(private readonly ctx: Context) {}
  inspect(): { entryId: string; declaration: string; implementation: string; state: number; current: boolean } | null {
    const value = this.binding;
    return value ? { entryId: value.entry.id, declaration: value.declaration, implementation: value.implementation,
      state: value.fiber.state, current: value.entry.fiber === value.fiber && value.fiber.uid !== null } : null;
  }
  async enhance(entry: Entry, implementation: string): Promise<void> {
    if (entry.disabled) return;
    const currentBinding = this.binding;
    if (currentBinding?.entry === entry && entry.fiber === currentBinding.fiber && entry.fiber?.uid !== null
      && currentBinding.implementation === implementation) return;
    // Finish an original import already in flight before stopping it; Entry.init deduplicates that task.
    if (!entry.fiber || entry.fiber.uid === null) await entry.init();
    this.binding = undefined;
    const declaration = entry.options.name, options = entry.options;
    const disabled = options.disabled;
    const previous = entry.fiber;
    await entry.update({ disabled: true });
    if (previous) await boundedAwait(previous.await().catch(() => {}), DEFAULT_RELEASE_TIMEOUT_MS);
    if (entry.options !== options || entry.options.name !== declaration) throw Error('buildr-composition: configuration owner changed during replacement');
    options.name = implementation;
    if (disabled === undefined) delete options.disabled;
    else options.disabled = disabled;
    let actual: Fiber | undefined;
    try {
      await entry.init(); actual = entry.fiber;
      if (!actual) throw Error('buildr-composition: configuration implementation did not load');
      await actual.await();
      if (actual.state !== 2) throw Error('buildr-composition: configuration implementation is inactive');
      if (entry.options !== options || options.name !== implementation || entry.fiber !== actual) throw Error('buildr-composition: configuration owner changed during activation');
      // Stable configuration identity remains the real source declaration. Actual implementation is inspectable above.
      options.name = declaration;
      this.binding = { entry, fiber: actual, declaration, implementation };
    } catch (error) {
      if (entry.options === options && options.name === implementation) {
        if (!isContextDisposing(this.ctx)) {
          await boundedAwait(entry.update({ disabled: true }).catch(() => {}), DEFAULT_RELEASE_TIMEOUT_MS);
          if (actual) await boundedAwait(actual.await().catch(() => {}), DEFAULT_RELEASE_TIMEOUT_MS);
        }
        options.name = declaration;
        if (disabled === undefined) delete options.disabled;
        else options.disabled = disabled;
        if (!entry.disabled && !isContextDisposing(this.ctx)) {
          await boundedAwait(entry.init().catch(() => {}), DEFAULT_RELEASE_TIMEOUT_MS);
          await boundedAwait(entry.fiber?.await().catch(() => {}), DEFAULT_RELEASE_TIMEOUT_MS);
        }
      }
      throw error;
    }
  }
  async release(releaseOptions?: { restoreStock?: boolean; timeoutMs?: number }): Promise<void> {
    const binding = this.binding; this.binding = undefined;
    if (!binding || binding.entry.fiber !== binding.fiber || binding.fiber.uid === null
      || binding.entry.options.name !== binding.declaration) return;
    const timeoutMs = releaseOptions?.timeoutMs ?? DEFAULT_RELEASE_TIMEOUT_MS;
    const disposing = isContextDisposing(this.ctx);
    const restoreStock = releaseOptions?.restoreStock ?? !disposing;
    const { entry, fiber } = binding, options = entry.options, disabled = options.disabled;
    if (disposing) return;
    await boundedAwait(entry.update({ disabled: true }).catch(() => {}), timeoutMs);
    await boundedAwait(fiber.await().catch(() => {}), timeoutMs);
    if (entry.options !== options || options.name !== binding.declaration) return;
    if (disabled === undefined) delete options.disabled;
    else options.disabled = disabled;
    if (restoreStock && !entry.disabled && !isContextDisposing(this.ctx)) {
      await boundedAwait(entry.init().catch(() => {}), timeoutMs);
      await boundedAwait(entry.fiber?.await().catch(() => {}), timeoutMs);
    }
  }
  async serialized<T>(operation: () => Promise<T>): Promise<T> { return withinReload(this.ctx, operation); }
}
