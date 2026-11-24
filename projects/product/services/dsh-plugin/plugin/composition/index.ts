/** Reversible public Loader composition; fails closed into degraded native mode on host mismatch. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Inject, Service, type Context } from '@deepseek-ai/cordis';
import { EntryTree, type Entry, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import { composeEntries, loadProfileDirectory, readProfilePatches } from '@deepseek-ai/dsh-app-boot';
import type {} from '@deepseek-ai/dsh-app-boot';
import { COMPOSITION_SCHEMA, ROOT_MODULES, PRESET_IDS, PRESET_MODULE, CLIENT_MODULES, assertDefinition, deriveEntries, type CompositionDefinition, type RawEntry } from './definition.ts';
import { NativeConfigurationOwner, boundedAwait, isContextDisposing } from './configuration-owner.ts';
import { REQUIRED_SIBLING_ENTRY_IDS, probeCompositionCompatibility } from './compatibility.ts';
import { createStartupCircuitBreaker, guardFilePath, readCompositionIdentity, readHostVersion } from './circuit-breaker.ts';

const COMPOSITION_IDS = new Set<string>([...Object.keys(ROOT_MODULES), ...PRESET_IDS, ...Object.keys(CLIENT_MODULES)]);
const TEARDOWN_TIMEOUT_MS = 5_000;
const SIBLING_SETTLE_TIMEOUT_MS = 3_000;
const READY_CONFIRM_MS = 2_000;
const FIBER_ACTIVE = 2;
const FIBER_FAILED = 3;

export type CompositionDegradedReason = 'incompatible-host' | 'activation-failed' | 'circuit-breaker';

export type CompositionStatus =
  | { state: 'active'; hostVersion: string | null; implementation: ReturnType<NativeConfigurationOwner['inspect']> }
  | { state: 'degraded'; hostVersion: string | null; reason: CompositionDegradedReason; detail: string; incompatibleModules?: string[] };

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
    buildrCompositionRuntime: {
      inspect: () => ReturnType<NativeConfigurationOwner['inspect']>;
      status: () => CompositionStatus;
    };
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
        if (previous) await boundedAwait(previous.await().catch(() => {}), TEARDOWN_TIMEOUT_MS);
        await this.root.create(row);
      }
      else if (!isDeepStrictEqual(existing.options, row)) await existing.update(row, true);
    }));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fiberError(fiber: Entry['fiber']): unknown {
  // Some hosts expose the error; the supported SDK only guarantees Fiber.state.
  return fiber && 'error' in fiber ? fiber.error : undefined;
}

export default class BuildrComposition {
  static inject = ['loader', 'profileContext'];
  private tree: CompositionTree | undefined;
  private disposed = false;
  private active = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private circuitBreaker: ReturnType<typeof createStartupCircuitBreaker> | undefined;
  private currentStatus: CompositionStatus = { state: 'degraded', hostVersion: null, reason: 'activation-failed', detail: 'initializing' };
  private readonly suspendedDependency = 'buildr-composition-suspended-' + randomUUID();
  private readonly suspended = new Map<Entry, EntryOptions>();
  private readonly configurationOwner: NativeConfigurationOwner;
  private appliedRows?: RawEntry[];
  private appliedDefinition: CompositionDefinition | undefined;

  constructor(private readonly ctx: Context) {
    this.configurationOwner = new NativeConfigurationOwner(ctx);
    ctx.provide('buildrCompositionRuntime', {
      inspect: () => this.configurationOwner.inspect(),
      status: () => this.currentStatus,
    });
  }

  /** Configuration declaration and actual producer implementation are intentionally separate identities. */
  inspectConfigurationOwner() { return this.configurationOwner.inspect(); }

  private isHostDisposing(): boolean {
    if (isContextDisposing(this.ctx)) return true;
    const entryParent = (this.ctx.fiber as unknown as { parent?: { fiber?: { uid?: number | null; state?: number } } }).parent;
    if (entryParent?.fiber?.uid === null || entryParent?.fiber?.state === 4 || entryParent?.fiber?.state === 5) return true;
    return false;
  }

  private cancelReadyTimer(): void {
    if (this.readyTimer !== undefined) {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
  }

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

  private safeOriginalRows(): RawEntry[] {
    try {
      return this.originalRows();
    } catch {
      return [];
    }
  }

  private safeCurrentDefinition(): CompositionDefinition | undefined {
    try {
      return this.currentDefinition();
    } catch {
      return undefined;
    }
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

  private async stopTree(): Promise<void> {
    const tree = this.tree;
    this.tree = undefined;
    if (!tree) return;
    const fibers = [...tree.entries()].flatMap(entry => entry.fiber ? [entry.fiber] : []);
    tree.root.stop();
    await boundedAwait(Promise.allSettled(fibers.map(fiber => fiber.await())), TEARDOWN_TIMEOUT_MS);
  }

  private async restoreEntryToStock(entry: Entry, originals: readonly RawEntry[]): Promise<void> {
    this.unsuspendDependency(entry);
    const original = originals.find(row => row.id === entry.options.id && row.name === entry.options.name);
    const nextDisabled = (original?.disabled ?? null) as boolean | null;
    const nextInject = (original?.inject ?? null) as Exclude<EntryOptions['inject'], undefined>;
    await boundedAwait(
      entry.update({ disabled: nextDisabled, inject: nextInject }).catch(() => {}),
      TEARDOWN_TIMEOUT_MS,
    );
    if (!entry.disabled && entry.fiber?.inertia) {
      await boundedAwait(entry.fiber.await().catch(() => {}), TEARDOWN_TIMEOUT_MS);
    }
  }

  private async restoreSuspendedEntries(originals?: readonly RawEntry[]): Promise<void> {
    const rows = originals ?? this.safeOriginalRows();
    const pending = [...this.suspended];
    this.suspended.clear();
    for (const [entry, options] of pending) {
      this.unsuspendDependency(entry);
      if (entry.options !== options || !this.originalOwner(entry)) continue;
      await this.restoreEntryToStock(entry, rows);
    }
    // Also restore any original owner disabled by an immediately preceding restart cycle before fallback.
    for (const entry of this.ctx.loader.entries()) {
      if (!this.originalOwner(entry)) continue;
      const original = rows.find(row => row.id === entry.options.id && row.name === entry.options.name);
      if (original && original.disabled !== true && entry.disabled) {
        await this.restoreEntryToStock(entry, rows);
      }
    }
  }

  private async recoverFailedRequiredSiblings(): Promise<void> {
    const requiredSet = new Set<string>(REQUIRED_SIBLING_ENTRY_IDS);
    for (const entry of this.ctx.loader.entries()) {
      if (entry.disabled || !requiredSet.has(entry.options.id) || entry.options.id === 'agent-loop') continue;
      const fiber = entry.fiber;
      if (fiber === undefined || fiber.state === FIBER_ACTIVE) continue;
      if (fiber.state === FIBER_FAILED || fiberError(fiber) !== undefined || fiber.uid === null) {
        if (fiber.uid !== null) {
          await boundedAwait(fiber.restart().catch(() => {}), SIBLING_SETTLE_TIMEOUT_MS);
        } else {
          await boundedAwait(entry.init().catch(() => {}), SIBLING_SETTLE_TIMEOUT_MS);
          await boundedAwait(entry.fiber?.await().catch(() => {}), SIBLING_SETTLE_TIMEOUT_MS);
        }
      }
    }
  }

  private async degrade(
    hostVersion: string | null,
    reason: CompositionDegradedReason,
    detail: string,
    incompatibleModules?: string[],
  ): Promise<void> {
    this.active = false;
    this.cancelReadyTimer();
    this.appliedRows = relevantRows(this.safeOriginalRows());
    this.appliedDefinition = this.safeCurrentDefinition();
    this.currentStatus = {
      state: 'degraded',
      hostVersion,
      reason,
      detail,
      ...(incompatibleModules && incompatibleModules.length > 0 ? { incompatibleModules } : {}),
    };
    await this.stopTree();
    if (!this.isHostDisposing()) {
      // Restore stock root/preset providers first so agent-loop and required siblings find live native services.
      await this.restoreSuspendedEntries();
      await boundedAwait(
        this.configurationOwner.release({ restoreStock: true, timeoutMs: TEARDOWN_TIMEOUT_MS }).catch(() => {}),
        TEARDOWN_TIMEOUT_MS,
      );
      await this.recoverFailedRequiredSiblings();
    } else {
      await boundedAwait(
        this.configurationOwner.release({ restoreStock: false, timeoutMs: 2_000 }).catch(() => {}),
        2_000,
      );
    }
    this.ctx.logger.warn('buildr-composition degraded (%s): %s', reason, detail);
  }

  private async auditRequiredSiblings(): Promise<void> {
    const requiredSet = new Set<string>(REQUIRED_SIBLING_ENTRY_IDS);
    const siblings = [...this.ctx.loader.entries()].filter(
      entry => !entry.disabled && requiredSet.has(entry.options.id) && entry.options.id !== 'agent-loop',
    );
    await Promise.all(siblings.map(async entry => {
      if (entry.fiber?.inertia) {
        await boundedAwait(entry.fiber.await().catch(() => {}), SIBLING_SETTLE_TIMEOUT_MS);
      }
    }));
    const failed = siblings.filter(entry => entry.fiber?.state === FIBER_FAILED || fiberError(entry.fiber) !== undefined);
    if (failed.length > 0) {
      const detail = failed
        .map(entry => `${entry.options.id}: ${errorMessage(fiberError(entry.fiber) ?? 'activation failed')}`)
        .join('; ');
      throw Error(`buildr-composition: required sibling failed (${detail})`);
    }
  }

  private refresh(): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.disposed || this.isHostDisposing()) return;
      const profile = this.ctx.profileContext;
      const hostVersion = readHostVersion(profile.installAnchor);
      const entryUrl = typeof this.ctx.fiber.entry?.options.name === 'string'
        ? this.ctx.fiber.entry.options.name
        : 'buildr-composition';
      const compositionIdentity = readCompositionIdentity(entryUrl);
      const breaker = createStartupCircuitBreaker({
        guardFile: guardFilePath(profile.dir),
        hostVersion,
        compositionIdentity,
      });
      this.circuitBreaker = breaker;

      const guard = breaker.check();
      if (!guard.allowed) {
        await this.degrade(hostVersion, 'circuit-breaker', guard.detail);
        return;
      }

      let definition: CompositionDefinition;
      let originalRows: RawEntry[];
      let rows: RawEntry[];
      let baseURL: string;
      let includeTree: { import?: (specifier: string) => Promise<unknown> };
      let agentLoop: Entry;
      try {
        definition = this.currentDefinition();
        originalRows = this.originalRows();
        rows = deriveEntries(originalRows, definition).filter(row => row.id !== 'agent-loop');
        const parents = [...this.ctx.loader.entries()].filter(entry => ['tools', 'agent-loop', 'skill'].includes(entry.options.id)
          && entry.parent.tree.ctx.fiber.entry?.id === 'include');
        if (parents.length !== 3) {
          throw Error('buildr-composition: original root context is not uniquely addressable');
        }
        const resolvedBase = parents[0]!.parent.ctx.baseUrl;
        if (typeof resolvedBase !== 'string' || parents.some(entry => entry.parent.ctx.baseUrl !== resolvedBase)) {
          throw Error('buildr-composition: original owner base URL differs');
        }
        baseURL = resolvedBase;
        includeTree = parents[0]!.parent.tree as unknown as { import?: (specifier: string) => Promise<unknown> };
        agentLoop = parents.find(entry => entry.options.id === 'agent-loop')!;
        if (agentLoop.options.name !== ROOT_MODULES['agent-loop']) {
          throw Error('buildr-composition: unknown configuration owner implementation');
        }
      } catch (error) {
        await this.degrade(hostVersion, 'incompatible-host', errorMessage(error));
        return;
      }

      const importer = this.ctx.loader.internal?.import as
        | ((specifier: string, baseUrl: string, options: Record<string, unknown>) => Promise<unknown>)
        | undefined;
      if (typeof includeTree.import !== 'function' && typeof importer !== 'function') {
        await this.degrade(hostVersion, 'incompatible-host', 'loader.internal.import is unavailable');
        return;
      }

      const liveServices: Record<string, unknown> = {};
      const liveTools = this.ctx.get('tools' as never);
      if (liveTools !== undefined) liveServices[ROOT_MODULES.tools] = liveTools;
      const liveSkill = this.ctx.get('skill' as never);
      if (liveSkill !== undefined) liveServices[ROOT_MODULES.skill] = liveSkill;
      const liveAgentLoop = this.ctx.get('agentLoop' as never);
      if (liveAgentLoop !== undefined) liveServices[ROOT_MODULES['agent-loop']] = liveAgentLoop;

      const probe = await probeCompositionCompatibility({
        rows: originalRows,
        definition,
        baseUrl: baseURL,
        importModule: (specifier, from) => typeof includeTree.import === 'function'
          ? includeTree.import(specifier)
          : importer!.call(this.ctx.loader.internal, specifier, from, {}),
        liveServices,
      });
      if (!probe.compatible) {
        await this.degrade(hostVersion, 'incompatible-host', probe.detail, probe.incompatibleModules);
        return;
      }

      breaker.markAttempting();
      try {
        this.active = true;
        const originals = [...this.ctx.loader.entries()].filter(entry => this.originalOwner(entry));
        await Promise.all(originals.map(async entry => {
          this.suspend(entry);
          const fiber = entry.fiber;
          await boundedAwait(entry.update({ disabled: true }).catch(() => {}), TEARDOWN_TIMEOUT_MS);
          if (fiber) await boundedAwait(fiber.await().catch(() => {}), TEARDOWN_TIMEOUT_MS);
        }));
        if (this.disposed || this.isHostDisposing()) return;
        if (this.tree === undefined) this.tree = new CompositionTree(this.ctx.extend({ baseUrl: baseURL }));
        await this.tree.updateRows(rows as EntryOptions[]);
        await this.tree.await();
        await this.configurationOwner.enhance(agentLoop, definition.modules[ROOT_MODULES['agent-loop']]!);
        await this.tree.await();
        const failed = [...this.tree.entries()].filter(entry => !entry.disabled && entry.fiber?.state !== FIBER_ACTIVE);
        if (failed.length) throw Error('buildr-composition: enhanced owner failed to activate');
        await this.auditRequiredSiblings();
        this.appliedRows = relevantRows(originalRows);
        this.appliedDefinition = definition;
        this.currentStatus = {
          state: 'active',
          hostVersion,
          implementation: this.configurationOwner.inspect(),
        };
        this.cancelReadyTimer();
        this.readyTimer = setTimeout(() => {
          this.readyTimer = undefined;
          if (!this.disposed && this.active) breaker.markReady();
        }, READY_CONFIRM_MS);
        this.readyTimer.unref?.();
      } catch (error) {
        await this.degrade(hostVersion, 'activation-failed', errorMessage(error));
      }
    };
    return this.configurationOwner.serialized(run);
  }

  async* [Service.init]() {
    yield async () => {
      this.disposed = true;
      this.active = false;
      this.cancelReadyTimer();
      await this.stopTree();
      if (this.isHostDisposing()) {
        await boundedAwait(this.configurationOwner.release({ restoreStock: false, timeoutMs: 2_000 }).catch(() => {}), 2_000);
        return;
      }
      let selected = false;
      try {
        selected = this.selected();
      } catch {
        selected = false;
      }
      if (!selected) {
        this.circuitBreaker?.clear();
      }
      if (selected) {
        for (const [entry] of this.suspended) this.unsuspendDependency(entry);
        this.suspended.clear();
        await boundedAwait(
          this.configurationOwner.serialized(() => this.configurationOwner.release({ restoreStock: false, timeoutMs: TEARDOWN_TIMEOUT_MS })),
          TEARDOWN_TIMEOUT_MS,
        );
        return;
      }
      await this.restoreSuspendedEntries();
      await boundedAwait(
        this.configurationOwner.serialized(() => this.configurationOwner.release({ restoreStock: true, timeoutMs: TEARDOWN_TIMEOUT_MS })),
        TEARDOWN_TIMEOUT_MS,
      );
    };
    yield this.ctx.on('loader/patch-context', (entry, next) => {
      // Root Include reconciliation waits Loader inertia. Restart synchronously here so its
      // transaction also owns and awaits the full composition lifecycle; no detached reload work.
      if (entry === this.ctx.fiber.entry?.parent.tree.ctx.fiber.entry) {
        next();
        // ConfigEditor reconciles before checking its revision. Unchanged declarations and
        // the real native owner's own config updates must preserve that actual fiber identity.
        if (!this.disposed && this.ctx.fiber.uid !== null && this.ctx.fiber.state === FIBER_ACTIVE) {
          try {
            if (!isDeepStrictEqual(this.appliedRows, relevantRows(this.originalRows()))
              || !isDeepStrictEqual(this.appliedDefinition, this.currentDefinition())) {
              void this.ctx.fiber.restart().catch(error => this.ctx.logger.warn(error));
            }
          } catch {
            // Invalid declarations must not escape loader/patch-context.
          }
        }
        return;
      }
      if (this.originalOwner(entry)) {
        if (!this.disposed && this.active && this.selected()) {
          this.suspend(entry);
          queueMicrotask(() => {
            if (!this.disposed && this.active && entry.disabled && entry.fiber?.uid !== null) {
              void entry.fiber?.dispose();
            }
          });
        } else {
          this.unsuspendDependency(entry);
        }
      }
      return next();
    });
    await this.refresh();
  }
}
