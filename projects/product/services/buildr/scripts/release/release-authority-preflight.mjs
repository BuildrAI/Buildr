#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import {
  compareNpmTrustedPublishers,
  npmSupportsTrustList,
  parseJsonDocuments,
  releasePublishAuthority,
  sha256,
} from './release-authority.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');
const packagePath = 'projects/product/services/buildr/package.json';
const workflowPath = '.github/workflows/publish.yml';

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
    npmCommand: options.npm || 'npm',
    output: options.output ? path.resolve(options.output) : null,
  };
}

function safeReason(result) {
  const text = `${result.stderr}\n${result.stdout}`.trim();
  if (/ENEEDAUTH/i.test(text)) return 'ENEEDAUTH';
  if (/E401|401 Unauthorized|authentication token/i.test(text)) return 'E401';
  if (/E404|404 Not Found/i.test(text)) return 'E404';
  return result.status === 0 ? null : `command-exit-${result.status}`;
}

export function inspectWorkflowAuthority(source) {
  const document = YAML.parse(source);
  const publish = document?.jobs?.publish;
  const permissions = publish?.permissions ?? document?.permissions ?? {};
  const runs = Array.isArray(publish?.steps) ? publish.steps.map((step) => step?.run).filter((value) => typeof value === 'string') : [];
  const wrapperInvocations = runs.filter((value) => value.includes('scripts/release/trusted-publish.mjs'));
  const rawPublishInvocations = runs.filter((value) => /(^|\s)npm\s+publish(?:\s|$)/m.test(value));
  return {
    environment: environmentName(publish?.environment),
    idToken: permissions?.['id-token'] ?? null,
    allowedActions: wrapperInvocations.length === 1 && rawPublishInvocations.length === 0 ? ['npm publish'] : [],
    wrapperInvocations: wrapperInvocations.length,
    rawPublishInvocations: rawPublishInvocations.length,
  };
}

export function runReleaseAuthorityPreflight(options = {}, dependencies = {}) {
  const execute = dependencies.execute ?? defaultExecute;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const repo = path.resolve(options.repo || workspaceRoot);
  const remote = options.remote || 'origin';
  const ghCommand = options.ghCommand || 'gh';
  const npmCommand = options.npmCommand || 'npm';
  const expected = releasePublishAuthority;
  const findings = [];

  const commitResult = command(execute, 'git', ['rev-parse', options.sourceCommit || 'HEAD'], repo);
  const sourceCommit = commitResult.status === 0 ? commitResult.stdout.trim() : null;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) findings.push(finding('source_commit_unavailable', 'full Git commit', safeReason(commitResult), 'git'));

  const packageResult = sourceCommit ? command(execute, 'git', ['show', `${sourceCommit}:${packagePath}`], repo) : null;
  let packageMetadata = null;
  try { packageMetadata = packageResult?.status === 0 ? JSON.parse(packageResult.stdout) : null; } catch { packageMetadata = null; }
  if (!packageMetadata) findings.push(finding('package_metadata_unavailable', packagePath, safeReason(packageResult ?? { status: 1, stderr: '' }), 'package'));
  else {
    if (packageMetadata.name !== '@buildr-ai/buildr') findings.push(finding('package_name_mismatch', '@buildr-ai/buildr', packageMetadata.name ?? null, 'package'));
    const packageRepository = repositoryFromUrl(packageMetadata.repository?.url ?? packageMetadata.repository);
    if (packageRepository !== expected.repository) findings.push(finding('package_repository_mismatch', expected.repository, packageRepository, 'package'));
  }

  const remoteResult = command(execute, 'git', ['remote', 'get-url', remote], repo);
  const remoteRepository = remoteResult.status === 0 ? repositoryFromUrl(remoteResult.stdout) : null;
  if (remoteRepository !== expected.repository) findings.push(finding('git_remote_repository_mismatch', expected.repository, remoteRepository ?? safeReason(remoteResult), 'git'));

  const workflowResult = sourceCommit ? command(execute, 'git', ['show', `${sourceCommit}:${workflowPath}`], repo) : null;
  let workflow = null;
  let workflowAuthority = null;
  try {
    workflow = workflowResult?.status === 0 ? workflowResult.stdout : null;
    workflowAuthority = workflow ? inspectWorkflowAuthority(workflow) : null;
  } catch {
    workflowAuthority = null;
  }
  if (!workflowAuthority) findings.push(finding('workflow_unavailable', workflowPath, safeReason(workflowResult ?? { status: 1, stderr: '' }), 'workflow'));
  else {
    if (path.basename(workflowPath) !== expected.workflow) findings.push(finding('workflow_filename_mismatch', expected.workflow, path.basename(workflowPath), 'workflow'));
    if (workflowAuthority.environment !== expected.environment) findings.push(finding('workflow_environment_mismatch', expected.environment, workflowAuthority.environment, 'workflow'));
    if (workflowAuthority.idToken !== 'write') findings.push(finding('workflow_id_token_permission_mismatch', 'write', workflowAuthority.idToken, 'workflow'));
    if (JSON.stringify(workflowAuthority.allowedActions) !== JSON.stringify(expected.allowedActions)) findings.push(finding('workflow_allowed_actions_mismatch', expected.allowedActions, workflowAuthority.allowedActions, 'workflow'));
  }

  const observed = {
    package: packageMetadata ? { name: packageMetadata.name, repository: repositoryFromUrl(packageMetadata.repository?.url ?? packageMetadata.repository) } : null,
    git: { remote, repository: remoteRepository },
    workflow: workflowAuthority,
    github: null,
    npm: null,
  };

  if (findings.length === 0) {
    const repositoryResult = command(execute, ghCommand, ['repo', 'view', '--json', 'nameWithOwner'], repo);
    let githubRepository = null;
    try { githubRepository = repositoryResult.status === 0 ? JSON.parse(repositoryResult.stdout).nameWithOwner : null; } catch { githubRepository = null; }
    if (githubRepository !== expected.repository) findings.push(finding('github_repository_mismatch', expected.repository, githubRepository ?? safeReason(repositoryResult), 'github'));

    const environmentResult = command(execute, ghCommand, ['api', `repos/${expected.repository}/environments/${expected.environment}`], repo);
    let githubEnvironment = null;
    try { githubEnvironment = environmentResult.status === 0 ? JSON.parse(environmentResult.stdout).name : null; } catch { githubEnvironment = null; }
    if (githubEnvironment !== expected.environment) findings.push(finding('github_environment_unavailable', expected.environment, githubEnvironment ?? safeReason(environmentResult), 'github'));
    observed.github = { repository: githubRepository, environment: githubEnvironment };

    const versionResult = command(execute, npmCommand, ['--version'], repo);
    const npmVersion = versionResult.status === 0 ? versionResult.stdout.trim() : null;
    if (!npmSupportsTrustList(npmVersion)) {
      findings.push(finding('npm_trust_list_unsupported', 'npm >=11.15.0', npmVersion ?? safeReason(versionResult), 'npm'));
      observed.npm = { cliVersion: npmVersion, trustedPublishers: null };
    } else {
      const trustResult = command(execute, npmCommand, ['trust', 'list', '@buildr-ai/buildr', '--json'], repo);
      if (trustResult.status !== 0) {
        findings.push(finding('npm_trusted_publisher_unavailable', 'authenticated current trust readback', safeReason(trustResult), 'npm'));
        observed.npm = { cliVersion: npmVersion, trustedPublishers: null };
      } else {
        let publishers = null;
        try { publishers = parseJsonDocuments(trustResult.stdout); } catch { publishers = null; }
        if (!publishers) findings.push(finding('npm_trusted_publisher_invalid', 'valid npm trust JSON', 'invalid-json', 'npm'));
        else {
          const comparison = compareNpmTrustedPublishers(publishers, expected);
          if (!comparison.ok) findings.push(finding('npm_trusted_publisher_mismatch', comparison.expected, comparison.actual, 'npm'));
          observed.npm = { cliVersion: npmVersion, trustedPublishers: comparison.actual };
        }
      }
    }
  }

  return {
    schemaVersion: 'buildr.release-authority-preflight/v1',
    status: findings.length === 0 ? 'ready' : 'blocked',
    expected,
    sourceCommit,
    workflow: { path: workflowPath, sha256: workflow ? sha256(workflow) : null },
    observed,
    findings,
    observedAt: now(),
    nextActions: findings.length === 0 ? [] : [
      '在 npm >=11.15 的 authenticated maintainer session 中修复或确认 GitHub/npm current authority 后重跑 preflight；不得创建或推送 release tag。',
    ],
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = runReleaseAuthorityPreflight(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'ready') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: 'buildr.release-authority-preflight/v1', status: 'blocked', error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
