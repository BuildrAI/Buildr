#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import {
  npmOidcAudience,
  npmRegistryOrigin,
  releaseAuthorityProbeArtifactName,
  releaseAuthorityProbeSchema,
  releasePackageName,
  releasePublishAuthority,
  releaseWorkflowPath,
  sha256,
} from './release-authority.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');

class ProbeError extends Error {
  constructor(code, message, actual = null) {
    super(message);
    this.code = code;
    this.actual = actual;
  }
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new ProbeError('probe_input_missing', `${name} is required`, name);
  return value.trim();
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ProbeError('github_identity_invalid', `${name} must be a positive integer`, value ?? null);
  return parsed;
}

function parseOptions(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    values[key.slice(2)] = value;
  }
  return {
    repo: path.resolve(values.repo || workspaceRoot),
    sourceCommit: requiredString(values['source-commit'], '--source-commit'),
    workflowSha256: requiredString(values['workflow-sha256'], '--workflow-sha256'),
    output: values.output ? path.resolve(values.output) : null,
  };
}

function workflowIdentity(env) {
  const repository = requiredString(env.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  const workflowRef = requiredString(env.GITHUB_WORKFLOW_REF, 'GITHUB_WORKFLOW_REF');
  const event = requiredString(env.GITHUB_EVENT_NAME, 'GITHUB_EVENT_NAME');
  const headSha = requiredString(env.GITHUB_SHA, 'GITHUB_SHA');
  const runId = positiveInteger(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID');
  const runAttempt = positiveInteger(env.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT');
  const serverUrl = requiredString(env.GITHUB_SERVER_URL, 'GITHUB_SERVER_URL');
  return {
    repository,
    workflow: path.basename(releaseWorkflowPath),
    workflowRef,
    environment: releasePublishAuthority.environment,
    event,
    runId,
    runAttempt,
    headSha,
    runUrl: `${serverUrl}/${repository}/actions/runs/${runId}`,
  };
}

function assertHostedIdentity(identity, sourceCommit) {
  if (identity.repository !== releasePublishAuthority.repository) throw new ProbeError('github_repository_mismatch', 'GitHub repository does not match release authority', identity.repository);
  if (!identity.workflowRef.startsWith(`${releasePublishAuthority.repository}/${releaseWorkflowPath}@`)) throw new ProbeError('github_workflow_mismatch', 'GitHub workflow ref does not match release authority', identity.workflowRef);
  if (identity.event !== 'workflow_dispatch') throw new ProbeError('github_event_mismatch', 'Authority probe must run from workflow_dispatch', identity.event);
  if (identity.headSha !== sourceCommit) throw new ProbeError('github_source_commit_mismatch', 'GitHub checkout does not match frozen source commit', identity.headSha);
}

function normalizedTimestamp(value, field) {
  const timestampMs = typeof value === 'string'
    ? Date.parse(value)
    : Number.isSafeInteger(value) && value >= 0
      ? value * 1000
      : Number.NaN;
  if (!Number.isFinite(timestampMs)) throw new ProbeError('npm_exchange_metadata_invalid', `${field} is not a valid timestamp`, value ?? null);
  try {
    return new Date(timestampMs).toISOString();
  } catch {
    throw new ProbeError('npm_exchange_metadata_invalid', `${field} is not a valid timestamp`, value ?? null);
  }
}

async function jsonResponse(response, code) {
  try {
    return await response.json();
  } catch {
    throw new ProbeError(code, 'Remote response was not valid JSON', { status: response.status });
  }
}

export async function runReleaseAuthorityOidcProbe(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? (() => new Date().toISOString());
  if (typeof fetchImpl !== 'function') throw new ProbeError('fetch_unavailable', 'fetch is unavailable');

  const repo = path.resolve(options.repo || workspaceRoot);
  const sourceCommit = requiredString(options.sourceCommit, 'sourceCommit');
  const workflowSha256 = requiredString(options.workflowSha256, 'workflowSha256');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new ProbeError('source_commit_invalid', 'sourceCommit must be a full Git commit', sourceCommit);
  if (!/^[a-f0-9]{64}$/.test(workflowSha256)) throw new ProbeError('workflow_digest_invalid', 'workflowSha256 must be a SHA-256 digest', workflowSha256);

  const workflowSource = fs.readFileSync(path.join(repo, releaseWorkflowPath), 'utf8');
  const actualWorkflowSha256 = sha256(workflowSource);
  if (actualWorkflowSha256 !== workflowSha256) throw new ProbeError('workflow_digest_mismatch', 'Checked out workflow bytes do not match frozen digest', actualWorkflowSha256);

  const github = workflowIdentity(env);
  assertHostedIdentity(github, sourceCommit);

  const requestUrl = new URL(requiredString(env.ACTIONS_ID_TOKEN_REQUEST_URL, 'ACTIONS_ID_TOKEN_REQUEST_URL'));
  requestUrl.searchParams.set('audience', npmOidcAudience);
  const idTokenResponse = await fetchImpl(requestUrl, {
    headers: { Authorization: `Bearer ${requiredString(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'ACTIONS_ID_TOKEN_REQUEST_TOKEN')}` },
  });
  if (!idTokenResponse.ok) throw new ProbeError('github_oidc_token_request_failed', 'GitHub OIDC token request failed', { status: idTokenResponse.status });
  const idTokenDocument = await jsonResponse(idTokenResponse, 'github_oidc_token_response_invalid');
  const idToken = requiredString(idTokenDocument?.value, 'GitHub OIDC token');

  const exchangeUrl = `${npmRegistryOrigin}/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(releasePackageName)}`;
  const exchangeResponse = await fetchImpl(exchangeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (exchangeResponse.status !== 201) throw new ProbeError('npm_oidc_exchange_failed', 'npm OIDC package token exchange failed', { status: exchangeResponse.status });
  const exchange = await jsonResponse(exchangeResponse, 'npm_oidc_exchange_response_invalid');
  requiredString(exchange?.token, 'npm exchange token');
  const tokenType = requiredString(exchange?.token_type, 'npm token_type');
  const created = normalizedTimestamp(exchange?.created, 'npm created');
  const expires = normalizedTimestamp(exchange?.expires, 'npm expires');
  if (Date.parse(expires) <= Date.parse(created)) throw new ProbeError('npm_exchange_metadata_invalid', 'npm exchange expiry must be after creation', { created, expires });

  return {
    schemaVersion: releaseAuthorityProbeSchema,
    status: 'ready',
    expected: releasePublishAuthority,
    sourceCommit,
    workflow: { path: releaseWorkflowPath, sha256: workflowSha256 },
    artifact: { name: releaseAuthorityProbeArtifactName(github.runId, github.runAttempt) },
    github,
    npm: {
      package: releasePackageName,
      registry: npmRegistryOrigin,
      exchange: { status: 201, tokenType, created, expires },
    },
    findings: [],
    observedAt: now(),
  };
}

function blockedEvidence(options, error, env = process.env) {
  const runId = Number(env.GITHUB_RUN_ID);
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  return {
    schemaVersion: releaseAuthorityProbeSchema,
    status: 'blocked',
    expected: releasePublishAuthority,
    sourceCommit: options?.sourceCommit ?? null,
    workflow: { path: releaseWorkflowPath, sha256: options?.workflowSha256 ?? null },
    artifact: Number.isSafeInteger(runId) && Number.isSafeInteger(runAttempt)
      ? { name: releaseAuthorityProbeArtifactName(runId, runAttempt) }
      : null,
    github: null,
    npm: { package: releasePackageName, registry: npmRegistryOrigin, exchange: null },
    findings: [{ code: error?.code || 'release_authority_probe_failed', actual: error?.actual ?? error?.message ?? 'unknown' }],
    observedAt: new Date().toISOString(),
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options = null;
  let result = null;
  try {
    options = parseOptions(process.argv.slice(2));
    result = await runReleaseAuthorityOidcProbe(options);
  } catch (error) {
    result = blockedEvidence(options, error);
    process.exitCode = 1;
  }
  if (options?.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({ schemaVersion: result.schemaVersion, status: result.status, sourceCommit: result.sourceCommit, workflow: result.workflow, artifact: result.artifact, findings: result.findings }, null, 2)}\n`);
}
