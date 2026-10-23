import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../../infrastructure/filesystem/atomic-files.ts';
import { parseRuntimeDefinition, renderRuntimeDefinition, type ServiceRuntimeDefinition } from '../domain/runtime-definition.ts';

export function runtimeDefinitionPath(targetRoot: string, serviceCode: string): string {
  return path.join(targetRoot, 'services', serviceCode, 'runtime.yml');
}

export function readRuntimeDefinition(targetRoot: string, serviceCode: string): { definition: ServiceRuntimeDefinition; path: string } | null {
  const file = runtimeDefinitionPath(targetRoot, serviceCode);
  if (!fs.existsSync(file)) return null;
  return { definition: parseRuntimeDefinition(fs.readFileSync(file, 'utf8')), path: file };
}

export async function writeRuntimeDefinition(targetRoot: string, serviceCode: string, definition: ServiceRuntimeDefinition): Promise<string> {
  const file = runtimeDefinitionPath(targetRoot, serviceCode);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await atomicWriteFile(file, renderRuntimeDefinition(definition), 'utf8');
  return file;
}
