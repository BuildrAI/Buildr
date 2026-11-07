import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../../src/infrastructure/filesystem/atomic-files.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../../..');
const productRoot = path.resolve(serviceRoot, '../..');

export type ContractOutputPaths = { backend: string; web: string };

export function contractOutputPaths(filename: string, outputRoot?: string): ContractOutputPaths {
  if (outputRoot) {
    const root = path.resolve(outputRoot);
    return {
      backend: path.join(root, 'buildr', 'build', 'generated', filename),
      web: path.join(root, 'buildr-web', 'build', 'generated', filename),
    };
  }
  return {
    backend: path.join(serviceRoot, 'build', 'generated', filename),
    web: path.join(productRoot, 'services', 'buildr-web', 'build', 'generated', filename),
  };
}

export function cliOutputRoot(argv: string[]): string | undefined {
  const index = argv.indexOf('--output-root');
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--output-root requires a directory.');
  return path.resolve(value);
}

/** Preserve warm compiler inputs and never expose a truncated DTO to readers. */
export function writeContractOutput(file: string, content: string): void {
  try { if (fs.readFileSync(file, 'utf8') === content) return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  atomicWriteFile(file, content);
}
