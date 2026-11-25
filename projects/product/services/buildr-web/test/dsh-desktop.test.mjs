import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const notifies = [];
const configured = [];
globalThis.__buildrDshTest = { notifies, configured };

const stub = (source) => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/app/dsh-desktop.tsx')) {
      if (specifier === 'react') return stub('export const useCallback=f=>f,useEffect=()=>{},useMemo=f=>f(),useRef=v=>({current:v}),useState=v=>[typeof v==="function"?v():v,()=>{}];');
      if (specifier === 'react-router-dom') return stub('export const MemoryRouter=()=>null,useLocation=()=>({pathname:"/",state:null}),useNavigate=()=>()=>{};');
      if (specifier === 'antd') return stub('export const Alert=()=>null,Button=()=>null;');
      if (specifier.endsWith('/shell')) {
        return stub(`
          export function configureDesktopBridge(opts) { globalThis.__buildrDshTest.configured.push(opts); }
          export function desktopNotify(data) { globalThis.__buildrDshTest.notifies.push(data); }
          export function desktopPage(search) {
            const q = new URLSearchParams(search), kind = q.get('dsh');
            if (kind === 'chat') return { kind };
            const workspaceId = q.get('workspace');
            if ((kind === 'explorer' || kind === 'source-control') && workspaceId && workspaceId.length <= 1024) return { kind, workspaceId };
          }
        `);
      }
      if (specifier === '../api') return stub('export const api=async()=>({});');
      if (specifier.endsWith('/workspace-client')) return stub('export const createWorkspaceClient=()=>({readById:async()=>null});');
      if (specifier.endsWith('/CodeExplorerPage')) return stub('export const CodeExplorerPage=()=>null;');
      if (specifier.endsWith('/CodeSourceControlPage')) return stub('export const CodeSourceControlPage=()=>null;');
      if (specifier.endsWith('/WorkspaceReadCache')) return stub('export const WorkspaceReadCacheProvider=({children})=>children;');
      if (specifier.endsWith('/useWorkbenchPreferences')) return stub('export const WorkbenchPreferencesProvider=({children})=>children;');
      if (specifier.endsWith('/WorkspaceFileEditingProvider')) return stub('export const WorkspaceFileEditingProvider=({children})=>children;');
      if (specifier.endsWith('/WorkspaceSourceControlProvider')) return stub('export const WorkspaceSourceControlProvider=({children})=>children;');
      if (specifier.endsWith('/AppShellContext')) return stub('export const AppShellContext={Provider:({children})=>children};');
      if (specifier.endsWith('/pageTabs')) return stub('export const WorkspaceViewActiveContext={Provider:({children})=>children};');
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/app/dsh-desktop.tsx')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      };
    }
    return next(url, context);
  },
});

const storage = new Map();
const listeners = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.location = { hash: '#dsh=development', origin: 'http://127.0.0.1:4458', href: 'http://127.0.0.1:4458/#dsh=development' };
globalThis.window = {
  addEventListener: (name, fn) => {
    const list = listeners.get(name) || [];
    list.push(fn);
    listeners.set(name, list);
  },
};

const mod = await import('../src/app/dsh-desktop.tsx');

test('development DSH mode persists across SPA route hash clearing while remaining isolated from tool views', () => {
  assert.equal(mod.isDevelopmentDesktop(), true);
  assert.equal(mod.desktopToolPage(), undefined);
  assert.equal(configured.at(-1).channel, 'buildr-development-desktop/v1:');
  assert.equal(configured.at(-1).active, true);

  globalThis.location.hash = '';
  assert.equal(mod.initDevelopmentDesktopMode(), true);
  assert.equal(mod.isDevelopmentDesktop(), true);
});

test('desktopToolPage parses explorer and source-control hash routes and host events update native sidebar reveal forwarding', () => {
  globalThis.location.hash = '#dsh=explorer&workspace=ws-1';
  assert.deepEqual(mod.desktopToolPage(), { kind: 'explorer', workspaceId: 'ws-1' });
  globalThis.location.hash = '#dsh=source-control&workspace=ws-1';
  assert.deepEqual(mod.desktopToolPage(), { kind: 'source-control', workspaceId: 'ws-1' });

  globalThis.location.hash = '';
  assert.equal(mod.revealDesktopExplorerFile('ws-1', { path: 'src/a.ts', line: 12, checkout: { repositoryId: 'r', checkoutId: 'c' } }), false);
  for (const fn of listeners.get('buildr-dsh-host') || []) fn({ detail: { native: true } });
  assert.equal(mod.isDesktopNativeSidebar(), true);
  assert.equal(mod.revealDesktopExplorerFile('ws-1', { path: 'src/a.ts', line: 12, checkout: { repositoryId: 'r', checkoutId: 'c' } }), true);
  assert.deepEqual(notifies.at(-1), {
    kind: 'reveal',
    file: { workspaceId: 'ws-1', revision: 'observed', path: 'src/a.ts', line: 12, checkout: { repositoryId: 'r', checkoutId: 'c' } },
  });

  mod.reportDesktopWorkspace({ id: 'ws-1', path: '/tmp/repo', name: 'Buildr' });
  mod.reportDesktopWorkspace({ id: 'ws-1', path: '/tmp/repo', name: 'Buildr' });
  assert.deepEqual(notifies.filter((item) => item.kind === 'workspace'), [{ kind: 'workspace', scope: { id: 'ws-1', path: '/tmp/repo', name: 'Buildr' } }]);
});
