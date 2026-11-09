import crypto from 'node:crypto';
import { assertCandidateRound, passedRoundRecord, ROUND_SCHEMA } from './candidate-round.ts';
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';
import { verificationInputApplicability } from './result-applicability.ts';
import { createVerificationReuseIdentity, validEnvironment, type VerificationReuseEnvironment, type VerificationReuseSnapshot } from './verification-reuse.ts';

export const CANDIDATE_SOURCE_IMPORT_ENV = 'BUILDR_SOURCE_VERIFICATION';
// Common checks have one coverage owner across declared executable systems.
// Platform checks require their real OS. Original OS/CPU remain visible;
// installed-package/Host Node checks cannot use this source-only policy.
export const CANDIDATE_SOURCE_REUSE_POLICY = Object.freeze({
  schemaVersion: 'buildr.candidate-source-reuse-policy/v4',
  platform: 'explicit-common-or-same-declared-os', architecture: 'retain-original', artifactResults: 'never', candidateRound: 'passed-results-only-no-input-invalidation',
  sourceGranularity: 'check',
});
export const MAX_SOURCE_IMPORT_CHARACTERS = 56_000;
const MAX_DECODED_BYTES = 2 * 1024 * 1024;
const BUNDLE_SCHEMA = 'buildr.verification-source-bundle/v1';
const PACKET_SCHEMA = 'buildr.candidate-source-import/v1';

export type SourceBundle = { schemaVersion: string; records: any[]; roundId?: string };
const digest = (value: string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

export function assertSourceBundle(value: any): asserts value is SourceBundle {
  if (value?.schemaVersion === ROUND_SCHEMA) { assertCandidateRound(value); return; }
  if (value?.schemaVersion !== BUNDLE_SCHEMA || !Array.isArray(value.records) || value.records.length > 512) {
    throw new Error('Source verification bundle is invalid or exceeds its record budget.');
  }
  // The execution owner performs input, recipe, environment and result checks.
  // Transport validation never turns a caller-supplied boolean into proof.
  for (const record of value.records) {
    if (record?.schemaVersion !== 'buildr.verification-source-result/v1'
        || typeof record.identity?.stepId !== 'string' || record.identity.stepId.length > 160
        || !/^sha256-[a-f0-9]{64}$/u.test(record.identity.key ?? '')) {
      throw new Error('Source verification record is invalid.');
    }
  }
}

export function encodeCandidateSourceImport(bundle: SourceBundle): string {
  assertSourceBundle(bundle);
  const body = JSON.stringify(bundle);
  const packet = JSON.stringify({ schemaVersion: PACKET_SCHEMA, digest: digest(body), bundle });
  if (Buffer.byteLength(packet) > MAX_DECODED_BYTES) throw new Error('Source verification exceeds its decoded byte budget.');
  // Brotli keeps a full round under the dispatch budget; gzip exceeded it once
  // file-level proofs accumulated. Decoding still accepts older gzip packets.
  const encoded = brotliCompressSync(packet).toString('base64');
  if (encoded.length > MAX_SOURCE_IMPORT_CHARACTERS) {
    throw new Error('Source verification exceeds the workflow input budget; no Candidate was dispatched.');
  }
  return encoded;
}

export function decodeCandidateSourceImport(encoded: string): SourceBundle {
  if (!encoded || encoded.length > MAX_SOURCE_IMPORT_CHARACTERS || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw new Error('Source verification transport is invalid or exceeds its input budget.');
  }
  let packet: any;
  try {
    const bytes = Buffer.from(encoded, 'base64');
    let decoded: Buffer;
    try { decoded = gunzipSync(bytes, { maxOutputLength: MAX_DECODED_BYTES }); }
    catch { decoded = brotliDecompressSync(bytes, { maxOutputLength: MAX_DECODED_BYTES }); }
    packet = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new Error('Source verification transport cannot be decoded within its byte budget.');
  }
  assertSourceBundle(packet?.bundle);
  if (packet.schemaVersion !== PACKET_SCHEMA || packet.digest !== digest(JSON.stringify(packet.bundle))) {
    throw new Error('Source verification transport integrity differs.');
  }
  return packet.bundle;
}

export function candidateSourceImportFromEnvironment(env: Record<string, string | undefined>): SourceBundle {
  const input = env[CANDIDATE_SOURCE_IMPORT_ENV];
  if (!input) return { schemaVersion: BUNDLE_SCHEMA, records: [] };
  if (env.GITHUB_EVENT_NAME && env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Imported source verification requires the controlled manual Candidate entry.');
  }
  const log = decodeCandidateSourceImport(input);
  if (log.schemaVersion === ROUND_SCHEMA) assertCandidateRound(log, env.BUILDR_SELECTION_ID ?? env.BUILDR_VERIFICATION_ROUND);
  return log;
}

export function candidateSourceRunnerPlatform(runner: string): string {
  return runner === 'macos' ? 'darwin' : runner === 'windows' ? 'win32' : runner;
}

/** The recorded execution environment is authoritative for source proofs.
 * Common checks may come from either declared OS; platform checks only from
 * the exact OS that owns the shard. The checker host never replaces that fact. */
export function candidateSourceRecordEnvironment(step: any, record: any, runner: string): VerificationReuseEnvironment | null {
  const original = record?.result?.inputEnvironment;
  const observed = record?.environment;
  if (!validEnvironment(original) || !observed || typeof observed !== 'object') return null;
  if (original.platform !== observed.platform || original.arch !== observed.arch || original.nodeVersion !== observed.nodeVersion) return null;
  if (step.platformScope?.kind === 'common') {
    return ['darwin', 'win32'].includes(original.platform) ? original : null;
  }
  if (step.platformScope?.kind === 'platform') {
    return step.platformScope.runners.includes(runner) && original.platform === candidateSourceRunnerPlatform(runner) ? original : null;
  }
  return null;
}

/** Shared by Candidate planning and shard execution. This uses the same input
 * applicability and recipe identity as ordinary source reuse. */
export function validateCandidateSourceRecord(options: {
  record: any; step: any; runner: string; selectionId: string | undefined; snapshot: VerificationReuseSnapshot;
}): boolean {
  const { record, step, runner, selectionId, snapshot } = options;
  if (!step || !selectionId || !passedRoundRecord(record, selectionId, step, runner)) return false;
  // A user-declared scope retains a same-round passed record without claiming
  // a fresh execution in this scope.
  if (record.result?.retainedByUserInstruction === true) return true;
  if (!step.reuse) return true;
  try {
    const environment = candidateSourceRecordEnvironment(step, record, runner);
    if (!environment) return false;
    return verificationInputApplicability(record.result?.inputIdentity, createVerificationReuseIdentity(step, { ...snapshot, environment })).applicable;
  } catch {
    return false;
  }
}

export function reusedCandidateSourceResult(record: any): any {
  return {
    ...record.result,
    durationMs: 0,
    disposition: 'reused',
    reusedFrom: { ...record.origin, durationMs: record.result.durationMs, identity: record.identity.key },
    sourceRecord: record,
  };
}

/** Split one source shard without weakening any individual proof. Missing
 * checks execute; valid sibling results are transported into the same shard
 * evidence instead of rerunning the entire shard. */
export function candidateSourceShardReuse(shard: any, bundle: SourceBundle,
  validate: (record: any, stepId: string, runner: string) => boolean): {
    reused: Array<{ stepId: string; record: any }>; missingStepIds: string[];
  } {
  assertSourceBundle(bundle);
  const reused: Array<{ stepId: string; record: any }> = [], missingStepIds: string[] = [];
  for (const stepId of shard.stepIds) {
    const record = bundle.records
      .filter(record => record.identity.stepId === stepId && validate(record, stepId, shard.runner))
      .sort((left, right) => String(right.origin?.finishedAt ?? '').localeCompare(String(left.origin?.finishedAt ?? '')))[0];
    if (record) reused.push({ stepId, record });
    else missingStepIds.push(stepId);
  }
  return { reused, missingStepIds };
}

export function planCandidateSourceReuse(shards: any[], bundle: SourceBundle,
  validate: (record: any, stepId: string, runner: string) => boolean): {
    sourceShards: any[]; reusedShards: Array<{ shard: any; records: any[] }>; reusedStepIds: string[];
    reusedByShard: Array<{ shard: any; reused: Array<{ stepId: string; record: any }>; missingStepIds: string[] }>;
  } {
  assertSourceBundle(bundle);
  const sourceShards: any[] = [], reusedShards: Array<{ shard: any; records: any[] }> = [];
  const reusedByShard: Array<{ shard: any; reused: Array<{ stepId: string; record: any }>; missingStepIds: string[] }> = [];
  const reusedStepIds = new Set<string>();
  for (const shard of shards) {
    if (shard.requiresArtifact || shard.producesArtifact) continue;
    const split = candidateSourceShardReuse(shard, bundle, validate);
    reusedByShard.push({ shard, ...split });
    for (const item of split.reused) reusedStepIds.add(item.stepId);
    if (split.missingStepIds.length === 0) reusedShards.push({ shard, records: split.reused.map(item => item.record) });
    else sourceShards.push(shard);
  }
  return { sourceShards, reusedShards, reusedStepIds: [...reusedStepIds].sort(), reusedByShard };
}
