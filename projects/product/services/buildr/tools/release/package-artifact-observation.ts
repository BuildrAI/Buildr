/** Read official package bytes without npm configuration, extraction or execution. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { parsePackageCompatibility, type CompatibilityArtifact } from './package-compatibility.ts';
import { type PublishedPackageObservation } from './release-targets.ts';
import { requestReleaseJson } from './release-observation.ts';
import { readReleaseArtifact } from './release-artifact.ts';

export const packageNames = { buildr: '@buildr-ai/buildr', 'dsh-plugin': '@buildr-ai/buildr-dsh-plugin' } as const;
export const packageArtifactInputSchema = 'buildr.package-artifact-input/v1';
const registry = 'https://registry.npmjs.org/';
const maximumBytes = 256 * 1024 * 1024;
const sha = (bytes: Buffer, algorithm: string, encoding: 'hex' | 'base64' = 'hex') => crypto.createHash(algorithm).update(bytes).digest(encoding);

function archiveNumber(bytes: Buffer): number {
  const value = bytes.toString('ascii').replace(/\0.*$/su, '').trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error('Package archive has an invalid numeric header.');
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Package archive has an unsafe numeric header.');
  return parsed;
}

function extendedPath(bytes: Buffer): string | undefined {
  let offset = 0;
  let value: string | undefined;
  while (offset < bytes.length) {
    const separator = bytes.indexOf(32, offset);
    const size = Number(bytes.subarray(offset, separator).toString('ascii'));
    if (separator < offset || !Number.isSafeInteger(size) || size <= separator - offset + 1 || offset + size > bytes.length) throw new Error('Package archive has an invalid extended header.');
    const entry = bytes.subarray(separator + 1, offset + size).toString('utf8');
    if (!entry.endsWith('\n')) throw new Error('Package archive has an invalid extended entry.');
    if (entry.startsWith('path=')) value = entry.slice(5, -1);
    offset += size;
  }
  return value;
}

/** Parse only bounded metadata; no file in the archive is extracted or loaded. */
export function packageMetadataFromTarball(bytes: Buffer): Record<string, any> {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maximumBytes) throw new Error('Package archive byte size is invalid.');
  const archive = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 });
  let offset = 0;
  let terminated = false;
  let nextPath: string | undefined;
  let metadata: Record<string, any> | undefined;
  const paths = new Set<string>();
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (archive.subarray(offset).some(byte => byte !== 0)) throw new Error('Package archive has trailing material.');
      terminated = true;
      break;
    }
    const checksum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== archiveNumber(header.subarray(148, 156))) throw new Error('Package archive header checksum mismatches.');
    const size = archiveNumber(header.subarray(124, 136));
    const start = offset + 512;
    if (start + size > archive.length) throw new Error('Package archive is truncated.');
    const body = archive.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
    const kind = String.fromCharCode(header[156] || 48);
    if (kind === 'x') { nextPath = extendedPath(body) ?? nextPath; continue; }
    if (kind === 'L') { nextPath = body.toString('utf8').replace(/\0.*$/su, ''); continue; }
    if (kind === 'g') { if (extendedPath(body)) throw new Error('Global archive paths are unsupported.'); continue; }
    const text = (from: number, to: number) => header.subarray(from, to).toString('utf8').replace(/\0.*$/su, '');
    const prefix = text(345, 500);
    const name = nextPath ?? (prefix ? `${prefix}/${text(0, 100)}` : text(0, 100));
    nextPath = undefined;
    if (!name.startsWith('package/') || name.includes('\\') || name.split('/').some(part => part === '.' || part === '..')) throw new Error('Package archive path is unsafe.');
    if (kind === '5') continue;
    if (kind !== '0' || paths.has(name)) throw new Error('Package archive contains duplicate files, links or special entries.');
    paths.add(name);
    if (name === 'package/package.json') {
      if (body.length > 1024 * 1024) throw new Error('Package metadata is too large.');
      const value = JSON.parse(body.toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Package metadata is invalid.');
      metadata = value;
    }
  }
  if (!terminated || nextPath) throw new Error('Package archive is truncated or has incomplete trailing material.');
  if (!metadata) throw new Error('Package archive contains no unique package metadata.');
  return metadata;
}

export function artifactFromTarball(bytes: Buffer, expected: { origin: 'registry' | 'candidate'; packageName: CompatibilityArtifact['packageName']; version: string; integrity: string; sourceCommit?: string }): CompatibilityArtifact {
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/u.test(expected.integrity) || `sha512-${sha(bytes, 'sha512', 'base64')}` !== expected.integrity) throw new Error('Package archive integrity mismatches the frozen artifact.');
  const metadata = packageMetadataFromTarball(bytes);
  if (metadata.name !== expected.packageName || metadata.version !== expected.version || metadata.private === true) throw new Error('Package archive identity mismatches the observed package.');
  if (expected.origin === 'candidate' && !/^[a-f0-9]{40,64}$/u.test(expected.sourceCommit ?? '')) throw new Error('Candidate package requires its exact source identity.');
  return { origin: expected.origin, packageName: expected.packageName, version: expected.version, integrity: expected.integrity,
    artifactSha256: sha(bytes, 'sha256'), compatibility: metadata.buildrCompatibility == null ? null : parsePackageCompatibility(metadata.buildrCompatibility),
    ...(expected.sourceCommit ? { sourceCommit: expected.sourceCommit } : {}) };
}

async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const address = new URL(url);
  if (address.origin !== new URL(registry).origin || address.username || address.password) throw new Error('Package tarball must use the official registry origin.');
  const response = await fetchImpl(address, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error('Official package tarball download failed.');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maximumBytes) throw new Error('Official package tarball exceeds the byte budget.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maximumBytes) throw new Error('Official package tarball exceeds the byte budget.');
      chunks.push(Buffer.from(item.value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

export async function observePublishedPackageArtifact(packageValue: keyof typeof packageNames, options: { version?: string; expectedIntegrity?: string; fetchImpl?: typeof fetch } = {}): Promise<{ observation: PublishedPackageObservation; bytes?: Buffer }> {
  const packageName = packageNames[packageValue];
  if (!packageName) throw new Error('Unsupported release package.');
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    let version = options.version;
    if (!version) {
      const response = await requestReleaseJson(new URL(encodeURIComponent(packageName), registry), { fetchImpl, headers: { accept: 'application/json' } });
      if (response.status === 404) return { observation: { status: 'absent', packageName } };
      if (response.status !== 200 || response.body?.name !== packageName) throw new Error('Official package identity is unknown.');
      version = response.body?.['dist-tags']?.latest ?? response.body?.['dist-tags']?.next;
      if (typeof version !== 'string') throw new Error('Official package has no exact public release endpoint.');
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('Official package version is invalid.');
    const response = await requestReleaseJson(new URL(`${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`, registry), { fetchImpl, headers: { accept: 'application/json' } });
    if (response.status === 404) return { observation: { status: 'absent', packageName } };
    const metadata = response.body;
    if (response.status !== 200 || metadata?.name !== packageName || metadata?.version !== version || typeof metadata?.dist?.tarball !== 'string' || typeof metadata?.dist?.integrity !== 'string') throw new Error('Official package version metadata is incomplete.');
    if (options.expectedIntegrity && options.expectedIntegrity !== metadata.dist.integrity) throw new Error('Official registry artifact integrity conflicts with the frozen bytes.');
    const bytes = await download(metadata.dist.tarball, fetchImpl);
    const artifact = artifactFromTarball(bytes, { origin: 'registry', packageName, version, integrity: metadata.dist.integrity });
    return { observation: { status: 'present', artifact }, bytes };
  } catch (error) {
    return { observation: { status: 'unknown', packageName, diagnostic: error instanceof Error ? error.message : 'Official package observation failed.' } };
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options: Record<string, string> = {};
    for (let index = 2; index < process.argv.length; index += 2) {
      const flag = process.argv[index], value = process.argv[index + 1];
      if (!flag?.startsWith('--') || !value || !['package', 'version', 'integrity', 'output', 'tarball', 'candidate-manifest', 'discover'].includes(flag.slice(2)) || Object.hasOwn(options, flag.slice(2))) throw new Error('Invalid package artifact observation input.');
      options[flag.slice(2)] = value;
    }
    const discover = options.discover === 'current';
    if (options.discover && (!discover || options.version || options.integrity || options['candidate-manifest'])) throw new Error('Current public endpoint discovery cannot override frozen candidate, version or integrity.');
    if ((!discover && (!options.version || !options.integrity)) || !options.output || (!options.tarball && !options['candidate-manifest'])) throw new Error('Exact version/integrity or explicit current discovery and owned output paths are required.');
    let artifact: CompatibilityArtifact;
    let tarball: string;
    if (options['candidate-manifest']) {
      if (options.package !== 'buildr' || options.tarball) throw new Error('Candidate input must use the original Buildr artifact and cannot replace its tarball.');
      const candidate = readReleaseArtifact(options['candidate-manifest'], { packageName: packageNames.buildr, version: options.version });
      if (candidate.manifest.integrity !== options.integrity) throw new Error('Candidate integrity differs from the frozen peer input.');
      tarball = candidate.tarball;
      artifact = artifactFromTarball(fs.readFileSync(tarball), { origin: 'candidate', packageName: packageNames.buildr, version: options.version, integrity: options.integrity, sourceCommit: candidate.manifest.sourceCommit });
    } else {
      const observed = await observePublishedPackageArtifact(options.package as keyof typeof packageNames, { version: options.version, expectedIntegrity: options.integrity });
      if (observed.observation.status !== 'present' || !observed.bytes) throw new Error(observed.observation.status === 'unknown' ? observed.observation.diagnostic : 'Exact public package is absent.');
      artifact = observed.observation.artifact;
      tarball = path.resolve(options.tarball);
      fs.mkdirSync(path.dirname(tarball), { recursive: true });
      fs.writeFileSync(tarball, observed.bytes, { flag: 'wx', mode: 0o600 });
    }
    const output = path.resolve(options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: packageArtifactInputSchema, artifact, tarball }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: 'observed', artifact, input: output })}\n`);
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Package observation failed.'}\n`); process.exitCode = 1; }
}
