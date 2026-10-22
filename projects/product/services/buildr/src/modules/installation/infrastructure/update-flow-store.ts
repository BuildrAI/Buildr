import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWriteJson, withExclusiveFileLock } from '../../../infrastructure/filesystem/index.ts';
import { productDataRoot } from '../../../infrastructure/filesystem/product-data-root.ts';
import { parseSemver } from '../domain/release-version.ts';
import { updateError, type UpdateRecord, type UpdateStore } from '../application/update-flow-state.ts';

/** Local observations only. Installation authority is re-checked by the installation owner. */
export function createUpdateFlowStore(productRoot: string, options: { dataRoot?: string } = {}): UpdateStore {
  const root = fs.realpathSync(productRoot);
  const slot = createHash('sha256').update(root).digest('hex');
  const file = path.join(options.dataRoot || productDataRoot(), 'web-updates', `${slot}.json`);
  const invalid = () => updateError('update_record_invalid', '本次更新记录无法核实，已保留原文件。');
  function read(): UpdateRecord | null {
    if (!fs.existsSync(file)) return null;
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw invalid();
      const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
      const value = envelope?.record;
      if (envelope.schemaVersion !== 'buildr.web-update-record/v1' || !value || value.productRoot !== root
        || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)
        || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isSafeInteger(value.ownerPid) || value.ownerPid < 1
        || !['npm', 'development'].includes(value.mode) || !['stable', 'candidate'].includes(value.track)
        || !parseSemver(value.version) || !parseSemver(value.previousVersion)
        || !(value.installedVersion === null || parseSemver(value.installedVersion))
        || !(value.previousInstallationIdentity === null || typeof value.previousInstallationIdentity === 'string')
        || !['preparing', 'ready', 'applying', 'failed', 'partial', 'completed'].includes(value.status)
        || !['idle', 'download', 'ready', 'install', 'launcher', 'restart', 'verify', 'completed'].includes(value.stage)
        || !['install', 'launcher', 'restart', 'verify'].every(key => ['pending', 'running', 'done', 'failed', 'skipped'].includes(value.steps?.[key]))
        || ![value.error, value.launcherError].every(error => error === null || (typeof error?.code === 'string' && typeof error?.message === 'string'))
        || typeof value.updatedAt !== 'string') throw invalid();
      return value;
    } catch { throw invalid(); }
  }
  return {
    read,
    write(record, expectedRevision) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      withExclusiveFileLock(`${file}.lock`, file, () => {
        const observed = read();
        if ((observed?.revision ?? null) !== expectedRevision || record.revision !== (expectedRevision ?? 0) + 1) {
          throw updateError('update_record_conflict', '更新记录已变化，请重新读取后再操作。');
        }
        if (record.productRoot !== root) throw invalid();
        atomicWriteJson(file, { schemaVersion: 'buildr.web-update-record/v1', record }, { mode: 0o600 });
      });
    },
  };
}
