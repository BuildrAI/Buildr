import fs from 'node:fs';
import path from 'node:path';
import { nativeProgramPolicies } from '../executors/program-policy.ts';
import { listConnectionProgramReferences } from '../persistence/connection-relocation.ts';
import { safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from './files.ts';

/** Managed program packages are reclaimable only without any binding, upgrade
 * rollback/target or default-destination reference. Unknown references retain. */
export interface ProgramPackageReferences { complete: boolean; directories: Set<string>; replaced: Set<string> }

const providers = Object.keys(nativeProgramPolicies);

function packageDirectory(root: string, executable: string): string | undefined {
  if (!path.isAbsolute(executable)) return undefined;
  const relative = path.relative(path.join(root, 'programs'), executable);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  const [provider, directory] = relative.split(path.sep);
  if (!provider || !directory || !providers.includes(provider)) return undefined;
  return path.join(root, 'programs', provider, directory);
}

export function programPackageReferences(root: string): ProgramPackageReferences {
  const directories = new Set<string>();
  const replaced = new Set<string>();
  let bound = new Map<string,string>();
  let complete = true;
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const directory = packageDirectory(root, value);
    if (directory) directories.add(directory);
  };
  try {
    const references = listConnectionProgramReferences(path.join(root, 'conversations.sqlite'));
    complete = references.complete;
    bound = references.bound;
    for (const value of references.paths) add(value);
  } catch { complete = false; }
  const upgrades = path.join(root, 'program-upgrades');
  let names: string[] = [];
  try { names = fs.readdirSync(upgrades); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false; }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(upgrades, name);
    try {
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('upgrade_record_unsafe');
      const view = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof view.executable !== 'string' || !['downloading', 'waiting', 'restarting', 'completed', 'failed', 'interrupted'].includes(view.state)) throw new Error('upgrade_record_invalid');
      // A completed upgrade already committed the binding; its historical
      // pre-upgrade executable must not pin the old package forever.
      if (view.state !== 'completed') { add(view.executable); add(view.installedExecutable); }
      else if (view.connectionId === name.slice(0, -'.json'.length) && typeof view.installedExecutable === 'string' && bound.get(view.connectionId) === view.installedExecutable) {
        const previous = packageDirectory(root, view.executable);
        const current = packageDirectory(root, view.installedExecutable);
        if (previous && current && previous !== current && path.dirname(previous) === path.dirname(current)
          && path.basename(path.dirname(previous)) === view.connectionId && path.basename(previous).startsWith('package-')) replaced.add(previous);
      }
    } catch {
      // An unreadable record may hide a rollback source; retain that provider's packages.
      const provider = name.slice(0, -'.json'.length);
      const base = path.join(root, 'programs', provider);
      if (providers.includes(provider)) {
        try { for (const directory of fs.readdirSync(base)) if (directory.startsWith('package-') || directory.startsWith('.prepare-')) directories.add(path.join(base, directory)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false; }
      } else complete = false;
    }
  }
  // A prepared package may not be bound yet. Its explicit pointer keeps that
  // exact package until a later preparation or update supersedes it.
  for (const provider of providers) {
    const file = path.join(root, 'programs', provider, 'prepared.json');
    try {
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('program_latest_pointer_invalid');
      const pointer = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof pointer.executable !== 'string') throw new Error('program_latest_pointer_invalid');
      add(pointer.executable);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false;
    }
  }
  // Keep the legacy default destination reusable as well.
  for (const provider of providers) directories.add(path.join(root, 'programs', provider, `${nativeProgramPolicies[provider as keyof typeof nativeProgramPolicies].version}-${process.platform}-${process.arch}`));
  return { complete, directories, replaced };
}

/** Version packages and crashed `.prepare-*` staging directories of known
 * providers; occupancy is scoped to each package directory itself. */
export function programPackageCandidates(root: string, use: StorageUse, cutoff: number, references = programPackageReferences(root)): StorageCandidate[] {
  if (!safeStoragePath(root, path.join(root, 'programs'))) return [];
  const items: StorageCandidate[] = [];
  for (const provider of providers) {
    const base = path.join(root, 'programs', provider);
    if (!safeStoragePath(root, base)) continue;
    let names: string[];
    try { names = fs.readdirSync(base); } catch { continue; }
    for (const name of names) {
      if (!name.startsWith('package-') && !name.startsWith('.prepare-')) continue;
      const target = path.join(base, name);
      const item = storageCandidate(root, 'program-package', target, target, use, references.replaced.has(target) ? Infinity : cutoff);
      if (item.eligible && (!references.complete || references.directories.has(target))) {
        item.eligible = false;
        item.reason = references.complete ? 'program_package_referenced' : 'program_references_unknown';
      }
      items.push(item);
    }
  }
  return items;
}

/** Fresh reference proof for the conditional removal; the original path stays
 * authoritative even after the collector's temporary rename. */
export function programPackageUnreferenced(root: string, directory: string): boolean {
  const references = programPackageReferences(root);
  return references.complete && !references.directories.has(directory);
}
