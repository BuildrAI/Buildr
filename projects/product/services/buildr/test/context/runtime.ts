import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Buildr-specific immutable filesystem seed adapter. The reusable Context
// definition/cache/Host authority lives in src/infrastructure/testing/context-runtime/.

export const TEST_CONTEXT_MARKER_SCHEMA: any = 'buildr.test-context/v1';
export const TEST_CONTEXT_PROJECTION_SCHEMA: any = 'buildr.test-context-projection/v1';
export const TEST_CONTEXTS_ENV: any = 'BUILDR_TEST_CONTEXTS';

const MARKER_FILE: any = 'context.json';

function contextError(code: any, message: any, details: any = {}): any  {
  const error: Error & Record<string, any> = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  return error;
}

export function isContainedPath(parent: any, child: any): any  {
  const relative: any = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function digestContextTree(root: any): any  {
  const resolvedRoot: any = path.resolve(root);
  const hash: any = crypto.createHash('sha256');
  const visit: any = (target: any) => {
    const stat: any = fs.lstatSync(target);
    const relative: any = path.relative(resolvedRoot, target).split(path.sep).join('/');
    if (stat.isSymbolicLink()) {
      hash.update(`symlink:${relative}:${fs.readlinkSync(target)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      hash.update(`directory:${relative}\0`);
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry));
      return;
    }
    if (stat.isFile()) {
      hash.update(`file:${relative}:${stat.mode & 0o777}\0`);
      hash.update(fs.readFileSync(target));
      hash.update('\0');
    }
  };
  visit(resolvedRoot);
  return `sha256-${hash.digest('hex')}`;
}

function normalizeProvider(provider: any): any  {
  if (!provider || typeof provider !== 'object') throw contextError('test_context_provider_invalid', 'Context provider must be an object.');
  if (!/^[a-z0-9][a-z0-9-]*\/v[1-9][0-9]*$/.test(provider.key ?? '')) {
    throw contextError('test_context_provider_invalid', 'Context provider key must use <id>/v<version>.', { key: provider?.key ?? null });
  }
  for (const hook of ['prepare', 'inspect']) {
    if (typeof provider[hook] !== 'function') throw contextError('test_context_provider_invalid', `Context provider ${provider.key} is missing ${hook}().`);
  }
  if (!['transaction', 'sandbox', 'full-lifecycle'].includes(provider.isolationMode)) {
    throw contextError('test_context_provider_invalid', `Context provider ${provider.key} has an invalid isolation mode.`, { isolationMode: provider.isolationMode });
  }
  if (!['rollback', 'snapshot', 'recreate'].includes(provider.resetStrategy)) {
    throw contextError('test_context_provider_invalid', `Context provider ${provider.key} has an invalid reset strategy.`, { resetStrategy: provider.resetStrategy });
  }
  if (!['worker-safe', 'bounded', 'exclusive'].includes(provider.parallelSafety)) {
    throw contextError('test_context_provider_invalid', `Context provider ${provider.key} has invalid parallel safety.`, { parallelSafety: provider.parallelSafety });
  }
  return provider;
}

function readProjection(env: any): any  {
  const raw: any = env?.[TEST_CONTEXTS_ENV];
  if (!raw) return { contexts: new Map(), eventsFile: null };
  let projection: any;
  try {
    projection = JSON.parse(raw);
  } catch (error: any) {
    throw contextError('test_context_projection_invalid', 'Inherited Test Context projection is not valid JSON.', { cause: error.message });
  }
  if (projection?.schemaVersion !== TEST_CONTEXT_PROJECTION_SCHEMA || !projection.contexts || typeof projection.contexts !== 'object' || Array.isArray(projection.contexts)) {
    throw contextError('test_context_projection_invalid', 'Inherited Test Context projection does not match the supported contract.');
  }
  const contexts: any = new Map();
  for (const [key, value] of Object.entries(projection.contexts)) {
    if (!value || typeof value.root !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value.identity ?? '')) {
      throw contextError('test_context_projection_invalid', 'Inherited Test Context entry is incomplete.', { key });
    }
    contexts.set(key, Object.freeze({ root: path.resolve(value.root), identity: value.identity }));
  }
  if (projection.eventsFile != null && typeof projection.eventsFile !== 'string') {
    throw contextError('test_context_projection_invalid', 'Inherited Test Context event sink is invalid.');
  }
  return { contexts, eventsFile: projection.eventsFile ? path.resolve(projection.eventsFile) : null };
}

function readMarker(contextRoot: any): any  {
  const markerPath: any = path.join(contextRoot, MARKER_FILE);
  let marker: any;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (error: any) {
    throw contextError('test_context_marker_invalid', 'Test Context marker is missing or invalid.', { contextRoot, cause: error.message });
  }
  if (marker?.schemaVersion !== TEST_CONTEXT_MARKER_SCHEMA
    || typeof marker.provider !== 'string'
    || marker.seed !== 'seed'
    || !/^sha256-[a-f0-9]{64}$/.test(marker.identity ?? '')
    || !Number.isFinite(marker.prepareDurationMs)) {
    throw contextError('test_context_marker_invalid', 'Test Context marker is incomplete.', { contextRoot, marker });
  }
  return marker;
}

export function inspectTestContext(contextRoot: any, provider: any): any  {
  const normalizedProvider: any = normalizeProvider(provider);
  let resolvedContextRoot: any;
  try {
    resolvedContextRoot = fs.realpathSync(contextRoot);
  } catch (error: any) {
    throw contextError('test_context_root_invalid', 'Test Context root is missing or unavailable.', { contextRoot: path.resolve(contextRoot), cause: error.message });
  }
  const marker: any = readMarker(resolvedContextRoot);
  if (marker.provider !== normalizedProvider.key) {
    throw contextError('test_context_provider_mismatch', 'Test Context marker belongs to another provider.', { expected: normalizedProvider.key, actual: marker.provider });
  }
  const seedRoot: any = path.resolve(resolvedContextRoot, marker.seed);
  if (!isContainedPath(resolvedContextRoot, seedRoot) || !fs.statSync(seedRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw contextError('test_context_seed_invalid', 'Test Context seed is missing or outside its Context root.', { contextRoot: resolvedContextRoot, seedRoot });
  }
  if (fs.lstatSync(seedRoot).isSymbolicLink() || fs.realpathSync(seedRoot) !== seedRoot) {
    throw contextError('test_context_seed_invalid', 'Test Context seed root must not be a symbolic-link alias.', { seedRoot });
  }
  normalizedProvider.inspect({ contextRoot: resolvedContextRoot, seedRoot, marker });
  const actualIdentity: any = digestContextTree(seedRoot);
  if (actualIdentity !== marker.identity) {
    throw contextError('test_context_seed_dirty', 'Test Context seed changed after preparation.', { provider: normalizedProvider.key, expectedIdentity: marker.identity, actualIdentity });
  }
  return Object.freeze({ contextRoot: resolvedContextRoot, seedRoot, marker });
}

function slug(value: any): any  {
  return value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'context';
}

export function createTestContextPool(options: any = {}): any  {
  const providers: any = new Map((options.providers ?? []).map((provider: any) => {
    const normalized: any = normalizeProvider(provider);
    return [normalized.key, normalized];
  }));
  if (providers.size !== (options.providers ?? []).length) throw contextError('test_context_provider_duplicate', 'Test Context provider keys must be unique.');
  const inheritedProjection: any = readProjection(options.env ?? process.env);
  const inherited: any = new Map([...inheritedProjection.contexts, ...Object.entries(options.inheritedContexts ?? {}).map(([key, root]: any) => [key, { root: path.resolve(root), identity: null }])]);
  const contexts: any = new Map();
  const activeLeases: any = new Set();
  const events: any[] = [];
  const temporaryRoot: any = path.resolve(options.temporaryRoot ?? os.tmpdir());
  let poolRoot: any = options.root ? path.resolve(options.root) : null;
  let eventsFile: any = options.eventsFile ? path.resolve(options.eventsFile) : inheritedProjection.eventsFile;
  let cleaned: any = false;

  const recordEvent: any = (event: any) => {
    const normalized: any = Object.freeze({ ...event, observedAt: new Date().toISOString(), pid: process.pid });
    events.push(normalized);
    if (eventsFile) fs.appendFileSync(eventsFile, `${JSON.stringify(normalized)}\n`);
    return normalized;
  };

  const eventSnapshot: any = () => {
    if (!eventsFile || !fs.statSync(eventsFile, { throwIfNoEntry: false })?.isFile()) return Object.freeze([...events]);
    return Object.freeze(fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map((line: any) => JSON.parse(line)));
  };

  const providerFor: any = (key: any) => {
    const provider: any = providers.get(key);
    if (!provider) throw contextError('test_context_provider_unknown', `Unknown Test Context provider: ${key}`, { key });
    return provider;
  };

  const ensurePoolRoot: any = () => {
    if (!poolRoot) poolRoot = fs.mkdtempSync(path.join(temporaryRoot, 'buildr-test-context-pool-'));
    else fs.mkdirSync(poolRoot, { recursive: true });
    if (fs.lstatSync(poolRoot).isSymbolicLink()) throw contextError('test_context_pool_root_invalid', 'Test Context Pool root must not be a symbolic-link alias.', { poolRoot });
    poolRoot = fs.realpathSync(poolRoot);
    eventsFile ??= path.join(poolRoot, 'events.ndjson');
    return poolRoot;
  };

  const prepare: any = (key: any) => {
    if (cleaned) throw contextError('test_context_pool_cleaned', 'Test Context Pool has already been cleaned.');
    if (contexts.has(key)) return contexts.get(key);
    const provider: any = providerFor(key);
    const inheritedEntry: any = inherited.get(key);
    if (inheritedEntry) {
      const inspected: any = inspectTestContext(inheritedEntry.root, provider);
      if (inheritedEntry.identity && inheritedEntry.identity !== inspected.marker.identity) {
        throw contextError('test_context_projection_identity_mismatch', 'Inherited Test Context identity does not match its marker.', { key, expected: inheritedEntry.identity, actual: inspected.marker.identity });
      }
      const entry: any = Object.freeze({ ...inspected, provider, owned: false, prepareDurationMs: 0 });
      contexts.set(key, entry);
      recordEvent({ operation: 'reuse', provider: key, durationMs: 0, identity: inspected.marker.identity });
      return entry;
    }
    const root: any = ensurePoolRoot();
    const contextRoot: any = path.join(root, slug(key));
    const seedRoot: any = path.join(contextRoot, 'seed');
    if (fs.existsSync(contextRoot)) throw contextError('test_context_root_conflict', 'Test Context root already exists before preparation.', { key, contextRoot });
    fs.mkdirSync(seedRoot, { recursive: true });
    const startedAt: any = Date.now();
    try {
      const providerData: any = provider.prepare({ contextRoot, seedRoot }) ?? {};
      const marker: any = {
        schemaVersion: TEST_CONTEXT_MARKER_SCHEMA,
        provider: key,
        seed: 'seed',
        identity: digestContextTree(seedRoot),
        prepareDurationMs: Date.now() - startedAt,
        isolationMode: provider.isolationMode,
        resetStrategy: provider.resetStrategy,
        parallelSafety: provider.parallelSafety,
        footprints: [...(provider.footprints ?? [])],
        providerData,
      };
      fs.writeFileSync(path.join(contextRoot, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`);
      const inspected: any = inspectTestContext(contextRoot, provider);
      const entry: any = Object.freeze({ ...inspected, provider, owned: true, prepareDurationMs: marker.prepareDurationMs });
      contexts.set(key, entry);
      recordEvent({ operation: 'prepare', provider: key, durationMs: marker.prepareDurationMs, identity: marker.identity });
      return entry;
    } catch (error: any) {
      fs.rmSync(contextRoot, { recursive: true, force: true });
      throw error;
    }
  };

  const acquire: any = (key: any, acquireOptions: any = {}) => {
    const context: any = prepare(key);
    inspectTestContext(context.contextRoot, context.provider);
    const safeName: any = slug(acquireOptions.name ?? key);
    const sandboxBase: any = fs.realpathSync(fs.mkdtempSync(path.join(temporaryRoot, `buildr-${safeName}-`)));
    const sandboxRoot: any = path.join(sandboxBase, 'sandbox');
    const startedAt: any = Date.now();
    try {
      if (typeof context.provider.materialize === 'function') context.provider.materialize({ context, sandboxBase, sandboxRoot });
      else fs.cpSync(context.seedRoot, sandboxRoot, { recursive: true });
      if (!fs.statSync(sandboxRoot, { throwIfNoEntry: false })?.isDirectory()) throw contextError('test_context_sandbox_invalid', 'Context provider did not materialize a sandbox directory.', { key, sandboxRoot });
      const realSandbox: any = fs.realpathSync(sandboxRoot);
      if (!isContainedPath(sandboxBase, realSandbox) || realSandbox !== path.resolve(sandboxRoot) || realSandbox === context.seedRoot) {
        throw contextError('test_context_sandbox_alias', 'Test Context sandbox aliases or escapes its owned boundary.', { key, sandboxRoot, seedRoot: context.seedRoot });
      }
      const materializeDurationMs: any = Date.now() - startedAt;
      let released: any = false;
      const lease: any = {
        provider: key,
        root: realSandbox,
        base: sandboxBase,
        context: Object.freeze({ root: context.contextRoot, identity: context.marker.identity, marker: context.marker }),
        timing: Object.freeze({ materializeDurationMs }),
        release(): any  {
          if (released) return Object.freeze({ status: 'already-released', provider: key, cleanupDurationMs: 0 });
          released = true;
          activeLeases.delete(lease);
          const releaseStartedAt: any = Date.now();
          let failure: any = null;
          try {
            inspectTestContext(context.contextRoot, context.provider);
            context.provider.release?.({ context, sandboxBase, sandboxRoot: realSandbox });
          } catch (error: any) {
            failure = error;
          }
          try {
            fs.rmSync(sandboxBase, { recursive: true, force: false });
          } catch (error: any) {
            failure ??= contextError('test_context_cleanup_failed', 'Test Context sandbox cleanup failed.', { key, sandboxBase, cause: error.message });
          }
          const cleanupDurationMs: any = Date.now() - releaseStartedAt;
          recordEvent({ operation: 'release', provider: key, durationMs: cleanupDurationMs, identity: context.marker.identity, status: failure ? 'failed' : 'released' });
          if (failure) throw failure;
          return Object.freeze({ status: 'released', provider: key, cleanupDurationMs });
        },
      };
      activeLeases.add(lease);
      recordEvent({ operation: 'materialize', provider: key, durationMs: materializeDurationMs, identity: context.marker.identity });
      return Object.freeze(lease);
    } catch (error: any) {
      fs.rmSync(sandboxBase, { recursive: true, force: true });
      throw error;
    }
  };

  const environment: any = () => {
    const projected: any = Object.fromEntries([...contexts.entries()].map(([key, context]: any) => [key, { root: context.contextRoot, identity: context.marker.identity }]));
    if (Object.keys(projected).length === 0) return {};
    return { [TEST_CONTEXTS_ENV]: JSON.stringify({ schemaVersion: TEST_CONTEXT_PROJECTION_SCHEMA, contexts: projected, ...(eventsFile ? { eventsFile } : {}) }) };
  };

  const cleanup: any = () => {
    if (cleaned) return Object.freeze({ status: 'already-cleaned', events: eventSnapshot() });
    let failure: any = null;
    for (const lease of [...activeLeases]) {
      try { lease.release(); } catch (error: any) { failure ??= error; }
    }
    for (const context of contexts.values()) {
      if (!context.owned) continue;
      try {
        inspectTestContext(context.contextRoot, context.provider);
        context.provider.cleanup?.({ context });
      } catch (error: any) {
        failure ??= error;
      }
    }
    recordEvent({ operation: 'cleanup', provider: null, durationMs: 0, status: failure ? 'failed' : 'cleaned', ownedContexts: [...contexts.values()].filter((context: any) => context.owned).length });
    const snapshot: any = eventSnapshot();
    if (poolRoot && fs.existsSync(poolRoot)) {
      try { fs.rmSync(poolRoot, { recursive: true, force: false }); } catch (error: any) {
        failure ??= contextError('test_context_cleanup_failed', 'Test Context Pool cleanup failed.', { poolRoot, cause: error.message });
      }
    }
    cleaned = true;
    if (failure) throw failure;
    return Object.freeze({ status: 'cleaned', events: snapshot });
  };

  return Object.freeze({ prepare, prepareAll: (keys: any) => [...new Set(keys)].map(prepare), acquire, environment, cleanup, events: eventSnapshot });
}
