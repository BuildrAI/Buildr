import fs from 'node:fs';
import path from 'node:path';
import { readReleaseArtifact } from './release-artifact.ts';
import { artifactFromTarball, packageArtifactInputSchema } from './package-artifact-observation.ts';
import { prepareLocalPlugin, prepareRegistryPlugin } from './local-plugin-preparation.ts';
import { importFrozenVerificationModule } from './frozen-verification-modules.ts';
import { parseCandidateDeclaredScope } from '../../../projects/product/services/buildr/test/verification/candidate-declared-scope.ts';
import { verificationSteps, CANDIDATE_CI_HOST_NODE_TUPLES } from '../../../projects/product/services/buildr/test/verification/registry.ts';
import { assertPublicHandoffData, createPackageHandoff, localPackagePlatform, LOCAL_PACKAGE_MODEL, LOCAL_PLATFORM_POLICY } from './local-package-handoff.ts';
import { preflightLocalConsumption } from './local-consumption-preflight.ts';

const write = (file: string, value: any) => fs.writeFileSync(file, JSON.stringify(value) + '\n');

function buildVerificationScope(
  options: any,
  tuples: readonly any[],
  steps: readonly any[],
  parseScope: (raw: string) => any,
  previous?: any,
): any {
  const requested = options.excludedBoundaries?.length || options.selectedChecks?.length;
  if (!requested) return previous ?? null;
  const selected = options.selectedChecks ? new Set<string>(options.selectedChecks) : null;
  const value = parseScope(JSON.stringify({
    excludedBoundaries: options.excludedBoundaries ?? [],
    excludedEvidenceIds: options.excludedBoundaries?.includes('E2E') || selected && !selected.has('host-node-compatibility')
      ? tuples.map((tuple: any) => tuple.id) : [],
    excludedStepIds: selected ? steps.filter((step: any) => step.profiles.includes('candidate')
      && step.executor?.type !== 'candidate-artifact' && !selected.has(step.id)).map((step: any) => step.id) : [],
    statement: options.scopeStatement || (selected ? `用户指定本轮只执行：${[...selected].sort().join(', ')}` : ''),
  }));
  if (previous && previous.identity !== value.identity) throw new Error('Verification scope is frozen with the local package; explicitly start a new selection to change it.');
  return value;
}

/** One frozen decision is consumed by source, local artifact, remote artifact and publication. */
export function localPackageVerificationScope(options: any, previous?: any): any {
  return buildVerificationScope(options, CANDIDATE_CI_HOST_NODE_TUPLES, verificationSteps, parseCandidateDeclaredScope, previous);
}

/** Frozen-checkout-aware variant that prefers the candidate worktree's registry and scope parser. */
export async function resolveLocalPackageVerificationScope(options: any, previous?: any, repo?: string): Promise<any> {
  const requested = options.excludedBoundaries?.length || options.selectedChecks?.length;
  if (!requested) return previous ?? null;
  const [registryMod, scopeMod] = await Promise.all([
    importFrozenVerificationModule(repo, 'registry.ts', () => import('../../../projects/product/services/buildr/test/verification/registry.ts')),
    importFrozenVerificationModule(repo, 'candidate-declared-scope.ts', () => import('../../../projects/product/services/buildr/test/verification/candidate-declared-scope.ts')),
  ]);
  return buildVerificationScope(options, registryMod.CANDIDATE_CI_HOST_NODE_TUPLES, registryMod.verificationSteps, scopeMod.parseCandidateDeclaredScope, previous);
}

export async function prepareLocalMainPackage(options: {
  repo: string; workspace: string; roundId: string; sourceCommit: string; sourceTree: string;
  sourceFile?: string; base?: string; platform?: NodeJS.Platform; scope?: any; plan?: any; previous?: any; peer?: any;
}, dependencies: any = {}): Promise<any> {
  const [
    { runVerificationStep },
    { prepareLocalSourceVerification },
    { decodeCandidateSourceImport },
    { readCandidateArtifactImports, assertFrozenCandidateCheckout },
    { verificationSteps: frozenSteps },
    { currentVerificationRules, retainVerificationRules },
    { readCandidateRound },
    { createLocalArtifactPlan },
  ] = await Promise.all([
    importFrozenVerificationModule(options.repo, 'timing/parallel-runner.ts', () => import('../../../projects/product/services/buildr/test/verification/timing/parallel-runner.ts')),
    importFrozenVerificationModule(options.repo, 'local-source-verification.ts', () => import('../../../projects/product/services/buildr/test/verification/local-source-verification.ts')),
    importFrozenVerificationModule(options.repo, 'candidate-source-reuse.ts', () => import('../../../projects/product/services/buildr/test/verification/candidate-source-reuse.ts')),
    importFrozenVerificationModule(options.repo, 'candidate-artifact-reuse.ts', () => import('../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts')),
    importFrozenVerificationModule(options.repo, 'registry.ts', () => import('../../../projects/product/services/buildr/test/verification/registry.ts')),
    importFrozenVerificationModule(options.repo, 'release/verification-rules.ts', () => import('../../../projects/product/services/buildr/test/verification/release/verification-rules.ts')),
    importFrozenVerificationModule(options.repo, 'candidate-round.ts', () => import('../../../projects/product/services/buildr/test/verification/candidate-round.ts')),
    importFrozenVerificationModule(options.repo, 'artifact.ts', () => import('../../../projects/product/services/buildr/test/verification/artifact.ts')),
  ]);
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
  const selectedStepIds = options.scope ? frozenSteps.filter((step: any) => step.profiles.includes('candidate')
    && (step.executor?.type === 'candidate-artifact' || !excluded.has(step.testing?.executionBoundary) && !excludedSteps.has(step.id))).map((step: any) => step.id) : undefined;
  const source = await (dependencies.prepareSource ?? prepareLocalSourceVerification)({
    repo: options.repo, sourceFile, roundId: options.roundId, base: options.base, platform: options.platform,
    packages: ['buildr', ...(options.plan?.requirements.plugin ? ['dsh-plugin'] : [])], transport: 'file',
    ...(selectedStepIds ? { selectedStepIds } : {}),
  });
  const cost: any = { sourceCommit: options.sourceCommit, artifactSha256: null, stages: [], sourceChecks: [], artifactChecks: null, package: null };
  try {
    const relevant = new Set<string>(source.verificationPlan?.steps?.map(({ id }: any) => id) ?? []);
    cost.sourceChecks = readCandidateRound(sourceFile, options.roundId).records.filter((record: any) => relevant.has(record.identity.stepId)).map((record: any) => {
      const { result, origin, environment } = record;
      return { id: record.identity.stepId, status: result.status, origin, environment, durationMs: result.durationMs ?? null,
        queueDurationMs: result.queueDurationMs ?? null, resources: result.resources ?? null,
        applicability: origin.sourceCommit === options.sourceCommit ? 'same-source-record' : 'earlier-source-record',
        files: result.roundFiles?.map(({ file, status, durationMs, origin }: any) => ({ file, status, durationMs, origin })) ?? [],
        phases: result.phases ?? [] };
    });
  } catch { cost.sourceChecks = null; }
  const retain = () => dependencies.onMeasurements?.(structuredClone(cost));
  retain();
  if (source.status !== 'ready') return { ...source, status: 'local-verification-required' };
  (dependencies.assertCheckout ?? assertFrozenCandidateCheckout)(service, options.sourceCommit);
  const env = { ...process.env, BUILDR_CANDIDATE_SOURCE_SHA: options.sourceCommit,
    ...(options.scope ? { BUILDR_CANDIDATE_VERIFICATION_SCOPE: JSON.stringify(options.scope) } : {}) };
  const execute = async (command: string, args: string[], settings: any) => {
    if (dependencies.execute) return dependencies.execute(command, args, settings);
    const result = await runVerificationStep({ name: path.basename(args[0]), command, args, cwd: settings.cwd,
      env: { ...settings.env, BUILDR_VERIFICATION_SAMPLE_RESOURCES: '1' }, timeoutMs: settings.timeout });
    return { ...result, status: result.status === 'passed' ? 0 : result.exitCode || 1 };
  };
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
        const started = performance.now();
        const result = await execute(process.execPath, args, { cwd: service, env, encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 64 * 1024 * 1024 });
        cost.stages.push({ id: args[0].endsWith('local-package-build.ts') ? 'package-build' : 'dependency-preparation', durationMs: Math.round(performance.now() - started), status: result.status === 0 && !result.error ? 'passed' : 'failed', resources: result.resources ?? null });
        retain();
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
  cost.artifactSha256 = artifact.manifest.sha256;
  try {
    const recorded = JSON.parse(fs.readFileSync(path.join(directory, 'release-package-timing.json'), 'utf8'));
    if (recorded.sourceCommit === options.sourceCommit && recorded.artifactSha256 === cost.artifactSha256) cost.package = recorded;
  } catch { /* A retained original can predate measurements. */ }
  retain();
  dependencies.onArtifactProduced?.({ sourceCommit: options.sourceCommit, artifactSha256: artifact.manifest.sha256, artifactDirectory: packageDirectory });
  process.stderr.write(`[release] local-package-verification source=${options.sourceCommit} sha256=${artifact.manifest.sha256}\n`);
  const consumerDirectory = path.join(directory, 'consumer-env');
  const verificationStarted = performance.now();
  const verification = await execute(process.execPath, [path.join(service, 'test/verification/artifact.ts'),
    '--artifact-dir', packageDirectory, '--output', evidenceDirectory, '--consumer-dir', consumerDirectory], {
    cwd: service, env, encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  cost.stages.push({ id: 'local-artifact-verification', durationMs: Math.round(performance.now() - verificationStarted), status: verification.status === 0 && !verification.error ? 'passed' : 'failed', resources: verification.resources ?? null });
  try {
    const observed = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'release-artifact-timing.json'), 'utf8'));
    if (observed.sourceCommit === options.sourceCommit && observed.artifactSha256 === cost.artifactSha256) cost.artifactChecks = observed;
  } catch { /* Failed or older runs may not retain a timing record. */ }
  retain();
  if (verification.stdout) process.stdout.write(String(verification.stdout));
  if (verification.stderr) process.stderr.write(String(verification.stderr));
  if (verification.error || verification.status !== 0) return { status: 'local-artifact-verification-required',
    localArtifact: { artifactDirectory: packageDirectory, evidenceDirectory, artifact: artifact.manifest },
    nextActions: ['修复本机原包验收失败后继续同一 prepare；现有 artifact.ts 采用有效结果，不重新制包。'] };
  fs.mkdirSync(directory, { recursive: true });
  const artifactImports = (dependencies.readArtifactImports ?? readCandidateArtifactImports)(evidenceDirectory);
  // A green child exit alone never substitutes for the actual complete proof.
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
  assertPublicHandoffData(decodeCandidateSourceImport(source.transport, 'file'));
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
  const handoffStarted = performance.now();
  let handoffStatus = 'failed';
  try {
    let pairEvidence: any[] | undefined;
    const retained = path.join(handoffDirectory, 'handoff.json');
    if (fs.existsSync(retained)) pairEvidence = JSON.parse(fs.readFileSync(retained, 'utf8')).pairEvidence;
    else if (options.plan?.selection.packages.length === 1 && options.plan.selection.packages[0] === 'buildr') {
      const { evaluateObservedPackagePlan } = await import('./package-release-operation.ts');
      const { observePublishedPackageArtifact } = await import('./package-artifact-observation.ts');
      const { normalizeReleaseTargets } = await import('./release-targets.ts');
      const counterpart = await (dependencies.observePairCounterpart ?? observePublishedPackageArtifact)('dsh-plugin');
      const pair = await evaluateObservedPackagePlan(normalizeReleaseTargets({ version: peer.version, selectionId: options.roundId }),
        { buildr: { artifact: peer, bytes: fs.readFileSync(artifact.tarball) } }, { 'dsh-plugin': counterpart },
        { capturePairEvidence: true, verifyBuildrPluginPair: dependencies.verifyBuildrPluginPair });
      if (pair.status !== 'passed') return { status: 'compatibility-blocked', compatibility: pair, nextActions: ['保留原包，只补准确配对证明。'] };
      pairEvidence = pair.pairEvidence;
    }
    handoff = createPackageHandoff({ output: handoffDirectory, sourceCommit: options.sourceCommit, sourceTree: options.sourceTree,
      platform: options.platform, artifactSha256: artifact.manifest.sha256, files, verificationScope: options.scope, plugin,
      platformPolicy: LOCAL_PLATFORM_POLICY, verificationRules, pairEvidence, consume: input =>
        (dependencies.preflight ?? preflightLocalConsumption)({ repo: options.repo, sourceCommit: options.sourceCommit, sourceTree: options.sourceTree,
          directory: path.join(directory, 'consumption-preflight'), handoff: input, artifactDirectory: packageDirectory,
          sourcePacket, artifactPacket, pluginDirectory, expectedPeer: options.plan?.selection.packages.includes('buildr') ? peer : options.peer,
          roundId: options.roundId }, { execute: dependencies.executeConsumptionSync })?.consumption });
    handoffStatus = 'passed';
  } catch (error: any) {
    return { status: 'local-consumption-preflight-required', nextActions: [`正式消费预演未通过：${error.message}；保留原包和证明，修正读取／契约后接续，不重新制包。`] };
  } finally {
    cost.stages.push({ id: 'handoff-and-consumption-preflight', durationMs: Math.round(performance.now() - handoffStarted), status: handoffStatus });
    retain();
  }
  (dependencies.assertCheckout ?? assertFrozenCandidateCheckout)(service, options.sourceCommit);
  return { status: 'ready', executionModel: LOCAL_PACKAGE_MODEL, sourceCommit: options.sourceCommit, artifactSha256: artifact.manifest.sha256,
    platformPolicy: LOCAL_PLATFORM_POLICY,
    localRunner: platforms.local, remoteRunner: platforms.remote, runner: platforms.runner, artifactDirectory: packageDirectory,
    evidenceDirectory, handoffDirectory, handoffIdentity: handoff.identity };
}
