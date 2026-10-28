import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/pages/useWorkspaceCatalog.ts')) {
    const text = specifier === 'react'
      ? ['useCallback', 'useEffect', 'useRef', 'useState'].map(name => `export const ${name}=(...args)=>globalThis.__catalogHooks.${name}(...args);`).join('\n')
      : specifier === '../api/workspace-api' ? 'export const workspaceApi=new Proxy({},{get:(_,key)=>globalThis.__catalogWorkspaceApi?.[key]});'
      : specifier === '../api/workspace-preparation-api' ? 'export const workspacePreparationApi=new Proxy({},{get:(_,key)=>globalThis.__catalogPreparationApi?.[key]});'
      : null;
    if (text) return { url: 'data:text/javascript,' + encodeURIComponent(text), shortCircuit: true };
  }
  return next(specifier.startsWith('.') && context.parentURL?.includes('/pages/') && !/\.[a-z]+$/u.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

const readyEntry = { status: 'ready', readiness: 'ready', rootPath: '/ws', workspace: { id: 'ws-1', name: 'ws' } };
const registryOf = () => ({ revision: 1, workspaces: [readyEntry], lastOpenedWorkspaceId: 'ws-1' });

const { useWorkspaceCatalog } = await import('../src/features/workspace/pages/useWorkspaceCatalog.ts');

function view() {
  const slots = [], effects = []; let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  globalThis.__catalogHooks = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useMemo(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  const render = options => { cursor = 0; const value = useWorkspaceCatalog(options); effects.splice(0).forEach(fn => fn()); return value; };
  return { render, dispose() { slots.forEach(slot => slot?.cleanup?.()); delete globalThis.__catalogHooks; } };
}

function options(overrides = {}) {
  return {
    stayOnCatalog: false,
    onOpenWorkspace: () => {},
    onRecoveryPrompt: () => {},
    onPreparationStart: () => {},
    workspaceRegistryRevision: 0,
    onRegistryChanged: () => {},
    ...overrides,
  };
}

test('auto-open consumes its attempt: later registry refreshes cannot re-open or re-prepare', async () => {
  let lists = 0, opens = 0; const opened = [];
  globalThis.__catalogWorkspaceApi = { listRegistered: async () => { lists++; return registryOf(); } };
  globalThis.__catalogPreparationApi = {
    open: async id => { opens++; opened.push(id); return { ready: true, workspaceId: id }; },
  };
  const navigations = [];
  const h = view();
  try {
    const first = options({ workspaceRegistryRevision: 0, onOpenWorkspace: id => navigations.push(id) });
    h.render(first);
    await settle();
    assert.equal(opens, 1, 'first ready observation auto-opens once');
    assert.equal(navigations.length, 1);
    // A preparation settle bumps workspaceRegistryRevision; the effect re-runs
    // but must not call open() again — that was the preparing↔failed loop.
    h.render(options({ workspaceRegistryRevision: 1 }));
    await settle();
    h.render(options({ workspaceRegistryRevision: 2 }));
    await settle();
    assert.equal(opens, 1, 'registry refreshes never re-trigger auto-open');
    assert.ok(lists >= 3, 'registry still refreshes on each revision');
  } finally { h.dispose(); }
});

test('failed preparation result is surfaced once and not retried by refresh', async () => {
  let opens = 0;
  globalThis.__catalogWorkspaceApi = { listRegistered: async () => registryOf() };
  globalThis.__catalogPreparationApi = {
    open: async () => { opens++; return { id: 'prep-1', revision: 3, rootPath: '/ws', name: 'ws', workspaceId: 'ws-1', status: 'failed', error: 'blocked' }; },
  };
  const starts = [], navigations = [];
  const h = view();
  try {
    h.render(options({ workspaceRegistryRevision: 0, onPreparationStart: value => starts.push(value), onOpenWorkspace: id => navigations.push(id) }));
    await settle();
    assert.equal(opens, 1);
    assert.equal(starts.length, 1);
    assert.equal(starts[0].status, 'failed', 'failed preparation is handed to the dialog as-is');
    assert.equal(navigations.length, 0, 'failed open never navigates into the workspace');
    h.render(options({ workspaceRegistryRevision: 1 }));
    await settle();
    assert.equal(opens, 1, 'no implicit retry after the failure settles');
  } finally { h.dispose(); }
});

test('background readiness refreshes without overlap or auto-open and stops on completion or hiding', async t => {
  t.mock.timers.enable({apis:['setInterval']});
  const previousDocument=globalThis.document;
  const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});globalThis.document=doc;
  let lists=0,opens=0,release;
  const initial={...readyEntry,readiness:'preparing'};
  let current=initial;
  globalThis.__catalogWorkspaceApi={listRegistered:async()=>{lists++;if(release===undefined&&lists===2)await new Promise(resolve=>{release=resolve;});return {revision:1,workspaces:[current],lastOpenedWorkspaceId:null};}};
  globalThis.__catalogPreparationApi={open:async()=>{opens++;return {ready:true,workspaceId:'ws-1'};}};
  const h=view(),opts=options({stayOnCatalog:true});
  try {
    h.render(opts);await settle();h.render(opts);await settle();
    assert.equal(lists,2);t.mock.timers.tick(6000);await settle();assert.equal(lists,2,'in-flight polling is not duplicated');
    doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));
    release();await settle();t.mock.timers.tick(6000);await settle();assert.equal(lists,2);
    current=readyEntry;doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await settle();
    const latest=h.render(opts);assert.equal(latest.registry.workspaces[0].readiness,'ready');
    const done=lists;t.mock.timers.tick(6000);await settle();assert.equal(lists,done,'finished preparation stops polling');assert.equal(opens,0);
  } finally {h.dispose();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
