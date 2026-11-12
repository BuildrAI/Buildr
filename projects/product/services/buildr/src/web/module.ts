import { SYSTEM_INSTALLATION_APPLICATION } from '../modules/installation/module.ts';
import { registerWebInstanceLifecycle } from './application/instance-lifecycle.ts';
import { createWebCliContributions } from './interfaces/cli/web.ts';
import { createLocalWorkspaceServer } from './http/server.ts';
import { WORKSPACE_APPLICATION } from '../modules/workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../modules/task/module.ts';
import {
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
  type NpmWebUpdateInput,
} from '../modules/installation/module.ts';
import { handoffUpdatedBuildrWeb } from './application/update-web-handoff.ts';
import type { WebInstanceLifecycleRuntime, WebLifecycleOptions } from './application/instance-lifecycle.ts';
import { readBuildrWebInstance } from './infrastructure/instance-runtime.ts';

export { readBuildrWebInstance as readLocalBuildrWebInstance };

export const WEB_MODULE_ID = 'web-instance-lifecycle';
export const WEB_INSTANCE_LIFECYCLE = 'web.instance-lifecycle';

export function readCurrentBuildrWebOrigin(profile: { dataRoot: string }): string | null {
  return readBuildrWebInstance(profile)?.url ?? null;
}

type WebModuleDependency = {
  webUpdateResume?():void;
  refreshPreparedWorkspaces?():Promise<void>;
  ensureRegisteredTarget?(root: string | null): string | null;
  resolveRegisteredWorkspace?: WebLifecycleOptions['resolveRegisteredWorkspace'];
  readCurrentProductIdentity?(): ReturnType<WebLifecycleOptions['readProductIdentity']>;
  assertCurrentNpmLauncherBinding?: WebLifecycleOptions['assertNpmLauncherBinding'];
  readNpmUpdateHandoffInstallation?(input: NpmWebUpdateInput): any;
  assertNpmUpdateHandoffTarget?(instance: any, options?: any): unknown;
  assertCanonicalTaskWorkspace?(root: string): string;
  inspectGitWorktrees?: WebInstanceLifecycleRuntime['inspectGitWorktrees'];
  readGitWorktreeEvidence?: WebInstanceLifecycleRuntime['readGitWorktreeEvidence'];
};
type WebModuleRequires = Record<string, WebModuleDependency>;

export function resumeDevelopmentWorkspaceRefresh(product: {channel?:string}, serverOptions: {previewIdentity?:unknown;webProfile?:{profile?:string;overridden?:boolean}}, refresh?:()=>Promise<void>) {
  if (serverOptions.previewIdentity || product.channel !== 'development' || serverOptions.webProfile?.profile !== 'development' || serverOptions.webProfile.overridden || !refresh) return;
  setImmediate(() => { void refresh().catch((error:Error) => console.warn('工作空间后台刷新未完成：', error.message)); });
}

export function createWebModule(runtime: WebInstanceLifecycleRuntime, options: { httpContributions?: unknown[]; closeResources?: () => Promise<void>; onReady?:()=>void | Promise<void>; agentRuntimeStatus?: () => Promise<unknown> } = {}) {
  const httpContributions = options.httpContributions || [];
  return Object.freeze({
    id: WEB_MODULE_ID,
    requires: Object.freeze([WORKSPACE_APPLICATION, TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER, SYSTEM_INSTALLATION_IDENTITY, SYSTEM_INSTALLATION_LAUNCHER, SYSTEM_INSTALLATION_APPLICATION]),
    create(requires: WebModuleRequires) {
      const resumeUpdate=requires[SYSTEM_INSTALLATION_APPLICATION]?.webUpdateResume;
      if(typeof resumeUpdate!=='function')throw new Error('Web update continuation port is missing.');
      const identity = requires[SYSTEM_INSTALLATION_IDENTITY];
      const launcher = requires[SYSTEM_INSTALLATION_LAUNCHER];
      const workspace = requires[WORKSPACE_APPLICATION];
      const taskQuery = requires[TASK_QUERY_APPLICATION];
      const worktreeProvider = requires[TASK_WORKTREE_PROVIDER];
      if (!identity?.readCurrentProductIdentity || !launcher?.assertCurrentNpmLauncherBinding || !workspace?.ensureRegisteredTarget || !workspace?.resolveRegisteredWorkspace
        || !identity.readNpmUpdateHandoffInstallation || !identity.assertNpmUpdateHandoffTarget
        || typeof taskQuery?.assertCanonicalTaskWorkspace !== 'function'
        || typeof worktreeProvider?.inspectGitWorktrees !== 'function' || typeof worktreeProvider?.readGitWorktreeEvidence !== 'function') {
        throw new Error('Web module dependencies are incomplete.');
      }
      const composition = Object.assign(Object.create(runtime), {
        assertCanonicalTaskWorkspace: taskQuery.assertCanonicalTaskWorkspace,
        inspectGitWorktrees: worktreeProvider.inspectGitWorktrees,
        readGitWorktreeEvidence: worktreeProvider.readGitWorktreeEvidence,
      }) as WebInstanceLifecycleRuntime;
      registerWebInstanceLifecycle(composition, {
        httpContributions,
        closeResources: options.closeResources,
        createLocalWorkspaceServer: (webRuntime, serverOptions) => {
          let previewWarmup: NodeJS.Timeout | undefined;
          return Reflect.apply(createLocalWorkspaceServer, undefined, [webRuntime, { ...serverOptions, agentRuntimeStatus: options.agentRuntimeStatus, beforeShutdown: () => {
            if (previewWarmup) { clearTimeout(previewWarmup); previewWarmup = undefined; }
          }, onReady: async () => {
          if (!serverOptions.previewIdentity) {
            await options.onReady?.(); resumeUpdate();
            resumeDevelopmentWorkspaceRefresh(identity.readCurrentProductIdentity!(), serverOptions, workspace.refreshPreparedWorkspaces);
          } else {
            // A preview must publish its authenticated health endpoint before
            // the pinned runtime warms up. Runtime-unit preparation can be
            // CPU-bound; doing it here would block the event loop and make a
            // healthy child look unreachable during start.
            previewWarmup = setTimeout(() => { previewWarmup = undefined; void Promise.resolve(options.onReady?.()).catch(error => console.warn('预览执行后台预热未完成，工作记录已保留。', error)); }, 250);
            previewWarmup.unref?.();
          }
        } }]);
        },
        ensureRegisteredTarget: workspace.ensureRegisteredTarget,
        resolveRegisteredWorkspace: workspace.resolveRegisteredWorkspace,
        readProductIdentity: identity.readCurrentProductIdentity,
        assertNpmLauncherBinding: launcher.assertCurrentNpmLauncherBinding,
        assertNpmUpdateHandoffTarget: instance => identity.assertNpmUpdateHandoffTarget!(instance),
      });
      const application = Object.freeze({
        startBuildrWeb: composition.startBuildrWeb,
        manageBuildrWebPreview: composition.manageBuildrWebPreview,
        handoffUpdatedBuildrWeb: (input: NpmWebUpdateInput) => handoffUpdatedBuildrWeb(input, {
          readNpmUpdateHandoffInstallation: identity.readNpmUpdateHandoffInstallation!,
          assertNpmUpdateHandoffTarget: identity.assertNpmUpdateHandoffTarget!,
          assertNpmLauncherBinding: launcher.assertCurrentNpmLauncherBinding,
        }),
      });
      return Object.freeze({
        provides: { [WEB_INSTANCE_LIFECYCLE]: application },
        contributions: {
          cli: createWebCliContributions(application),
          diagnostics: [Object.freeze({ id: 'web-instance-lifecycle.diagnostics', readModel: application })],
        },
      });
    },
  });
}
