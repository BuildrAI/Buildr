#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';

export const CANDIDATE_ENVIRONMENT_PROFILES = Object.freeze(['base', 'artifact', 'source-runtime', 'host'] as const);
export type CandidateEnvironmentProfile = typeof CANDIDATE_ENVIRONMENT_PROFILES[number];

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.resolve(serviceRoot, '../buildr-web');
const projectRoot = path.resolve(serviceRoot, '../..');

function assertProfile(value: string): CandidateEnvironmentProfile {
  if (!CANDIDATE_ENVIRONMENT_PROFILES.includes(value as CandidateEnvironmentProfile)) {
    throw new Error(`Unsupported Candidate environment profile: ${value || '(missing)'}`);
  }
  return value as CandidateEnvironmentProfile;
}

export function candidateEnvironmentPlan(profileValue: string, roots = { serviceRoot, webRoot }): Array<{ id: string; executable: 'npm' | 'node'; args: string[]; cwd: string }> {
  const profile = assertProfile(profileValue);
  const plan: Array<{ id: string; executable: 'npm' | 'node'; args: string[]; cwd: string }> = [
    { id: 'buildr-dependencies', executable: 'npm', args: ['ci'], cwd: roots.serviceRoot },
  ];
  if (profile === 'host') return plan;
  if (profile === 'artifact' || profile === 'source-runtime') {
    plan.push({ id: 'buildr-web-dependencies', executable: 'npm', args: ['ci'], cwd: roots.webRoot });
  }
  plan.push({ id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot });
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
}: {
  profile: string;
  nodeExecutable?: string;
  env?: NodeJS.ProcessEnv;
  roots?: { serviceRoot: string; webRoot: string; projectRoot: string };
  execute?: typeof spawnCommandSync;
}) {
  const profile = assertProfile(profileValue);
  const requiredVersion = fs.readFileSync(path.join(roots.projectRoot, '.node-version'), 'utf8').trim();
  const exact = createExactNodeExecutionEnvironment({
    nodeExecutable,
    env,
    requireNpm: true,
    ...(profile === 'host' ? {} : { expectedVersion: requiredVersion }),
  });
  const operations = [];
  for (const item of candidateEnvironmentPlan(profile, roots)) {
    const executable = item.executable === 'npm' ? exact.npmExecutable : exact.nodeExecutable;
    const result = execute(executable, item.args, { cwd: item.cwd, encoding: 'utf8', env: exact.env });
    operations.push({ id: item.id, status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status ?? 1 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) {
      throw Object.assign(new Error(`Candidate environment preparation failed at ${item.id}.`), { code: 'candidate_environment_preparation_failed', operations });
    }
  }
  return {
    schemaVersion: 'buildr.candidate-environment-preparation/v1',
    status: 'passed',
    profile,
    node: exact.audit,
    operations,
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
    if (process.argv[2] !== 'prepare') throw new Error('Usage: candidate-environment.ts prepare --profile <base|artifact|source-runtime|host>');
    const result = prepareCandidateEnvironment({ profile: option(process.argv.slice(2), '--profile') || '' });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
