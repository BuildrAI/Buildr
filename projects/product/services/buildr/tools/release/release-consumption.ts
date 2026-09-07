#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { readReleaseArtifact, assertNpmTarballInventory } from './release-artifact.ts';
import { resolveReleaseContract } from './release-contract.ts';
import { extractReleaseNotes } from './release-notes.ts';
import { publisherNpmCli, PUBLISH_NPM_VERSION } from '../verification/candidate-environment.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const repositoryRoot = path.resolve(serviceRoot, '../../../..');

// This is the executable coverage contract, shared by Candidate and publication.
// A new check must either name its Candidate evidence or explain its live boundary.
export const RELEASE_CHECKS = Object.freeze([
  { id: 'package-contract', phase: 'candidate', evidence: ['core-package-runtime-release-macos'], operation: 'metadata' },
  { id: 'platform-launcher', phase: 'candidate', evidence: ['core-package-runtime-release-macos', 'runtime-windows'], operation: 'platform' },
  { id: 'host-node', phase: 'candidate', evidence: ['host-minimum-macos', 'host-current-macos', 'host-minimum-windows', 'host-current-windows', 'host-minimum-linux', 'host-current-linux'], operation: 'host' },
  { id: 'publisher-cli', phase: 'candidate', evidence: ['host-minimum-linux'], operation: 'publisher' },
  { id: 'release-lifecycle', phase: 'candidate', evidence: ['release-infrastructure-macos', 'release-infrastructure-windows'], operation: 'lifecycle' },
  { id: 'artifact-readback', phase: 'pre-publication', reason: 'Recheck downloaded bytes against the frozen Candidate before mutation.' },
  { id: 'publication-authority', phase: 'protected-authority', reason: 'Real platform approval and OIDC exist only in the protected run.' },
  { id: 'source-convergence', phase: 'protected-authority', reason: 'Git refs and publishing authority can change after Candidate.' },
  { id: 'registry-state', phase: 'protected', reason: 'Official Registry version and dist-tags can change after Candidate.' },
  { id: 'tag-state', phase: 'protected', reason: 'The immutable tag must be created or reused under real publication authorization.' },
  { id: 'github-release-state', phase: 'protected', reason: 'Public Release metadata can change after Candidate.' },
  { id: 'npm-publish', phase: 'protected', reason: 'Publishing the verified bytes requires real Registry authority.' },
  { id: 'registry-readback', phase: 'protected', reason: 'Confirm official bytes and dist-tags after the write or its recovery.' },
  { id: 'github-release-write', phase: 'protected', reason: 'Create missing public notes only after matching npm publication.' },
  { id: 'registry-install', phase: 'post-publication', reason: 'Installation from the official Registry requires published bytes.' },
] as const);

export type ReleaseInitialCheckId = Extract<typeof RELEASE_CHECKS[number], { phase: 'pre-publication' | 'protected-authority' }>['id'];
export type ReleaseEffectCheckId = Extract<typeof RELEASE_CHECKS[number], { phase: 'protected' | 'post-publication' }>['id'];

export const RELEASE_CONSUMER_COMMANDS = Object.freeze({
  platform: { file: 'test/verification/release/release-smoke.ts', args: ['--platform-launcher'], preparation: 'consumer' },
  host: { file: 'test/verification/host-node.ts', args: [], preparation: 'host' },
  registry: { file: 'test/verification/release/release-smoke.ts', args: [], preparation: 'consumer' },
});

export function releaseConsumptionIdentity(): string {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify({ checks: RELEASE_CHECKS, commands: RELEASE_CONSUMER_COMMANDS, publisherNpm: PUBLISH_NPM_VERSION })).digest('hex')}`;
}

export function validateReleaseCheckDefinitions(checks: readonly any[] = RELEASE_CHECKS): void {
  const ids = new Set<string>();
  for (const check of checks) {
    if (!check.id || ids.has(check.id)) throw new Error(`Duplicate or missing release check: ${check.id}`);
    ids.add(check.id);
    if (check.phase === 'candidate') {
      if (!Array.isArray(check.evidence) || !check.evidence.length || !['metadata', 'platform', 'host', 'publisher', 'lifecycle'].includes(check.operation)) throw new Error(`Release check ${check.id} has no executable Candidate coverage.`);
    } else if (!['pre-publication', 'protected-authority', 'protected', 'post-publication'].includes(check.phase) || !check.reason?.trim()) {
      throw new Error(`Release check ${check.id} has no live-state or authorization boundary.`);
    }
  }
}

export function assertReleaseConsumptionCoverage(aggregate: any, expected: { sourceCommit: string; sourceTree?: string }, artifact: any): void {
  validateReleaseCheckDefinitions();
  if (aggregate?.status !== 'passed' || aggregate.sourceCommit !== expected.sourceCommit || (expected.sourceTree && aggregate.sourceTree !== expected.sourceTree)) throw new Error('Release consumption requires a passed Candidate for the exact source.');
  if (aggregate.consumptionIdentity !== releaseConsumptionIdentity()) throw new Error('Candidate release consumption recipe is missing or stale.');
  for (const check of RELEASE_CHECKS) {
    if ('evidence' in check && check.evidence.some(id => !aggregate.evidenceIds?.includes(id))) throw new Error(`Candidate is missing release check ${check.id}.`);
  }
  for (const field of ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest']) {
    if (!artifact || aggregate.artifact?.[field] !== artifact[field]) throw new Error(`Candidate consumption artifact ${field} mismatches.`);
  }
}

export function validateArtifactDocumentLinks(tarball: string, inventory: any, execute = spawnCommandSync): { checked: number } {
  const files = new Set<string>(inventory.files.map((entry: any) => entry.path));
  let checked = 0;
  for (const file of ['README.md', 'payload/product/README.md']) {
    if (!files.has(file)) throw new Error(`Package documentation is missing ${file}.`);
    const result = execute('tar', ['-xOf', tarball, `package/${file}`], { encoding: 'utf8', timeout: 30_000 });
    if (result.error || result.status !== 0) throw new Error(`Unable to read package documentation ${file}.`);
    for (const match of String(result.stdout).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
      const target = match[1]!;
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target.split('#')[0]!));
      if (!files.has(resolved)) throw new Error(`Package documentation link is missing: ${file} -> ${target}`);
      checked++;
    }
  }
  return { checked };
}

export function inspectReleaseConsumerArtifact(manifestPath: string, roots = { serviceRoot, repositoryRoot }): any {
  const artifact = readReleaseArtifact(manifestPath);
  const metadata = JSON.parse(fs.readFileSync(path.join(roots.serviceRoot, 'package.json'), 'utf8'));
  if (metadata.name !== artifact.manifest.packageName || metadata.version !== artifact.manifest.version) throw new Error('Release consumer source package identity differs from the frozen artifact.');
  const notes = extractReleaseNotes(fs.readFileSync(path.join(roots.repositoryRoot, 'CHANGELOG.md'), 'utf8'), metadata.version);
  const contract = resolveReleaseContract(metadata.version, `v${metadata.version}`, { sourceCommit: artifact.manifest.sourceCommit, enginesNode: metadata.engines.node, releaseNotes: notes });
  const packs = JSON.parse(fs.readFileSync(path.join(path.dirname(artifact.manifestPath), 'npm-pack.json'), 'utf8'));
  if (!Array.isArray(packs) || packs.length !== 1 || packs[0].filename !== artifact.manifest.filename || packs[0].integrity !== artifact.manifest.integrity) throw new Error('Release consumer requires matching single-package inventory.');
  assertNpmTarballInventory(packs[0].files);
  const documents = validateArtifactDocumentLinks(artifact.tarball, packs[0]);
  return { artifact, contract, documents };
}

export function runReleaseConsumer(operation: 'platform' | 'host' | 'registry' | 'metadata' | 'publisher', options: { manifestPath?: string; packageSpec?: string; env?: NodeJS.ProcessEnv; execute?: typeof spawnCommandSync } = {}): any {
  const execute = options.execute ?? spawnCommandSync;
  const env = { ...process.env, ...options.env };
  let inspected: any = null;
  if (operation !== 'registry') {
    const manifestPath = options.manifestPath || env.BUILDR_RELEASE_ARTIFACT_MANIFEST || env.BUILDR_CANDIDATE_RELEASE_MANIFEST;
    if (!manifestPath) throw new Error('Release consumption requires an explicit frozen artifact; it never builds a package.');
    inspected = inspectReleaseConsumerArtifact(manifestPath);
    env.BUILDR_CANDIDATE_TARBALL = inspected.artifact.tarball;
    env.BUILDR_CANDIDATE_PACK_METADATA = path.join(path.dirname(manifestPath), 'npm-pack.json');
    env.BUILDR_CANDIDATE_RELEASE_MANIFEST = manifestPath;
    delete env.BUILDR_RELEASE_ARTIFACT_MANIFEST;
    delete env.BUILDR_RELEASE_PACKAGE_SPEC;
  } else {
    const packageSpec = options.packageSpec || env.BUILDR_RELEASE_PACKAGE_SPEC;
    if (!/^@buildr-ai\/buildr@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageSpec || '')) throw new Error('Registry consumption requires an exact official package version.');
    env.BUILDR_RELEASE_PACKAGE_SPEC = packageSpec;
    for (const key of ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST', 'BUILDR_RELEASE_ARTIFACT_MANIFEST']) delete env[key];
  }
  const startedAt = Date.now();
  if (operation !== 'metadata') {
    const command = operation === 'publisher'
      ? { file: path.relative(serviceRoot, publisherNpmCli()), args: ['publish', inspected.artifact.tarball, '--dry-run', '--ignore-scripts', '--provenance=false', '--access', 'public', '--tag', inspected.contract.npmTag, '--registry=https://registry.npmjs.org/'] }
      : RELEASE_CONSUMER_COMMANDS[operation];
    const result = execute(process.execPath, [path.join(serviceRoot, command.file), ...command.args], { cwd: serviceRoot, env, encoding: 'utf8', timeout: 300_000 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) throw Object.assign(new Error(`Release consumer ${operation} failed: ${result.error?.message || result.signal || result.status}`), { code: 'release-consumer-failed', durationMs: Date.now() - startedAt, signal: result.signal, pid: result.pid });
  }
  return { status: 'passed', operation, consumptionIdentity: releaseConsumptionIdentity(), artifact: inspected?.artifact.manifest ?? null, durationMs: Date.now() - startedAt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2];
    if (action === 'plan') process.stdout.write(`${JSON.stringify({ identity: releaseConsumptionIdentity(), checks: RELEASE_CHECKS, commands: RELEASE_CONSUMER_COMMANDS })}\n`);
    else if (action === 'verify') {
      const [contextFile, aggregateFile, manifestFile] = process.argv.slice(3);
      if (!contextFile || !aggregateFile || !manifestFile) throw new Error('verify requires context, aggregate and manifest files.');
      const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      const aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
      const artifact = inspectReleaseConsumerArtifact(manifestFile).artifact.manifest;
      assertReleaseConsumptionCoverage(aggregate, context.release, artifact);
      for (const field of ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest']) if (artifact[field] !== context.artifact?.[field]) throw new Error(`Frozen release context artifact ${field} mismatches.`);
      const { releaseContextIdentity } = await import('./release-readiness.ts');
      if (releaseContextIdentity(aggregate) !== context.candidate.aggregateIdentity) throw new Error('Frozen Candidate aggregate identity mismatches.');
      process.stdout.write('Release consumption coverage and immutable bytes passed.\n');
    } else if (['platform', 'host', 'registry', 'metadata', 'publisher'].includes(action || '')) process.stdout.write(`${JSON.stringify(runReleaseConsumer(action as 'platform' | 'host' | 'registry' | 'metadata' | 'publisher'))}\n`);
    else throw new Error('Usage: release-consumption.ts <plan|metadata|platform|host|publisher|registry|verify>');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
