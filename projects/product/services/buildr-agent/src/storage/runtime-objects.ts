import fs from 'node:fs';
import { cloneViewReferences } from './clone-views.ts';
import { cloneFile } from './clone-file.ts';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ensureStorageDirectory, safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from './files.ts';

export function runtimeFileHash(file: string): string {
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024), fd = fs.openSync(file, 'r');
  try { let count: number; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

/** Caller holds the existing profile storage lock. One read-only inode per
 * content and executable mode; views only link it, never copy another body. */
export function materializeRuntimeObject(root: string, source: string, mode?: number, requireClone=false): string {
  const before = fs.lstatSync(source);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('agent_runtime_source_changed');
  const digest = runtimeFileHash(source), executable = mode ?? (before.mode & 0o111);
  const directory = path.join(root, 'toolchains/objects', digest.slice(0, 2), digest + '-' + executable.toString(8));
  ensureStorageDirectory(root, directory);
  const target = path.join(directory, process.platform === 'win32' ? 'payload.exe' : 'payload');
  const verify = () => {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid() || stat.mode & 0o222 || (stat.mode & 0o111) !== executable || runtimeFileHash(target) !== digest) throw new Error('agent_runtime_object_changed');
  };
  const current = fs.statSync(source);
  if (before.dev !== current.dev || before.ino !== current.ino || before.size !== current.size || before.mtimeMs !== current.mtimeMs || before.ctimeMs !== current.ctimeMs) throw new Error('agent_runtime_source_changed');
  if (fs.existsSync(target)) { verify(); return target; }
  const staged = path.join(directory, '.stage-' + randomUUID());
  try {
    if(requireClone)cloneFile(source,staged);else if(before.size>=1024*1024){try{cloneFile(source,staged);}catch{fs.copyFileSync(source,staged,fs.constants.COPYFILE_EXCL);}}else fs.copyFileSync(source, staged, fs.constants.COPYFILE_FICLONE);
    if (runtimeFileHash(staged) !== digest) throw new Error('agent_runtime_source_changed');
    fs.chmodSync(staged, 0o400 | executable);
    try { fs.linkSync(staged, target); } catch (error) { if (!fs.existsSync(target)) throw error; }
    verify(); return target;
  } finally { fs.rmSync(staged, { force: true }); }
}


/** Hardlink counts are the authoritative view references. Only an unchanged,
 * unlinked, hash-verified service object is eligible, after its retention window. */
export function runtimeObjectUnreferenced(directory: string, identity: string): boolean {
  try {
    const references=cloneViewReferences(path.resolve(directory,'../../../..'));
    if(!references.complete||references.objects.has(identity))return false;
    const match = /^([a-f0-9]{64})-([0-7]{1,3})$/.exec(identity);
    const names = fs.readdirSync(directory);
    if (!match || names.length !== 1 || names[0] !== (process.platform === 'win32' ? 'payload.exe' : 'payload')) return false;
    const file = path.join(directory, names[0]!), stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() && (!process.getuid || stat.uid === process.getuid()) && stat.nlink === 1 && !(stat.mode & 0o222) &&
      (stat.mode & 0o111) === parseInt(match[2]!,8) && runtimeFileHash(file) === match[1];
  } catch { return false; }
}
export function runtimeObjectCandidates(root: string, use: StorageUse, now=Date.now()): StorageCandidate[] {
  const base = path.join(root, 'toolchains/objects'), result: StorageCandidate[] = [];
  const references=cloneViewReferences(root);if(!references.complete)return result;
  if (!safeStoragePath(root, base)) return result;
  for (const prefix of fs.readdirSync(base)) {
    const parent = path.join(base, prefix);
    if (!/^[a-f0-9]{2}$/.test(prefix) || !safeStoragePath(root,parent)) continue;
    for (const identity of fs.readdirSync(parent)) {
      const directory = path.join(parent, identity);
      if (references.objects.has(identity) || !identity.startsWith(prefix) || !safeStoragePath(root,directory)) continue;
      const file = path.join(directory,process.platform === 'win32' ? 'payload.exe' : 'payload');
      if (fs.lstatSync(file,{throwIfNoEntry:false})?.nlink !== 1) continue;
      const item = storageCandidate(root,'runtime-object',directory,directory,use,now-30*24*60*60_000);
      if (item.eligible && fs.lstatSync(file).ctimeMs>now-30*24*60*60_000) { item.eligible=false; item.reason='runtime_object_retention'; }
      if (item.eligible && !runtimeObjectUnreferenced(directory,identity)) { item.eligible=false; item.reason='runtime_object_unknown'; }
      result.push(item);
    }
  }
  return result;
}

/** A finished, private native-package staging directory. npm links are kept as
 * links; regular installation files use the same immutable object namespace as
 * retained backends. Mutable project dependencies never call this function. */
export function sharePreparedToolPackage(root: string, directory: string): void {
  if (!/^programs\/[a-z][a-z0-9-]*\/\.prepare-[A-Za-z0-9]+$/.test(path.relative(root,directory).split(path.sep).join('/')) || !safeStoragePath(root,directory)) throw new Error('agent_program_staging_unsafe');
  const visit = (parent: string) => {
    for (const name of fs.readdirSync(parent)) {
      const file=path.join(parent,name), before=fs.lstatSync(file);
      if (before.isSymbolicLink()) continue;
      if (before.isDirectory()) { visit(file); continue; }
      if (!before.isFile() || process.getuid && before.uid !== process.getuid()) throw new Error('agent_program_staging_unsafe');
      const object=materializeRuntimeObject(root,file), current=fs.lstatSync(file);
      if (before.dev!==current.dev || before.ino!==current.ino || before.mtimeMs!==current.mtimeMs || before.ctimeMs!==current.ctimeMs) throw new Error('agent_runtime_source_changed');
      const temporary=path.join(parent,'.share-'+randomUUID());
      try { fs.linkSync(object,temporary); fs.renameSync(temporary,file); }
      finally { fs.rmSync(temporary,{force:true}); }
    }
  };
  visit(directory);
}
