import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { readReleaseCandidate } from './dsh-plugin/release-candidate.ts';
import { assertBoundPluginVerification } from '../../../projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts';
import { inspectReleaseConsumerArtifact } from '../../../projects/product/services/buildr/test/verification/release/release-consumption.ts';
import { assertReleaseConsumptionCoverage } from '../../../projects/product/services/buildr/test/verification/release/release-consumption-contract.ts';
import { currentVerificationRules } from '../../../projects/product/services/buildr/test/verification/release/verification-rules.ts';
import { validatePackageHandoff } from './local-package-handoff.ts';
import { freezeLocalConsumption } from './local-consumption-record.ts';

/** Read-only consumer rehearsal. It adopts existing proofs but never invokes
 * a source/artifact check, packer, SDK builder, GitHub request or publisher. */
export function preflightLocalConsumption(options: {
  repo: string; sourceCommit: string; sourceTree: string; directory: string; handoff: any;
  artifactDirectory?: string; sourcePacket?: string; artifactPacket?: string;
  pluginDirectory?: string; expectedPeer?: any; roundId?: string;
  verifierRepo?: string; verificationSource?: string;
}, dependencies: any = {}): any {
  const handoff = validatePackageHandoff(options.handoff);
  if (handoff.sourceCommit !== options.sourceCommit || handoff.sourceTree !== options.sourceTree) throw new Error('Local consumption source differs from the frozen handoff.');
  const kind = handoff.kind === 'plugin' ? 'plugin' : 'buildr';
  const rules = (dependencies.currentRules ?? currentVerificationRules)(options.repo, handoff.verificationScope, kind, handoff.platformPolicy ?? null);
  if (!handoff.verificationRules || !isDeepStrictEqual(handoff.verificationRules, rules)) throw new Error('Local consumption rules differ from the immutable package handoff.');
  fs.mkdirSync(options.directory, { recursive: true });
  const evidenceDirectory = fs.mkdtempSync(path.join(options.directory, 'attempt-'));
  const receipt: any = { schemaVersion: 'buildr.local-consumption-preflight/v1', sourceCommit: options.sourceCommit,
    sourceTree: options.sourceTree, handoffIdentity: handoff.identity, rulesIdentity: rules.identity,
    qualification: 'local-consumption-only', status: 'failed', checks: [] };
  try {
    if (kind === 'buildr') {
      if (!options.artifactDirectory || !options.sourcePacket || !options.artifactPacket) throw new Error('Main package consumption requires explicit original and source/artifact proofs.');
      const service = path.join(options.repo, 'projects/product/services/buildr');
      const aggregateFile = path.join(evidenceDirectory, 'candidate-ci-aggregate.json');
      const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_CANDIDATE_SOURCE_SHA: options.sourceCommit,
        BUILDR_SELECTION_ID: options.roundId, BUILDR_LOCAL_PACKAGE_HANDOFF: path.join(evidenceDirectory, 'handoff.json'),
        BUILDR_SOURCE_VERIFICATION_FILE: options.sourcePacket, BUILDR_ARTIFACT_VERIFICATION_FILE: options.artifactPacket,
        BUILDR_CANDIDATE_CI_ARTIFACT_DIR: options.artifactDirectory, BUILDR_CANDIDATE_CI_OUTPUT_DIR: evidenceDirectory,
        BUILDR_CANDIDATE_CI_EVIDENCE_DIR: evidenceDirectory, BUILDR_CANDIDATE_CI_AGGREGATE_OUTPUT: aggregateFile,
        ...(handoff.verificationScope ? { BUILDR_CANDIDATE_VERIFICATION_SCOPE: JSON.stringify(handoff.verificationScope) } : {}),
      };
      for (const key of Object.keys(env)) if (key.startsWith('GITHUB_') || ['BUILDR_SOURCE_VERIFICATION', 'BUILDR_ARTIFACT_VERIFICATION',
        'BUILDR_CANDIDATE_PRODUCT_SOURCE', 'BUILDR_CANDIDATE_REPAIR_PLAN', 'BUILDR_CANDIDATE_CI_EVIDENCE_OUTPUT',
        'BUILDR_CANDIDATE_VERIFICATION_SCOPE'].includes(key)) delete env[key];
      if (handoff.verificationScope) env.BUILDR_CANDIDATE_VERIFICATION_SCOPE = JSON.stringify(handoff.verificationScope);
      fs.writeFileSync(env.BUILDR_LOCAL_PACKAGE_HANDOFF!, JSON.stringify(handoff) + '\n');
      if (Boolean(options.verifierRepo) !== Boolean(options.verificationSource)) throw new Error('Independent consumption requires both verifier checkout and exact commit.');
      const verifierService = options.verifierRepo ? path.join(options.verifierRepo, 'projects/product/services/buildr') : service;
      if (options.verifierRepo) {
        env.BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT = service;
        env.BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE = options.verificationSource;
        receipt.verificationSource = options.verificationSource;
      } else {
        delete env.BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT;
        delete env.BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE;
      }
      const execute = dependencies.execute ?? spawnSync;
      for (const action of ['plan', 'aggregate']) {
        const result = execute(process.execPath, [path.join(verifierService, 'test/verification/candidate-ci.ts'), action], {
          cwd: service, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
        });
        fs.writeFileSync(path.join(evidenceDirectory, `${action}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
        if (result.error || result.status !== 0) throw new Error(`Local ${action} cannot consume existing proof: ${String(result.error?.message || result.stderr || result.stdout || result.status).slice(-4096)}`);
      }
      const aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
      const inspected = (dependencies.inspectArtifact ?? inspectReleaseConsumerArtifact)(path.join(options.artifactDirectory, 'release-artifact.json'));
      (dependencies.assertCoverage ?? assertReleaseConsumptionCoverage)(aggregate,
        { sourceCommit: options.sourceCommit, sourceTree: options.sourceTree }, inspected.artifact.manifest);
      receipt.checks.push({ id: 'main-formal-consumption', status: 'passed', artifactSha256: inspected.artifact.manifest.sha256 });
      if (!options.verifierRepo && handoff.platformPolicy) receipt.consumption = freezeLocalConsumption(handoff, aggregate);
    }
    if (handoff.plugin) {
      if (!options.pluginDirectory) throw new Error('Plugin consumption requires the original candidate directory.');
      const candidate = (dependencies.readPlugin ?? readReleaseCandidate)(path.join(options.pluginDirectory, 'candidate.json'));
      const full = JSON.parse(fs.readFileSync(path.join(options.pluginDirectory, 'plugin-full-verification.json'), 'utf8'));
      (dependencies.assertPlugin ?? assertBoundPluginVerification)({ ...handoff.plugin.plan,
        ...(options.expectedPeer ? { expectedPeer: options.expectedPeer } : {}) }, candidate.manifest, full);
      receipt.checks.push({ id: 'plugin-formal-consumption', status: 'passed', artifactSha256: candidate.manifest.sha256 });
    }
    if (!receipt.checks.length) throw new Error('Local consumption preflight has no package to inspect.');
    receipt.status = 'passed';
  } catch (error: any) {
    receipt.failure = error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(options.directory, 'local-consumption-preflight.json'), JSON.stringify(receipt, null, 2) + '\n');
  }
  return receipt;
}
