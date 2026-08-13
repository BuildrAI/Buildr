#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import {
  releaseAuthorityProbeArtifactName,
  releasePublishAuthority,
  releaseWorkflowPath,
  sha256,
} from './release-authority.mjs';
import { runReleaseAuthorityPreflight } from './release-authority-preflight.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');

function defaultExecute(command, args, options = {}) {
  if (options.stream) return spawnSync(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: 'inherit' });
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env });
}

function invoke(execute, executable, args, cwd, options = {}) {
  const result = execute(executable, args, { cwd, ...options });
  if (result?.status !== 0) throw new Error(`${executable} ${args.join(' ')} failed: ${String(result?.stderr ?? result?.stdout ?? '').trim()}`);
  return String(result?.stdout ?? '');
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
    sourceCommit: options['source-commit'] || 'origin/main',
    remoteMain: options['remote-main'] || 'origin/main',
    ghCommand: options.gh || 'gh',
    output: options.output ? path.resolve(options.output) : null,
    timeoutMs: Number(options['timeout-ms'] || 10 * 60 * 1000),
  };
}

function parseJson(value, label) {
  try { return JSON.parse(value); } catch { throw new Error(`${label} returned invalid JSON.`); }
}

function fullCommit(execute, repo, ref) {
  const commit = invoke(execute, 'git', ['rev-parse', ref], repo).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`${ref} did not resolve to a full Git commit.`);
  return commit;
}

async function defaultWait(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runHostedReleaseAuthorityProbe(options = {}, dependencies = {}) {
  const execute = dependencies.execute ?? defaultExecute;
  const wait = dependencies.wait ?? defaultWait;
  const onStatus = dependencies.onStatus ?? ((message) => process.stderr.write(`${message}\n`));
  const nowMs = dependencies.nowMs ?? (() => Date.now());
  const probeId = dependencies.probeId ?? crypto.randomUUID();
  const repo = path.resolve(options.repo || workspaceRoot);
  const ghCommand = options.ghCommand || 'gh';
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10 * 60 * 1000;
  const sourceCommit = fullCommit(execute, repo, options.sourceCommit || 'origin/main');
  const remoteMain = fullCommit(execute, repo, options.remoteMain || 'origin/main');
  if (sourceCommit !== remoteMain) throw new Error(`Authority probe source ${sourceCommit} is not current origin/main ${remoteMain}.`);
  const workflowSource = invoke(execute, 'git', ['show', `${sourceCommit}:${releaseWorkflowPath}`], repo);
  const workflowSha256 = sha256(workflowSource);
  const title = `Authority probe ${probeId}`;

  invoke(execute, ghCommand, [
    'workflow', 'run', releasePublishAuthority.workflow,
    '--repo', releasePublishAuthority.repository,
    '--ref', 'main',
    '-f', `probe_id=${probeId}`,
    '-f', `source_commit=${sourceCommit}`,
    '-f', `workflow_sha256=${workflowSha256}`,
  ], repo);

  const startedAt = nowMs();
  let run = null;
  while (!run && nowMs() - startedAt <= timeoutMs) {
    const runs = parseJson(invoke(execute, ghCommand, [
      'run', 'list',
      '--repo', releasePublishAuthority.repository,
      '--workflow', releasePublishAuthority.workflow,
      '--event', 'workflow_dispatch',
      '--branch', 'main',
      '--limit', '100',
      '--json', 'databaseId,displayTitle,headSha,status,conclusion',
    ], repo), 'gh run list');
    run = Array.isArray(runs) ? runs.find((item) => item?.displayTitle === title && item?.headSha === sourceCommit) : null;
    if (!run) await wait(3_000);
  }
  if (!run) throw new Error(`Timed out locating GitHub authority probe ${probeId}.`);

  const runId = Number(run.databaseId);
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('GitHub authority probe returned an invalid run id.');
  onStatus(`GitHub authority probe: https://github.com/${releasePublishAuthority.repository}/actions/runs/${runId}`);
  onStatus(`If npm-production approval is requested, approve this run in GitHub; no npm password or OTP is needed.`);
  invoke(execute, ghCommand, ['run', 'watch', String(runId), '--repo', releasePublishAuthority.repository, '--exit-status', '--interval', '5'], repo, { stream: true });
  const currentRun = parseJson(invoke(execute, ghCommand, ['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`], repo), 'GitHub run readback');
  const runAttempt = Number(currentRun.run_attempt);
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) throw new Error('GitHub authority probe returned an invalid run attempt.');

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-authority-probe-'));
  try {
    const artifactName = releaseAuthorityProbeArtifactName(runId, runAttempt);
    invoke(execute, ghCommand, ['run', 'download', String(runId), '--repo', releasePublishAuthority.repository, '--name', artifactName, '--dir', temporaryRoot], repo);
    const evidencePath = path.join(temporaryRoot, 'release-authority-probe.json');
    const probeEvidence = parseJson(fs.readFileSync(evidencePath, 'utf8'), 'authority probe artifact');
    const result = runReleaseAuthorityPreflight({ repo, sourceCommit, ghCommand, runId, probeEvidence }, { execute, nowMs });
    if (result.status !== 'ready') throw Object.assign(new Error('Hosted release authority preflight is blocked.'), { result });
    return result;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options = null;
  try {
    options = parseOptions(process.argv.slice(2));
    const result = await runHostedReleaseAuthorityProbe(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const result = error?.result ?? { schemaVersion: 'buildr.release-authority-probe-runner/v1', status: 'blocked', error: error.message };
    if (options?.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}
