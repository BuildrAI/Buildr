#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import {
  npmRegistryOrigin,
  releaseAuthorityEvidenceMaxAgeMs,
  releaseAuthorityPreflightSchema,
  releaseAuthorityProbeArtifactName,
  releaseAuthorityProbeSchema,
  releasePackageName,
  releasePublishAuthority,
  releaseWorkflowPath,
  samePublishAuthority,
  sha256,
} from './release-authority.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');
const packagePath = 'projects/product/services/buildr/package.json';

function defaultExecute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env });
}

function command(execute, executable, args, cwd) {
  const result = execute(executable, args, { cwd });
  return {
    status: Number.isInteger(result?.status) ? result.status : 1,
    stdout: String(result?.stdout ?? ''),
    stderr: String(result?.stderr ?? result?.error?.message ?? ''),
  };
}

function finding(code, expected, actual, source) {
  return { code, source, expected, actual };
}

function repositoryFromUrl(value) {
  const match = /github\.com(?::|\/)([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(String(value ?? '').trim());
  return match?.[1] ?? null;
}

function environmentName(value) {
  if (typeof value === 'string') return value;
  return typeof value?.name === 'string' ? value.name : null;
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return {
    repo: path.resolve(options.repo || workspaceRoot),
    sourceCommit: options['source-commit'] || 'HEAD',
    remote: options.remote || 'origin',
    ghCommand: options.gh || 'gh',
    runId: options['run-id'] || null,
    probeEvidencePath: options['probe-evidence'] ? path.resolve(options['probe-evidence']) : null,
    output: options.output ? path.resolve(options.output) : null,
  };
}

function safeReason(result) {
  const text = `${result?.stderr ?? ''}\n${result?.stdout ?? ''}`.trim();
  if (/E401|401 Unauthorized|authentication token/i.test(text)) return 'E401';
  if (/E404|404 Not Found/i.test(text)) return 'E404';
  if (/E403|403 Forbidden/i.test(text)) return 'E403';
  return result?.status === 0 ? null : `command-exit-${result?.status ?? 1}`;
}

function parseJson(result) {
  if (result?.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function jobAuthority(job, script) {
  const permissions = job?.permissions ?? {};
  const runs = Array.isArray(job?.steps) ? job.steps.map((step) => step?.run).filter((value) => typeof value === 'string') : [];
  return {
    environment: environmentName(job?.environment),
    idTokenPermission: permissions?.['id-token'] ?? null,
    condition: typeof job?.if === 'string' ? job.if : null,
    scriptInvocations: runs.filter((value) => value.includes(script)).length,
  };
}

export function inspectWorkflowAuthority(source) {
  const document = YAML.parse(source);
  const publish = document?.jobs?.publish;
  const probe = document?.jobs?.['authority-probe'];
  const publishRuns = Array.isArray(publish?.steps) ? publish.steps.map((step) => step?.run).filter((value) => typeof value === 'string') : [];
  const wrapperInvocations = publishRuns.filter((value) => value.includes('scripts/release/trusted-publish.mjs'));
  const rawPublishInvocations = publishRuns.filter((value) => /(^|\s)npm\s+publish(?:\s|$)/m.test(value));
  return {
    publish: {
      ...jobAuthority(publish, 'scripts/release/trusted-publish.mjs'),
      allowedActions: wrapperInvocations.length === 1 && rawPublishInvocations.length === 0 ? ['npm publish'] : [],
      wrapperInvocations: wrapperInvocations.length,
      rawPublishInvocations: rawPublishInvocations.length,
    },
    probe: jobAuthority(probe, 'scripts/release/release-authority-oidc-probe.mjs'),
  };
}

export function containsCredentialMaterial(value) {
  if (typeof value === 'string') return /(?:^|\W)npm_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value);
  if (Array.isArray(value)) return value.some(containsCredentialMaterial);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => /^(?:token|idToken|accessToken|authorization)$/i.test(key) || containsCredentialMaterial(child));
}

function validateProbeEvidence({ evidence, sourceCommit, workflowDigest, run, artifacts, nowMs }) {
  const findings = [];
  const runId = Number(run?.id);
  const runAttempt = Number(run?.run_attempt);
  const expectedArtifact = releaseAuthorityProbeArtifactName(runId, runAttempt);
  if (!evidence) return [finding('probe_evidence_missing', releaseAuthorityProbeSchema, null, 'probe')];
  if (containsCredentialMaterial(evidence)) findings.push(finding('probe_evidence_contains_credentials', 'credential-free evidence', 'forbidden token material', 'probe'));
  if (evidence.schemaVersion !== releaseAuthorityProbeSchema) findings.push(finding('probe_evidence_schema_mismatch', releaseAuthorityProbeSchema, evidence.schemaVersion ?? null, 'probe'));
  if (evidence.status !== 'ready' || !Array.isArray(evidence.findings) || evidence.findings.length !== 0) findings.push(finding('probe_not_ready', 'ready with zero findings', { status: evidence.status ?? null, findings: evidence.findings ?? null }, 'probe'));
  if (!samePublishAuthority(evidence.expected)) findings.push(finding('probe_authority_tuple_mismatch', releasePublishAuthority, evidence.expected ?? null, 'probe'));
  if (evidence.sourceCommit !== sourceCommit) findings.push(finding('probe_source_commit_mismatch', sourceCommit, evidence.sourceCommit ?? null, 'probe'));
  if (evidence.workflow?.path !== releaseWorkflowPath || evidence.workflow?.sha256 !== workflowDigest) findings.push(finding('probe_workflow_mismatch', { path: releaseWorkflowPath, sha256: workflowDigest }, evidence.workflow ?? null, 'probe'));
  if (evidence.artifact?.name !== expectedArtifact) findings.push(finding('probe_artifact_identity_mismatch', expectedArtifact, evidence.artifact?.name ?? null, 'probe'));
  const artifact = Array.isArray(artifacts?.artifacts) ? artifacts.artifacts.find((item) => item?.name === expectedArtifact) : null;
  if (!artifact || artifact.expired === true) findings.push(finding('probe_artifact_unavailable', { name: expectedArtifact, expired: false }, artifact ? { name: artifact.name, expired: artifact.expired } : null, 'github'));

  const expectedRun = {
    repository: releasePublishAuthority.repository,
    workflow: releasePublishAuthority.workflow,
    environment: releasePublishAuthority.environment,
    event: 'workflow_dispatch',
    runId,
    runAttempt,
    headSha: sourceCommit,
    runUrl: run?.html_url ?? null,
  };
  for (const [key, expected] of Object.entries(expectedRun)) {
    if (evidence.github?.[key] !== expected) findings.push(finding(`probe_github_${key}_mismatch`, expected, evidence.github?.[key] ?? null, 'probe'));
  }
  if (typeof evidence.github?.workflowRef !== 'string' || !evidence.github.workflowRef.startsWith(`${releasePublishAuthority.repository}/${releaseWorkflowPath}@`)) findings.push(finding('probe_github_workflow_ref_mismatch', `${releasePublishAuthority.repository}/${releaseWorkflowPath}@<ref>`, evidence.github?.workflowRef ?? null, 'probe'));
  if (evidence.npm?.package !== releasePackageName || evidence.npm?.registry !== npmRegistryOrigin || evidence.npm?.exchange?.status !== 201) findings.push(finding('probe_npm_exchange_mismatch', { package: releasePackageName, registry: npmRegistryOrigin, status: 201 }, evidence.npm ?? null, 'probe'));

  const observedAtMs = Date.parse(evidence.observedAt ?? '');
  const createdMs = Date.parse(evidence.npm?.exchange?.created ?? '');
  const expiresMs = Date.parse(evidence.npm?.exchange?.expires ?? '');
  if (!Number.isFinite(observedAtMs) || nowMs - observedAtMs < -60_000 || nowMs - observedAtMs > releaseAuthorityEvidenceMaxAgeMs) findings.push(finding('probe_evidence_stale', `observed within ${releaseAuthorityEvidenceMaxAgeMs}ms`, evidence.observedAt ?? null, 'probe'));
  if (!Number.isFinite(createdMs) || !Number.isFinite(expiresMs) || expiresMs <= createdMs || expiresMs <= nowMs) findings.push(finding('probe_exchange_expired', 'valid unexpired exchange metadata', evidence.npm?.exchange ?? null, 'probe'));
  return findings;
}

export function runReleaseAuthorityPreflight(options = {}, dependencies = {}) {
  const execute = dependencies.execute ?? defaultExecute;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const nowMs = dependencies.nowMs ?? (() => Date.now());
  const repo = path.resolve(options.repo || workspaceRoot);
  const remote = options.remote || 'origin';
  const ghCommand = options.ghCommand || 'gh';
  const expected = releasePublishAuthority;
  const findings = [];

  const commitResult = command(execute, 'git', ['rev-parse', options.sourceCommit || 'HEAD'], repo);
  const sourceCommit = commitResult.status === 0 ? commitResult.stdout.trim() : null;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) findings.push(finding('source_commit_unavailable', 'full Git commit', safeReason(commitResult), 'git'));

  const packageResult = sourceCommit ? command(execute, 'git', ['show', `${sourceCommit}:${packagePath}`], repo) : null;
  let packageMetadata = null;
  try { packageMetadata = packageResult?.status === 0 ? JSON.parse(packageResult.stdout) : null; } catch { packageMetadata = null; }
  if (!packageMetadata) findings.push(finding('package_metadata_unavailable', packagePath, safeReason(packageResult), 'package'));
  else {
    if (packageMetadata.name !== releasePackageName) findings.push(finding('package_name_mismatch', releasePackageName, packageMetadata.name ?? null, 'package'));
    const packageRepository = repositoryFromUrl(packageMetadata.repository?.url ?? packageMetadata.repository);
    if (packageRepository !== expected.repository) findings.push(finding('package_repository_mismatch', expected.repository, packageRepository, 'package'));
  }

  const remoteResult = command(execute, 'git', ['remote', 'get-url', remote], repo);
  const remoteRepository = remoteResult.status === 0 ? repositoryFromUrl(remoteResult.stdout) : null;
  if (remoteRepository !== expected.repository) findings.push(finding('git_remote_repository_mismatch', expected.repository, remoteRepository ?? safeReason(remoteResult), 'git'));

  const workflowResult = sourceCommit ? command(execute, 'git', ['show', `${sourceCommit}:${releaseWorkflowPath}`], repo) : null;
  let workflow = null;
  let workflowAuthority = null;
  try {
    workflow = workflowResult?.status === 0 ? workflowResult.stdout : null;
    workflowAuthority = workflow ? inspectWorkflowAuthority(workflow) : null;
  } catch {
    workflowAuthority = null;
  }
  const workflowDigest = workflow ? sha256(workflow) : null;
  if (!workflowAuthority) findings.push(finding('workflow_unavailable', releaseWorkflowPath, safeReason(workflowResult), 'workflow'));
  else {
    if (path.basename(releaseWorkflowPath) !== expected.workflow) findings.push(finding('workflow_filename_mismatch', expected.workflow, path.basename(releaseWorkflowPath), 'workflow'));
    if (workflowAuthority.publish.environment !== expected.environment) findings.push(finding('workflow_environment_mismatch', expected.environment, workflowAuthority.publish.environment, 'workflow'));
    if (workflowAuthority.publish.idTokenPermission !== 'write') findings.push(finding('workflow_id_token_permission_mismatch', 'write', workflowAuthority.publish.idTokenPermission, 'workflow'));
    if (JSON.stringify(workflowAuthority.publish.allowedActions) !== JSON.stringify(expected.allowedActions)) findings.push(finding('workflow_allowed_actions_mismatch', expected.allowedActions, workflowAuthority.publish.allowedActions, 'workflow'));
    if (workflowAuthority.publish.condition !== "github.event_name == 'push'") findings.push(finding('workflow_publish_event_guard_mismatch', "github.event_name == 'push'", workflowAuthority.publish.condition, 'workflow'));
    if (workflowAuthority.probe.environment !== expected.environment || workflowAuthority.probe.idTokenPermission !== 'write' || workflowAuthority.probe.condition !== "github.event_name == 'workflow_dispatch'" || workflowAuthority.probe.scriptInvocations !== 1) findings.push(finding('workflow_probe_identity_mismatch', { environment: expected.environment, idTokenPermission: 'write', condition: "github.event_name == 'workflow_dispatch'", scriptInvocations: 1 }, workflowAuthority.probe, 'workflow'));
  }

  const observed = {
    package: packageMetadata ? { name: packageMetadata.name, repository: repositoryFromUrl(packageMetadata.repository?.url ?? packageMetadata.repository) } : null,
    git: { remote, repository: remoteRepository },
    workflow: workflowAuthority,
    github: null,
    probe: null,
  };

  let probeEvidence = dependencies.probeEvidence ?? options.probeEvidence ?? null;
  if (!probeEvidence && options.probeEvidencePath) {
    try { probeEvidence = JSON.parse(fs.readFileSync(options.probeEvidencePath, 'utf8')); } catch { probeEvidence = null; }
  }
  const runId = String(options.runId ?? probeEvidence?.github?.runId ?? '');
  if (!/^\d+$/.test(runId)) findings.push(finding('github_probe_run_id_missing', 'positive GitHub run id', runId || null, 'github'));

  if (findings.length === 0) {
    const repositoryResult = command(execute, ghCommand, ['repo', 'view', '--json', 'nameWithOwner'], repo);
    const repositoryDocument = parseJson(repositoryResult);
    const githubRepository = repositoryDocument?.nameWithOwner ?? null;
    if (githubRepository !== expected.repository) findings.push(finding('github_repository_mismatch', expected.repository, githubRepository ?? safeReason(repositoryResult), 'github'));

    const environmentResult = command(execute, ghCommand, ['api', `repos/${expected.repository}/environments/${expected.environment}`], repo);
    const githubEnvironment = parseJson(environmentResult)?.name ?? null;
    if (githubEnvironment !== expected.environment) findings.push(finding('github_environment_unavailable', expected.environment, githubEnvironment ?? safeReason(environmentResult), 'github'));

    const runResult = command(execute, ghCommand, ['api', `repos/${expected.repository}/actions/runs/${runId}`], repo);
    const run = parseJson(runResult);
    if (!run) findings.push(finding('github_probe_run_unavailable', runId, safeReason(runResult), 'github'));
    else {
      const expectedRun = { repository: expected.repository, event: 'workflow_dispatch', headSha: sourceCommit, status: 'completed', conclusion: 'success', workflowPath: releaseWorkflowPath };
      const actualRun = { repository: run.repository?.full_name ?? null, event: run.event ?? null, headSha: run.head_sha ?? null, status: run.status ?? null, conclusion: run.conclusion ?? null, workflowPath: typeof run.path === 'string' ? run.path.split('@')[0] : null };
      if (JSON.stringify(actualRun) !== JSON.stringify(expectedRun)) findings.push(finding('github_probe_run_mismatch', expectedRun, actualRun, 'github'));
      if (Number(run.id) !== Number(runId)) findings.push(finding('github_probe_run_identity_mismatch', Number(runId), run.id ?? null, 'github'));
    }

    const artifactsResult = command(execute, ghCommand, ['api', `repos/${expected.repository}/actions/runs/${runId}/artifacts`], repo);
    const artifacts = parseJson(artifactsResult);
    if (!artifacts) findings.push(finding('github_probe_artifacts_unavailable', 'current run artifacts', safeReason(artifactsResult), 'github'));
    if (run && artifacts) findings.push(...validateProbeEvidence({ evidence: probeEvidence, sourceCommit, workflowDigest, run, artifacts, nowMs: nowMs() }));
    observed.github = run ? { repository: githubRepository, environment: githubEnvironment, run: { id: Number(run.id), attempt: Number(run.run_attempt), event: run.event, headSha: run.head_sha, status: run.status, conclusion: run.conclusion, workflowPath: run.path, url: run.html_url } } : { repository: githubRepository, environment: githubEnvironment, run: null };
    observed.probe = probeEvidence ? { schemaVersion: probeEvidence.schemaVersion, status: probeEvidence.status, artifact: probeEvidence.artifact, github: probeEvidence.github, npm: probeEvidence.npm, observedAt: probeEvidence.observedAt } : null;
  }

  return {
    schemaVersion: releaseAuthorityPreflightSchema,
    status: findings.length === 0 ? 'ready' : 'blocked',
    expected,
    sourceCommit,
    workflow: { path: releaseWorkflowPath, sha256: workflowDigest },
    observed,
    findings,
    observedAt: now(),
    nextActions: findings.length === 0 ? [] : [
      '针对当前 origin/main commit 与 publish.yml digest 重新运行 GitHub-hosted authority probe，修复 current authority 后再生成 preflight evidence；不得创建或推送 release tag。',
    ],
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = runReleaseAuthorityPreflight(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'ready') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseAuthorityPreflightSchema, status: 'blocked', error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
