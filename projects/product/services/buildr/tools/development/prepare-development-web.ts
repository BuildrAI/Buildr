#!/usr/bin/env node


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

export async function prepareDevelopmentWeb({
  outputRoot = path.join(serviceRoot, 'web-dist'),
  generateDtos = generateFreshDevelopmentWebDtos,
  build = buildWebDist,
  prepareAgent = prepareDevelopmentAgent,
}: {
  outputRoot?: string;
  generateDtos?: () => Promise<string[]>;
  build?: (outputRoot: string) => string;
  prepareAgent?: () => string;
} = {}): Promise<{ schemaVersion: string; status: string; root: string; generatedDtos: string[] }> {
  prepareAgent();
  const generatedDtos = await generateDtos();
  const root = build(path.resolve(outputRoot));
  return {
    schemaVersion: 'buildr.development-web-preparation/v1',
    status: 'passed',
    root,
    generatedDtos,
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
