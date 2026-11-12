import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../infrastructure/value.ts';
import { RUNTIME_ADAPTERS } from '../infrastructure/runtime/adapter-contract.ts';
import { listSkillProjectionOwnershipReceipts } from '../infrastructure/runtime/skills/projection-files.ts';
import { createBuiltinReceipts } from './package-maintenance/builtin-receipts.ts';

export function createManagedFileQuery(existsFile: (file: string) => boolean) {
  const receipts = createBuiltinReceipts({ crypto, fs, path, existsFile, isPlainObject });
  return function builtinManagedFiles(root: string, relative?: string): string[] {
    const directory = fs.lstatSync(path.join(root, '.buildr'), { throwIfNoEntry: false });
    const receipt = fs.lstatSync(path.join(root, receipts.relativePath), { throwIfNoEntry: false });
    if (directory?.isSymbolicLink() || receipt && (!receipt.isFile() || receipt.isSymbolicLink() || receipt.size > 1024 * 1024)) {
      throw new Error('Builtin ownership receipt cannot be inspected safely.');
    }
    // Command receipts own individual records in a mixed manifest.
    const files: string[] = receipts.read(root).builtins.flatMap((item: any) => {
      if (item.type === 'skill') return item.files.map((file: any) => path.posix.join(item.target, file.path));
      return item.type === 'rule' ? [item.target] : [];
    });
    if (!relative) return files;
    const seen = new Set<string>();
    for (const adapter of Object.values(RUNTIME_ADAPTERS) as Array<{ id: string; traits: { skills?: { root: string } } }>) {
      const runtimeRoot = adapter.traits.skills?.root;
      if (!runtimeRoot || seen.has(runtimeRoot) || !relative.startsWith(`${runtimeRoot}/skills/`)) continue;
      seen.add(runtimeRoot);
      const projections = listSkillProjectionOwnershipReceipts({ targetRoot: root, runtimeRoot, destination: 'workspace', adapterId: adapter.id });
      for (const entry of projections) {
        for (const member of entry.receipt.files) files.push(path.relative(root, path.join(entry.targetDir, member.path)).split(path.sep).join('/'));
      }
    }
    return files;
  };
}
