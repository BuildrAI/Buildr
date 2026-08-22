import { registerApplicationCliUpdate } from './application/cli-update.mjs';
import { registerProductInstallationStatus } from './application/product-installation-status.mjs';
import { createInstallationCliContributions } from './interfaces/cli/installation.mjs';
import { createLauncherCliContributions, registerLauncherInterface } from './interfaces/cli/launcher.mjs';
import { readCurrentProductIdentity } from './infrastructure/current-product-identity.mjs';
import { assertCurrentNpmLauncherBinding, refreshInstalledNpmLauncher } from './infrastructure/npm-launcher.mjs';
import { validateNpmLauncherBinding } from './infrastructure/launcher-binding.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';

export * from './application/npm-installation-enrollment.mjs';
export * from './application/release-awareness.mjs';
export * from './interfaces/cli/installation.mjs';
export * from './interfaces/cli/launcher.mjs';
export * from './infrastructure/current-product-identity.mjs';
export * from './infrastructure/installation-origin.mjs';
export * from './infrastructure/installation-registry.mjs';
export * from './infrastructure/launcher-binding.mjs';
export * from './infrastructure/npm-launcher.mjs';
export * from './contracts/web-profile.mjs';

export const SYSTEM_INSTALLATION_MODULE_ID = 'system-installation';
export const SYSTEM_INSTALLATION_IDENTITY = 'system.installation.identity';
export const SYSTEM_INSTALLATION_LAUNCHER = 'system.installation.launcher';
export const SYSTEM_INSTALLATION_APPLICATION = 'system.installation.application';

const APPLICATION_METHODS = Object.freeze([
  'releaseAwareness',
  'updateCheck',
  'updateBuildr',
  'buildInstallationInventory',
  'buildInstallationStatusInventory',
  'installationStatus',
  'manageLocalAppLauncher',
]);

function methodPort(runtime, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, (...args) => runtime[method](...args)])));
}

function releaseAwarenessHttpContribution(application) {
  return Object.freeze({
    id: 'system-installation.release-awareness.http',
    handleTopLevel: ({ request, pathname }) => {
      if (request.method !== 'GET' || pathname !== '/api/v1/release-awareness') return null;
      const awareness = application.releaseAwareness({ allowDevelopmentQuery: false, persistState: true, notify: true });
      return { status: 200, body: withJsonSchema(PUBLIC_JSON_SCHEMAS.releaseAwareness, awareness) };
    },
  });
}

export function createSystemInstallationModule(runtime) {
  return Object.freeze({
    id: SYSTEM_INSTALLATION_MODULE_ID,
    requires: Object.freeze([]),
    create() {
      registerApplicationCliUpdate(runtime);
      registerProductInstallationStatus(runtime);
      registerLauncherInterface(runtime);
      const application = methodPort(runtime, APPLICATION_METHODS);
      const identity = Object.freeze({ readCurrentProductIdentity });
      const launcher = Object.freeze({
        assertCurrentNpmLauncherBinding,
        refreshInstalledNpmLauncher,
        validateNpmLauncherBinding,
      });
      return Object.freeze({
        provides: {
          [SYSTEM_INSTALLATION_IDENTITY]: identity,
          [SYSTEM_INSTALLATION_LAUNCHER]: launcher,
          [SYSTEM_INSTALLATION_APPLICATION]: application,
        },
        contributions: {
          cli: Object.freeze([
            ...createInstallationCliContributions(),
            ...createLauncherCliContributions(),
          ]),
          http: Object.freeze([releaseAwarenessHttpContribution(application)]),
          diagnostics: Object.freeze([Object.freeze({ id: 'system-installation.diagnostics', readModel: application })]),
        },
      });
    },
  });
}
