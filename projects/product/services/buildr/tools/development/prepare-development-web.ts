#!/usr/bin/env node


import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { buildWebDist } from '../build/web-dist.ts';
import { prepareDevelopmentAgent } from './prepare-development-agent.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

export async function generateDevelopmentWebDtos(): Promise<string[]> {
  // Importing HTTP catalogs can dereference newly added Agent schemas. Do not
  // load any writer until the prepared package is available in this process.
  const [{writeWorkbenchDto},{writeRuntimeSystemDto},{writeTaskProfessionalHttpDto},{writeTaskRecordHttpDto},{writeWorkspaceAgentAssetsDtos}] = await Promise.all([
    import('../codegen/contracts/workbench-dto.ts'),
    import('../codegen/contracts/runtime-system-dto.ts'),
    import('../codegen/contracts/task-professional-dto.ts'),
    import('../codegen/contracts/task-dto.ts'),
    import('../codegen/contracts/workspace-agent-assets-dto.ts'),
  ]);
  const outputs = [
    ...await writeTaskRecordHttpDto(),
    ...await writeWorkbenchDto(),
    ...await writeTaskProfessionalHttpDto(),
    ...await writeRuntimeSystemDto(),
    ...await writeWorkspaceAgentAssetsDtos(),
  ];
  return outputs.map((file) => path.resolve(file)).sort();
}

async function generateFreshDevelopmentWebDtos(): Promise<string[]> {
  // The launcher may already have loaded the previous Agent package. A fresh
  // process must resolve its public schemas after preparation replaces it.
  const result = spawnSync(process.execPath, [import.meta.filename, '--generate-dtos'], {
    cwd: serviceRoot, encoding: 'utf8', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`development_web_dto_generation_failed: ${(result.stderr || result.stdout).trim()}`);
  return JSON.parse(result.stdout) as string[];
}

/** Launcher output explains staged failures verbatim; keep the real cause reachable. */
function stageWebPreparationFailure(error: unknown): Error {
  const failure = error instanceof Error ? error : new Error(String(error));
  const staged = failure as Error & { stage?: string; internalCode?: string; code?: string };
  if (staged.stage) return failure;
  staged.stage = 'prepare-web';
  if (!staged.internalCode) staged.internalCode = typeof staged.code === 'string' ? staged.code : 'development_web_preparation_failed';
  return failure;
}

type PreparationStageTiming = { id: string; status: 'passed' | 'failed'; startedAt: string; finishedAt: string; durationMs: number };

export async function prepareDevelopmentWeb({
  outputRoot = path.join(serviceRoot, 'web-dist'),
  generateDtos = generateFreshDevelopmentWebDtos,
  build = buildWebDist,
  prepareAgent = prepareDevelopmentAgent,
  now = () => performance.now(),
  progress = (event) => {
    const line = `${JSON.stringify(event)}\n`;
    if (process.env.BUILDR_DEVELOPMENT_PROGRESS_FD === '3') fs.writeSync(3, line);
    else process.stderr.write(line);
  },
}: {
  outputRoot?: string;
  generateDtos?: () => Promise<string[]>;
  build?: (outputRoot: string) => string;
  prepareAgent?: () => string;
  now?: () => number;
  progress?: (event: Record<string, unknown>) => void;
} = {}): Promise<{ schemaVersion: string; status: string; root: string; generatedDtos: string[]; timings: { durationMs: number; stages: PreparationStageTiming[] } }> {
  const started = now();
  const stages: PreparationStageTiming[] = [];
  const emit = (event: Record<string, unknown>) => {
    try { progress({ schemaVersion: 'buildr.development-web-progress/v1', ...event }); }
    catch { /* Progress output must not replace the real build outcome. */ }
  };
  const stage = async <T>(id: string, operation: () => T | Promise<T>): Promise<T> => {
    const begin = now();
    const startedAt = new Date().toISOString();
    emit({ event: 'stage-start', stage: id, startedAt });
    let status: 'passed' | 'failed' = 'failed';
    try { const result = await operation(); status = 'passed'; return result; }
    finally {
      const timing = { id, status, startedAt, finishedAt: new Date().toISOString(), durationMs: Math.max(0, now() - begin) };
      stages.push(timing);
      emit({ event: 'stage-end', stage: id, ...timing });
    }
  };
  let generatedDtos: string[];
  let root: string;
  try {
    await stage('prepare-agent', prepareAgent);
    generatedDtos = await stage('generate-dtos', generateDtos);
    root = await stage('build-web', () => build(path.resolve(outputRoot)));
  } catch (error) {
    throw Object.assign(stageWebPreparationFailure(error), { timings: { durationMs: Math.max(0, now() - started), stages } });
  }
  return {
    schemaVersion: 'buildr.development-web-preparation/v1',
    status: 'passed',
    root,
    generatedDtos,
    timings: { durationMs: Math.max(0, now() - started), stages },
  };
}

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes('--generate-dtos')) {
    process.stdout.write(`${JSON.stringify(await generateDevelopmentWebDtos())}\n`);
    return;
  }
  const result = await prepareDevelopmentWeb({ outputRoot: option(args, '--output', path.join(serviceRoot, 'web-dist')) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
