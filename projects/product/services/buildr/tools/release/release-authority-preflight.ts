#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import {
  containsCredentialMaterial,
  releaseAuthorityPreflightSchema,
  releasePackageName,
  releasePublishAuthority,
  releaseWorkflowPath,
  sha256,
} from './release-authority.ts';

export { containsCredentialMaterial } from './release-authority.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot: any = path.resolve(serviceRoot, '../../../..');
const packagePath: any = 'projects/product/services/buildr/package.json';
const protectedJobId: any = 'release';
const expectedDispatchInputs: any = Object.freeze([
  'candidate_base',
  'candidate_run_id',
  'candidate_tree',
  'context_digest',
  'release_context',
  'release_id',
  'source_commit',
  'version',
  'workflow_sha256',
]);
const expectedNeeds: any = Object.freeze(['candidate', 'contract', 'host-node', 'launcher']);

function defaultExecute(command: any, args: any, options: any = {}): any  {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env });
}

function command(execute: any, executable: any, args: any, cwd: any): any  {
  const result: any = execute(executable, args, { cwd });
  return {
    status: Number.isInteger(result?.status) ? result.status : 1,
    stdout: String(result?.stdout ?? ''),
    stderr: String(result?.stderr ?? result?.error?.message ?? ''),
  };
}

function finding(code: any, expected: any, actual: any, source: any): any  {
  return { code, source, expected, actual };
}

function repositoryFromUrl(value: any): any  {
  const match: any = /github\.com(?::|\/)([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(String(value ?? '').trim());
  return match?.[1] ?? null;
}

function environmentName(value: any): any  {
  if (typeof value === 'string') return value;
  return typeof value?.name === 'string' ? value.name : null;
}

function parseOptions(argv: any): any  {
  const options: any = {};
  for (let index: any = 0; index < argv.length; index += 2) {
    const key: any = argv[index];
    const value: any = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return {
    repo: path.resolve(options.repo || workspaceRoot),
    sourceCommit: options['source-commit'] || 'HEAD',
    remote: options.remote || 'origin',
    ghCommand: options.gh || 'gh',
    output: options.output ? path.resolve(options.output) : null,
  };
}

function safeReason(result: any): any  {
  const text: any = `${result?.stderr ?? ''}\n${result?.stdout ?? ''}`.trim();
  if (/E401|401 Unauthorized|authentication token/i.test(text)) return 'E401';
  if (/E404|404 Not Found/i.test(text)) return 'E404';
  if (/E403|403 Forbidden/i.test(text)) return 'E403';
  return result?.status === 0 ? null : `command-exit-${result?.status ?? 1}`;
}

function parseJson(result: any): any  {
  if (result?.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function normalizedNeeds(value: any): any  {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? [...value].sort() : [];
}

function runBodies(job: any): any  {
  return Array.isArray(job?.steps)
    ? job.steps.map((step: any) => step?.run).filter((value: any) => typeof value === 'string')
    : [];
}

function jobAuthority(job: any): any  {
  const permissions: any = job?.permissions ?? {};
  const runs: any = runBodies(job);
  return {
    environment: environmentName(job?.environment),
    idTokenPermission: permissions?.['id-token'] ?? null,
    contentsPermission: permissions?.contents ?? null,
    needs: normalizedNeeds(job?.needs),
    oidcProbeInvocations: runs.filter((value: any) => value.includes('tools/release/release-authority-oidc-probe.ts')).length,
    preTagInvocations: runs.filter((value: any) => value.includes('tools/release/release-convergence.ts') && value.includes('--stage pre-tag')).length,
    tagPreflightInvocations: runs.filter((value: any) => value.includes('tools/release/release-tag-ensure.ts preflight')).length,
    tagEnsureInvocations: runs.filter((value: any) => value.includes('tools/release/release-tag-ensure.ts ensure')).length,
    trustedPublishInvocations: runs.filter((value: any) => value.includes('tools/release/trusted-publish.ts')).length,
    rawPublishInvocations: runs.filter((value: any) => /(^|\s)npm\s+publish(?:\s|$)/m.test(value)).length,
  };
}

export function inspectWorkflowAuthority(source: any): any  {
  const document: any = YAML.parse(source);
  const jobs: any = document?.jobs && typeof document.jobs === 'object' ? document.jobs : {};
  const workflowDispatch: any = document?.on?.workflow_dispatch;
  const dispatchInputs: any = workflowDispatch?.inputs && typeof workflowDispatch.inputs === 'object'
    ? Object.keys(workflowDispatch.inputs).sort()
    : [];
  const environmentJobs: any = Object.entries(jobs)
    .filter(([, job]: any) => environmentName(job?.environment))
    .map(([id, job]: any) => ({ id, environment: environmentName(job.environment) }));
  const privilegedJobs: any = Object.entries(jobs)
    .filter(([id, job]: any) => id !== protectedJobId && (job?.permissions?.['id-token'] === 'write' || job?.permissions?.contents === 'write'))
    .map(([id, job]: any) => ({ id, idTokenPermission: job?.permissions?.['id-token'] ?? null, contentsPermission: job?.permissions?.contents ?? null }));
  return {
    triggers: {
      workflowDispatch: Boolean(workflowDispatch),
      dispatchInputs,
      push: Boolean(document?.on?.push),
      pushTags: Array.isArray(document?.on?.push?.tags) ? document.on.push.tags : [],
    },
    protectedJobId,
    environmentJobs,
    privilegedJobs,
    release: jobAuthority(jobs[protectedJobId]),
  };
}

export function runReleaseAuthorityPreflight(options: any = {}, dependencies: any = {}): any  {
  const execute: any = dependencies.execute ?? defaultExecute;
  const now: any = dependencies.now ?? (() => new Date().toISOString());
  const repo: any = path.resolve(options.repo || workspaceRoot);
  const remote: any = options.remote || 'origin';
  const ghCommand: any = options.ghCommand || 'gh';
  const expected: any = releasePublishAuthority;
  const findings: any[] = [];

  const commitResult: any = command(execute, 'git', ['rev-parse', options.sourceCommit || 'HEAD'], repo);
  const sourceCommit: any = commitResult.status === 0 ? commitResult.stdout.trim() : null;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) findings.push(finding('source_commit_unavailable', 'full Git commit', safeReason(commitResult), 'git'));

  const packageResult: any = sourceCommit ? command(execute, 'git', ['show', `${sourceCommit}:${packagePath}`], repo) : null;
  let packageMetadata: any = null;
  try { packageMetadata = packageResult?.status === 0 ? JSON.parse(packageResult.stdout) : null; } catch { packageMetadata = null; }
  if (!packageMetadata) findings.push(finding('package_metadata_unavailable', packagePath, safeReason(packageResult), 'package'));
  else {
    if (packageMetadata.name !== releasePackageName) findings.push(finding('package_name_mismatch', releasePackageName, packageMetadata.name ?? null, 'package'));
    const packageRepository: any = repositoryFromUrl(packageMetadata.repository?.url ?? packageMetadata.repository);
    if (packageRepository !== expected.repository) findings.push(finding('package_repository_mismatch', expected.repository, packageRepository, 'package'));
  }

  const remoteResult: any = command(execute, 'git', ['remote', 'get-url', remote], repo);
  const remoteRepository: any = remoteResult.status === 0 ? repositoryFromUrl(remoteResult.stdout) : null;
  if (remoteRepository !== expected.repository) findings.push(finding('git_remote_repository_mismatch', expected.repository, remoteRepository ?? safeReason(remoteResult), 'git'));

  const workflowResult: any = sourceCommit ? command(execute, 'git', ['show', `${sourceCommit}:${releaseWorkflowPath}`], repo) : null;
  let workflow: any = null;
  let workflowAuthority: any = null;
  try {
    workflow = workflowResult?.status === 0 ? workflowResult.stdout : null;
    workflowAuthority = workflow ? inspectWorkflowAuthority(workflow) : null;
  } catch {
    workflowAuthority = null;
  }
  const workflowDigest: any = workflow ? sha256(workflow) : null;
  if (!workflowAuthority) findings.push(finding('workflow_unavailable', releaseWorkflowPath, safeReason(workflowResult), 'workflow'));
  else {
    if (path.basename(releaseWorkflowPath) !== expected.workflow) findings.push(finding('workflow_filename_mismatch', expected.workflow, path.basename(releaseWorkflowPath), 'workflow'));
    if (!workflowAuthority.triggers.workflowDispatch || JSON.stringify(workflowAuthority.triggers.dispatchInputs) !== JSON.stringify(expectedDispatchInputs)) findings.push(finding('workflow_dispatch_contract_mismatch', { workflowDispatch: true, inputs: expectedDispatchInputs }, workflowAuthority.triggers, 'workflow'));
    if (workflowAuthority.triggers.push || workflowAuthority.triggers.pushTags.length > 0) findings.push(finding('workflow_push_trigger_forbidden', { push: false, pushTags: [] }, workflowAuthority.triggers, 'workflow'));
    if (JSON.stringify(workflowAuthority.environmentJobs) !== JSON.stringify([{ id: protectedJobId, environment: expected.environment }])) findings.push(finding('workflow_environment_owner_mismatch', [{ id: protectedJobId, environment: expected.environment }], workflowAuthority.environmentJobs, 'workflow'));
    if (workflowAuthority.privilegedJobs.length > 0) findings.push(finding('workflow_unprotected_privileged_job', [], workflowAuthority.privilegedJobs, 'workflow'));
    const release: any = workflowAuthority.release;
    if (release.environment !== expected.environment || release.idTokenPermission !== 'write' || release.contentsPermission !== 'write') findings.push(finding('workflow_release_identity_mismatch', { environment: expected.environment, idTokenPermission: 'write', contentsPermission: 'write' }, release, 'workflow'));
    if (JSON.stringify(release.needs) !== JSON.stringify(expectedNeeds)) findings.push(finding('workflow_release_needs_mismatch', expectedNeeds, release.needs, 'workflow'));
    const invocations: any = {
      oidcProbeInvocations: 1,
      preTagInvocations: 1,
      tagPreflightInvocations: 1,
      tagEnsureInvocations: 1,
      trustedPublishInvocations: 1,
      rawPublishInvocations: 0,
    };
    for (const [key, expectedCount] of Object.entries(invocations)) {
      if (release[key] !== expectedCount) findings.push(finding(`workflow_${key.replace(/[A-Z]/g, (value: any) => `_${value.toLowerCase()}`)}_mismatch`, expectedCount, release[key], 'workflow'));
    }
  }

  const observed: any = {
    package: packageMetadata ? { name: packageMetadata.name, repository: repositoryFromUrl(packageMetadata.repository?.url ?? packageMetadata.repository) } : null,
    git: { remote, repository: remoteRepository },
    workflow: workflowAuthority,
    github: null,
  };

  if (findings.length === 0) {
    const repositoryResult: any = command(execute, ghCommand, ['repo', 'view', '--json', 'nameWithOwner'], repo);
    const githubRepository: any = parseJson(repositoryResult)?.nameWithOwner ?? null;
    if (githubRepository !== expected.repository) findings.push(finding('github_repository_mismatch', expected.repository, githubRepository ?? safeReason(repositoryResult), 'github'));
    const environmentResult: any = command(execute, ghCommand, ['api', `repos/${expected.repository}/environments/${expected.environment}`], repo);
    const githubEnvironment: any = parseJson(environmentResult)?.name ?? null;
    if (githubEnvironment !== expected.environment) findings.push(finding('github_environment_unavailable', expected.environment, githubEnvironment ?? safeReason(environmentResult), 'github'));
    observed.github = { repository: githubRepository, environment: githubEnvironment };
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
      '修复 current main、publish.yml唯一protected release transaction或GitHub Environment后重新运行静态preflight；不得dispatch发布、创建tag或执行npm publish。',
    ],
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options: any = parseOptions(process.argv.slice(2));
    const result: any = runReleaseAuthorityPreflight(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'ready') process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseAuthorityPreflightSchema, status: 'blocked', error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
