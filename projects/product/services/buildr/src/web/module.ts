import { registerWebInstanceLifecycle } from './application/instance-lifecycle.ts';
import { createWebCliContributions } from './interfaces/cli/web.ts';
import { createLocalWorkspaceServer } from './http/server.mjs';
import { WORKSPACE_APPLICATION } from '../workspace/module.mjs';
import {
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
} from '../system/installation/module.mjs';
import type { WebInstanceLifecycleRuntime, WebLifecycleOptions } from './application/instance-lifecycle.ts';

export const WEB_MODULE_ID = 'web-instance-lifecycle';
export const WEB_INSTANCE_LIFECYCLE = 'web.instance-lifecycle';

type WebModuleDependency = {
  ensureRegisteredTarget?(root: string | null): string | null;
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
      if (!identity?.readCurrentProductIdentity || !launcher?.assertCurrentNpmLauncherBinding || !workspace?.ensureRegisteredTarget) {
        throw new Error('Web module dependencies are incomplete.');
      }
      registerWebInstanceLifecycle(runtime, {
        httpContributions,
        createLocalWorkspaceServer: (webRuntime, serverOptions) => Reflect.apply(createLocalWorkspaceServer, undefined, [webRuntime, serverOptions]),
        ensureRegisteredTarget: workspace.ensureRegisteredTarget,
        readProductIdentity: identity.readCurrentProductIdentity,
        assertNpmLauncherBinding: launcher.assertCurrentNpmLauncherBinding,
      });
      const application = Object.freeze({
        startBuildrWeb: runtime.startBuildrWeb,
        manageBuildrWebPreview: runtime.manageBuildrWebPreview,
      });
      return Object.freeze({
        provides: { [WEB_INSTANCE_LIFECYCLE]: application },
        contributions: {
          cli: createWebCliContributions(),
          diagnostics: [Object.freeze({ id: 'web-instance-lifecycle.diagnostics', readModel: application })],
        },
      });
    },
  });
}
