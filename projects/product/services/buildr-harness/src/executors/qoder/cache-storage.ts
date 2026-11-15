import fs from 'node:fs';
import path from 'node:path';
import { safeStoragePath, safeStorageResource } from '../../storage/files.ts';

/** Qoder SDK's completed native extraction protocol, not arbitrary tmp data.
 * Future SDK layouts remain vendor-owned in the host's standard temporary root. */
export function qoderLegacyCaches(configRoot: string): string[] {
  const temporary = path.join(configRoot, 'tmp');
  if (!safeStoragePath(configRoot, temporary)) return [];
  const result: string[] = [];
  for (const name of fs.readdirSync(temporary)) {
    if (!/^qodercli-natives-v1\.1\.\d+-[\w.-]+$/.test(name)) continue;
    const directory = path.join(temporary, name);
    try {
      if (!safeStoragePath(configRoot, directory) || !safeStorageResource(configRoot, directory, 256)) continue;
      if ((fs.statSync(directory).mode & 0o777) !== 0o700 || fs.readdirSync(directory).sort().join(',') !== '.ready,node_modules,vendor') continue;
      const ready = path.join(directory, '.ready');
      if (fs.statSync(ready).size !== 16 || !/^[a-f0-9]{16}$/.test(fs.readFileSync(ready, 'utf8'))) continue;
      const modules = path.join(directory, 'node_modules');
      if (['@lydell/node-pty', '@silvia-odwyer/photon-node'].some(name => fs.statSync(path.join(modules, name, 'package.json')).size > 64 * 1024)) continue;
      const pty = JSON.parse(fs.readFileSync(path.join(modules, '@lydell/node-pty/package.json'), 'utf8'));
      const photon = JSON.parse(fs.readFileSync(path.join(modules, '@silvia-odwyer/photon-node/package.json'), 'utf8'));
      if (pty.name !== '@lydell/node-pty' || photon.name !== '@silvia-odwyer/photon-node') continue;
      const vendors = fs.readdirSync(path.join(directory, 'vendor'));
      if (vendors.length !== 1 || vendors[0] !== 'ripgrep') continue;
      if (!fs.statSync(path.join(directory, 'vendor/ripgrep')).isDirectory()) continue;
      result.push(path.join('tmp', name));
    } catch { /* Missing native completion/ownership evidence retains the object. */ }
  }
  return result;
}
