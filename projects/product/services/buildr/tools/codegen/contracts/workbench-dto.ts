import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { WORKBENCH_HTTP_DEFINITIONS } from '../../../src/modules/workbench/interfaces/http/workbench-http-schema.ts';
import { cliOutputRoot, contractOutputPaths } from './output-paths.ts';

export async function renderWorkbenchDto(): Promise<string> {
  const names = Object.keys(WORKBENCH_HTTP_DEFINITIONS).filter((name) => name.startsWith('Workbench') || name.startsWith('TaskWork'));
  const output = await compile({ type: 'object', additionalProperties: false, properties: Object.fromEntries(names.map((name) => [name, { $ref: `#/$defs/${name}` }])), required: names, $defs: WORKBENCH_HTTP_DEFINITIONS } as Parameters<typeof compile>[0], 'WorkbenchHttpDtoProjection', { bannerComment: '', enableConstEnums: false, strictIndexSignatures: true, style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' } });
  return `/* eslint-disable */\n// Generated from Workbench HTTP JSON Schema. Do not edit.\n// Run: npm run contracts:prepare\n\n${output.trim()}\n`;
}
export async function writeWorkbenchDto(outputRoot?: string): Promise<string[]> {
  const content = await renderWorkbenchDto();
  const files = Object.values(contractOutputPaths('workbench-dto.ts', outputRoot));
  for (const file of files) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  return files;
}
export async function checkWorkbenchDto(outputRoot?: string): Promise<string[]> {
  const content = await renderWorkbenchDto();
  return Object.values(contractOutputPaths('workbench-dto.ts', outputRoot)).filter((file) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const root = cliOutputRoot(process.argv.slice(2));
  if (process.argv.includes('--check')) { const drift = await checkWorkbenchDto(root); if (drift.length) { console.error(drift); process.exitCode = 1; } }
  else await writeWorkbenchDto(root);
}
