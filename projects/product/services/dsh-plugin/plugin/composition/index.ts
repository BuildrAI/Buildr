/** Reversible public Loader composition; official Include retains its real configuration owner. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Inject, Service, type Context } from '@deepseek-ai/cordis';
import { EntryTree, type Entry, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import { composeEntries, loadProfileDirectory, readProfilePatches } from '@deepseek-ai/dsh-app-boot';
import type {} from '@deepseek-ai/dsh-app-boot';
import { COMPOSITION_SCHEMA, ROOT_MODULES, PRESET_IDS, PRESET_MODULE, CLIENT_MODULES, assertDefinition, deriveEntries, type CompositionDefinition, type RawEntry } from './definition.ts';
import { NativeConfigurationOwner } from './configuration-owner.ts';

const COMPOSITION_IDS = new Set<string>([...Object.keys(ROOT_MODULES), ...PRESET_IDS, ...Object.keys(CLIENT_MODULES)]);
/** Only declaration owners actually adapted by this composition can require its replacement. */
function relevantRows(rows: RawEntry[]): RawEntry[] {
  return rows.filter(row => COMPOSITION_IDS.has(row.id)).map(row => {
    if (row.id !== 'agent-loop') return row;
    const { config: _config, ...owner } = row; return owner;
  });
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Inspect the real native configuration owner and its explicitly substituted implementation. */
    buildrCompositionRuntime: { inspect: () => ReturnType<NativeConfigurationOwner['inspect']> };
  }
}

class CompositionTree extends EntryTree {
  override write(): void {}
  async updateRows(rows: EntryOptions[]): Promise<void> {
    const wanted = new Set(rows.map(row => row.id));
    for (const id of Object.keys(this.store)) if (!wanted.has(id)) this.root.remove(id);
    this.root.data = rows;
    await Promise.all(rows.map(async row => {
      const existing = this.store[row.id];
      if (existing === undefined) await this.root.create(row);
      else if (existing.options.name !== row.name) {
        const previous = existing.fiber;
        this.root.remove(row.id);
        if (previous) await previous.await().catch(() => {});
        await this.root.create(row);
      }
      else if (!isDeepStrictEqual(existing.options, row)) await existing.update(row, true);
    }));
  }
}
export default class BuildrComposition {
  static inject = ['loader', 'profileContext'];
  private tree?: CompositionTree;
  private disposed = false;
  private readonly suspendedDependency = 'buildr-composition-suspended-' + randomUUID();
  private readonly suspended = new Map<Entry, EntryOptions>();
  private readonly configurationOwner: NativeConfigurationOwner;
  private appliedRows?: RawEntry[];
  private appliedDefinition?: CompositionDefinition;
  constructor(private readonly ctx: Context) {
    this.configurationOwner = new NativeConfigurationOwner(ctx);
    ctx.provide('buildrCompositionRuntime', { inspect: () => this.inspectConfigurationOwner() });
  }
  /** Configuration declaration and actual producer implementation are intentionally separate identities. */
  inspectConfigurationOwner() { return this.configurationOwner.inspect(); }
  private currentDefinition(): CompositionDefinition {
    // Loader can retain a callback while another cooperative layer supplies the same owner id.
    // The current declaration, rather than the retained callback's URL, owns the physical graph.
    const baseURL = this.ctx.fiber.entry?.options.name;
    if (typeof baseURL !== 'string' || !baseURL.startsWith('file://')) throw Error('buildr-composition: unknown current package entry');
    const raw = JSON.parse(readFileSync(new URL('./definition.json', baseURL), 'utf8'));
    const value: unknown = { ...raw, presetOwner: new URL(raw.presetOwner, baseURL).href,
      modules: Object.fromEntries(Object.entries(raw.modules as Record<string, string>).map(([name, file]) => [name, new URL(file, baseURL).href])) };
    assertDefinition(value); return value;
  }
  private originalRows(): RawEntry[] {
    const profile = this.ctx.profileContext;
    const loaded = loadProfileDirectory('buildr-composition', profile.dir, profile.installAnchor);
    // Exclude every cooperating composition, including package aliases. Retain user, home and invocation layers.
    loaded.layers = loaded.layers.filter(layer => {
      const manifest = JSON.parse(readFileSync(join(layer.packageDir, 'package.json'), 'utf8'));
      return manifest.buildrComposition?.schemaVersion !== COMPOSITION_SCHEMA;
    });
    return composeEntries([readProfilePatches('buildr-composition', profile, loaded)]) as RawEntry[];
  }
  private selected(): boolean {
    const profile = this.ctx.profileContext;
    return loadProfileDirectory('buildr-composition', profile.dir, profile.installAnchor).layers.some(layer => {
      const manifest = JSON.parse(readFileSync(join(layer.packageDir, 'package.json'), 'utf8'));
      return manifest.buildrComposition?.schemaVersion === COMPOSITION_SCHEMA;
    });
  }
  private originalOwner(entry: Entry): boolean {
    if (entry.parent.tree.ctx.fiber.entry?.id !== 'include') return false;
    const expected: Record<string, string> = { ...ROOT_MODULES,
      ...Object.fromEntries(PRESET_IDS.map(id => [id, PRESET_MODULE])),
      'ui-trajectory': '@deepseek-ai/dsh-client-ui-trajectory',
      'ui-settings-agent-loop': '@deepseek-ai/dsh-client-ui-settings-agent-loop' };
    // This real Include row stays active so the official ConfigEditor owns its editable namespace.
    delete expected['agent-loop'];
    return expected[entry.options.id] === entry.options.name;
  }
  private unsuspendDependency(entry: Entry): void {
    if (entry.fiber) delete entry.fiber.inject[this.suspendedDependency];
    const inject = entry.options.inject;
    if (inject && !Array.isArray(inject)) delete inject[this.suspendedDependency];
  }
  /** Higher profile/home/invocation enablement still means the enhanced owner should run.
   * A private, unavailable dependency prevents the original import already in flight from starting.
   * Both flags exist only in the Loader generation; configuration files remain untouched. */
  private suspend(entry: Entry): void {
    this.suspended.set(entry, entry.options);
    entry.options.disabled = true;
    entry.options.inject = { ...Inject.resolve(entry.options.inject), [this.suspendedDependency]: null };
    if (entry.fiber) entry.fiber.inject[this.suspendedDependency] = null;
  }
  private refresh(): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.disposed) return;
      const definition = this.currentDefinition();
      const originalRows = this.originalRows();
      const rows = deriveEntries(originalRows, definition).filter(row => row.id !== 'agent-loop');
      const originals = [...this.ctx.loader.entries()].filter(entry => this.originalOwner(entry));
      await Promise.all(originals.map(async entry => {
        this.suspend(entry);
        const fiber = entry.fiber;
        await entry.update({ disabled: true });
        if (fiber) await fiber.await().catch(() => {});
      }));
      const parents = [...this.ctx.loader.entries()].filter(entry => ['tools', 'agent-loop', 'skill'].includes(entry.options.id)
        && entry.parent.tree.ctx.fiber.entry?.id === 'include');
      if (parents.length !== 3) {
        throw Error('buildr-composition: original root context is not uniquely addressable');
      }
      const baseURL = parents[0]!.parent.ctx.baseUrl;
      if (typeof baseURL !== 'string' || parents.some(entry => entry.parent.ctx.baseUrl !== baseURL)) {
        throw Error('buildr-composition: original owner base URL differs');
      }
      if (this.tree === undefined) this.tree = new CompositionTree(this.ctx.extend({ baseUrl: baseURL }));
      const agentLoop = parents.find(entry => entry.options.id === 'agent-loop')!;
      if (agentLoop.options.name !== ROOT_MODULES['agent-loop']) throw Error('buildr-composition: unknown configuration owner implementation');
      await this.tree.updateRows(rows as EntryOptions[]);
      await this.tree.await();
      await this.configurationOwner.enhance(agentLoop, definition.modules[ROOT_MODULES['agent-loop']]!);
      await this.tree.await();
      const failed = [...this.tree.entries()].filter(entry => !entry.disabled && entry.fiber?.state !== 2);
      if (failed.length) throw Error('buildr-composition: enhanced owner failed to activate');
      this.appliedRows = relevantRows(originalRows); this.appliedDefinition = definition;
    };
    return this.configurationOwner.serialized(run);
  }
  async* [Service.init]() {
    yield async () => {
      this.disposed = true;
      const fibers = this.tree ? [...this.tree.entries()].flatMap(entry => entry.fiber ? [entry.fiber] : []) : [];
      this.tree?.root.stop();
      await Promise.allSettled(fibers.map(fiber => fiber.await()));
      await this.configurationOwner.serialized(() => this.configurationOwner.release());
      const selected = this.selected();
      const originals = selected ? [] : this.originalRows();
      for (const [entry, options] of this.suspended) {
        this.unsuspendDependency(entry);
        // A later Loader generation, including a concurrent user change, owns its own flags.
        if (selected || entry.options !== options || !this.originalOwner(entry)) continue;
        const original = originals.find(row => row.id === options.id && row.name === options.name);
        if (original) await entry.update({ disabled: (original.disabled ?? null) as boolean | null,
          inject: (original.inject ?? null) as Exclude<EntryOptions['inject'], undefined> });
      }
    };
    yield this.ctx.on('loader/patch-context', (entry, next) => {
      // Root Include reconciliation waits Loader inertia. Restart synchronously here so its
      // transaction also owns and awaits the full composition lifecycle; no detached reload work.
      if (entry === this.ctx.fiber.entry?.parent.tree.ctx.fiber.entry) {
        next();
        // ConfigEditor reconciles before checking its revision. Unchanged declarations and
        // the real native owner's own config updates must preserve that actual fiber identity.
        if (!this.disposed && this.ctx.fiber.uid !== null && this.ctx.fiber.state === 2
          && (!isDeepStrictEqual(this.appliedRows, relevantRows(this.originalRows()))
          || !isDeepStrictEqual(this.appliedDefinition, this.currentDefinition()))) {
          void this.ctx.fiber.restart().catch(error => this.ctx.logger.warn(error));
        }
        return;
      }
      if (this.originalOwner(entry)) {
        if (!this.disposed && this.selected()) this.suspend(entry);
        else this.unsuspendDependency(entry);
      }
      return next();
    });
    await this.refresh();
  }
}
