import crypto from 'node:crypto';

import {
  canonicalContextConfiguration,
  contextConfigurationIdentity,
  normalizeContextRequest,
  testContextError,
} from './definition.mjs';

const SCOPE_RANK = Object.freeze({ test: 1, suite: 2, worker: 3 });

function digest(parts) {
  return `sha256-${crypto.createHash('sha256').update(parts.join('\0')).digest('hex')}`;
}

function inspectDisposition(value) {
  if (value == null || value === true || value === 'clean' || value.status === 'clean') return { dirty: false, reason: null };
  if (value === false || value === 'dirty') return { dirty: true, reason: 'provider-inspection' };
  if (value?.dirty === true || value?.status === 'dirty') return { dirty: true, reason: value.reason ?? 'provider-inspection' };
  throw testContextError('test_context_inspection_invalid', 'Context inspect() returned an unsupported disposition.', { value });
}

function scopeIdentity(definition, owner) {
  if (definition.scope === 'worker') return 'worker';
  if (definition.scope === 'suite') {
    if (!owner.suiteId) throw testContextError('test_context_scope_identity_missing', `Suite Context ${definition.key} requires suiteId.`);
    return `suite:${owner.suiteId}`;
  }
  if (!owner.testId) throw testContextError('test_context_scope_identity_missing', `Test Context ${definition.key} requires testId.`);
  return `test:${owner.testId}`;
}

function dependencyConfig(dependency, parentConfig) {
  return typeof dependency.config === 'function' ? dependency.config(parentConfig) : dependency.config;
}

export function createTestContextRuntime(options = {}) {
  const entries = new Map();
  const activeLeases = new Set();
  const events = [];
  let sequence = 0;
  let closed = false;

  const record = (event) => {
    const item = Object.freeze({ sequence: ++sequence, observedAt: new Date().toISOString(), pid: process.pid, ...event });
    events.push(item);
    options.onEvent?.(item);
    return item;
  };

  const validateGraph = (definition, stack = [], visited = new Set()) => {
    if (stack.includes(definition.key)) {
      const cycle = [...stack.slice(stack.indexOf(definition.key)), definition.key];
      throw testContextError('test_context_dependency_cycle', 'Context dependency graph contains a cycle.', { cycle });
    }
    if (visited.has(definition)) return;
    visited.add(definition);
    for (const dependency of definition.dependencies) {
      if (SCOPE_RANK[dependency.definition.scope] < SCOPE_RANK[definition.scope]) {
        throw testContextError('test_context_dependency_scope_invalid', `${definition.key} cannot depend on shorter-lived ${dependency.definition.key}.`, {
          context: definition.key,
          dependency: dependency.definition.key,
        });
      }
      validateGraph(dependency.definition, [...stack, definition.key], visited);
    }
  };

  const ensureEntry = async (definition, config, owner) => {
    if (closed) throw testContextError('test_context_runtime_closed', 'Test Context Runtime is closed.');
    validateGraph(definition);
    const dependencies = [];
    for (const dependency of definition.dependencies) {
      dependencies.push(await ensureEntry(dependency.definition, dependencyConfig(dependency, config), owner));
    }
    const normalizedConfig = canonicalContextConfiguration(config);
    const sourceIdentity = typeof definition.sourceIdentity === 'function'
      ? await definition.sourceIdentity({ config })
      : definition.sourceIdentity ?? 'source:unspecified';
    if (typeof sourceIdentity !== 'string' || !sourceIdentity) throw testContextError('test_context_source_identity_invalid', `${definition.key} returned an invalid source identity.`);
    const identity = digest([
      definition.key,
      contextConfigurationIdentity(config),
      sourceIdentity,
      ...dependencies.map((entry) => entry.identity),
    ]);
    const scope = scopeIdentity(definition, owner);
    const cacheKey = `${definition.key}:${scope}:${identity}`;
    let entry = entries.get(cacheKey);
    if (entry) {
      if (entry.creating) await entry.creating;
      record({ operation: 'cache-hit', context: definition.key, cacheKey, identity, scope });
      return entry;
    }
    entry = {
      cacheKey,
      definition,
      config: JSON.parse(normalizedConfig),
      identity,
      scope,
      dependencies,
      state: null,
      active: 0,
      waiters: [],
      dirty: false,
      dirtyReason: null,
      createdSequence: sequence + 1,
      creating: null,
      destroyed: false,
    };
    entries.set(cacheKey, entry);
    const startedAt = Date.now();
    entry.creating = (async () => {
      try {
        entry.state = await definition.create({
          config: entry.config,
          identity,
          dependencies: Object.freeze(Object.fromEntries(dependencies.map((item) => [item.definition.id, item.state]))),
          record,
        });
        record({ operation: 'create', context: definition.key, cacheKey, identity, scope, durationMs: Date.now() - startedAt });
      } catch (error) {
        entries.delete(cacheKey);
        record({ operation: 'create', context: definition.key, cacheKey, identity, scope, durationMs: Date.now() - startedAt, status: 'failed', error: error.message });
        throw error;
      } finally {
        entry.creating = null;
      }
    })();
    await entry.creating;
    return entry;
  };

  const waitForEntry = async (entry) => {
    if (entry.definition.parallelSafety !== 'exclusive' || entry.active === 0) return 0;
    const startedAt = Date.now();
    await new Promise((resolve) => entry.waiters.push(resolve));
    return Date.now() - startedAt;
  };

  const activateEntry = async (entry) => {
    const waitMs = await waitForEntry(entry);
    entry.active += 1;
    if (waitMs > 0) record({ operation: 'wait', context: entry.definition.key, cacheKey: entry.cacheKey, identity: entry.identity, durationMs: waitMs });
  };

  const deactivateEntry = (entry) => {
    entry.active -= 1;
    if (entry.active < 0) throw testContextError('test_context_lease_invalid', `${entry.definition.key} active lease count became negative.`);
    if (entry.active === 0) entry.waiters.shift()?.();
  };

  const destroyEntry = async (entry, reason) => {
    if (entry.destroyed) return;
    if (entry.active !== 0) throw testContextError('test_context_destroy_active', `Cannot destroy active Context ${entry.definition.key}.`, { active: entry.active });
    const startedAt = Date.now();
    entry.destroyed = true;
    entries.delete(entry.cacheKey);
    try {
      await entry.definition.destroy?.({ state: entry.state, config: entry.config, identity: entry.identity, reason, record });
      record({ operation: 'destroy', context: entry.definition.key, cacheKey: entry.cacheKey, identity: entry.identity, durationMs: Date.now() - startedAt, reason });
    } catch (error) {
      record({ operation: 'destroy', context: entry.definition.key, cacheKey: entry.cacheKey, identity: entry.identity, durationMs: Date.now() - startedAt, reason, status: 'failed', error: error.message });
      throw error;
    }
  };

  const acquire = async (requests, owner = {}) => {
    const normalized = Object.entries(requests ?? {}).map(([alias, request]) => normalizeContextRequest(request, alias));
    if (normalized.length === 0) throw testContextError('test_context_request_invalid', 'At least one Context request is required.');
    if (new Set(normalized.map((item) => item.alias)).size !== normalized.length) throw testContextError('test_context_request_invalid', 'Context request aliases must be unique.');
    const requested = [];
    for (const request of normalized) requested.push({ request, entry: await ensureEntry(request.definition, request.config, owner) });
    const reachableEntries = new Map();
    const collectEntry = (entry) => {
      for (const dependency of entry.dependencies) collectEntry(dependency);
      reachableEntries.set(entry.cacheKey, entry);
    };
    for (const item of requested) collectEntry(item.entry);
    const lockEntries = [...reachableEntries.values()]
      .sort((left, right) => left.cacheKey.localeCompare(right.cacheKey));
    for (const entry of lockEntries) await activateEntry(entry);
    const acquired = [];
    const values = {};
    const startedAt = Date.now();
    try {
      for (const item of requested) {
        const value = item.entry.definition.acquire
          ? await item.entry.definition.acquire({
            state: item.entry.state,
            config: item.entry.config,
            identity: item.entry.identity,
            owner,
            record,
          })
          : item.entry.state;
        if (item.entry.definition.parallelSafety === 'isolated' && value === item.entry.state) {
          throw testContextError('test_context_isolation_invalid', `${item.entry.definition.key} must acquire an isolated value.`);
        }
        acquired.push({ ...item, value, dirty: false, dirtyReason: null });
        values[item.request.alias] = value;
      }
    } catch (error) {
      for (const entry of lockEntries.reverse()) deactivateEntry(entry);
      throw error;
    }
    let released = false;
    const lease = {
      values: Object.freeze(values),
      identities: Object.freeze(Object.fromEntries(requested.map((item) => [item.request.alias, item.entry.identity]))),
      markDirty(alias, reason = 'test-marked-dirty') {
        const item = acquired.find((candidate) => candidate.request.alias === alias);
        if (!item) throw testContextError('test_context_dirty_alias_unknown', `Unknown Context alias: ${alias}`);
        item.dirty = true;
        item.dirtyReason = reason;
      },
      async release(releaseOptions = {}) {
        if (released) return Object.freeze({ status: 'already-released' });
        released = true;
        activeLeases.delete(lease);
        const failures = [];
        for (const item of [...acquired].reverse()) {
          const hookContext = { state: item.entry.state, value: item.value, config: item.entry.config, identity: item.entry.identity, owner, outcome: releaseOptions.outcome ?? 'unknown', record };
          try { await item.entry.definition.release?.(hookContext); } catch (error) { failures.push(error); item.dirty = true; item.dirtyReason ??= 'release-failed'; }
          try {
            const inspection = inspectDisposition(await item.entry.definition.inspect?.(hookContext));
            if (inspection.dirty) {
              item.dirty = true;
              item.dirtyReason ??= inspection.reason;
              failures.push(testContextError('test_context_dirty_detected', `${item.entry.definition.key} inspect() detected unexpected drift.`, { reason: inspection.reason }));
            }
          } catch (error) {
            failures.push(error);
            item.dirty = true;
            item.dirtyReason ??= 'inspect-failed';
          }
          if (item.dirty) {
            item.entry.dirty = true;
            item.entry.dirtyReason ??= item.dirtyReason;
            record({ operation: 'dirty', context: item.entry.definition.key, cacheKey: item.entry.cacheKey, identity: item.entry.identity, reason: item.dirtyReason });
          }
        }
        for (const entry of [...lockEntries].reverse()) deactivateEntry(entry);
        for (const entry of [...lockEntries].reverse()) {
          if (entry.active !== 0) continue;
          if (!entry.dirty && entry.definition.reset) {
            const resetStartedAt = Date.now();
            try {
              await entry.definition.reset({ state: entry.state, config: entry.config, identity: entry.identity, owner, record });
              record({ operation: 'reset', context: entry.definition.key, cacheKey: entry.cacheKey, identity: entry.identity, durationMs: Date.now() - resetStartedAt });
            } catch (error) {
              failures.push(error);
              entry.dirty = true;
              entry.dirtyReason ??= 'reset-failed';
            }
          }
          if (entry.definition.scope === 'test' || entry.dirty) {
            try { await destroyEntry(entry, entry.dirty ? entry.dirtyReason : 'test-scope-complete'); } catch (error) { failures.push(error); }
          }
        }
        record({ operation: 'release', contexts: acquired.map((item) => item.entry.definition.key), durationMs: Date.now() - startedAt, status: failures.length ? 'failed' : 'released' });
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) throw new AggregateError(failures, 'Test Context release failed.');
        return Object.freeze({ status: 'released' });
      },
    };
    activeLeases.add(lease);
    record({ operation: 'acquire', contexts: acquired.map((item) => item.entry.definition.key), durationMs: Date.now() - startedAt, owner });
    return Object.freeze(lease);
  };

  const closeSuite = async (suiteId) => {
    const selected = [...entries.values()].filter((entry) => entry.definition.scope === 'suite' && entry.scope === `suite:${suiteId}`)
      .sort((left, right) => right.createdSequence - left.createdSequence);
    for (const entry of selected) await destroyEntry(entry, 'suite-close');
    return Object.freeze({ status: 'closed', suiteId, destroyed: selected.length });
  };

  const close = async () => {
    if (closed) return Object.freeze({ status: 'already-closed', events: Object.freeze([...events]) });
    const failures = [];
    for (const lease of [...activeLeases]) {
      try { await lease.release({ outcome: 'runtime-close' }); } catch (error) { failures.push(error); }
    }
    const selected = [...entries.values()].sort((left, right) => right.createdSequence - left.createdSequence);
    for (const entry of selected) {
      if (entry.destroyed) continue;
      try { await destroyEntry(entry, 'runtime-close'); } catch (error) { failures.push(error); }
    }
    closed = true;
    record({ operation: 'runtime-close', status: failures.length ? 'failed' : 'closed', destroyed: selected.length });
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Test Context Runtime close failed.');
    return Object.freeze({ status: 'closed', events: Object.freeze([...events]) });
  };

  return Object.freeze({
    acquire,
    closeSuite,
    close,
    record: (event) => record(event),
    events: () => Object.freeze([...events]),
    snapshot: () => Object.freeze({ closed, entries: entries.size, activeLeases: activeLeases.size, events: events.length }),
  });
}
