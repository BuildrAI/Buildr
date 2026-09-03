#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { BUILDR_WEB_HTTP_SCHEMAS } from '../../src/web/http/buildr-web-http-contracts.ts';
import { RELEASE_AWARENESS_HTTP_SCHEMAS } from '../../src/system/installation/interfaces/http/release-awareness-http-contracts.ts';
import { PUBLICATION_HTTP_SCHEMAS } from '../../src/system/publication/interfaces/http/publication-http-contracts.ts';
import { cliOutputRoot, contractOutputPaths } from './output-paths.ts';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const productRoot: any = path.resolve(serviceRoot, '../..');
const defaultOutputs: any = contractOutputPaths('web/http', 'runtime-system-http-dto.ts');
const catalogs: any = Object.freeze([
  ['buildrWeb', BUILDR_WEB_HTTP_SCHEMAS],
  ['releaseAwareness', RELEASE_AWARENESS_HTTP_SCHEMAS],
  ['publication', PUBLICATION_HTTP_SCHEMAS],
]);

export async function renderRuntimeSystemDto(): Promise<any>  {
  const parts: any[] = [];
  for (const [catalog, schemas] of catalogs) {
    for (const [key, value] of Object.entries(schemas) as Array<[string, any]>) {
      const { $schema: _draft, $id: _id, title: _title, ...body }: any = value;
      const name: any = `${value.title}_${catalog}_${key}`;
      const generated: any = await compile({ ...body, title: name }, name, {
        bannerComment: '', additionalProperties: false, enableConstEnums: false, strictIndexSignatures: true, unreachableDefinitions: false,
        style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
      });
      parts.push(generated.trim());
    }
  }
  return ['/* eslint-disable */', '// Generated from Runtime/System HTTP JSON Schemas. Do not edit.', '// Run: npm run contracts:generate:runtime-system', '', ...parts, ''].join('\n');
}

export async function checkRuntimeSystemDto(outputRoot: any): Promise<any>  {
  const content: any = await renderRuntimeSystemDto();
  const selected: any = contractOutputPaths('web/http', 'runtime-system-http-dto.ts', outputRoot);
  return [selected.backend, selected.web].filter((file: any) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content);
}

export async function writeRuntimeSystemDto(outputRoot: any = undefined): Promise<any>  {
  const content: any = await renderRuntimeSystemDto();
  const selected: any = outputRoot ? contractOutputPaths('web/http', 'runtime-system-http-dto.ts', outputRoot) : defaultOutputs;
  const outputs: any[] = [selected.backend, selected.web];
  for (const file of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return outputs;
}

async function main(): Promise<any>  {
  const content: any = await renderRuntimeSystemDto();
  const outputRoot: any = cliOutputRoot(process.argv.slice(2));
  const selected: any = outputRoot ? contractOutputPaths('web/http', 'runtime-system-http-dto.ts', outputRoot) : defaultOutputs;
  const outputs: any[] = [selected.backend, selected.web];
  const drift: any = outputs.filter((file: any) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content);
  if (process.argv.includes('--check')) {
    if (drift.length) {
      console.error(`Runtime/System HTTP DTO drift: ${drift.map((file: any) => path.relative(productRoot, file)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const file of await writeRuntimeSystemDto(outputRoot)) {
    console.log(`Generated ${path.relative(productRoot, file)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
