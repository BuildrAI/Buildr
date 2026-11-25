import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OpenCode } from './handoff.ts';

export type Installation = { node: string; packageRoot: string; dataRoot: string; port: string };
export type Discovery = { installation: Installation } | { code: OpenCode };

export function supportsDevelopment(version: unknown): boolean {
  if (typeof version !== 'string') return false;
  const match = /^0\.1\.(\d+)(?:-rc\.([1-9]\d*))?$/.exec(version);
  if (!match) return false;
  const minor = Number(match[1]);
  const rc = match[2] === undefined ? null : Number(match[2]);
  if (minor === 0 && rc !== null) return rc >= 67;
  return true;
}

function sha256Prefixed(file: string): string {
  return `sha256-${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function isRegularRealFile(file: unknown): file is string {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  try {
    return fs.realpathSync(file) === file && fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function readPackageMetadata(packageRoot: string): { name?: unknown; version?: unknown; private?: unknown } | null {
  const manifest = path.join(packageRoot, 'package.json');
  if (!isRegularRealFile(manifest)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown; version?: unknown; private?: unknown };
  } catch {
    return null;
  }
}

function discoverFromLauncher(
  realHome: string,
  systemApplications: string,
  dataRoot: string,
): Discovery | null {
  const candidates = [
    path.join(realHome, 'Applications', 'Buildr Development.app'),
    path.join(systemApplications, 'Buildr Development.app'),
    path.join(realHome, 'Applications', 'Buildr Web.app'),
    path.join(systemApplications, 'Buildr Web.app'),
  ];
  for (const target of candidates) {
    if (!fs.lstatSync(target, { throwIfNoEntry: false })) continue;
    const marker = path.join(target, 'Contents', 'Resources', 'launcher-binding.json');
    if (!isRegularRealFile(marker)) return { code: 'development-installation-invalid' };
    try {
      const binding = JSON.parse(fs.readFileSync(marker, 'utf8')) as {
        schemaVersion?: unknown;
        channel?: unknown;
        platform?: unknown;
        target?: unknown;
        package?: unknown;
        hostNode?: { path?: unknown; sha256?: unknown };
        packageEntry?: { path?: unknown; sha256?: unknown };
        webPort?: { preferred?: unknown };
      };
      if (binding.schemaVersion !== 'buildr.npm-launcher-binding/v2'
          || binding.channel !== 'npm'
          || binding.platform !== 'darwin'
          || binding.package !== '@buildr-ai/buildr'
          || typeof binding.target !== 'string'
          || path.resolve(binding.target) !== target
          || !isRegularRealFile(binding.hostNode?.path)
          || !isRegularRealFile(binding.packageEntry?.path)
          || sha256Prefixed(binding.hostNode.path) !== binding.hostNode.sha256
          || sha256Prefixed(binding.packageEntry.path) !== binding.packageEntry.sha256) {
        return { code: 'development-installation-invalid' };
      }
      const packageRoot = path.dirname(path.dirname(binding.packageEntry.path));
      if (binding.packageEntry.path !== path.join(packageRoot, 'bin', 'buildr.mjs')) {
        return { code: 'development-installation-invalid' };
      }
      const metadata = readPackageMetadata(packageRoot);
      if (!metadata || metadata.name !== '@buildr-ai/buildr' || metadata.private === true) {
        return { code: 'development-installation-invalid' };
      }
      if (!supportsDevelopment(metadata.version)) return { code: 'development-incompatible' };
      const port = Number.isInteger(binding.webPort?.preferred) && (binding.webPort!.preferred as number) > 0
        ? String(binding.webPort!.preferred)
        : '4457';
      return {
        installation: {
          node: binding.hostNode.path,
          packageRoot,
          dataRoot,
          port,
        },
      };
    } catch {
      return { code: 'development-installation-invalid' };
    }
  }
  return null;
}

function discoverFromRegistry(dataRoot: string): Discovery {
  const file = path.join(dataRoot, 'product-installations.json');
  if (!fs.lstatSync(file, { throwIfNoEntry: false })) return { code: 'development-not-installed' };
  let parsed: { schemaVersion?: unknown; installations?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { schemaVersion?: unknown; installations?: unknown };
  } catch {
    return { code: 'development-installation-invalid' };
  }
  if (parsed?.schemaVersion !== 'buildr.product-installation-registry/v1' || !Array.isArray(parsed.installations)) {
    return { code: 'development-installation-invalid' };
  }
  let sawIncompatible = false;
  for (let i = parsed.installations.length - 1; i >= 0; i -= 1) {
    const record = parsed.installations[i] as {
      origin?: { package?: unknown; channel?: unknown };
      entryPath?: unknown;
      runtime?: { executable?: unknown };
    } | undefined;
    if (record?.origin?.package !== '@buildr-ai/buildr' || record.origin.channel !== 'npm') continue;
    const rawEntry = record.entryPath;
    const rawNode = record.runtime?.executable;
    if (typeof rawEntry !== 'string' || !path.isAbsolute(rawEntry) || typeof rawNode !== 'string' || !path.isAbsolute(rawNode)) continue;
    try {
      const entry = fs.realpathSync(rawEntry);
      const node = fs.realpathSync(rawNode);
      if (!fs.lstatSync(entry).isFile() || !fs.lstatSync(node).isFile()) continue;
      const packageRoot = path.dirname(path.dirname(entry));
      if (entry !== path.join(packageRoot, 'bin', 'buildr.mjs')) continue;
      const metadata = readPackageMetadata(packageRoot);
      if (!metadata || metadata.name !== '@buildr-ai/buildr' || metadata.private === true) continue;
      if (!supportsDevelopment(metadata.version)) {
        sawIncompatible = true;
        continue;
      }
      return {
        installation: {
          node,
          packageRoot,
          dataRoot,
          port: '4457',
        },
      };
    } catch { /* Try older registry entries cleanly if an older slot was uninstalled. */ }
  }
  return { code: sawIncompatible ? 'development-incompatible' : 'development-not-installed' };
}

/** Discover a verified released @buildr-ai/buildr installation (launcher binding first, then npm installation registry). */
export function discoverReleased(
  home = os.homedir(),
  platform = process.platform,
  systemApplications = '/Applications',
): Discovery {
  if (platform !== 'darwin') return { code: 'development-platform' };
  try {
    const realHome = fs.realpathSync(home);
    const dataRoot = path.join(realHome, 'Library', 'Application Support', 'Buildr');
    return discoverFromLauncher(realHome, systemApplications, dataRoot) ?? discoverFromRegistry(dataRoot);
  } catch {
    return { code: 'development-installation-invalid' };
  }
}
