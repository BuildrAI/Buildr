import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export interface DevelopmentSnapshot {id: string; file: string; root: string}

/** Freeze code, not user data or the dependency installation. Original module
 * URLs remain intact so installation identity and filesystem paths don't lie. */
export function createDevelopmentSnapshot(serviceRoot: string, outputRoot = path.join(serviceRoot, 'build/dev-live')): DevelopmentSnapshot {
  const files: Record<string, string> = {};
  const roots = ['src', 'bin', 'tools', 'node_modules/@buildr-ai/buildr-harness/build'];
  function visit(relative: string) {
    const filename = path.join(serviceRoot, relative);
    const info = fs.lstatSync(filename);
    if (info.isSymbolicLink()) throw new Error(`development_snapshot_symlink: ${relative}`);
    if (info.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));
    } else if (info.isFile() && /\.(?:[cm]?js|ts|json)$/.test(relative)) files[relative] = fs.readFileSync(filename, 'utf8');
  }
  for (const root of roots) visit(root);
  const id = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const root = path.join(outputRoot, id);
  fs.mkdirSync(root, {recursive: true});
  const file = path.join(root, 'snapshot.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({version: 1, id, serviceRoot, files}), {flag: 'wx', mode: 0o600});
  // The hook itself must remain executable after a subsequent broken edit.
  const loader = path.join(root, 'loader.mjs');
  if (!fs.existsSync(loader)) fs.copyFileSync(path.join(serviceRoot, 'tools/development/dev-source-loader.mjs'), loader, fs.constants.COPYFILE_EXCL);
  return {id, file, root};
}

/** Bound the developer cache without touching unknown directories or live code. */
export function pruneDevelopmentSnapshots(serviceRoot: string, keep: Set<string>) {
  const directory = path.join(serviceRoot, 'build/dev-live');
  for (const id of fs.readdirSync(directory)) {
    if (keep.has(id) || !/^[a-f0-9]{64}$/.test(id)) continue;
    const root = path.join(directory, id);
    if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'snapshot.json'), 'utf8'));
      if (manifest.version !== 1 || manifest.id !== id || manifest.serviceRoot !== serviceRoot) continue;
      fs.rmSync(root, {recursive: true});
    } catch { /* A damaged or busy cache is retained, not a failed adoption. */ }
  }
}
