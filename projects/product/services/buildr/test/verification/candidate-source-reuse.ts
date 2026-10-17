import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const CANDIDATE_SOURCE_IMPORT_ENV = 'BUILDR_SOURCE_VERIFICATION';
// Common checks have one coverage owner across declared executable systems.
// Platform checks require their real OS. Original OS/CPU remain visible;
// installed-package/Host Node checks cannot use this source-only policy.
export const CANDIDATE_SOURCE_REUSE_POLICY = Object.freeze({
  schemaVersion: 'buildr.candidate-source-reuse-policy/v2',
  platform: 'explicit-common-or-same-declared-os', architecture: 'retain-original', artifactResults: 'never',
});
export const MAX_SOURCE_IMPORT_CHARACTERS = 56_000;
const MAX_DECODED_BYTES = 2 * 1024 * 1024;
const BUNDLE_SCHEMA = 'buildr.verification-source-bundle/v1';
const PACKET_SCHEMA = 'buildr.candidate-source-import/v1';

export type SourceBundle = { schemaVersion: string; records: any[] };
const digest = (value: string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

export function assertSourceBundle(value: any): asserts value is SourceBundle {
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
  const encoded = gzipSync(packet).toString('base64');
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
    packet = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: MAX_DECODED_BYTES }).toString('utf8'));
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
  return decodeCandidateSourceImport(input);
}

export function planCandidateSourceReuse(shards: any[], bundle: SourceBundle,
  validate: (record: any, stepId: string, runner: string) => boolean): {
    sourceShards: any[]; reusedShards: Array<{ shard: any; records: any[] }>; reusedStepIds: string[];
  } {
  assertSourceBundle(bundle);
  const sourceShards: any[] = [], reusedShards: Array<{ shard: any; records: any[] }> = [];
  const reusedStepIds = new Set<string>();
  for (const shard of shards) {
    if (shard.requiresArtifact || shard.producesArtifact) continue;
    const records = shard.stepIds.map((stepId: string) => bundle.records
      .filter(record => record.identity.stepId === stepId && validate(record, stepId, shard.runner))
      .sort((left, right) => String(right.origin?.finishedAt ?? '').localeCompare(String(left.origin?.finishedAt ?? '')))[0]);
    for (const record of records) if (record) reusedStepIds.add(record.identity.stepId);
    if (records.every(Boolean)) reusedShards.push({ shard, records });
    else sourceShards.push(shard);
  }
  return { sourceShards, reusedShards, reusedStepIds: [...reusedStepIds].sort() };
}
