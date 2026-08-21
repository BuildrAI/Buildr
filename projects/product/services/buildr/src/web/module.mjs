import { registerWebInstanceLifecycle } from './application/instance-lifecycle.mjs';
import { createWebCliContributions } from './interfaces/cli/web.mjs';
import { createLocalWorkspaceServer, ensureRegisteredTarget } from '../interfaces/local-app/http/server.mjs';

export const WEB_MODULE_ID = 'web-instance-lifecycle';
export const WEB_INSTANCE_LIFECYCLE = 'web.instance-lifecycle';

export function createWebModule(runtime, { httpContributions = [] } = {}) {
  return Object.freeze({
    id: WEB_MODULE_ID,
    requires: Object.freeze([]),
    create() {
      registerWebInstanceLifecycle(runtime, { httpContributions, createLocalWorkspaceServer, ensureRegisteredTarget });
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
