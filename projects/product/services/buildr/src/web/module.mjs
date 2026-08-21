import { registerWebInstanceLifecycle } from './application/instance-lifecycle.mjs';
import { createWebCliContributions } from './interfaces/cli/web.mjs';
import { createLocalWorkspaceServer, ensureRegisteredTarget } from '../interfaces/local-app/http/server.mjs';
import {
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
} from '../system/installation/module.mjs';

export const WEB_MODULE_ID = 'web-instance-lifecycle';
export const WEB_INSTANCE_LIFECYCLE = 'web.instance-lifecycle';

export function createWebModule(runtime, { httpContributions = [] } = {}) {
  return Object.freeze({
    id: WEB_MODULE_ID,
    requires: Object.freeze([SYSTEM_INSTALLATION_IDENTITY, SYSTEM_INSTALLATION_LAUNCHER]),
    create(requires) {
      const identity = requires[SYSTEM_INSTALLATION_IDENTITY];
      const launcher = requires[SYSTEM_INSTALLATION_LAUNCHER];
      registerWebInstanceLifecycle(runtime, {
        httpContributions,
        createLocalWorkspaceServer,
        ensureRegisteredTarget,
        readProductIdentity: identity.readCurrentProductIdentity,
        assertNpmLauncherBinding: launcher.assertCurrentNpmLauncherBinding,
      });
      const application = Object.freeze({
        startLocalWorkspaceApp: (...args) => runtime.startLocalWorkspaceApp(...args),
        manageLocalAppPreview: (...args) => runtime.manageLocalAppPreview(...args),
      });
      return Object.freeze({
        provides: { [WEB_INSTANCE_LIFECYCLE]: application },
        contributions: { cli: createWebCliContributions() },
      });
    },
  });
}
