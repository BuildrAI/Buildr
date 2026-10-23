import fs from 'node:fs';
import path from 'node:path';

import { ARTIFACT_SCHEMA_VERSION, artifactError, normalizeArtifactId, normalizeArtifactRecord, type ArtifactRecord } from '../domain/artifact.ts';

type RepositoryRuntime = {
  ensureDirectory(directory: string): void;
  existsFile(file: string): boolean;
  atomicWriteJson(file: string, value: unknown): void;
  toPosixRelative(root: string, file: string): string;
};

export function artifactsRoot(targetRoot: string): string {
  return path.join(targetRoot, '.buildr', 'local', 'artifacts');
}

export function artifactRegistryRoot(targetRoot: string): string {
  return path.join(artifactsRoot(targetRoot), 'registry');
}

export function artifactRecordPath(targetRoot: string, artifactId: string): string {
  return path.join(artifactRegistryRoot(targetRoot), `${normalizeArtifactId(artifactId)}.json`);
}

export function registerArtifactRepository(runtime: RepositoryRuntime) {
  function readRecordFile(file: string): { record: ArtifactRecord | null; parseError: string | null; file: string } {
    try {
      return { record: normalizeArtifactRecord(JSON.parse(fs.readFileSync(file, 'utf8'))), parseError: null, file };
    } catch (error: any) {
      return { record: null, parseError: error?.message || 'unreadable', file };
    }
  }

  function listArtifactRecords(targetRoot: string): { records: ArtifactRecord[]; invalid: { file: string; error: string }[] } {
    const root = artifactRegistryRoot(targetRoot);
    const records: ArtifactRecord[] = [];
    const invalid: { file: string; error: string }[] = [];
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return { records, invalid }; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const observed = readRecordFile(path.join(root, entry.name));
      if (observed.record) records.push(observed.record);
      else invalid.push({ file: runtime.toPosixRelative(targetRoot, observed.file), error: observed.parseError || 'invalid' });
    }
    records.sort((left, right) => left.path.localeCompare(right.path));
    return { records, invalid };
  }

  function readArtifactRecord(targetRoot: string, artifactId: string): ArtifactRecord | null {
    const file = artifactRecordPath(targetRoot, artifactId);
    if (!runtime.existsFile(file)) return null;
    const observed = readRecordFile(file);
    if (!observed.record) throw artifactError('artifact_record_invalid', `产物记录损坏：${observed.file}（${observed.parseError}）。`, 500);
    if (observed.record.artifactId !== normalizeArtifactId(artifactId)) {
      throw artifactError('artifact_record_invalid', `产物记录标识与文件名不一致：${observed.file}。`, 500);
    }
    return observed.record;
  }

  function findArtifactByPath(targetRoot: string, relativePath: string): ArtifactRecord | null {
    const { records } = listArtifactRecords(targetRoot);
    return records.find((record) => record.path === relativePath) || null;
  }

  function writeArtifactRecord(targetRoot: string, record: ArtifactRecord) {
    runtime.ensureDirectory(artifactRegistryRoot(targetRoot));
    const file = artifactRecordPath(targetRoot, record.artifactId);
    runtime.atomicWriteJson(file, record);
    return file;
  }

  Object.assign(runtime, { artifactsRoot, artifactRegistryRoot, artifactRecordPath, listArtifactRecords, readArtifactRecord, findArtifactByPath, writeArtifactRecord });
  return runtime;
}
