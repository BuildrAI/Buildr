#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { createCandidatePreparationReuse } from './candidate-preparation-reuse.ts';
import { atomicWriteJson } from '../../src/infrastructure/filesystem/atomic-files.ts';

export const CANDIDATE_ENVIRONMENT_PROFILES = Object.freeze(['base', 'artifact', 'frontend', 'browser-artifact', 'source-runtime', 'consumer', 'host', 'publisher'] as const);
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
  const agentRoot = path.resolve(roots.serviceRoot, '../buildr-agent');
  const plan: Array<{ id: string; executable: 'npm' | 'node'; args: string[]; cwd: string }> = consumesArtifact ? [] : [
    { id: 'buildr-agent-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: agentRoot },
    { id: 'buildr-agent-build', executable: 'node', args: ['tools/build.ts'], cwd: agentRoot },
  ];
  plan.push({ id: 'buildr-dependencies', executable: 'npm', args: consumesArtifact ? ['ci', '--omit=dev', '--ignore-scripts', '--install-links'] : ['ci', '--install-links'], cwd: roots.serviceRoot });
  if (profile === 'publisher') plan.push({ id: 'publisher-npm', executable: 'npm', args: ['install', '--prefix', path.join(roots.serviceRoot, 'node_modules/.buildr-publisher'), '--ignore-scripts', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', `npm@${PUBLISH_NPM_VERSION}`], cwd: roots.serviceRoot });
  if (consumesArtifact) return plan;
  if (profile === 'artifact' || profile === 'frontend' || profile === 'source-runtime') {
    plan.push({ id: 'buildr-web-dependencies', executable: 'npm', args: ['ci'], cwd: roots.webRoot });
  }
  // The artifact builder generates its isolated inputs itself. Source tests need
  // the development projection; an installed-package consumer needs neither.
  if (profile !== 'artifact') plan.push({ id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot });
  if (profile === 'source-runtime') {
    plan.push({ id: 'buildr-web-source-runtime', executable: 'node', args: ['tools/development/prepare-development-web.ts'], cwd: roots.serviceRoot });
  }
  if (profile === 'browser-artifact') plan.push({ id: 'browser-chromium', executable: 'npm', args: ['run', 'test:browser:install'], cwd: roots.serviceRoot });
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
  output = env.BUILDR_CANDIDATE_PREPARATION_OUTPUT,
  reusePrepared = false,
  preparationReuseOptions = {},
}: {
  profile: string;
  nodeExecutable?: string;
  env?: NodeJS.ProcessEnv;
  roots?: { serviceRoot: string; webRoot: string; projectRoot: string };
  execute?: typeof spawnCommandSync;
  timeoutMs?: number;
  now?: () => number;
  stream?: Pick<NodeJS.WriteStream, 'write'>;
  output?: string;
  reusePrepared?: boolean;
  preparationReuseOptions?: any;
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Preparation timeout must be a positive integer.');
  const profile = assertProfile(profileValue);
  const startedAt = now();
  const operations: any[] = [];
  const evidence: any = {
    schemaVersion: 'buildr.candidate-environment-preparation/v1', status: 'running', profile, id: env.BUILDR_CANDIDATE_PREPARATION_ID ?? null,
    workflow: env.GITHUB_RUN_ID ? { runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT || 1) } : null,
    sourceCommit: env.CANDIDATE_SOURCE_SHA || env.GITHUB_SHA || null,
    node: null, operations, startedAt: new Date(startedAt).toISOString(), durationMs: 0,
    checks: 'not-started',
  };
  const persist = () => {
    evidence.durationMs = now() - startedAt;
    if (output) atomicWriteJson(path.resolve(output), evidence);
  };
  persist();
  try {
    const requiredVersion = fs.readFileSync(path.join(roots.projectRoot, '.node-version'), 'utf8').trim();
    const exact = createExactNodeExecutionEnvironment({
      nodeExecutable, env, requireNpm: true,
      ...(profile === 'host' ? {} : { minimumVersion: requiredVersion }),
    });
    evidence.node = exact.audit;
    const childEnv: NodeJS.ProcessEnv = { ...exact.env, npm_config_fetch_retries: '1', npm_config_fetch_timeout: '30000' };
    delete childEnv.BUILDR_CANDIDATE_PREPARATION_OUTPUT;
    delete childEnv.BUILDR_CANDIDATE_PREPARATION_ID;
    const prepared = reusePrepared ? createCandidatePreparationReuse(roots, exact.audit, { ...preparationReuseOptions, env: exact.env }) : null;
    persist();
    for (const item of candidateEnvironmentPlan(profile, roots)) {
      const executable = item.executable === 'npm' ? exact.npmExecutable : exact.nodeExecutable;
      const operationStartedAt = now();
      const operation: any = { id: item.id, status: 'running', startedAt: new Date(operationStartedAt).toISOString(), timeoutMs };
      operations.push(operation);
      persist();
      let snapshot: any = null;
      try { snapshot = prepared?.inspect(item); } catch {}
      operation.disposition = snapshot?.reusable ? 'reused' : 'executed';
      if (snapshot?.reusable) {
        Object.assign(operation, { status: 'passed', disposition: 'reused', exitCode: null, finishedAt: new Date(now()).toISOString(), durationMs: now() - operationStartedAt, reusedFrom: snapshot.reusedFrom });
        persist();
        stream.write(`[candidate-environment] ${profile}/${item.id} reused (${operation.durationMs}ms)\n`);
        continue;
      }
      prepared?.invalidate(item);
      persist();
      stream.write(`[candidate-environment] ${profile}/${item.id} started\n`);
      let result: any;
      try {
        result = execute(executable, item.args, {
          cwd: item.cwd, encoding: 'utf8', timeout: timeoutMs,
          env: childEnv,
        });
      } catch (error: any) {
        result = { status: null, error, signal: null };
      }
      const errorCode = typeof result.error?.code === 'string' && /^[A-Z][A-Z_0-9]{0,63}$/u.test(result.error.code) ? result.error.code : null;
      const npmCode = ['ci', 'install'].includes(item.args[0]) ? String(result.stderr ?? '').match(/^npm (?:error|ERR!) code (ECONNRESET|EAI_AGAIN|E429|E502|E503|E504)\s*$/mu)?.[1] ?? null : null;
      const code = errorCode ?? npmCode;
      const failed = Boolean(result.error) || result.status !== 0;
      Object.assign(operation, {
        status: failed ? 'failed' : 'passed', exitCode: Number.isInteger(result.status) ? result.status : null,
        finishedAt: new Date(now()).toISOString(), durationMs: now() - operationStartedAt,
        failureCode: failed ? code === 'ETIMEDOUT' ? 'preparation-timeout' : 'preparation-command-failed' : null,
        errorCode: code, failureClass: !failed ? null : code === 'ETIMEDOUT' ? 'timeout' : ['ECONNRESET', 'EAI_AGAIN', 'E429', 'E502', 'E503', 'E504'].includes(code) ? 'transient' : 'unknown',
        signal: result.signal ?? null, pid: result.pid ?? null,
      });
      persist();
      if (result.stdout) stream.write(result.stdout);
      if (result.stderr) stream.write(result.stderr);
      if (failed) throw Object.assign(new Error(`Candidate environment preparation failed at ${item.id}.`), { code: 'candidate_environment_preparation_failed', operations });
      if (prepared) {
        try { prepared.complete(item, snapshot, operation.finishedAt); } catch { /* Disposable preparation receipts never change command results. */ }
      }
      stream.write(`[candidate-environment] ${profile}/${item.id} passed (${operation.durationMs}ms)\n`);
    }
    evidence.status = 'passed';
    evidence.finishedAt = new Date(now()).toISOString();
    persist();
    return evidence;
  } catch (error: any) {
    evidence.status = 'failed';
    evidence.finishedAt = new Date(now()).toISOString();
    evidence.failureCode = operations.some(item => item.status === 'failed') ? 'candidate_environment_preparation_failed' : 'candidate_environment_setup_failed';
    persist();
    throw Object.assign(error, { operations, preparation: evidence });
  }
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
    if (process.argv[2] !== 'prepare') throw new Error('Usage: candidate-environment.ts prepare --profile <base|artifact|frontend|browser-artifact|source-runtime|consumer|host|publisher>');
    const result = prepareCandidateEnvironment({ profile: option(process.argv.slice(2), '--profile') || '', output: option(process.argv.slice(2), '--output') ?? process.env.BUILDR_CANDIDATE_PREPARATION_OUTPUT });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error: unknown) {
    process.stderr.write(`${JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error), ...error instanceof Error && 'operations' in error ? { operations: error.operations } : {} })}\n`);
    process.exitCode = 1;
  }
}
