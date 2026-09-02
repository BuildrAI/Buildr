#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

export const releaseContextSchema = 'buildr.release-context/v1';
export const releaseReadinessSchema = 'buildr.release-readiness/v1';

const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40,64}$/u;
const STAGES = new Set(['pre-candidate', 'pre-main', 'dispatch-check', 'pre-tag']);

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const field of Object.keys(value)) if (!fields.includes(field)) throw new Error(`${label}.${field} is not supported.`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function releaseContextIdentity(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function optionalProjection(value, fields, label) {
  if (value == null) return null;
  closed(value, fields, label);
  return canonical(value);
}

export function createReleaseContext(input) {
  closed(input, ['selection', 'release', 'candidate', 'artifact', 'convergence', 'environment', 'node', 'workflow', 'taskCorrelation'], 'release context input');
  const value = {
    schemaVersion: releaseContextSchema,
    selection: optionalProjection(input.selection, ['identity', 'version', 'branch', 'releaseHead', 'releaseTree', 'generation', 'status', 'reconciliationIdentity'], 'selection'),
    release: optionalProjection(input.release, ['version', 'sourceCommit', 'sourceTree'], 'release'),
    candidate: optionalProjection(input.candidate, ['workflow', 'runId', 'runAttempt', 'runUrl', 'sourceCommit', 'sourceTree', 'registryIdentity', 'aggregateIdentity', 'status'], 'candidate'),
    artifact: optionalProjection(input.artifact, ['artifactName', 'sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest'], 'artifact'),
    convergence: optionalProjection(input.convergence, ['mainCommit', 'mainTree', 'devCommit', 'devTree', 'mergeCommit', 'mergeParents', 'mergeMethod', 'reconciliationIdentity'], 'convergence'),
    environment: optionalProjection(input.environment, ['identity', 'status', 'taskId', 'nodeVersion', 'nodeIdentity'], 'environment'),
    node: optionalProjection(input.node, ['authority', 'version', 'executionIdentity'], 'node'),
    workflow: optionalProjection(input.workflow, ['path', 'digest', 'repository', 'environment'], 'workflow'),
    taskCorrelation: optionalProjection(input.taskCorrelation, ['identity', 'status', 'sourceCommit', 'sourceTree', 'remoteRef'], 'taskCorrelation'),
  };
  value.identity = releaseContextIdentity(value);
  return value;
}

export function validateReleaseContext(value) {
  closed(value, ['schemaVersion', 'selection', 'release', 'candidate', 'artifact', 'convergence', 'environment', 'node', 'workflow', 'taskCorrelation', 'identity'], 'release context');
  if (value.schemaVersion !== releaseContextSchema || !DIGEST.test(value.identity || '')) throw new Error('Release context schema/identity is invalid.');
  const { schemaVersion: _schemaVersion, identity: _identity, ...input } = value;
  const recreated = createReleaseContext(input);
  if (recreated.identity !== value.identity) throw new Error(`Release context identity mismatch: ${value.identity} != ${recreated.identity}.`);
  return recreated;
}

const stageRequired = Object.freeze({
  'pre-candidate': ['selection', 'release', 'environment', 'node', 'workflow', 'taskCorrelation'],
  'pre-main': ['selection', 'release', 'candidate', 'artifact', 'environment', 'node', 'workflow', 'taskCorrelation'],
  'dispatch-check': ['selection', 'release', 'candidate', 'artifact', 'convergence', 'environment', 'node', 'workflow', 'taskCorrelation'],
  'pre-tag': ['selection', 'release', 'candidate', 'artifact', 'convergence', 'environment', 'node', 'workflow', 'taskCorrelation'],
});

const hostedChecks = Object.freeze([
  { id: 'npm-production-approval', owner: 'github-environment', summary: '唯一protected transaction的npm-production审批只能在hosted run中成立。' },
  { id: 'hosted-oidc-exchange', owner: 'github-oidc', summary: 'OIDC/Trusted Publishing身份只能由current protected run/attempt证明。' },
  { id: 'pre-tag-remote-readback', owner: 'protected-transaction', summary: 'tag前必须在hosted job重新读取remote、Registry与GitHub控制面。' },
]);

function finding(code, owner, expected, actual, nextAction) {
  return { code, severity: 'blocked', owner, expected, actual, nextAction };
}

function checkIdentity(findings, value, field, owner) {
  if (value != null && !DIGEST.test(value)) findings.push(finding(`${field}-identity-invalid`, owner, 'sha256 identity', value, `重新读取current ${owner} identity。`));
}

function checkSha(findings, value, field, owner) {
  if (value != null && !SHA.test(value)) findings.push(finding(`${field}-invalid`, owner, 'full Git identity', value, `重新读取current ${owner} Git identity。`));
}

export function evaluateReleaseReadiness(input) {
  closed(input, ['stage', 'context'], 'release readiness input');
  if (!STAGES.has(input.stage)) throw new Error(`Unsupported release readiness stage: ${input.stage}.`);
  const context = validateReleaseContext(input.context);
  const findings = [];
  for (const field of stageRequired[input.stage]) {
    if (context[field] == null) findings.push(finding(`${field}-missing`, field, 'current owner projection', null, `从${field} owner读取current fact后重新运行${input.stage}。`));
  }

  if (context.selection) {
    checkIdentity(findings, context.selection.identity, 'selection', 'release-selection');
    if (context.selection.status !== 'frozen') findings.push(finding('selection-not-frozen', 'release-selection', 'frozen', context.selection.status, '冻结current release selection后重试。'));
    checkSha(findings, context.selection.releaseHead, 'selection-release-head', 'release-selection');
    checkSha(findings, context.selection.releaseTree, 'selection-release-tree', 'release-selection');
  }
  if (context.release) {
    checkSha(findings, context.release.sourceCommit, 'release-source-commit', 'release');
    checkSha(findings, context.release.sourceTree, 'release-source-tree', 'release');
  }
  if (context.selection && context.release) {
    if (context.selection.version !== context.release.version) findings.push(finding('release-version-mismatch', 'release-selection', context.selection.version, context.release.version, '使用matching release version重建context。'));
    if (context.selection.releaseHead !== context.release.sourceCommit) findings.push(finding('release-head-mismatch', 'release-selection', context.selection.releaseHead, context.release.sourceCommit, '使用current release HEAD重建context。'));
    if (context.selection.releaseTree !== context.release.sourceTree) findings.push(finding('release-tree-mismatch', 'release-selection', context.selection.releaseTree, context.release.sourceTree, '使用current release tree重建context。'));
  }
  if (context.candidate) {
    if (context.candidate.status !== 'passed') findings.push(finding('candidate-not-passed', 'product-candidate', 'passed', context.candidate.status, '对current release source完成Product Candidate。'));
    checkIdentity(findings, context.candidate.registryIdentity, 'candidate-registry', 'product-candidate');
    checkIdentity(findings, context.candidate.aggregateIdentity, 'candidate-aggregate', 'product-candidate');
    if (!Number.isSafeInteger(context.candidate.runId) || context.candidate.runId < 1) findings.push(finding('candidate-run-invalid', 'product-candidate', 'positive run id', context.candidate.runId, '读取matching Candidate run。'));
    if (context.release && (context.candidate.sourceCommit !== context.release.sourceCommit || context.candidate.sourceTree !== context.release.sourceTree)) findings.push(finding('candidate-source-mismatch', 'product-candidate', { commit: context.release.sourceCommit, tree: context.release.sourceTree }, { commit: context.candidate.sourceCommit, tree: context.candidate.sourceTree }, '对current release source重新形成Candidate。'));
  }
  if (context.artifact) {
    if (!/^[a-f0-9]{64}$/u.test(context.artifact.sha256 || '')) findings.push(finding('artifact-sha256-invalid', 'product-candidate', '64-character SHA-256', context.artifact.sha256, '重新读取matching Candidate artifact bytes。'));
    checkIdentity(findings, context.artifact.applicationPayloadDigest, 'artifact-payload', 'product-candidate');
    if (context.artifact.artifactName !== 'candidate-package') findings.push(finding('artifact-name-mismatch', 'product-candidate', 'candidate-package', context.artifact.artifactName, '使用matching Candidate run的唯一candidate-package。'));
    if (context.release && context.artifact.sourceCommit !== context.release.sourceCommit) findings.push(finding('artifact-source-mismatch', 'product-candidate', context.release.sourceCommit, context.artifact.sourceCommit, '重新读取matching Candidate artifact。'));
  }
  if (context.candidate && context.artifact && context.candidate.sourceCommit !== context.artifact.sourceCommit) findings.push(finding('candidate-artifact-source-mismatch', 'product-candidate', context.candidate.sourceCommit, context.artifact.sourceCommit, '使用同一Candidate run的aggregate和artifact。'));
  if (context.taskCorrelation) {
    checkIdentity(findings, context.taskCorrelation.identity, 'task-correlation', 'task-correlation');
    if (context.taskCorrelation.status !== 'passed') findings.push(finding('task-correlation-not-passed', 'task-correlation', 'passed', context.taskCorrelation.status, '重新读取current release与support Task关系。'));
    if (context.release && context.taskCorrelation.sourceTree !== context.release.sourceTree) findings.push(finding('task-correlation-source-mismatch', 'task-correlation', { tree: context.release.sourceTree }, { commit: context.taskCorrelation.sourceCommit, tree: context.taskCorrelation.sourceTree }, '按current release/main tree重建Task correlation。'));
  }
  if (context.environment) {
    checkIdentity(findings, context.environment.identity, 'environment', 'task-environment');
    if (!['ready', 'cleaned'].includes(context.environment.status)) findings.push(finding('environment-not-current', 'task-environment', 'ready|cleaned', context.environment.status, '恢复matching Task Environment read model。'));
  }
  if (context.node && context.environment && (context.node.version !== context.environment.nodeVersion || context.node.executionIdentity !== context.environment.nodeIdentity)) findings.push(finding('node-environment-mismatch', 'task-environment', { version: context.environment.nodeVersion, identity: context.environment.nodeIdentity }, { version: context.node.version, identity: context.node.executionIdentity }, '使用Environment冻结的exact Node重新运行。'));
  if (context.workflow) {
    if (context.workflow.path !== '.github/workflows/publish.yml' || context.workflow.environment !== 'npm-production') findings.push(finding('workflow-authority-mismatch', 'publish-workflow', { path: '.github/workflows/publish.yml', environment: 'npm-production' }, context.workflow, '恢复唯一publish workflow authority。'));
    checkIdentity(findings, context.workflow.digest, 'workflow', 'publish-workflow');
  }
  if (context.convergence && context.release) {
    if (context.convergence.mainTree !== context.release.sourceTree) findings.push(finding('main-tree-mismatch', 'git-convergence', context.release.sourceTree, context.convergence.mainTree, '完成release到main的tree-equivalent收敛后重试。'));
    checkSha(findings, context.convergence.mainCommit, 'main-commit', 'git-convergence');
    checkSha(findings, context.convergence.devCommit, 'dev-commit', 'git-convergence');
  }
  if (context.selection?.reconciliationIdentity && ['dispatch-check', 'pre-tag'].includes(input.stage)) {
    if (context.convergence?.reconciliationIdentity !== context.selection.reconciliationIdentity) findings.push(finding('main-reconciliation-identity-mismatch', 'git-convergence', context.selection.reconciliationIdentity, context.convergence?.reconciliationIdentity ?? null, '按current reconciliation identity重建release context。'));
    if (context.convergence?.mergeMethod !== 'merge') findings.push(finding('main-merge-method-mismatch', 'git-convergence', 'merge', context.convergence?.mergeMethod ?? null, 'release→main必须使用Create a merge commit并重新读取结果。'));
    const mergeParents = context.convergence?.mergeParents;
    if (!Array.isArray(mergeParents) || mergeParents.length !== 2) findings.push(finding('main-merge-parents-missing', 'git-convergence', 'exactly two merge parents', mergeParents ?? null, '重新读取main merge commit的两个父提交。'));
    if (context.convergence?.mergeCommit !== context.convergence?.mainCommit) findings.push(finding('main-merge-commit-mismatch', 'git-convergence', context.convergence?.mainCommit ?? null, context.convergence?.mergeCommit ?? null, '使用current main merge commit重建convergence evidence。'));
    if (context.release && Array.isArray(mergeParents) && !mergeParents.includes(context.release.sourceCommit)) findings.push(finding('main-merge-release-parent-missing', 'git-convergence', context.release.sourceCommit, mergeParents, '重新读取包含current release source的main merge parents。'));
  }

  const ready = findings.length === 0;
  return {
    schemaVersion: releaseReadinessSchema,
    stage: input.stage,
    status: ready ? 'ready' : 'blocked',
    frozen: ready && ['dispatch-check', 'pre-tag'].includes(input.stage),
    context,
    contextIdentity: context.identity,
    findings,
    deferredChecks: hostedChecks,
    effects: [],
    nextActions: ready ? (input.stage === 'dispatch-check' ? ['等待维护者对当前frozen context明确授权publication。'] : []) : [...new Set(findings.map((item) => item.nextAction))],
  };
}

function parseOptions(argv) {
  const [action, ...rest] = argv;
  const options = { action };
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Invalid release readiness argument: ${name || '<missing>'}.`);
    options[name.slice(2)] = value;
  }
  return options;
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const input = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
    const result = options.action === 'validate-context'
      ? validateReleaseContext(input)
      : options.action === 'evaluate'
        ? evaluateReleaseReadiness({ stage: options.stage, context: input })
        : (() => { throw new Error('Usage: release-readiness.mjs validate-context --input <json> [--output <json>] | evaluate --stage <stage> --input <json> [--output <json>]'); })();
    if (options.output) fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseReadinessSchema, status: 'blocked', error: error.message, effects: [] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
