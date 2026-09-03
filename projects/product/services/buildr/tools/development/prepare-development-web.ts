#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';

import { writeRuntimeSystemDto } from '../contracts/runtime-system-dto.ts';
import { writeTaskProfessionalHttpDto } from '../contracts/task-professional-dto.ts';
import { writeTaskRecordHttpDto } from '../contracts/task-record-dto.ts';
import { writeWorkspaceAgentAssetsDtos } from '../contracts/workspace-agent-assets-dto.ts';
import { buildWebDist } from '../build/web-dist.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

export async function generateDevelopmentWebDtos(): Promise<string[]> {
  const outputs = [
    ...await writeTaskRecordHttpDto(),
    ...await writeTaskProfessionalHttpDto(),
    ...await writeRuntimeSystemDto(),
    ...await writeWorkspaceAgentAssetsDtos(),
  ];
  return outputs.map((file) => path.resolve(file)).sort();
}

export async function prepareDevelopmentWeb({
  outputRoot = path.join(serviceRoot, 'web-dist'),
  generateDtos = generateDevelopmentWebDtos,
  build = buildWebDist,
}: {
  outputRoot?: string;
  generateDtos?: () => Promise<string[]>;
  build?: (outputRoot: string) => string;
} = {}): Promise<{ schemaVersion: string; status: string; root: string; generatedDtos: string[] }> {
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
