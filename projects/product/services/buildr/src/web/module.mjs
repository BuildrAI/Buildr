import { registerWebInstanceLifecycle } from './application/instance-lifecycle.mjs';
import { createWebCliContributions } from './interfaces/cli/web.mjs';
import { createLocalWorkspaceServer } from './http/server.mjs';
import { WORKSPACE_APPLICATION } from '../workspace/module.mjs';
import {
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
} from '../system/installation/module.mjs';

export const WEB_MODULE_ID = 'web-instance-lifecycle';
export const WEB_INSTANCE_LIFECYCLE = 'web.instance-lifecycle';

export function createWebModule(runtime, { httpContributions = [] } = {}) {
  return Object.freeze({
    id: WEB_MODULE_ID,
    requires: Object.freeze([WORKSPACE_APPLICATION, SYSTEM_INSTALLATION_IDENTITY, SYSTEM_INSTALLATION_LAUNCHER]),
    create(requires) {
      const identity = requires[SYSTEM_INSTALLATION_IDENTITY];
      const launcher = requires[SYSTEM_INSTALLATION_LAUNCHER];
      const workspace = requires[WORKSPACE_APPLICATION];
      registerWebInstanceLifecycle(runtime, {
        httpContributions,
        createLocalWorkspaceServer,
        ensureRegisteredTarget: workspace.ensureRegisteredTarget,
        readProductIdentity: identity.readCurrentProductIdentity,
        assertNpmLauncherBinding: launcher.assertCurrentNpmLauncherBinding,
      });
      const application = Object.freeze({
        startBuildrWeb: (...args) => runtime.startBuildrWeb(...args),
        manageBuildrWebPreview: (...args) => runtime.manageBuildrWebPreview(...args),
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
