import { registerApplicationCliUpdate } from './application/cli-update.ts';
import { registerProductInstallationStatus } from './application/product-installation-status.ts';
import { createInstallationCliContributions } from './interfaces/cli/installation.ts';
import { createLauncherCliContributions, registerLauncherInterface } from './interfaces/cli/launcher.ts';
import { createReleaseAwarenessHttpContribution } from './interfaces/http/release-awareness-http.ts';
import { readCurrentProductIdentity } from './infrastructure/current-product-identity.ts';
import { assertCurrentNpmLauncherBinding, refreshInstalledNpmLauncher } from './infrastructure/npm-launcher.ts';
import { validateNpmLauncherBinding } from './infrastructure/launcher-binding.ts';

export * from './application/npm-installation-enrollment.ts';
export * from './application/release-awareness.ts';
export * from './interfaces/cli/installation.ts';
export * from './interfaces/cli/launcher.ts';
export * from './infrastructure/current-product-identity.ts';
export * from './infrastructure/installation-origin.ts';
export * from './infrastructure/installation-registry.ts';
export * from './infrastructure/launcher-binding.ts';
export * from './infrastructure/npm-launcher.ts';
export * from './contracts/web-profile.ts';

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
  'manageBuildrWebLauncher',
]);

function methodPort(runtime: any, methods: any) {
  return Object.freeze(Object.fromEntries(methods.map((method: any) => [method, (...args: any[]) => runtime[method](...args)])));
}

export function createSystemInstallationModule(runtime: any) {
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
          http: Object.freeze([createReleaseAwarenessHttpContribution(application)]),
          diagnostics: Object.freeze([Object.freeze({ id: 'system-installation.diagnostics', readModel: application })]),
        },
      });
    },
  });
}
