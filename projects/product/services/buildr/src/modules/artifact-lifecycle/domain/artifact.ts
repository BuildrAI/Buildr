import crypto from 'node:crypto';
import path from 'node:path';

export const ARTIFACT_SCHEMA_VERSION = 'buildr.workspace-artifact/v1';
export const ARTIFACT_DISPOSITIONS = Object.freeze(['ephemeral', 'retained', 'evidence'] as const);
export const ARTIFACT_STATES = Object.freeze(['active', 'retained', 'retained-stale', 'expired', 'released', 'unattributed', 'missing'] as const);
export type ArtifactDisposition = typeof ARTIFACT_DISPOSITIONS[number];
export type ArtifactState = typeof ARTIFACT_STATES[number];

export type ArtifactReference = {
  summary: string;
  checkPath: string | null;
};

export type ArtifactRecord = {
  schemaVersion: string;
  artifactId: string;
  path: string;
  registeredBy: string;
  purpose: string;
  disposition: ArtifactDisposition;
  taskId: string | null;
  retainReason: string | null;
  references: ArtifactReference[];
  state: 'registered' | 'released';
  releasedAt: string | null;
  releaseReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactError = Error & { code?: string; status?: number; details?: unknown; nextAction?: string };

export function artifactError(code: string, message: string, status = 400, details?: unknown, nextAction?: string): ArtifactError {
  return Object.assign(new Error(message), { code, status, ...(details === undefined ? {} : { details }), ...(nextAction ? { nextAction } : {}) });
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw artifactError('artifact_input_invalid', `${field} 必须是非空文本。`, 400);
  return value.trim();
}

export function normalizeArtifactId(value: unknown): string {
  const id = requiredText(value, 'artifactId');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw artifactError('artifact_input_invalid', `artifactId 只接受字母数字与 ._-：${id}。`, 400);
  return id;
}

export function artifactIdForPath(relativePath: string): string {
  const base = path.basename(relativePath).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
  const suffix = crypto.createHash('sha256').update(relativePath).digest('hex').slice(0, 8);
  return `${base}-${suffix}`;
}

export function normalizeDisposition(value: unknown): ArtifactDisposition {
  const disposition = requiredText(value, 'disposition');
  if (!(ARTIFACT_DISPOSITIONS as readonly string[]).includes(disposition)) {
    throw artifactError('artifact_input_invalid', `disposition 必须是 ${ARTIFACT_DISPOSITIONS.join('|')}：${disposition}。`, 400);
  }
  return disposition as ArtifactDisposition;
}

export function normalizeReferences(value: unknown): ArtifactReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw artifactError('artifact_input_invalid', 'references 必须是引用说明数组。', 400);
  return value.map((item: any) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw artifactError('artifact_input_invalid', 'reference 必须是对象。', 400);
    const summary = requiredText(item.summary, 'reference.summary');
    const checkPath = item.checkPath === undefined || item.checkPath === null ? null : requiredText(item.checkPath, 'reference.checkPath');
    return { summary, checkPath };
  });
}

export function normalizeArtifactRecord(raw: unknown): ArtifactRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw artifactError('artifact_record_invalid', '产物记录必须是对象。', 400);
  const record: any = raw;
  if (record.schemaVersion !== ARTIFACT_SCHEMA_VERSION) throw artifactError('artifact_record_invalid', `产物记录 schemaVersion 必须是 ${ARTIFACT_SCHEMA_VERSION}。`, 400);
  const state = record.state === 'released' ? 'released' : 'registered';
  return Object.freeze({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: normalizeArtifactId(record.artifactId),
    path: requiredText(record.path, 'path'),
    registeredBy: requiredText(record.registeredBy, 'registeredBy'),
    purpose: requiredText(record.purpose, 'purpose'),
    disposition: normalizeDisposition(record.disposition),
    taskId: record.taskId === undefined || record.taskId === null ? null : requiredText(record.taskId, 'taskId'),
    retainReason: record.retainReason === undefined || record.retainReason === null ? null : requiredText(record.retainReason, 'retainReason'),
    references: normalizeReferences(record.references),
    state,
    releasedAt: record.releasedAt ?? null,
    releaseReason: record.releaseReason ?? null,
    createdAt: requiredText(record.createdAt, 'createdAt'),
    updatedAt: requiredText(record.updatedAt, 'updatedAt'),
  });
}

export function artifactRecordDigest(record: ArtifactRecord): string {
  return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

export function createArtifactRecord(input: {
  path: string;
  registeredBy: string;
  purpose: string;
  disposition: ArtifactDisposition;
  taskId?: string | null;
  retainReason?: string | null;
  references?: ArtifactReference[];
}): ArtifactRecord {
  const disposition = normalizeDisposition(input.disposition);
  const retainReason = input.retainReason ?? null;
  const references = normalizeReferences(input.references ?? []);
  if (disposition === 'retained' && (!retainReason || !references.length)) {
    throw artifactError('artifact_retained_reference_required', 'retained 产物必须提供 --retain-reason 与至少一条 --reference。', 400, undefined, '补充保留理由与引用方后重新登记。');
  }
  const now = new Date().toISOString();
  return Object.freeze({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: artifactIdForPath(input.path),
    path: requiredText(input.path, 'path'),
    registeredBy: requiredText(input.registeredBy, 'registeredBy'),
    purpose: requiredText(input.purpose, 'purpose'),
    disposition,
    taskId: input.taskId ?? null,
    retainReason,
    references,
    state: 'registered',
    releasedAt: null,
    releaseReason: null,
    createdAt: now,
    updatedAt: now,
  });
}
