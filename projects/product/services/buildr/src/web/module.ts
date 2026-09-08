import { registerWebInstanceLifecycle } from './application/instance-lifecycle.ts';
import { createWebCliContributions } from './interfaces/cli/web.ts';
import { createLocalWorkspaceServer } from './http/server.ts';
import { WORKSPACE_APPLICATION } from '../modules/workspace/module.ts';
import {
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
} from '../modules/installation/module.ts';
import type { WebInstanceLifecycleRuntime, WebLifecycleOptions } from './application/instance-lifecycle.ts';

export const WEB_MODULE_ID = 'web-instance-lifecycle';
export const WEB_INSTANCE_LIFECYCLE = 'web.instance-lifecycle';

type WebModuleDependency = {
  ensureRegisteredTarget?(root: string | null): string | null;
  resolveRegisteredWorkspace?: WebLifecycleOptions['resolveRegisteredWorkspace'];
  readCurrentProductIdentity?(): ReturnType<WebLifecycleOptions['readProductIdentity']>;
  assertCurrentNpmLauncherBinding?: WebLifecycleOptions['assertNpmLauncherBinding'];
};
type WebModuleRequires = Record<string, WebModuleDependency>;

export function createWebModule(runtime: WebInstanceLifecycleRuntime, options: { httpContributions?: unknown[] } = {}) {
  const httpContributions = options.httpContributions || [];
  return Object.freeze({
    id: WEB_MODULE_ID,
    requires: Object.freeze([WORKSPACE_APPLICATION, SYSTEM_INSTALLATION_IDENTITY, SYSTEM_INSTALLATION_LAUNCHER]),
    create(requires: WebModuleRequires) {
      const identity = requires[SYSTEM_INSTALLATION_IDENTITY];
      const launcher = requires[SYSTEM_INSTALLATION_LAUNCHER];
      const workspace = requires[WORKSPACE_APPLICATION];
      if (!identity?.readCurrentProductIdentity || !launcher?.assertCurrentNpmLauncherBinding || !workspace?.ensureRegisteredTarget || !workspace?.resolveRegisteredWorkspace) {
        throw new Error('Web module dependencies are incomplete.');
      }
      const composition = Object.create(runtime) as WebInstanceLifecycleRuntime;
      registerWebInstanceLifecycle(composition, {
        httpContributions,
        createLocalWorkspaceServer: (webRuntime, serverOptions) => Reflect.apply(createLocalWorkspaceServer, undefined, [webRuntime, serverOptions]),
        ensureRegisteredTarget: workspace.ensureRegisteredTarget,
        resolveRegisteredWorkspace: workspace.resolveRegisteredWorkspace,
        readProductIdentity: identity.readCurrentProductIdentity,
        assertNpmLauncherBinding: launcher.assertCurrentNpmLauncherBinding,
      });
      const application = Object.freeze({
        startBuildrWeb: composition.startBuildrWeb,
        manageBuildrWebPreview: composition.manageBuildrWebPreview,
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
