import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { restorePackageHandoff, validatePackageHandoff, LOCAL_PACKAGE_WORKFLOW, LOCAL_PLATFORM_POLICY, localPackagePlatform } from './local-package-handoff.ts';
import { readReleaseArtifact } from './release-artifact.ts';
import { readReleaseCandidate } from './dsh-plugin/release-candidate.ts';
import { createLocalArtifactPlan } from '../../../projects/product/services/buildr/test/verification/artifact.ts';
import { createPluginSourceAggregate } from '../../../projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts';
import { currentVerificationRules } from '../../../projects/product/services/buildr/test/verification/release/verification-rules.ts';
import { isDeepStrictEqual } from 'node:util';

const workspace = path.resolve(import.meta.dirname, '../../..');
const required = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing local package input ${name}.`);
  return value;
};
const envLine = (name: string, value: string) => {
  if (/[\r\n]/u.test(value)) throw new Error('Package environment values must be single-line data.');
  fs.appendFileSync(required('GITHUB_ENV'), `${name}=${value}\n`);
};

export function adoptRemotePackage(options: { repo: string; commit: string; output: string;
  sourceCommit: string; sourceTree: string; identity: string; artifactSha256: string; platform?: NodeJS.Platform; preserveOnly?: boolean }): any {
  const handoff = restorePackageHandoff(options.repo, options.commit, options.output, options);
  if (handoff.kind === 'plugin') {
    const owned = readReleaseCandidate(path.join(options.output, 'plugin-candidate/candidate.json'));
    if (owned.manifest.sourceCommit !== handoff.sourceCommit || owned.manifest.sha256 !== handoff.artifactSha256) {
      throw new Error('Restored plugin differs from its frozen local producer.');
    }
    return { handoff, artifact: null };
  }
  const artifact = readReleaseArtifact(path.join(options.output, 'candidate-package/release-artifact.json'));
  if (artifact.manifest.sourceCommit !== handoff.sourceCommit || artifact.manifest.sha256 !== handoff.artifactSha256) {
    throw new Error('Restored package differs from its frozen local producer.');
  }
  return { handoff, artifact };
}

/** Restore only this system's evidence, never overwrite newly adopted local proof.
 * The normal artifact verifier and aggregator still validate every result. */
export function restorePriorPlatformEvidence(options: { handoff: any; directory: string; output: string;
  runId: string; runAttempt: number; platform?: NodeJS.Platform }): string[] {
  const handoff = validatePackageHandoff(options.handoff);
  if (localPackagePlatform(options.platform).local !== handoff.remoteRunner
    || !/^[1-9]\d*$/u.test(options.runId) || !Number.isSafeInteger(options.runAttempt) || options.runAttempt < 2) {
    throw new Error('Package retry requires the exact run and opposite system.');
  }
  const restored: string[] = [];
  const plan = createLocalArtifactPlan(options.platform, { scope: 'platform', verificationScope: handoff.verificationScope });
  for (const node of plan.nodes) {
    const name = `candidate-ci-evidence-${node.id}.json`;
    const file = path.join(options.directory, name), stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('Invalid prior platform evidence file.');
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (evidence.id !== node.id || evidence.sourceCommit !== handoff.sourceCommit || evidence.sourceTree !== handoff.sourceTree
      || evidence.artifact?.sha256 !== handoff.artifactSha256 || evidence.runner?.os !== handoff.remoteRunner
      || String(evidence.workflow?.runId) !== options.runId || !Number.isSafeInteger(Number(evidence.workflow?.runAttempt))
      || Number(evidence.workflow.runAttempt) < 1 || Number(evidence.workflow.runAttempt) >= options.runAttempt) {
      throw new Error('Prior platform proof differs from the same package run or attempt.');
    }
    fs.mkdirSync(options.output, { recursive: true });
    fs.copyFileSync(file, path.join(options.output, name), fs.constants.COPYFILE_EXCL);
    restored.push(node.id);
  }
  return restored;
}

function restoreRetry(output: string): void {
  const runId = required('GITHUB_RUN_ID'), runAttempt = Number(required('GITHUB_RUN_ATTEMPT'));
  const evidenceDirectory = required('BUILDR_CANDIDATE_CI_OUTPUT_DIR');
  const handoff = JSON.parse(fs.readFileSync(path.join(output, 'handoff.json'), 'utf8'));
  const gh = (args: string[], timeout = 30_000) => {
    const result = spawnSync('gh', args, { cwd: workspace, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Prior package evidence readback failed; do not assume the original request had no results.');
    return result.stdout;
  };
  // An early failed attempt may not have uploaded any proof. Distinguish that
  // authoritative absence from a network/download error, rather than swallowing both.
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/BuildrAI/Buildr/actions/runs/${runId}/artifacts?per_page=100`]));
  if (!Array.isArray(pages) || !pages.length || pages.some(page => !Array.isArray(page.artifacts))) throw new Error('Invalid package retry artifact inventory.');
  const artifacts = pages.flatMap(page => page.artifacts);
  if (pages.some(page => page.total_count !== artifacts.length)
    || new Set(artifacts.map(item => item.id)).size !== artifacts.length) throw new Error('Incomplete package retry artifact inventory.');
  const previous = artifacts.filter(item => item.name === 'package-platform-evidence' && item.expired === false);
  if (!previous.length) {
    process.stdout.write('[release] no retained platform evidence from the earlier attempt; execute missing platform nodes.\n');
    return;
  }
  if (previous.length !== 1 || previous[0].size_in_bytes <= 0) throw new Error('Package retry evidence is not unique.');
  fs.mkdirSync(path.dirname(evidenceDirectory), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(path.dirname(evidenceDirectory), 'package-retry-'));
  try {
    gh(['run', 'download', runId, '--repo', 'BuildrAI/Buildr', '--name', 'package-platform-evidence', '--dir', temporary], 120_000);
    const restored = restorePriorPlatformEvidence({ handoff, directory: temporary, output: evidenceDirectory, runId, runAttempt });
    process.stdout.write(`[release] restored prior platform nodes: ${restored.join(', ') || 'none'}\n`);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = path.resolve(required('BUILDR_LOCAL_PACKAGE_DIRECTORY'));
  if (process.argv[2] === 'restore') {
    const { handoff } = adoptRemotePackage({ repo: workspace, output, commit: required('BUILDR_LOCAL_PACKAGE_COMMIT'),
      sourceCommit: required('BUILDR_CANDIDATE_SOURCE_SHA'), sourceTree: required('BUILDR_LOCAL_PACKAGE_SOURCE_TREE'),
      identity: required('BUILDR_LOCAL_PACKAGE_IDENTITY'), artifactSha256: required('BUILDR_LOCAL_PACKAGE_SHA256'),
      preserveOnly: process.env.BUILDR_LOCAL_PACKAGE_PRESERVE_ONLY === 'true' });
    if (process.env.BUILDR_LOCAL_PACKAGE_PRESERVE_ONLY === 'true'
      && handoff.kind !== 'plugin' && handoff.platformPolicy !== LOCAL_PLATFORM_POLICY) {
      throw new Error('Historical package verification cannot be silently replaced by preservation-only execution.');
    }
    envLine('BUILDR_LOCAL_PACKAGE_HANDOFF', path.join(output, 'handoff.json'));
    envLine('BUILDR_LOCAL_PACKAGE_KIND', handoff.kind ?? 'buildr');
    envLine('BUILDR_LOCAL_PACKAGE_HAS_CONSUMPTION', handoff.consumption ? 'true' : 'false');
    if (handoff.kind !== 'plugin') {
      envLine('BUILDR_CANDIDATE_CI_ARTIFACT_DIR', path.join(output, 'candidate-package'));
      // File inputs avoid Windows' per-variable size limit and an unnecessary
      // encode/decode roundtrip. Legacy dispatched inputs remain readable.
      envLine('BUILDR_SOURCE_VERIFICATION_FILE', path.join(output, 'source-verification.json'));
      envLine('BUILDR_ARTIFACT_VERIFICATION_FILE', path.join(output, 'artifact-verification.json'));
      if (handoff.verificationScope) envLine('BUILDR_CANDIDATE_VERIFICATION_SCOPE', JSON.stringify(handoff.verificationScope));
    }
    // The rest of the job consumes this data; no code from the data ref is loaded.
  } else if (process.argv[2] === 'retry') {
    restoreRetry(output);
  } else if (process.argv[2] === 'plugin') {
    const handoff = validatePackageHandoff(JSON.parse(fs.readFileSync(path.join(output, 'handoff.json'), 'utf8')));
    if (handoff.plugin) {
      if (handoff.verificationRules && !isDeepStrictEqual(handoff.verificationRules,
        currentVerificationRules(workspace, handoff.verificationScope, handoff.kind === 'plugin' ? 'plugin' : 'buildr', handoff.platformPolicy ?? null))) {
        throw new Error('Plugin preservation rules differ from their frozen local source.');
      }
      const directory = path.join(output, 'plugin-candidate');
      const owned = readReleaseCandidate(path.join(directory, 'candidate.json'));
      const full = JSON.parse(fs.readFileSync(path.join(directory, 'plugin-full-verification.json'), 'utf8'));
      const result = createPluginSourceAggregate(handoff.plugin.plan, owned.manifest, full,
        { runId: required('GITHUB_RUN_ID'), runAttempt: Number(required('GITHUB_RUN_ATTEMPT')), path: LOCAL_PACKAGE_WORKFLOW });
      // Joint handoffs carry the main aggregate contract; the plugin's byte-bound
      // full manifest remains its independent recipe authority.
      if (handoff.kind === 'plugin' && handoff.verificationRules) result.verificationRules = handoff.verificationRules;
      fs.writeFileSync(path.join(directory, 'plugin-candidate-ci-aggregate.json'), JSON.stringify(result) + '\n');
      fs.appendFileSync(required('GITHUB_OUTPUT'), `version=${handoff.plugin.version}\n`);
    }
  } else throw new Error('Usage: local-package-remote.ts restore|retry|plugin');
}
