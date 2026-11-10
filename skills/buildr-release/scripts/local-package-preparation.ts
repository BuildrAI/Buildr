import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readReleaseArtifact } from './release-artifact.ts';
import { artifactFromTarball, packageArtifactInputSchema } from './package-artifact-observation.ts';
import { prepareLocalPlugin, prepareRegistryPlugin } from './local-plugin-preparation.ts';
import { prepareLocalSourceVerification } from '../../../projects/product/services/buildr/test/verification/local-source-verification.ts';
import { decodeCandidateSourceImport } from '../../../projects/product/services/buildr/test/verification/candidate-source-reuse.ts';
import { readCandidateArtifactImports } from '../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts';
import { assertFrozenCandidateCheckout } from '../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts';
import { parseCandidateDeclaredScope } from '../../../projects/product/services/buildr/test/verification/candidate-declared-scope.ts';
import { verificationSteps, CANDIDATE_CI_HOST_NODE_TUPLES } from '../../../projects/product/services/buildr/test/verification/registry.ts';
import { assertPublicHandoffData, createPackageHandoff, localPackagePlatform, LOCAL_PACKAGE_MODEL, LOCAL_PLATFORM_POLICY } from './local-package-handoff.ts';
import { currentVerificationRules, retainVerificationRules } from '../../../projects/product/services/buildr/test/verification/release/verification-rules.ts';
import { preflightLocalConsumption } from './local-consumption-preflight.ts';

const write = (file: string, value: any) => fs.writeFileSync(file, JSON.stringify(value) + '\n');

/** One frozen decision is consumed by source, local artifact, remote artifact and publication. */
export function localPackageVerificationScope(options: any, previous?: any): any {
  const requested = options.excludedBoundaries?.length || options.selectedChecks?.length;
  if (!requested) return previous ?? null;
  const selected = options.selectedChecks ? new Set<string>(options.selectedChecks) : null;
  const value = parseCandidateDeclaredScope(JSON.stringify({
    excludedBoundaries: options.excludedBoundaries ?? [],
    excludedEvidenceIds: options.excludedBoundaries?.includes('E2E') || selected && !selected.has('host-node-compatibility')
      ? CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => tuple.id) : [],
    excludedStepIds: selected ? verificationSteps.filter((step: any) => step.profiles.includes('candidate')
      && step.executor?.type !== 'candidate-artifact' && !selected.has(step.id)).map((step: any) => step.id) : [],
    statement: options.scopeStatement || (selected ? `用户指定本轮只执行：${[...selected].sort().join(', ')}` : ''),
  }));
  if (previous && previous.identity !== value.identity) throw new Error('Verification scope is frozen with the local package; explicitly start a new selection to change it.');
  return value;
}

export async function prepareLocalMainPackage(options: {
  repo: string; workspace: string; roundId: string; sourceCommit: string; sourceTree: string;
  sourceFile?: string; base?: string; platform?: NodeJS.Platform; scope?: any; plan?: any; previous?: any; peer?: any;
}, dependencies: any = {}): Promise<any> {
  const platforms = localPackagePlatform(options.platform);
  const service = path.join(options.repo, 'projects/product/services/buildr');
  const directory = path.join(service, 'build/verification/candidates', options.sourceCommit);
  const packageDirectory = path.join(directory, 'candidate-package');
  const evidenceDirectory = path.join(directory, 'local-evidence');
  const verificationRules = retainVerificationRules(path.join(directory, 'verification-rules.json'),
    (dependencies.currentRules ?? currentVerificationRules)(options.repo, options.scope, 'buildr', LOCAL_PLATFORM_POLICY));
  const sourceFile = options.sourceFile ?? path.join(options.workspace, 'projects/product/services/buildr/build/verification/candidate-rounds', `${options.roundId}.json`);
  const excluded = new Set<string>(options.scope?.excludedBoundaries ?? []);
  const excludedSteps = new Set<string>(options.scope?.excludedStepIds ?? []);
  const selectedStepIds = options.scope ? verificationSteps.filter((step: any) => step.profiles.includes('candidate')
    && (step.executor?.type === 'candidate-artifact' || !excluded.has(step.testing?.executionBoundary) && !excludedSteps.has(step.id))).map((step: any) => step.id) : undefined;
  const source = await (dependencies.prepareSource ?? prepareLocalSourceVerification)({
    repo: options.repo, sourceFile, roundId: options.roundId, base: options.base, platform: options.platform,
    packages: ['buildr', ...(options.plan?.requirements.plugin ? ['dsh-plugin'] : [])],
    ...(selectedStepIds ? { selectedStepIds } : {}),
  });
  if (source.status !== 'ready') return { ...source, status: 'local-verification-required' };
  (dependencies.assertCheckout ?? assertFrozenCandidateCheckout)(service, options.sourceCommit);
  const env = { ...process.env, BUILDR_CANDIDATE_SOURCE_SHA: options.sourceCommit,
    ...(options.scope ? { BUILDR_CANDIDATE_VERIFICATION_SCOPE: JSON.stringify(options.scope) } : {}) };
  const execute = dependencies.execute ?? ((command: string, args: string[], settings: any) => spawnSync(command, args, settings));
  const read = dependencies.readArtifact ?? readReleaseArtifact;
  let artifact: any;
  const manifestFile = path.join(packageDirectory, 'release-artifact.json');
  if (fs.existsSync(manifestFile)) artifact = read(manifestFile);
  else {
    if (fs.existsSync(packageDirectory) && fs.readdirSync(packageDirectory).some(file => file.endsWith('.tgz'))) {
      throw new Error('Local package production was interrupted before its manifest; preserve and diagnose it, do not silently repack.');
    }
    artifact = await (dependencies.createPackage ?? (async () => {
      const commands = [
        [path.join(service, 'tools/development/prepare-development-dependencies.ts')],
        [path.join(options.repo, 'skills/buildr-release/scripts/local-package-build.ts'), packageDirectory],
      ];
      for (const args of commands) {
        process.stderr.write(`[release] ${args[0].endsWith('local-package-build.ts') ? 'local-package-build' : 'local-package-environment'} source=${options.sourceCommit}\n`);
        const result = execute(process.execPath, args, { cwd: service, env, encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 64 * 1024 * 1024 });
        if (result.stdout) process.stdout.write(String(result.stdout));
        if (result.stderr) process.stderr.write(String(result.stderr));
        if (result.error || result.status !== 0) throw new Error('Frozen local package production failed; retain its output and diagnose without repacking.');
      }
      return read(manifestFile);
    }))(service, packageDirectory);
  }
  if (artifact.manifest.sourceCommit !== options.sourceCommit || options.previous
    && options.previous.sourceCommit === options.sourceCommit && options.previous.artifactSha256 !== artifact.manifest.sha256) {
    throw new Error('Local package bytes differ from their frozen source or previous observation.');
  }
  dependencies.onArtifactProduced?.({ sourceCommit: options.sourceCommit, artifactSha256: artifact.manifest.sha256, artifactDirectory: packageDirectory });
  process.stderr.write(`[release] local-package-verification source=${options.sourceCommit} sha256=${artifact.manifest.sha256}\n`);
  const verification = execute(process.execPath, [path.join(service, 'test/verification/artifact.ts'),
    '--artifact-dir', packageDirectory, '--output', evidenceDirectory], {
    cwd: service, env, encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (verification.stdout) process.stdout.write(String(verification.stdout));
  if (verification.stderr) process.stderr.write(String(verification.stderr));
  // Consumer checks intentionally install production-only verifier dependencies.
  // Restore the owned source environment before adopting its existing proofs or
  // returning a failure; never rewrite proof identities to hide that transition.
  const restored = execute(process.execPath, [path.join(service, 'tools/verification/candidate-environment.ts'),
    'prepare', '--profile', 'base'], {
    cwd: service, env, encoding: 'utf8', timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (restored.stdout) process.stdout.write(String(restored.stdout));
  if (restored.stderr) process.stderr.write(String(restored.stderr));
  if (restored.error || restored.status !== 0) return { status: 'local-source-environment-required',
    localArtifact: { artifactDirectory: packageDirectory, evidenceDirectory, artifact: artifact.manifest },
    nextActions: ['恢复本机源码验证依赖环境后接续；保留原包与全部验收结果，不重新制包或改写证明。'] };
  if (verification.error || verification.status !== 0) return { status: 'local-artifact-verification-required',
    localArtifact: { artifactDirectory: packageDirectory, evidenceDirectory, artifact: artifact.manifest },
    nextActions: ['修复本机原包验收失败后继续同一 prepare；现有 artifact.ts 采用有效结果，不重新制包。'] };
  fs.mkdirSync(directory, { recursive: true });
  const artifactImports = (dependencies.readArtifactImports ?? readCandidateArtifactImports)(evidenceDirectory);
  // A green child exit alone never substitutes for the actual complete proof.
  const { createLocalArtifactPlan } = await import('../../../projects/product/services/buildr/test/verification/artifact.ts');
  const localPlan = createLocalArtifactPlan(options.platform, { verificationScope: options.scope });
  if (localPlan.nodes.some((node: any) => !artifactImports.some((item: any) => item.id === node.id && item.status === 'passed'))) {
    throw new Error('Local package verification returned without its complete evidence.');
  }
  const peer = artifactFromTarball(fs.readFileSync(artifact.tarball), {
    origin: 'candidate', packageName: artifact.manifest.packageName, version: artifact.manifest.version,
    integrity: artifact.manifest.integrity, sourceCommit: options.sourceCommit,
  });
  const files: Array<{ path: string; source: string }> = [
    { path: `candidate-package/${artifact.manifest.filename}`, source: artifact.tarball },
    { path: 'candidate-package/release-artifact.json', source: artifact.manifestPath },
    { path: 'candidate-package/npm-pack.json', source: artifact.packMetadataPath ?? artifact.metadataPath ?? path.join(packageDirectory, 'npm-pack.json') },
  ];
  const sourcePacket = path.join(directory, 'source-verification.json'), artifactPacket = path.join(directory, 'artifact-verification.json');
  assertPublicHandoffData(decodeCandidateSourceImport(source.transport));
  write(sourcePacket, { transport: source.transport });
  write(artifactPacket, { evidence: artifactImports });
  files.push({ path: 'source-verification.json', source: sourcePacket }, { path: 'artifact-verification.json', source: artifactPacket });
  let plugin: any = null;
  let pluginDirectory: string | undefined;
  if (options.plan?.requirements.plugin) {
    const peerFile = path.join(directory, 'buildr-peer.json');
    write(peerFile, { schemaVersion: packageArtifactInputSchema, artifact: peer, tarball: artifact.tarball });
    const pluginOptions = { repo: options.repo,
      sourceCommit: options.sourceCommit, roundId: options.roundId, plan: options.plan, peer, peerFile,
      scope: options.scope, sourcePacket };
    const preparedPlugin = options.plan.selection.packages.includes('buildr')
      ? await (dependencies.preparePlugin ?? prepareLocalPlugin)(pluginOptions, { execute })
      : await prepareRegistryPlugin({ ...pluginOptions, peer: options.peer }, { execute, ...dependencies });
    if (preparedPlugin.status !== 'ready') return preparedPlugin;
    plugin = preparedPlugin.plugin;
    pluginDirectory = preparedPlugin.directory;
    files.push(...preparedPlugin.files);
  }
  const handoffDirectory = path.join(directory, 'handoff');
  let handoff: any;
  try {
    handoff = createPackageHandoff({ output: handoffDirectory, sourceCommit: options.sourceCommit, sourceTree: options.sourceTree,
      platform: options.platform, artifactSha256: artifact.manifest.sha256, files, verificationScope: options.scope, plugin,
      platformPolicy: LOCAL_PLATFORM_POLICY, verificationRules, consume: input =>
        (dependencies.preflight ?? preflightLocalConsumption)({ repo: options.repo, sourceCommit: options.sourceCommit, sourceTree: options.sourceTree,
          directory: path.join(directory, 'consumption-preflight'), handoff: input, artifactDirectory: packageDirectory,
          sourcePacket, artifactPacket, pluginDirectory, expectedPeer: options.plan?.selection.packages.includes('buildr') ? peer : options.peer,
          roundId: options.roundId }, { execute })?.consumption });
  } catch (error: any) {
    return { status: 'local-consumption-preflight-required', nextActions: [`正式消费预演未通过：${error.message}；保留原包和证明，修正读取／契约后接续，不重新制包。`] };
  }
  (dependencies.assertCheckout ?? assertFrozenCandidateCheckout)(service, options.sourceCommit);
  return { status: 'ready', executionModel: LOCAL_PACKAGE_MODEL, sourceCommit: options.sourceCommit, artifactSha256: artifact.manifest.sha256,
    platformPolicy: LOCAL_PLATFORM_POLICY,
    localRunner: platforms.local, remoteRunner: platforms.remote, runner: platforms.runner, artifactDirectory: packageDirectory,
    evidenceDirectory, handoffDirectory, handoffIdentity: handoff.identity };
}
