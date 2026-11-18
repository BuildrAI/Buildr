import fs from 'node:fs';
import path from 'node:path';

/** A fresh source inventory, never a receipt or timestamp cache. Keep transformed
 * metadata in memory so an unchanged preparation does not copy and delete a tree. */
export function runtimePackageTree() {
  const files = new Map<string, { source?: string; bytes?: Buffer; mode: number }>();
  const directories = new Map<string, number>();
  const parents = (relative: string) => {
    for (let dir = path.dirname(relative); dir !== '.'; dir = path.dirname(dir)) {
      if (!directories.has(dir)) directories.set(dir, 0o777 & ~process.umask());
    }
  };
  const read = (relative: string) => {
    const file = files.get(relative);
    if (!file) throw Error(`agent_runtime_file_missing: ${relative}`);
    return file.bytes ?? fs.readFileSync(file.source!);
  };
  const copy = (source: string, relative: string, filter: (file: string) => boolean = () => true) => {
    if (!filter(source)) return;
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw Error(`agent_runtime_symlink: ${source}`);
    parents(relative);
    if (stat.isDirectory()) {
      directories.set(relative, stat.mode & 0o777);
      for (const child of fs.readdirSync(source)) copy(path.join(source, child), path.join(relative, child), filter);
    } else if (stat.isFile()) files.set(relative, { source, mode: stat.mode & 0o777 });
    else throw Error('agent_runtime_file_invalid');
  };
  return {
    copy,
    has: (relative: string) => files.has(relative),
    json: (relative: string) => JSON.parse(read(relative).toString('utf8')),
    writeJson(relative: string, value: unknown) {
      parents(relative);
      files.set(relative, { bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`), mode: files.get(relative)?.mode ?? (0o666 & ~process.umask()) });
    },
    matches(root: string): boolean {
      const children = new Map<string, Set<string>>();
      for (const item of [...directories.keys(), ...files.keys()]) {
        const parent = path.dirname(item);
        if (!children.has(parent)) children.set(parent, new Set());
        children.get(parent)!.add(path.basename(item));
      }
      const visit = (relative: string): boolean => {
        const target = path.join(root, relative), stat = fs.lstatSync(target, { throwIfNoEntry: false });
        if (!stat || stat.isSymbolicLink()) return false;
        const file = files.get(relative);
        if (file) return stat.isFile() && (stat.mode & 0o777) === file.mode && fs.readFileSync(target).equals(read(relative));
        if (!stat.isDirectory() || (relative && (stat.mode & 0o777) !== directories.get(relative))) return false;
        const names = children.get(relative || '.') ?? new Set<string>();
        const actual = fs.readdirSync(target);
        return actual.length === names.size && actual.every(name => names.has(name) && visit(path.join(relative, name)));
      };
      return visit('');
    },
    materialize(root: string) {
      for (const [relative, mode] of [...directories].sort(([a], [b]) => a.length - b.length)) {
        fs.mkdirSync(path.join(root, relative), { recursive: true });
        fs.chmodSync(path.join(root, relative), mode);
      }
      for (const [relative, file] of files) {
        const target = path.join(root, relative);
        if (file.bytes) fs.writeFileSync(target, file.bytes);
        else fs.copyFileSync(file.source!, target);
        fs.chmodSync(target, file.mode);
      }
    },
  };
}
