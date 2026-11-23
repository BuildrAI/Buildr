import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { launcherFileHash, parseLauncherBinding } from '../../buildr-harness/src/launcher-binding.ts';
import type { OpenCode } from './handoff.ts';

export type Installation = { node: string; packageRoot: string; dataRoot: string; port: string };
export type Discovery = { installation: Installation } | { code: OpenCode };

export function supportsHarness(version: unknown): boolean {
  return typeof version === 'string' && /^0\.1\.(?:0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/.test(version);
}

/** Only the Harness-owned default macOS launcher is a release discovery source. */
export function discoverReleased(home = os.homedir(), platform = process.platform): Discovery {
  if (platform !== 'darwin') return { code: 'harness-platform' };
  try {
    const target = path.join(fs.realpathSync(home), 'Applications', 'Buildr Harness.app');
    const marker = path.join(target, 'Contents', 'Resources', 'harness-launcher.json');
    if (!fs.lstatSync(target, { throwIfNoEntry: false })) return { code: 'harness-not-installed' };
    if (fs.realpathSync(marker) !== marker || !fs.lstatSync(marker).isFile()) return { code: 'harness-installation-invalid' };
    const binding = parseLauncherBinding(fs.readFileSync(marker, 'utf8'), target);
    const packageRoot = path.dirname(path.dirname(binding.entry));
    if (binding.profile !== 'released' || (binding.platform ?? 'darwin') !== 'darwin' ||
        binding.entry !== path.join(packageRoot, 'bin', 'buildr-harness.mjs') ||
        fs.realpathSync(binding.entry) !== binding.entry || fs.realpathSync(binding.node) !== binding.node ||
        launcherFileHash(binding.entry) !== binding.entrySha256 || launcherFileHash(binding.node) !== binding.nodeSha256) {
      return { code: 'harness-installation-invalid' };
    }
    const manifest = path.join(packageRoot, 'package.json');
    if (fs.realpathSync(manifest) !== manifest || !fs.lstatSync(manifest).isFile()) return { code: 'harness-installation-invalid' };
    const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (metadata.name !== '@buildr-ai/buildr-harness' || metadata.private === true) return { code: 'harness-installation-invalid' };
    if (!supportsHarness(metadata.version)) return { code: 'harness-incompatible' };
    return { installation: { node: binding.node, packageRoot, dataRoot: binding.dataRoot, port: '9518' } };
  } catch {
    return { code: 'harness-installation-invalid' };
  }
}
