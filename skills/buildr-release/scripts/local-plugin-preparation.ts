import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { observePublishedPackageArtifact, packageArtifactInputSchema } from './package-artifact-observation.ts';
import { parseCompatibilityArtifact } from './package-compatibility.ts';
import { readReleaseCandidate } from './dsh-plugin/release-candidate.ts';
import { assertBoundPluginVerification } from '../../../projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts';
import { assertFrozenCandidateCheckout } from '../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts';
import { createPackageHandoff, LOCAL_PACKAGE_MODEL, localPackagePlatform } from './local-package-handoff.ts';
import { currentVerificationRules, retainVerificationRules } from '../../../projects/product/services/buildr/test/verification/release/verification-rules.ts';
import { preflightLocalConsumption } from './local-consumption-preflight.ts';

/** Shared by standalone and joint release; no GitHub SDK producer remains in new preparations. */
export async function prepareLocalPlugin(options: {
  repo: string; sourceCommit: string; roundId: string; plan: any; peer: any; peerFile: string;
  scope?: any; sourcePacket?: string;
}, dependencies: any = {}): Promise<any> {
  const root = path.join(options.repo, 'projects/product/services/dsh-plugin');
  const directory = path.join(root, 'build/release-candidates', options.sourceCommit);
  const verificationFile = path.join(directory, 'plugin-full-verification.json');
  const report = path.join(root, 'build/release-verification', `${options.sourceCommit}.json`);
  const candidateFile = path.join(directory, 'candidate.json');
  const execute = dependencies.execute ?? spawnSync;
  if (!fs.existsSync(verificationFile)) {
    if (fs.existsSync(candidateFile) && !fs.existsSync(report)) throw new Error('Local plugin candidate has no complete report; preserve it, do not repack.');
    if (!fs.existsSync(candidateFile)) {
      if (options.scope?.excludedBoundaries?.length || options.scope?.excludedStepIds?.length) return {
        status: 'local-plugin-verification-required',
        nextActions: ['插件完整验证不支持本轮排除范围；保留既有原包，不绕过用户范围声明。'],
      };
      const run = (file: string, args: string[], timeout: number) => {
        const result = execute(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8',
          timeout, maxBuffer: 64 * 1024 * 1024,
          env: { ...process.env, BUILDR_CANDIDATE_SOURCE_SHA: options.sourceCommit, BUILDR_SELECTION_ID: options.roundId,
            ...(options.sourcePacket ? { BUILDR_SOURCE_VERIFICATION_FILE: options.sourcePacket } : {}) } });
        if (result.stderr) process.stderr.write(String(result.stderr));
        if (result.error || result.status !== 0) {
          if (result.stdout) process.stdout.write(String(result.stdout));
          throw new Error(`Local plugin ${path.basename(file)} failed; retain diagnostics and resume this preparation.`);
        }
        return String(result.stdout);
      };
      // Resolve and validate the SDK automatically, including when a stale inherited selector exists.
      const output = run(path.join(root, 'tools/ensure-release-sdk.ts'), [], 40 * 60_000);
      const sdk = JSON.parse(output.trim().split('\n').at(-1)!);
      if (sdk.status !== 'prepared' || typeof sdk.sdk !== 'string' || !path.isAbsolute(sdk.sdk)) throw new Error('Local SDK preparation did not return its exact output.');
      fs.mkdirSync(path.dirname(report), { recursive: true });
      const verification = run(path.join(root, 'tools/verify-all.ts'), ['--source-sdk', sdk.sdk,
        '--buildr-peer', options.peerFile, '--candidate-output', directory, '--output', report], 40 * 60_000);
      if (verification) process.stdout.write(verification);
    }
    // A report must be bound to the actual original before being adopted on resume.
    const owned = readReleaseCandidate(candidateFile);
    const full = JSON.parse(fs.readFileSync(report, 'utf8'));
    assertBoundPluginVerification({ ...options.plan, expectedPeer: options.peer,
      peerSourceCommit: options.peer.sourceCommit }, owned.manifest, full);
    fs.copyFileSync(report, verificationFile, fs.constants.COPYFILE_EXCL);
  }
  const owned = readReleaseCandidate(candidateFile);
  const full = JSON.parse(fs.readFileSync(verificationFile, 'utf8'));
  assertBoundPluginVerification({ ...options.plan, expectedPeer: options.peer,
    peerSourceCommit: options.peer.sourceCommit }, owned.manifest, full);
  return { status: 'ready', directory, artifactSha256: owned.manifest.sha256,
    plugin: { version: owned.manifest.version, plan: options.plan },
    files: ['candidate.json', owned.manifest.filename, 'plugin-full-verification.json'].map(name =>
      ({ path: `plugin-candidate/${name}`, source: path.join(directory, name) })) };
}

/** Independent plugin preparation never produces an unrelated main package. */
export async function prepareRegistryPlugin(options: any, dependencies: any = {}): Promise<any> {
  const service = path.join(options.repo, 'projects/product/services/buildr');
  const directory = path.join(service, 'build/verification/candidates', options.sourceCommit, 'local-plugin');
  fs.mkdirSync(directory, { recursive: true });
  const peer = options.peer;
  if (!peer || peer.origin !== 'registry') throw new Error('Independent plugin requires its frozen registry peer.');
  const tarball = path.join(directory, 'buildr-peer.tgz'), peerFile = path.join(directory, 'buildr-peer.json');
  if (!fs.existsSync(tarball)) {
    const observed = await (dependencies.observePeer ?? observePublishedPackageArtifact)('buildr', {
      version: peer.version, expectedIntegrity: peer.integrity });
    if (observed.observation.status !== 'present' || !observed.bytes
      || !isDeepStrictEqual(parseCompatibilityArtifact(observed.observation.artifact), parseCompatibilityArtifact(peer))) {
      throw new Error('Registry peer differs from the frozen independent plugin input.');
    }
    fs.writeFileSync(tarball, observed.bytes, { flag: 'wx' });
  }
  const text = JSON.stringify({ schemaVersion: packageArtifactInputSchema, artifact: peer, tarball }) + '\n';
  if (fs.existsSync(peerFile) && fs.readFileSync(peerFile, 'utf8') !== text) throw new Error('Frozen plugin peer input changed.');
  if (!fs.existsSync(peerFile)) fs.writeFileSync(peerFile, text, { flag: 'wx' });
  const prepared = await (dependencies.preparePlugin ?? prepareLocalPlugin)({ ...options, peer, peerFile }, dependencies);
  return { ...prepared, peer };
}

export async function prepareLocalPluginPackage(options: any, dependencies: any = {}): Promise<any> {
  const service = path.join(options.repo, 'projects/product/services/buildr');
  const assertCheckout = dependencies.assertCheckout ?? assertFrozenCandidateCheckout;
  assertCheckout(service, options.sourceCommit);
  if (!options.plan?.requirements.plugin || options.plan.requirements.buildr) throw new Error('Expected an independent plugin plan.');
  const rulesDirectory = path.join(service, 'build/verification/candidates', options.sourceCommit, 'local-plugin');
  const verificationRules = retainVerificationRules(path.join(rulesDirectory, 'verification-rules.json'),
    (dependencies.currentRules ?? currentVerificationRules)(options.repo, null, 'plugin', null));
  const prepared = await prepareRegistryPlugin(options, dependencies);
  if (prepared.status !== 'ready') return prepared;
  if (options.previous?.sourceCommit === options.sourceCommit && options.previous.artifactSha256 !== prepared.artifactSha256) {
    throw new Error('Independent plugin original changed after its first observation.');
  }
  const handoffDirectory = path.join(service, 'build/verification/candidates', options.sourceCommit, 'local-plugin/handoff');
  const handoff = createPackageHandoff({ output: handoffDirectory, kind: 'plugin', sourceCommit: options.sourceCommit,
    sourceTree: options.sourceTree, platform: options.platform, artifactSha256: prepared.artifactSha256,
    files: prepared.files, plugin: prepared.plugin, verificationRules });
  try {
    (dependencies.preflight ?? preflightLocalConsumption)({ repo: options.repo, sourceCommit: options.sourceCommit, sourceTree: options.sourceTree,
      directory: path.join(rulesDirectory, 'consumption-preflight'), handoff, pluginDirectory: prepared.directory,
      expectedPeer: options.peer }, dependencies);
  } catch (error: any) {
    return { status: 'local-consumption-preflight-required', nextActions: [`插件正式消费预演未通过：${error.message}；保留原包，不重新构建 SDK 或打包。`] };
  }
  assertCheckout(service, options.sourceCommit);
  const platforms = localPackagePlatform(options.platform);
  return { status: 'ready', kind: 'plugin', executionModel: LOCAL_PACKAGE_MODEL, sourceCommit: options.sourceCommit,
    artifactSha256: prepared.artifactSha256, artifactDirectory: prepared.directory,
    localRunner: platforms.local, remoteRunner: platforms.remote, runner: platforms.runner,
    handoffDirectory, handoffIdentity: handoff.identity };
}
