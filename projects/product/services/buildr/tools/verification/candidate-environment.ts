#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';

export const CANDIDATE_ENVIRONMENT_PROFILES = Object.freeze(['base', 'artifact', 'source-runtime', 'consumer', 'host', 'publisher'] as const);
export type CandidateEnvironmentProfile = typeof CANDIDATE_ENVIRONMENT_PROFILES[number];

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.resolve(serviceRoot, '../buildr-web');
const projectRoot = path.resolve(serviceRoot, '../..');
export const PUBLISH_NPM_VERSION = '11.5.1';
export const publisherNpmCli = (root = serviceRoot) => path.join(root, 'node_modules/.buildr-publisher/node_modules/npm/bin/npm-cli.js');

function assertProfile(value: string): CandidateEnvironmentProfile {
  if (!CANDIDATE_ENVIRONMENT_PROFILES.includes(value as CandidateEnvironmentProfile)) {
    throw new Error(`Unsupported Candidate environment profile: ${value || '(missing)'}`);
  }
  return value as CandidateEnvironmentProfile;
}

export function candidateEnvironmentPlan(profileValue: string, roots = { serviceRoot, webRoot }): Array<{ id: string; executable: 'npm' | 'node'; args: string[]; cwd: string }> {
  const profile = assertProfile(profileValue);
  const consumesArtifact = profile === 'host' || profile === 'consumer' || profile === 'publisher';
  const plan: Array<{ id: string; executable: 'npm' | 'node'; args: string[]; cwd: string }> = [
    { id: 'buildr-dependencies', executable: 'npm', args: consumesArtifact ? ['ci', '--omit=dev', '--ignore-scripts'] : ['ci'], cwd: roots.serviceRoot },
  ];
  if (profile === 'publisher') plan.push({ id: 'publisher-npm', executable: 'npm', args: ['install', '--prefix', path.join(roots.serviceRoot, 'node_modules/.buildr-publisher'), '--ignore-scripts', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', `npm@${PUBLISH_NPM_VERSION}`], cwd: roots.serviceRoot });
  if (consumesArtifact) return plan;
  if (profile === 'artifact' || profile === 'source-runtime') {
    plan.push({ id: 'buildr-web-dependencies', executable: 'npm', args: ['ci'], cwd: roots.webRoot });
  }
  // The artifact builder generates its isolated inputs itself. Source tests need
  // the development projection; an installed-package consumer needs neither.
  if (profile !== 'artifact') plan.push({ id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot });
  if (profile === 'source-runtime') {
    plan.push({ id: 'buildr-web-source-runtime', executable: 'node', args: ['tools/development/prepare-development-web.ts'], cwd: roots.serviceRoot });
  }
  return plan;
}

export function prepareCandidateEnvironment({
  profile: profileValue,
  nodeExecutable = process.execPath,
  env = process.env,
  roots = { serviceRoot, webRoot, projectRoot },
  execute = spawnCommandSync,
  timeoutMs = 180_000,
  now = Date.now,
  stream = process.stdout,
}: {
  profile: string;
  nodeExecutable?: string;
  env?: NodeJS.ProcessEnv;
  roots?: { serviceRoot: string; webRoot: string; projectRoot: string };
  execute?: typeof spawnCommandSync;
  timeoutMs?: number;
  now?: () => number;
  stream?: Pick<NodeJS.WriteStream, 'write'>;
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Preparation timeout must be a positive integer.');
  const profile = assertProfile(profileValue);
  const requiredVersion = fs.readFileSync(path.join(roots.projectRoot, '.node-version'), 'utf8').trim();
  const exact = createExactNodeExecutionEnvironment({
    nodeExecutable,
    env,
    requireNpm: true,
    ...(profile === 'host' ? {} : { expectedVersion: requiredVersion }),
  });
  const startedAt = now();
  const operations = [];
  for (const item of candidateEnvironmentPlan(profile, roots)) {
    const executable = item.executable === 'npm' ? exact.npmExecutable : exact.nodeExecutable;
    const operationStartedAt = now();
    stream.write(`[candidate-environment] ${profile}/${item.id} started\n`);
    const result = execute(executable, item.args, {
      cwd: item.cwd, encoding: 'utf8', timeout: timeoutMs,
      env: { ...exact.env, npm_config_fetch_retries: '1', npm_config_fetch_timeout: '30000' },
    });
    const timedOut = result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT';
    operations.push({
      id: item.id, status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status ?? 1,
      startedAt: new Date(operationStartedAt).toISOString(), finishedAt: new Date(now()).toISOString(),
      durationMs: now() - operationStartedAt, timeoutMs, failureCode: timedOut ? 'preparation-timeout' : result.error?.message ?? null,
      signal: result.signal ?? null, pid: result.pid ?? null,
    });
    if (result.stdout) stream.write(result.stdout);
    if (result.stderr) stream.write(result.stderr);
    if (result.error || result.status !== 0) {
      throw Object.assign(new Error(`Candidate environment preparation failed at ${item.id}.`), { code: 'candidate_environment_preparation_failed', operations });
    }
    stream.write(`[candidate-environment] ${profile}/${item.id} passed (${now() - operationStartedAt}ms)\n`);
  }
  return {
    schemaVersion: 'buildr.candidate-environment-preparation/v1',
    status: 'passed',
    profile,
    node: exact.audit,
    operations,
    durationMs: now() - startedAt,
  };
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv[2] !== 'prepare') throw new Error('Usage: candidate-environment.ts prepare --profile <base|artifact|source-runtime|consumer|host|publisher>');
    const result = prepareCandidateEnvironment({ profile: option(process.argv.slice(2), '--profile') || '' });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error: unknown) {
    process.stderr.write(`${JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error), ...error instanceof Error && 'operations' in error ? { operations: error.operations } : {} })}\n`);
    process.exitCode = 1;
  }
}
