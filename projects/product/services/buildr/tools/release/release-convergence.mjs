#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import {
  containsCredentialMaterial,
  releaseAuthorityEvidenceMaxAgeMs,
  releaseAuthorityProbeSchema,
  releasePackageName,
  releasePublishAuthority,
  releaseWorkflowPath,
  samePublishAuthority,
  sha256,
} from './release-authority.mjs';

function runGit(repo, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result;
}

function rev(repo, ref) {
  return runGit(repo, ['rev-parse', ref]).stdout.trim();
}

function packageVersionAt(repo, ref) {
  const result = runGit(repo, ['show', `${ref}:projects/product/services/buildr/package.json`], { allowFailure: true });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout).version || null; } catch { return null; }
}

function isAncestor(repo, ancestor, descendant) {
  return runGit(repo, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true }).status === 0;
}

function fileAt(repo, ref, file) {
  const result = runGit(repo, ['show', `${ref}:${file}`], { allowFailure: true });
  return result.status === 0 ? result.stdout : null;
}

export function checkReleaseAuthorityEvidence({ evidence, sourceCommit, workflowSource, nowMs = Date.now() }) {
  const findings = [];
  if (!evidence) return [{ code: 'release_authority_evidence_missing', expected: `${releaseAuthorityProbeSchema} ready evidence from the current protected job`, actual: null }];
  if (containsCredentialMaterial(evidence)) findings.push({ code: 'release_authority_evidence_contains_credentials', expected: 'credential-free evidence', actual: 'forbidden token material' });
  if (evidence.schemaVersion !== releaseAuthorityProbeSchema) findings.push({ code: 'release_authority_evidence_schema_mismatch', expected: releaseAuthorityProbeSchema, actual: evidence.schemaVersion ?? null });
  if (evidence.status !== 'ready' || !Array.isArray(evidence.findings) || evidence.findings.length !== 0) findings.push({ code: 'release_authority_not_ready', expected: 'ready with zero findings', actual: { status: evidence.status ?? null, findingCount: Array.isArray(evidence.findings) ? evidence.findings.length : null } });
  if (!samePublishAuthority(evidence.expected, releasePublishAuthority)) findings.push({ code: 'release_authority_tuple_mismatch', expected: releasePublishAuthority, actual: evidence.expected ?? null });
  if (evidence.sourceCommit !== sourceCommit) findings.push({ code: 'release_authority_source_commit_mismatch', expected: sourceCommit, actual: evidence.sourceCommit ?? null });
  const observedAtMs = Date.parse(evidence.observedAt ?? '');
  const evidenceAgeMs = nowMs - observedAtMs;
  if (!Number.isFinite(observedAtMs) || evidenceAgeMs < -60_000 || evidenceAgeMs > releaseAuthorityEvidenceMaxAgeMs) findings.push({ code: 'release_authority_evidence_stale', expected: `observed within ${releaseAuthorityEvidenceMaxAgeMs}ms`, actual: evidence.observedAt ?? null });
  const workflowDigest = typeof workflowSource === 'string' ? sha256(workflowSource) : null;
  if (evidence.workflow?.path !== releaseWorkflowPath || evidence.workflow?.sha256 !== workflowDigest) findings.push({ code: 'release_authority_workflow_mismatch', expected: { path: releaseWorkflowPath, sha256: workflowDigest }, actual: evidence.workflow ?? null });
  const github = evidence.github;
  const expectedGithub = {
    repository: releasePublishAuthority.repository,
    workflow: releasePublishAuthority.workflow,
    environment: releasePublishAuthority.environment,
    event: 'workflow_dispatch',
    headSha: sourceCommit,
  };
  const actualGithub = github ? {
    repository: github.repository ?? null,
    workflow: github.workflow ?? null,
    environment: github.environment ?? null,
    event: github.event ?? null,
    headSha: github.headSha ?? null,
  } : null;
  if (JSON.stringify(actualGithub) !== JSON.stringify(expectedGithub)
      || !Number.isSafeInteger(github?.runId) || github.runId < 1
      || !Number.isSafeInteger(github?.runAttempt) || github.runAttempt < 1
      || typeof github?.workflowRef !== 'string'
      || !github.workflowRef.startsWith(`${releasePublishAuthority.repository}/${releaseWorkflowPath}@refs/heads/main`)) {
    findings.push({ code: 'release_authority_github_identity_mismatch', expected: { ...expectedGithub, workflowRef: `${releasePublishAuthority.repository}/${releaseWorkflowPath}@refs/heads/main`, runId: '<positive integer>', runAttempt: '<positive integer>' }, actual: github ?? null });
  }
  if (evidence.npm?.package !== releasePackageName || evidence.npm?.exchange?.status !== 201) {
    findings.push({ code: 'release_authority_probe_mismatch', expected: { package: releasePackageName, exchangeStatus: 201 }, actual: evidence.npm ?? null });
  }
  const expiresMs = Date.parse(evidence.npm?.exchange?.expires ?? '');
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) findings.push({ code: 'release_authority_probe_stale', expected: 'current and unexpired hosted probe', actual: { observedAt: evidence.observedAt ?? null, expires: evidence.npm?.exchange?.expires ?? null } });
  return findings;
}

function releaseTaskRefs(repo, version) {
  const result = runGit(repo, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/heads/tasks/release-${version}`, `refs/remotes/*/tasks/release-${version}`]);
  return result.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [ref, commit] = line.split(/\s+/);
    return { ref, commit };
  });
}

export function checkReleaseConvergence({
  repo,
  version,
  candidateBase,
  candidateTree,
  stage = 'pre-main',
  remote = 'origin',
  main = 'main',
  dev = 'dev',
  fetch = true,
  authorityEvidence = null,
  nowMs = Date.now(),
}) {
  if (!repo || !version || !candidateBase || !candidateTree) throw new Error('repo, version, candidateBase and candidateTree are required');
  if (!['pre-main', 'post-main', 'pre-tag'].includes(stage)) throw new Error(`Unsupported release convergence stage: ${stage}`);
  if (stage !== 'pre-tag' && authorityEvidence) throw new Error('authority evidence is only accepted by the pre-tag stage');
  if (fetch) runGit(repo, ['fetch', remote, main, dev]);
  const devRef = `${remote}/${dev}`;
  const mainRef = `${remote}/${main}`;
  const findings = [];
  const checksMain = stage === 'post-main' || stage === 'pre-tag';
  const refs = {
    dev: rev(repo, devRef),
    main: checksMain ? rev(repo, mainRef) : null,
  };
  const trees = {
    dev: rev(repo, `${devRef}^{tree}`),
    main: checksMain ? rev(repo, `${mainRef}^{tree}`) : null,
  };
  const versions = {
    dev: packageVersionAt(repo, devRef),
    main: checksMain ? packageVersionAt(repo, mainRef) : null,
  };
  if (!isAncestor(repo, candidateBase, devRef)) findings.push({ code: 'candidate_base_not_in_dev', expected: candidateBase, actual: refs.dev });
  if (trees.dev !== candidateTree) findings.push({ code: 'dev_tree_mismatch', expected: candidateTree, actual: trees.dev });
  if (versions.dev !== version) findings.push({ code: 'dev_version_mismatch', expected: version, actual: versions.dev });
  for (const item of releaseTaskRefs(repo, version)) {
    if (!isAncestor(repo, item.commit, devRef)) findings.push({ code: 'release_task_not_integrated', ref: item.ref, commit: item.commit });
  }
  if (checksMain) {
    if (trees.main !== candidateTree) findings.push({ code: 'main_tree_mismatch', expected: candidateTree, actual: trees.main });
    if (versions.main !== version) findings.push({ code: 'main_version_mismatch', expected: version, actual: versions.main });
    if (!isAncestor(repo, mainRef, devRef)) findings.push({ code: 'main_not_ancestor_of_dev', main: refs.main, dev: refs.dev });
  }
  if (stage === 'pre-tag') {
    findings.push(...checkReleaseAuthorityEvidence({
      evidence: authorityEvidence,
      sourceCommit: refs.main,
      workflowSource: fileAt(repo, mainRef, releaseWorkflowPath),
      nowMs,
    }));
  }
  return {
    schemaVersion: 'buildr.release-convergence/v1',
    ok: findings.length === 0,
    stage,
    version,
    candidateBase,
    candidateTree,
    refs,
    trees,
    versions,
    findings,
    nextActions: findings.length ? ['修复 release candidate/dev/main、current hosted authority或workflow identity后重新运行checker；不得创建tag或执行npm publish。'] : [],
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return {
    repo: options.repo,
    version: options.version,
    candidateBase: options['candidate-base'],
    candidateTree: options['candidate-tree'],
    stage: options.stage || 'pre-main',
    remote: options.remote || 'origin',
    main: options.main || 'main',
    dev: options.dev || 'dev',
    authorityEvidence: options['authority-evidence'] ? JSON.parse(fs.readFileSync(options['authority-evidence'], 'utf8')) : null,
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const result = checkReleaseConvergence(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ schemaVersion: 'buildr.release-convergence/v1', ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
