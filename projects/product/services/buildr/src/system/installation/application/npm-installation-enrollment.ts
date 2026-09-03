import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import {
  readCurrentInstallationOrigin,
  validateFormalInstallationOriginPayloadBinding,
} from '../infrastructure/installation-origin.ts';
import {
  createProductUpdateAuthority,
  enrollProductInstallation,
} from '../infrastructure/installation-registry.ts';
import {
  resolveApplicationPayloadRoot,
  readApplicationPayloadManifest,
  resolveProductRoot,
} from '../../../infrastructure/product-resources/index.ts';

function requiredAbsoluteFile(value: any, label: any) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} must be an explicit absolute path.`);
  const resolved = fs.realpathSync(value);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) throw new Error(`${label} is unavailable: ${value}.`);
  return resolved;
}

function requiredAbsoluteDirectory(value: any, label: any) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} must be an explicit absolute path.`);
  const resolved = fs.realpathSync(value);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${label} is unavailable: ${value}.`);
  return resolved;
}

function pathIsInside(candidate: any, root: any) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function skipped(reason: any) {
  return { action: 'skipped', reason };
}

export function enrollNpmInstallationFromLifecycle(options: any = {}) {
  const env = options.env || process.env;
  if (env.npm_lifecycle_event !== 'postinstall') throw new Error('npm update authority enrollment is restricted to the package postinstall lifecycle.');
  if (env.npm_config_global !== 'true') return skipped('npm lifecycle is not an explicit global installation');
  if (typeof process.getuid === 'function' && env.SUDO_UID && Number(env.SUDO_UID) !== process.getuid()) {
    return skipped('sudo changed the lifecycle user; Buildr will not enroll authority in another user registry');
  }
  const requiredEnvironment = ['npm_package_json', 'npm_config_prefix', 'npm_execpath', 'npm_node_execpath'];
  const missing = requiredEnvironment.filter((name: any) => !env[name]);
  if (missing.length) return skipped(`npm lifecycle did not provide ${missing.join(', ')}`);

  const payloadRoot = options.payloadRoot || resolveApplicationPayloadRoot();
  if (!payloadRoot) throw new Error('npm postinstall cannot resolve the installed application payload root.');
  const productRoot = fs.realpathSync(options.productRoot || resolveProductRoot());
  const origin = options.origin || readCurrentInstallationOrigin(productRoot, { payloadRoot });
  if (origin.channel !== 'npm') throw new Error(`npm postinstall resolved unexpected installation channel ${origin.channel}.`);
  if (options.origin) validateFormalInstallationOriginPayloadBinding(origin, readApplicationPayloadManifest(payloadRoot));
  if (!origin.receipt?.file) throw new Error('npm postinstall could not resolve its installation origin envelope.');
  const envelopePath = fs.realpathSync(origin.receipt.file);
  const packageRoot = fs.realpathSync(path.dirname(envelopePath));
  const packageJson = requiredAbsoluteFile(env.npm_package_json, 'npm lifecycle package.json');
  if (!sameFilesystemPath(packageJson, path.join(packageRoot, 'package.json'))) {
    throw new Error('npm lifecycle package.json does not match the installed Buildr envelope root.');
  }
  const metadata = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  if (metadata.name !== origin.package || metadata.version !== origin.version) {
    throw new Error('npm lifecycle package identity does not match the installed Buildr envelope.');
  }

  const prefix = requiredAbsoluteDirectory(env.npm_config_prefix, 'npm lifecycle global prefix');
  if (!pathIsInside(packageRoot, prefix)) throw new Error('Installed Buildr package root is outside the explicit npm global prefix.');
  const nodeExecutable = requiredAbsoluteFile(env.npm_node_execpath, 'npm lifecycle Host Node');
  const currentNode = requiredAbsoluteFile(options.runtimeExecutable || process.execPath, 'current Host Node');
  if (!sameFilesystemPath(nodeExecutable, currentNode)) {
    throw new Error('npm lifecycle Host Node does not match the Node executing Buildr postinstall.');
  }
  const npmCliPath = requiredAbsoluteFile(env.npm_execpath, 'npm lifecycle npm CLI');
  const entryPath = requiredAbsoluteFile(env.BUILDR_NPM_ENTRY_PATH, 'installed Buildr npm entry');
  if (!pathIsInside(entryPath, packageRoot)) throw new Error('Installed Buildr npm entry is outside the lifecycle package root.');

  return enrollProductInstallation({
    envelopePath,
    productRoot,
    entryPath,
    runtimeExecutable: currentNode,
    updateAuthority: createProductUpdateAuthority({ nodeExecutable, npmCliPath, prefix }),
  }, options.registry || {});
}
