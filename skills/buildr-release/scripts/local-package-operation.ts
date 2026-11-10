import { prepareLocalMainPackage, localPackageVerificationScope } from './local-package-preparation.ts';
import { createPackageHandoffCommit, LOCAL_PACKAGE_DISPATCH_WORKFLOW, LOCAL_PLATFORM_POLICY } from './local-package-handoff.ts';
import { pushReleaseBranch } from './release-git-convergence.ts';
import fs from 'node:fs';
import path from 'node:path';
import { readReleaseArtifact } from './release-artifact.ts';
import { validatePackageHandoff } from './local-package-handoff.ts';
import { prepareLocalPluginPackage } from './local-plugin-preparation.ts';
import { readReleaseCandidate } from './dsh-plugin/release-candidate.ts';

/** New preparation has one local producer and one data-only remote consumer. */
export async function continueLocalPackageCandidate(input: any, dependencies: any): Promise<any> {
  const { state, save, effects, git, gh, execute } = dependencies;
  state.localPackageScope = localPackageVerificationScope(input.options, state.localPackageScope);
  save();
  const retained = state.localPackage?.sourceCommit === input.sourceCommit && state.candidate?.dispatchRequested;
  let prepared = state.localPackage;
  if (retained) {
    const artifact = prepared.kind === 'plugin'
      ? (dependencies.readPluginArtifact ?? readReleaseCandidate)(path.join(prepared.artifactDirectory, 'candidate.json'))
      : (dependencies.readArtifact ?? readReleaseArtifact)(path.join(prepared.artifactDirectory, 'release-artifact.json'));
    const handoff = (dependencies.readHandoff ?? ((directory: string) => validatePackageHandoff(JSON.parse(fs.readFileSync(path.join(directory, 'handoff.json'), 'utf8')))))(prepared.handoffDirectory);
    if (artifact.manifest.sha256 !== prepared.artifactSha256 || handoff.identity !== prepared.handoffIdentity
      || (handoff.verificationScope?.identity ?? null) !== (state.localPackageScope?.identity ?? null)) throw new Error('Retained local original or verification scope changed.');
  } else prepared = await (dependencies.preparePackage ?? (input.plan?.requirements.buildr === false ? prepareLocalPluginPackage : prepareLocalMainPackage))({
    repo: input.repo, workspace: input.workspace, roundId: input.key, sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree, sourceFile: input.options.sourceVerification, base: input.baseline,
    platform: dependencies.platform, scope: state.localPackageScope, plan: input.plan, peer: state.preparationPeer,
    previous: state.localPackage ?? state.localPackageProduction,
  }, { ...dependencies.preparationDependencies, onArtifactProduced: (receipt: any) => { state.localPackageProduction = receipt; save(); } });
  if (prepared.status !== 'ready') return prepared;
  if (state.localPackage?.handoffIdentity && state.localPackage.sourceCommit === input.sourceCommit
    && state.localPackage.handoffIdentity !== prepared.handoffIdentity) throw new Error('Frozen local package or evidence changed after remote dispatch.');
  state.localPackage = prepared;
  const pointer = state.candidate;
  pointer.workflow ??= LOCAL_PACKAGE_DISPATCH_WORKFLOW;
  const workflowFile = pointer.workflow.split('/').at(-1);
  if (!pointer.packageData) {
    const data = (dependencies.createDataCommit ?? createPackageHandoffCommit)(input.repo, prepared.handoffDirectory);
    pointer.packageData = { commit: data.commit, identity: data.manifest.identity,
      branch: `${pointer.branch}-input-${prepared.artifactSha256.slice(0, 12)}` };
    save();
  }
  if (pointer.packageData.identity !== prepared.handoffIdentity) throw new Error('Package data reference differs from the prepared original.');
  const reference = `refs/heads/${pointer.packageData.branch}`;
  if (!pointer.packageData.pushed) {
    const before = git(['ls-remote', 'origin', reference], input.repo).split(/\s/u)[0] || null;
    if (before && before !== pointer.packageData.commit) throw new Error('Immutable package data reference already points to different bytes.');
    if (!before) {
      process.stderr.write(`[release] local-package-upload source=${input.sourceCommit} sha256=${prepared.artifactSha256}\n`);
      (dependencies.pushData ?? pushReleaseBranch)({ repo: input.repo, branch: pointer.packageData.branch, commit: pointer.packageData.commit, before: null },
        { execute: (command: string, args: string[], options: any) => execute(command, args,
          { ...options, ...(command === 'git' && args[0] === 'push' ? { timeout: 10 * 60_000 } : {}) }) }, effects);
    }
    pointer.packageData.pushed = true; save();
  }
  if (!pointer.runId) {
    const find = () => JSON.parse(gh(['run', 'list', '--repo', 'BuildrAI/Buildr', '--workflow', workflowFile,
      '--branch', pointer.branch, '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,headSha']))
      .find((run: any) => run.headSha === input.sourceCommit && !(pointer.previousRunIds ?? []).includes(run.databaseId));
    let existing = pointer.dispatchRequested ? find() : null;
    if (!existing && !pointer.dispatchRequested) {
      dependencies.ensureCarrier(pointer.branch);
      pointer.previousRunIds = JSON.parse(gh(['run', 'list', '--repo', 'BuildrAI/Buildr', '--workflow', workflowFile,
        '--branch', pointer.branch, '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId'])).map((run: any) => run.databaseId);
      const data = { source_tree: input.sourceTree, package_commit: pointer.packageData.commit,
        package_identity: prepared.handoffIdentity, package_sha256: prepared.artifactSha256, remote_runner: prepared.runner,
        preserve_only: prepared.kind === 'plugin' || prepared.platformPolicy === LOCAL_PLATFORM_POLICY };
      pointer.dispatchArgs = ['workflow', 'run', workflowFile, '--repo', 'BuildrAI/Buildr', '--ref', pointer.branch,
        '-f', `selection_id=${input.key}`, ...(workflowFile === 'verify.yml'
          ? ['-f', 'purpose=local-package', '-f', `local_package=${JSON.stringify(data)}`]
          : Object.entries(data).flatMap(([key, value]) => ['-f', `${key}=${value}`]))];
      pointer.dispatchRequested = true; save();
      const effect = { type: data.preserve_only ? 'package-preservation-dispatched' : 'package-verification-dispatched', sourceCommit: input.sourceCommit, state: 'unknown' };
      effects.push(effect);
      gh(pointer.dispatchArgs, input.repo); effect.state = 'confirmed';
      existing = find();
    }
    if (!existing) return { status: 'candidate-dispatch-unconfirmed', nextActions: ['回读同一对端验包请求，不重新制包或重复派发。'] };
    pointer.runId = Number(existing.databaseId); save();
  }
  return { status: 'ready' };
}
