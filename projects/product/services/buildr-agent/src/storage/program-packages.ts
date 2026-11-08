import fs from 'node:fs';
import path from 'node:path';
import { nativeProgramPolicies } from '../executors/program-policy.ts';
import { listConnectionProgramReferences } from '../persistence/connection-relocation.ts';
import { safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from './files.ts';

/** Managed program packages are reclaimable only without any binding, upgrade
 * rollback/target or default-destination reference. Unknown references retain. */
export interface ProgramPackageReferences { complete: boolean; directories: Set<string> }

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
  let complete = true;
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const directory = packageDirectory(root, value);
    if (directory) directories.add(directory);
  };
  try {
    const references = listConnectionProgramReferences(path.join(root, 'conversations.sqlite'));
    complete = references.complete;
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
    } catch {
      // An unreadable record may hide a rollback source; retain that provider's packages.
      const provider = name.slice(0, -'.json'.length);
      const base = path.join(root, 'programs', provider);
      if (providers.includes(provider)) {
        try { for (const directory of fs.readdirSync(base)) directories.add(path.join(base, directory)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false; }
      } else complete = false;
    }
  }
  // The policy default destination stays reusable for prepared, not-yet-bound programs.
  for (const provider of providers) directories.add(path.join(root, 'programs', provider, `${nativeProgramPolicies[provider as keyof typeof nativeProgramPolicies].version}-${process.platform}-${process.arch}`));
  return { complete, directories };
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
      const target = path.join(base, name);
      const item = storageCandidate(root, 'program-package', target, target, use, cutoff);
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
