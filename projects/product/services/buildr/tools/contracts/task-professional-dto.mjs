#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { TASK_PROFESSIONAL_HTTP_SCHEMAS } from '../../src/task/interfaces/http/task-professional-http-contracts.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const outputs = Object.freeze([
  path.join(serviceRoot, 'src/task/interfaces/http/generated/task-professional-http-dto.ts'),
  path.join(productRoot, 'services/buildr-web/src/api/generated/task-professional-http-dto.ts'),
]);

function body(schema) {
  const { $schema: _draft, $id: _identity, title: _title, ...value } = schema;
  return value;
}

export async function renderTaskProfessionalHttpDto() {
  const sourceIdentity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(Object.values(TASK_PROFESSIONAL_HTTP_SCHEMAS))).digest('hex')}`;
  const definitions = Object.fromEntries(Object.entries(TASK_PROFESSIONAL_HTTP_SCHEMAS).map(([name, value]) => [
    name[0].toUpperCase() + name.slice(1), body(value),
  ]));
  const projection = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'TaskProfessionalHttpDtoProjection',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.keys(definitions).map((name) => [name[0].toLowerCase() + name.slice(1), { $ref: `#/$defs/${name}` }])),
    required: Object.keys(definitions).map((name) => name[0].toLowerCase() + name.slice(1)),
    $defs: definitions,
  };
  const generated = await compile(projection, 'TaskProfessionalHttpDtoProjection', {
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

export async function checkTaskProfessionalHttpDto() {
  const expected = await renderTaskProfessionalHttpDto();
  return outputs.filter((output) => !fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected);
}

async function main() {
  const expected = await renderTaskProfessionalHttpDto();
  if (process.argv.includes('--check')) {
    const drift = outputs.filter((output) => !fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected);
    if (drift.length) {
      console.error(`Task Professional HTTP DTO drift: ${drift.map((output) => path.relative(productRoot, output)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, expected);
    console.log(`Generated ${path.relative(productRoot, output)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
