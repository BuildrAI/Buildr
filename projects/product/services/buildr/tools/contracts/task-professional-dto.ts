#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { TASK_PROFESSIONAL_HTTP_SCHEMAS } from '../../src/task/interfaces/http/task-professional-http-contracts.ts';
import { cliOutputRoot, contractOutputPaths } from './output-paths.ts';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const productRoot: any = path.resolve(serviceRoot, '../..');
const defaultOutputs: any = contractOutputPaths('task/interfaces/http', 'task-professional-http-dto.ts');

function body(schema: any, definitionName: any): any  {
  const { $schema: _draft, $id: _identity, title: _title, ...value }: any = schema;
  return JSON.parse(JSON.stringify(value).replaceAll('"#/$defs/', `"#/$defs/${definitionName}/$defs/`));
}

export async function renderTaskProfessionalHttpDto(): Promise<any>  {
  const sourceIdentity: any = `sha256-${crypto.createHash('sha256').update(JSON.stringify(Object.values(TASK_PROFESSIONAL_HTTP_SCHEMAS))).digest('hex')}`;
  const definitions: any = Object.fromEntries(Object.entries(TASK_PROFESSIONAL_HTTP_SCHEMAS).map(([name, value]: any) => {
    const definitionName: any = name[0].toUpperCase() + name.slice(1);
    return [definitionName, body(value, definitionName)];
  }));
  const projection: any = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'TaskProfessionalHttpDtoProjection',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.keys(definitions).map((name: any) => [name[0].toLowerCase() + name.slice(1), { $ref: `#/$defs/${name}` }])),
    required: Object.keys(definitions).map((name: any) => name[0].toLowerCase() + name.slice(1)),
    $defs: definitions,
  };
  const generated: any = await compile(projection, 'TaskProfessionalHttpDtoProjection', {
    bannerComment: '',
    additionalProperties: false,
    enableConstEnums: false,
    strictIndexSignatures: true,
    unreachableDefinitions: false,
    style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
  });
  return [
    '/* eslint-disable */',
    '// Generated from Task Professional HTTP JSON Schema. Do not edit.',
    '// Run: npm run contracts:professional:generate',
    `// Source Schema Identity: ${sourceIdentity}`,
    '',
    generated.trim(),
    '',
    'export type TaskProfessionalErrorResponse = TaskProfessionalHttpDtoProjection[\'errorResponse\'];',
    '',
  ].join('\n');
}

export async function checkTaskProfessionalHttpDto(outputRoot: any): Promise<any>  {
  const expected: any = await renderTaskProfessionalHttpDto();
  const selected: any = contractOutputPaths('task/interfaces/http', 'task-professional-http-dto.ts', outputRoot);
  const outputs: any[] = [selected.backend, selected.web];
  return outputs.filter((output: any) => !fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected);
}

export async function writeTaskProfessionalHttpDto(outputRoot: any = undefined): Promise<any>  {
  const expected: any = await renderTaskProfessionalHttpDto();
  const selected: any = outputRoot ? contractOutputPaths('task/interfaces/http', 'task-professional-http-dto.ts', outputRoot) : defaultOutputs;
  const outputs: any[] = [selected.backend, selected.web];
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, expected);
  }
  return outputs;
}

async function main(): Promise<any>  {
  const expected: any = await renderTaskProfessionalHttpDto();
  const outputRoot: any = cliOutputRoot(process.argv.slice(2));
  const selected: any = outputRoot ? contractOutputPaths('task/interfaces/http', 'task-professional-http-dto.ts', outputRoot) : defaultOutputs;
  const outputs: any[] = [selected.backend, selected.web];
  if (process.argv.includes('--check')) {
    const drift: any = outputs.filter((output: any) => !fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected);
    if (drift.length) {
      console.error(`Task Professional HTTP DTO drift: ${drift.map((output: any) => path.relative(productRoot, output)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const output of await writeTaskProfessionalHttpDto(outputRoot)) {
    console.log(`Generated ${path.relative(productRoot, output)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
