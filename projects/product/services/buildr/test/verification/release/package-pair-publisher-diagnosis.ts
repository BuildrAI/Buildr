#!/usr/bin/env node
/** One read-only publication compatibility check; never a Candidate or a publication. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPublicationCompatibility } from '../../../../../../../skills/buildr-release/scripts/release-publication.ts';
import { runReleaseConsumer } from './release-consumption.ts';
import { readReleaseArtifact } from '../../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { observePublishedPackageArtifact } from '../../../../../../../skills/buildr-release/scripts/package-artifact-observation.ts';
import { pairExecutionDiagnostic } from '../../../../../../../skills/buildr-release/scripts/package-pair-diagnostics.ts';
import { publisherNpmCli, PUBLISH_NPM_VERSION } from '../../../tools/verification/candidate-environment.ts';
import { resolvePeerNpm } from '../../../../dsh-plugin/tools/buildr-peer.ts';
import { verifyBuildrPluginPair } from '../../../../dsh-plugin/tools/verify-buildr-plugin-pair.ts';

export const PUBLISHER_PAIR_DIAGNOSIS_SCOPE = 'package-pair-publisher';
export const PUBLISHER_PAIR_DIAGNOSIS_SCHEMA = 'buildr.publisher-package-pair-diagnosis/v1';
interface GitFacts { head: string; tree: string; dirty: boolean }
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
const required = (env: NodeJS.ProcessEnv, key: string) => env[key] || fail(`publisher-pair-missing-${key.toLowerCase().replaceAll('_', '-')}`);

export function validatePublisherPairDiagnosis(env: NodeJS.ProcessEnv, run: any, facts: GitFacts): void {
  if (env.DIAGNOSTIC_SCOPE !== PUBLISHER_PAIR_DIAGNOSIS_SCOPE || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.BUILDR_CANDIDATE_PURPOSE !== 'candidate'
    || env.GITHUB_REPOSITORY !== 'BuildrAI/Buildr') fail('publisher-pair-dispatch-mismatch');
  if (!/^[1-9]\d*$/u.test(env.DIAGNOSTIC_CANDIDATE_RUN_ID ?? '') || !Number.isSafeInteger(Number(env.DIAGNOSTIC_CANDIDATE_RUN_ID))
    || String(run?.id) !== env.DIAGNOSTIC_CANDIDATE_RUN_ID
    || run.repository?.full_name !== 'BuildrAI/Buildr' || run.path !== '.github/workflows/verify.yml'
    || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
    || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt > 100) fail('publisher-pair-run-mismatch');
  if (!sha.test(env.DIAGNOSTIC_CANDIDATE_SOURCE ?? '') || run.head_sha !== env.DIAGNOSTIC_CANDIDATE_SOURCE) fail('publisher-pair-original-source-mismatch');
  if (!sha.test(env.GITHUB_SHA ?? '') || facts.head !== env.GITHUB_SHA) fail('publisher-pair-check-source-mismatch');
  if (!sha.test(env.EXPECTED_SOURCE_TREE ?? '') || facts.tree !== env.EXPECTED_SOURCE_TREE || facts.dirty) fail('publisher-pair-check-tree-mismatch');
  for (const key of ['BUILDR_RELEASE_PACKAGES', 'BUILDR_SOURCE_BUILDR_VERSION', 'BUILDR_PLUGIN_VERSION', 'BUILDR_SELECTION_ID',
    'BUILDR_SELECTION_BASELINE', 'BUILDR_SELECTION_MAIN', 'BUILDR_SELECTION_IDENTITY', 'BUILDR_BUILDR_PEER_VERSION',
    'BUILDR_BUILDR_PEER_INTEGRITY', 'BUILDR_RELEASE_REHEARSAL_IDENTITY', 'BUILDR_SOURCE_VERIFICATION']) {
    if (env[key]) fail('publisher-pair-extra-input');
  }
}

export function validatePublisherPairArtifact(manifest: any, sourceCommit: string): void {
  if (manifest.packageName !== '@buildr-ai/buildr' || manifest.sourceCommit !== sourceCommit
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version ?? '')
    || !/^[a-f0-9]{64}$/u.test(manifest.sha256 ?? '') || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(manifest.integrity ?? '')) fail('publisher-pair-artifact-mismatch');
}

export function publisherPairPluginInput(env: NodeJS.ProcessEnv): { version: string; integrity: string; artifactSha256: string } {
  const version = required(env, 'DIAGNOSTIC_PLUGIN_VERSION'), integrity = required(env, 'DIAGNOSTIC_PLUGIN_INTEGRITY'), artifactSha256 = required(env, 'DIAGNOSTIC_PLUGIN_SHA256');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version) || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity)
    || !/^[a-f0-9]{64}$/u.test(artifactSha256)) fail('publisher-pair-public-plugin-input-invalid');
  return { version, integrity, artifactSha256 };
}

export function validatePublisherPairPublicPlugin(value: any, expected: ReturnType<typeof publisherPairPluginInput>): void {
  const artifact = value?.observation?.artifact;
  if (value?.observation?.status !== 'present' || !Buffer.isBuffer(value.bytes) || !value.bytes.length
    || artifact?.origin !== 'registry' || artifact.packageName !== '@buildr-ai/buildr-dsh-plugin'
    || artifact.version !== expected.version || artifact.integrity !== expected.integrity
    || artifact.artifactSha256 !== expected.artifactSha256
    || artifact.verifiedContracts !== undefined) fail('publisher-pair-public-plugin-mismatch');
  if (digest(value.bytes) !== expected.artifactSha256
    || `sha512-${createHash('sha512').update(value.bytes).digest('base64')}` !== expected.integrity) fail('publisher-pair-public-plugin-bytes-mismatch');
}

function readGitFacts(productRoot: string): GitFacts {
  const git = (args: string[]) => execFileSync('git', args, { cwd: productRoot, encoding: 'utf8', timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return { head: git(['rev-parse', 'HEAD']).trim(), tree: git(['rev-parse', 'HEAD^{tree}']).trim(),
    dirty: git(['status', '--porcelain', '--untracked-files=all', '-z']).length > 0 };
}

function runtimeIdentity(productRoot: string): any {
  const nodeExecutable = fs.realpathSync(process.execPath);
  const npm = (cli: string) => {
    const actual = fs.realpathSync(cli), metadata = JSON.parse(fs.readFileSync(path.resolve(path.dirname(actual), '../package.json'), 'utf8'));
    return { cli: actual, version: metadata.version, sha256: digest(fs.readFileSync(actual)) };
  };
  return { platform: process.platform, arch: process.arch, nodeExecutable, nodeVersion: process.versions.node,
    nodeSha256: digest(fs.readFileSync(nodeExecutable)), pairNpm: npm(resolvePeerNpm(nodeExecutable)),
    publisherNpm: npm(publisherNpmCli(productRoot)) };
}

function writeSummary(directory: string, summary: any): void {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'package-pair-publisher-diagnosis.json'), temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(summary, null, 2)}\n`); fs.renameSync(temporary, target);
}

export async function runPublisherPairDiagnosis(options: { env?: NodeJS.ProcessEnv; productRoot?: string } = {}, dependencies: {
  readRun?: (filename: string) => any; readGitFacts?: (root: string) => GitFacts; readArtifact?: typeof readReleaseArtifact;
  observePlugin?: typeof observePublishedPackageArtifact; runtimeIdentity?: (root: string) => any;
  checkCompatibility?: typeof checkPublicationCompatibility; verifyPair?: typeof verifyBuildrPluginPair;
  publisherDryRun?: typeof runReleaseConsumer;
  writeSummary?: (directory: string, value: any) => void;
} = {}): Promise<any> {
  const env = options.env ?? process.env, output = path.resolve(required(env, 'DIAGNOSTIC_OUTPUT'));
  const productRoot = path.resolve(options.productRoot ?? path.resolve(import.meta.dirname, '../../..'));
  const persist = dependencies.writeSummary ?? writeSummary, readGit = dependencies.readGitFacts ?? readGitFacts;
  const started = Date.now();
  const summary: any = { schemaVersion: PUBLISHER_PAIR_DIAGNOSIS_SCHEMA, kind: 'diagnostic-only', aggregateEligible: false,
    scope: PUBLISHER_PAIR_DIAGNOSIS_SCOPE, status: 'failed', originalCandidateRunId: env.DIAGNOSTIC_CANDIDATE_RUN_ID ?? null,
    artifactSourceCommit: env.DIAGNOSTIC_CANDIDATE_SOURCE ?? null, artifactSha256: null, checkSourceCommit: null, checkSourceTree: null,
    pairExecutions: 0, preparationProfile: 'publisher', startedAt: new Date(started).toISOString() };
  let stage = 'validation', validated = false, run: any;
  try {
    run = (dependencies.readRun ?? ((filename: string) => JSON.parse(fs.readFileSync(filename, 'utf8'))))(required(env, 'DIAGNOSTIC_RUN_JSON'));
    const facts = readGit(productRoot);
    validatePublisherPairDiagnosis(env, run, facts); validated = true;
    const expectedPlugin = publisherPairPluginInput(env);
    summary.checkSourceCommit = facts.head; summary.checkSourceTree = facts.tree;
    summary.runtime = (dependencies.runtimeIdentity ?? runtimeIdentity)(productRoot);
    if (summary.runtime.platform !== 'darwin' || summary.runtime.nodeVersion !== '24.15.0'
      || summary.runtime.publisherNpm?.version !== PUBLISH_NPM_VERSION) fail('publisher-pair-runtime-mismatch');
    stage = 'artifact-readback';
    const artifact = (dependencies.readArtifact ?? readReleaseArtifact)(path.join(required(env, 'DIAGNOSTIC_ARTIFACT_DIR'), 'release-artifact.json'));
    validatePublisherPairArtifact(artifact.manifest, env.DIAGNOSTIC_CANDIDATE_SOURCE!);
    summary.artifactSha256 = artifact.manifest.sha256; summary.artifactIntegrity = artifact.manifest.integrity; summary.artifactSize = artifact.manifest.size;
    stage = 'public-plugin-readback';
    const plugin = await (dependencies.observePlugin ?? observePublishedPackageArtifact)('dsh-plugin', {
      version: expectedPlugin.version, expectedIntegrity: expectedPlugin.integrity,
    });
    validatePublisherPairPublicPlugin(plugin, expectedPlugin); summary.publicPlugin = plugin.observation.status === 'present' ? plugin.observation.artifact : null;
    stage = 'pair-execution'; summary.status = 'running'; persist(output, summary);
    summary.compatibility = await (dependencies.checkCompatibility ?? checkPublicationCompatibility)({
      context: { release: { version: artifact.manifest.version }, selection: { selectionId: 'publisher-pair-diagnosis' } }, artifact,
    }, {
      observePublishedPackageArtifact: async () => plugin,
      verifyBuildrPluginPair: (input: Parameters<typeof verifyBuildrPluginPair>[0]) => {
        if (summary.pairExecutions !== 0) fail('publisher-pair-repeated-execution');
        summary.pairExecutions = 1;
        // Deliberately retain the publisher's default Node-associated npm selection.
        return (dependencies.verifyPair ?? verifyBuildrPluginPair)(input);
      },
    });
    stage = 'publisher-dry-run';
    const dryRunStarted = Date.now();
    try {
      const result = (dependencies.publisherDryRun ?? runReleaseConsumer)('publisher', { manifestPath: artifact.manifestPath });
      summary.publisherDryRun = { status: result.status, operation: 'publisher', durationMs: Date.now() - dryRunStarted,
        artifactSha256: result.artifact?.sha256 ?? null, npmVersion: summary.runtime.publisherNpm.version };
      if (result.status !== 'passed' || result.artifact?.sha256 !== artifact.manifest.sha256) fail('publisher-pair-dry-run-mismatch');
    } catch (error) {
      summary.publisherDryRun = { status: 'failed', operation: 'publisher', durationMs: Date.now() - dryRunStarted,
        execution: pairExecutionDiagnostic(stage, 'publisher-pair-dry-run-failed', error) };
      throw error;
    }
    summary.status = summary.pairExecutions === 1 && summary.compatibility.status === 'passed' ? 'passed' : 'blocked';
  } catch (error: any) {
    summary.status = 'failed'; summary.failure = pairExecutionDiagnostic(stage, /^publisher-pair-[a-z-]+$/u.test(error.code ?? '') ? error.code : 'publisher-pair-diagnosis-failed', error);
  } finally {
    if (validated) {
      try { validatePublisherPairDiagnosis(env, run, readGit(productRoot)); summary.sourceReadback = 'unchanged'; }
      catch (error) { summary.status = 'failed'; summary.sourceReadback = 'failed';
        summary.sourceFailure = pairExecutionDiagnostic('source-readback', 'publisher-pair-source-drift', error); }
    }
    summary.finishedAt = new Date().toISOString(); summary.durationMs = Date.now() - started; persist(output, summary);
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await runPublisherPairDiagnosis(); console.log(JSON.stringify(result)); if (result.status !== 'passed') process.exitCode = 1; }
  catch { process.stderr.write('Publisher pair diagnosis could not save its independent summary.\n'); process.exitCode = 1; }
}
