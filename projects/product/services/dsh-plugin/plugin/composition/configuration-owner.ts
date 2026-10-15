/** Use the real Include entry and Loader lifecycle so official forms keep their configuration owner. */
import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import type {} from '@deepseek-ai/dsh-hmr';

/** Call only from lifecycle work that the enclosing Loader reconciliation awaits, never a detached event. */
export async function withinReload<T>(ctx: Context, operation: () => Promise<T>): Promise<T> {
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
    if (this.binding?.entry === entry && entry.fiber === this.binding.fiber && entry.fiber?.uid !== null
      && this.binding.implementation === implementation) return;
    // Finish an original import already in flight before stopping it; Entry.init deduplicates that task.
    if (!entry.fiber || entry.fiber.uid === null) await entry.init();
    this.binding = undefined;
    const declaration = entry.options.name, options = entry.options;
    const disabled = options.disabled;
    const previous = entry.fiber;
    await entry.update({ disabled: true });
    if (previous) await previous.await().catch(() => {});
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
        await entry.update({ disabled: true });
        if (actual) await actual.await().catch(() => {});
        options.name = declaration;
        if (disabled === undefined) delete options.disabled;
        else options.disabled = disabled;
        if (!entry.disabled) { await entry.init(); await entry.fiber?.await(); }
      }
      throw error;
    }
  }
  async release(): Promise<void> {
    const binding = this.binding; this.binding = undefined;
    if (!binding || binding.entry.fiber !== binding.fiber || binding.fiber.uid === null
      || binding.entry.options.name !== binding.declaration) return;
    const { entry, fiber } = binding, options = entry.options, disabled = options.disabled;
    await entry.update({ disabled: true });
    await fiber.await().catch(() => {});
    if (entry.options !== options || entry.options.name !== binding.declaration) return;
    if (disabled === undefined) delete options.disabled;
    else options.disabled = disabled;
    if (!entry.disabled) { await entry.init(); await entry.fiber?.await(); }
  }
  async serialized<T>(operation: () => Promise<T>): Promise<T> { return withinReload(this.ctx, operation); }
}
