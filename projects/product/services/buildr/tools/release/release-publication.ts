#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { RELEASE_CHECKS, runReleaseConsumer, inspectReleaseConsumerArtifact, validateReleaseCheckDefinitions, type ReleaseInitialCheckId, type ReleaseEffectCheckId } from './release-consumption.ts';
import { validateReleaseContext, evaluateReleaseReadiness } from './release-readiness.ts';
import { runReleaseAuthorityOidcProbe } from './release-authority-oidc-probe.ts';
import { checkReleaseConvergence } from './release-convergence.ts';
import { ensureReleaseTag, inspectReleaseTag } from './release-tag-ensure.ts';
import { ensureGitHubRelease } from './github-release-ensure.ts';
import { registryVersionState, registryDistTagsState, assertRegistryArtifact, waitForRegistryRelease } from './registry-version-state.ts';
import { publishFrozenArtifact } from './trusted-publish.ts';
import { extractReleaseNotes } from './release-notes.ts';
import { createReleaseTransactionEvidence } from './release-transaction-evidence.ts';
import { containsCredentialMaterial } from './release-authority.ts';
import { inspectReleaseSourceProvenance } from './release-selection.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../../../..');

function save(file: string, value: any): void {
  if (containsCredentialMaterial(value)) throw new Error('Release evidence cannot contain credentials.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

async function executeChecks(checks: readonly any[], handlers: Record<string, () => any>, checkpoint: (value: any) => void) {
  const steps: any[] = [];
  const effects: any[] = [];
  for (const check of checks) if (!handlers[check.id]) throw new Error(`Release check ${check.id} has no implementation.`);
  for (const check of checks) {
    const step: any = { id: check.id, status: 'running', startedAt: new Date().toISOString(), durationMs: 0 };
    steps.push(step);
    const started = Date.now();
    checkpoint({ steps, effects });
    process.stdout.write(`[release] ${check.id} started\n`);
    try {
      const value = await handlers[check.id]!();
      effects.push(...(value?.effects || []));
      if (value?.status === 'blocked' || value?.ok === false) throw Object.assign(new Error(value.diagnostic?.message || value.nextActions?.join(' ') || `Release check ${check.id} failed.`), { code: value.diagnostic?.code, effects: [] });
      step.status = 'passed';
    } catch (error: any) {
      effects.push(...(error.effects || []));
      step.status = 'failed';
      step.failureCode = error.code || 'release-check-failed';
      step.durationMs = Date.now() - started;
      checkpoint({ steps, effects });
      return { status: 'failed', steps, effects, failure: { check: check.id, code: step.failureCode, message: error.message } };
    }
    step.durationMs = Date.now() - started;
    step.finishedAt = new Date().toISOString();
    checkpoint({ steps, effects });
    process.stdout.write(`[release] ${check.id} passed (${step.durationMs}ms)\n`);
  }
  return { status: 'passed', steps, effects, failure: null };
}

// The protected caller owns real authorization. Tests exercise these effects
// against temporary Git and local HTTP services without fabricating OIDC.
export async function completePublicationEffects(options: any, dependencies: any = {}): Promise<any> {
  const { context, artifact, repo, token } = options;
  const version = context.release.version;
  const npmTag = version.includes('-') ? 'next' : 'latest';
  const notes = options.notes ?? extractReleaseNotes(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8'), version);
  const expectedRelease = { repository: context.workflow.repository, tag: `v${version}`, title: `v${version}`, body: notes, prerelease: version.includes('-'), targetCommit: context.convergence.mainCommit };
  const values: any = {};
  const checkpoint = options.checkpoint ?? (() => {});
  const handlers: Record<ReleaseEffectCheckId, () => unknown> = {
    'registry-state': async () => {
      values.beforeTags = await registryDistTagsState(artifact.manifest.packageName, dependencies.fetchImpl);
      const observed = await registryVersionState(artifact.manifest.packageName, version, dependencies.fetchImpl);
      assertRegistryArtifact(observed, artifact.manifest);
      values.registry = observed;
    },
    'tag-state': () => {
      values.tag = ensureReleaseTag({ repo, tag: `v${version}`, sourceCommit: context.convergence.mainCommit }, dependencies.gitDependencies);
      return values.tag;
    },
    'github-release-state': () => ensureGitHubRelease(expectedRelease, { token, mode: 'preflight', fetchImpl: dependencies.fetchImpl }),
    'npm-publish': async () => {
      const published = await publishFrozenArtifact({ manifestPath: artifact.manifestPath, npmTag }, { ...dependencies,
        onEffects: (effects: any[]) => checkpoint({ pendingEffects: effects }),
      });
      if (published.registry) values.registry = published.registry;
      return published;
    },
    'registry-readback': async () => {
      values.registry = await waitForRegistryRelease({ packageName: artifact.manifest.packageName, version, npmTag, integrity: artifact.manifest.integrity, beforeTags: values.beforeTags }, { fetchImpl: dependencies.fetchImpl, ...dependencies.registryWait });
    },
    'github-release-write': async () => {
      values.githubRelease = await ensureGitHubRelease(expectedRelease, { token, fetchImpl: dependencies.fetchImpl });
      return values.githubRelease;
    },
    'registry-install': async () => {
      values.registrySmoke = await (dependencies.registryInstall ?? (() => runReleaseConsumer('registry', { packageSpec: `${artifact.manifest.packageName}@${version}` })))();
      return values.registrySmoke;
    },
  };
  const checks = RELEASE_CHECKS.filter(check => check.phase === 'protected' || check.phase === 'post-publication');
  const result = await executeChecks(checks, handlers, checkpoint);
  // Read-only recovery after an error must preserve a successful Registry write
  // even when a later metadata/readback/installation check failed.
  try { values.registry = await registryVersionState(artifact.manifest.packageName, version, dependencies.fetchImpl); }
  catch { /* Keep the last confirmed observation; do not replace it with absent. */ }
  return { ...result, values };
}

export async function runReleasePublication(options: any, dependencies: any = {}): Promise<any> {
  validateReleaseCheckDefinitions();
  const repo = path.resolve(options.repo || repositoryRoot);
  const context = validateReleaseContext(options.context);
  const artifact = inspectReleaseConsumerArtifact(options.manifestPath).artifact;
  const phases: any[] = [];
  const effects: any[] = [];
  let pendingEffects: any[] = [];
  const journal = path.join(options.outputDirectory, 'publication-steps.json');
  const checkpoint = (value: any) => {
    if (value.pendingEffects) pendingEffects = value.pendingEffects;
    else if (value.steps) pendingEffects = [];
    save(journal, { schemaVersion: 'buildr.release-publication-steps/v1', contextIdentity: context.identity, steps: [...phases, ...(value.steps || [])], effects: [...effects, ...(value.effects || []), ...pendingEffects] });
  };
  let authority: any;
  const initial = await executeChecks(RELEASE_CHECKS.filter(check => ['pre-publication', 'protected-authority'].includes(check.phase)), {
    'artifact-readback': () => {
      if (artifact.manifest.version !== context.release.version) throw new Error('Protected artifact version differs from the frozen release.');
      for (const field of ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest']) if (artifact.manifest[field] !== context.artifact[field]) throw new Error(`Protected artifact ${field} mismatches the frozen Candidate.`);
      const readiness = evaluateReleaseReadiness({ stage: 'pre-tag', context });
      if (readiness.status !== 'ready') throw new Error(`Frozen context is not ready: ${readiness.findings.map((item: any) => item.code).join(', ')}`);
    },
    'publication-authority': async () => {
      authority = await runReleaseAuthorityOidcProbe({ repo, sourceCommit: context.convergence.mainCommit, workflowSha256: context.workflow.digest.slice(7) }, {
        fetchImpl: (url: any, init: any) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
      });
      save(path.join(options.outputDirectory, 'release-authority.json'), authority);
      return authority;
    },
    'source-convergence': () => {
      const convergence = checkReleaseConvergence({ repo, version: context.release.version, candidateBase: context.release.sourceCommit, candidateTree: context.release.sourceTree,
        stage: 'pre-tag', authorityEvidence: authority, publicationSourceCommit: context.convergence.mainCommit });
      if (convergence.ok) inspectReleaseSourceProvenance({ repo, sourceCommit: context.release.sourceCommit, generation: context.selection.generation, devRef: 'origin/dev' });
      return convergence;
    },
  } satisfies Record<ReleaseInitialCheckId, () => unknown>, checkpoint);
  phases.push(...initial.steps);
  effects.push(...initial.effects);
  let completed: any = initial;
  if (initial.status === 'passed') {
    completed = await completePublicationEffects({ context, artifact, repo, token: options.token, checkpoint }, dependencies);
    phases.push(...completed.steps);
    effects.push(...completed.effects);
  }
  let tagCommit: string | null = null;
  try {
    const observed = inspectReleaseTag({ repo, tag: `v${context.release.version}`, sourceCommit: context.convergence.mainCommit });
    tagCommit = observed.observed?.targetCommit ?? null;
  } catch { /* Unknown is not absent and is recorded by the phase result. */ }
  let registry = completed.values?.registry;
  try { registry = await registryVersionState(artifact.manifest.packageName, artifact.manifest.version); }
  catch { /* Preserve an already confirmed publication, if any. */ }
  const evidence = createReleaseTransactionEvidence({ context, publish: options.publish, outcome: completed.status, publicFacts: {
    version: context.release.version, tagCommit, npmDistTag: context.release.version.includes('-') ? 'next' : 'latest',
    registryPublished: registry?.published === true, registryIntegrity: registry?.published ? registry.integrity : null,
    registryObservation: registry ? (registry.published ? 'present' : 'absent') : 'unknown',
    githubRelease: completed.values?.githubRelease || effects.some(effect => effect.type === 'github-release-created' && effect.state === 'confirmed') ? `https://github.com/${context.workflow.repository}/releases/tag/v${context.release.version}` : null,
    registrySmoke: completed.values?.registrySmoke?.status === 'passed' ? 'passed' : 'unknown',
    steps: phases, effects,
    conflict: Boolean((tagCommit && tagCommit !== context.convergence.mainCommit) || (registry?.published && registry.integrity !== artifact.manifest.integrity) || completed.failure?.code?.includes('conflict')),
  } });
  save(path.join(options.outputDirectory, 'release-transaction-evidence.json'), evidence);
  return { status: completed.status, evidence, effects, failure: completed.failure };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [contextFile, manifestPath, outputDirectory] = process.argv.slice(2);
  if (!contextFile || !manifestPath || !outputDirectory) throw new Error('Usage: release-publication.ts <context> <artifact-manifest> <output-directory>');
  const result = await runReleasePublication({ context: JSON.parse(fs.readFileSync(contextFile, 'utf8')), manifestPath, outputDirectory, token: process.env.GITHUB_TOKEN,
    publish: { repository: process.env.GITHUB_REPOSITORY, workflow: '.github/workflows/publish.yml', runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, headSha: process.env.GITHUB_SHA },
  });
  process.stdout.write(`${JSON.stringify({ status: result.status, evidenceIdentity: result.evidence.identity, effects: result.effects, failure: result.failure })}\n`);
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
