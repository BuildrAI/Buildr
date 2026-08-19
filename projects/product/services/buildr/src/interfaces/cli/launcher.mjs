import process from 'node:process';

import { findRegisteredProductInstallation } from '../../infrastructure/product-identity/installation-registry.mjs';
import {
  installNpmLauncher,
  npmLauncherStatus,
  repairNpmLauncher,
  uninstallNpmLauncher,
} from '../../infrastructure/product-launcher/index.mjs';
import { readApplicationPayloadManifest, resolveApplicationPayloadRoot } from '../../infrastructure/product-resources/index.mjs';
import { readCurrentInstallationOrigin } from '../../infrastructure/product-identity/installation-origin.mjs';

function currentNpmRegistration(runtime) {
  const productRoot = runtime.productRoot();
  const payloadRoot = resolveApplicationPayloadRoot({ required: true });
  const origin = readCurrentInstallationOrigin(productRoot, {
    payloadRoot,
    payloadManifest: readApplicationPayloadManifest(payloadRoot),
  });
  if (origin.channel !== 'npm') {
    const error = new Error(`Buildr Web Launcher management requires a verified npm installation; current channel is ${origin.channel}.`);
    error.code = 'launcher.npm_installation_required';
    throw error;
  }
  const registration = findRegisteredProductInstallation(origin, {
    productRoot,
    envelopePath: origin.receipt?.file,
    entryPath: process.env.BUILDR_NPM_ENTRY_PATH,
  });
  if (registration?.status !== 'installed') {
    const error = new Error(`The npm installation registry is ${registration?.status || 'absent'}: ${registration?.reason || 'run npm install again to enroll exact Host Node/npm prefix authority'}.`);
    error.code = 'launcher.npm_registration_required';
    throw error;
  }
  return registration;
}

function printLauncherResult(result) {
  const location = result.target || '-';
  if (result.status === 'ready') console.log(`npm Buildr Web Launcher ready: ${location}`);
  else if (result.status === 'absent') console.log(`npm Buildr Web Launcher absent: ${location}`);
  else console.log(`npm Buildr Web Launcher ${result.status}: ${result.diagnostic?.message || location}`);
  for (const action of result.nextActions || []) console.log(`next: ${action}`);
}

export function registerLauncherInterface(runtime) {
  function manageLocalAppLauncher(action, args) {
    const supportsPort = ['install', 'repair'].includes(action);
    runtime.assertNoUnknownOptions(args, new Set(['--target', '--platform', '--json', ...(supportsPort ? ['--port'] : [])]), new Set(['--json']));
    const rawPort = supportsPort ? runtime.optionValue(args, '--port', undefined) : undefined;
    const port = rawPort === undefined ? undefined : Number(rawPort);
    if (rawPort !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error(`Invalid npm Launcher port: ${rawPort}.`);
    const options = {
      target: runtime.optionValue(args, '--target', undefined),
      platform: runtime.optionValue(args, '--platform', process.platform),
      port,
    };
    let result;
    if (action === 'status') result = npmLauncherStatus(options);
    else {
      const registration = currentNpmRegistration(runtime);
      if (action === 'install') result = installNpmLauncher({ ...options, registration });
      else if (action === 'repair') result = repairNpmLauncher({ ...options, registration });
      else if (action === 'uninstall') result = uninstallNpmLauncher({ ...options, registration });
      else throw new Error(`Unsupported Launcher action: ${action}.`);
    }
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else printLauncherResult(result);
    if (['stale', 'invalid'].includes(result.status)) process.exitCode = 1;
    return result;
  }
  Object.assign(runtime, { manageLocalAppLauncher });
  return runtime;
}
