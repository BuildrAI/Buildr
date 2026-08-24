#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compile } from 'json-schema-to-typescript';

import {
  TASK_RECORD_HTTP_DEFINITIONS,
  TASK_RECORD_HTTP_SCHEMAS,
} from '../../src/task/interfaces/http/task-record-http-contracts.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const workspaceProductRoot = path.resolve(serviceRoot, '../..');
const outputs = Object.freeze([
  path.join(serviceRoot, 'src/task/interfaces/http/generated/task-record-http-dto.ts'),
  path.join(workspaceProductRoot, 'services/buildr-web/src/api/generated/task-record-http-dto.ts'),
]);

function body(schema) {
  const { $schema: _draft, $id: _identity, title: _title, $defs: _defs, ...value } = schema;
  return value;
}

export async function renderTaskRecordHttpDto() {
  const definitions = {
    ...TASK_RECORD_HTTP_DEFINITIONS,
    TaskListRequest: body(TASK_RECORD_HTTP_SCHEMAS.listRequest),
    TaskListResponse: body(TASK_RECORD_HTTP_SCHEMAS.listResponse),
    TaskDetailRequest: body(TASK_RECORD_HTTP_SCHEMAS.detailRequest),
    TaskDetailResponse: body(TASK_RECORD_HTTP_SCHEMAS.detailResponse),
    TaskUpdateRequest: body(TASK_RECORD_HTTP_SCHEMAS.updateRequest),
    TaskUpdateResponse: body(TASK_RECORD_HTTP_SCHEMAS.updateResponse),
    TaskCompleteRequest: body(TASK_RECORD_HTTP_SCHEMAS.completeRequest),
    TaskCompleteResponse: body(TASK_RECORD_HTTP_SCHEMAS.completeResponse),
    TaskAbandonRequest: body(TASK_RECORD_HTTP_SCHEMAS.abandonRequest),
    TaskAbandonResponse: body(TASK_RECORD_HTTP_SCHEMAS.abandonResponse),
    TaskErrorResponse: body(TASK_RECORD_HTTP_SCHEMAS.errorResponse),
  };
  const projection = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'TaskRecordHttpDtoProjection',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.keys(definitions)
      .filter((name) => name.startsWith('Task') && (name.endsWith('Request') || name.endsWith('Response')))
      .map((name) => [name[0].toLowerCase() + name.slice(1), { $ref: `#/$defs/${name}` }])),
    required: Object.keys(definitions)
      .filter((name) => name.startsWith('Task') && (name.endsWith('Request') || name.endsWith('Response')))
      .map((name) => name[0].toLowerCase() + name.slice(1)),
    $defs: definitions,
  };
  const generated = await compile(projection, 'TaskRecordHttpDtoProjection', {
    bannerComment: '',
    additionalProperties: false,
    enableConstEnums: false,
    strictIndexSignatures: true,
    unreachableDefinitions: false,
    style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
  });
  return [
    '/* eslint-disable */',
    '// Generated from Task Record HTTP JSON Schema. Do not edit.',
    '// Run: npm run contracts:generate',
    '',
    generated.trim(),
    '',
    'export type TaskUpdateResponse = TaskRecordMutationResponse;',
    'export type TaskCompleteResponse = TaskRecordMutationResponse;',
    'export type TaskAbandonResponse = TaskRecordMutationResponse;',
    'export type TaskErrorResponse = ErrorResponse;',
    '',
  ].join('\n');
}

export async function checkTaskRecordHttpDto() {
  const expected = await renderTaskRecordHttpDto();
  return outputs.filter((output) => !fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected);
}

async function main() {
  const check = process.argv.includes('--check');
  const expected = await renderTaskRecordHttpDto();
  if (check) {
    const drift = outputs.filter((output) => !fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected);
    if (drift.length) {
      console.error(`Task Record HTTP DTO drift: ${drift.map((output) => path.relative(workspaceProductRoot, output)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, expected);
    console.log(`Generated ${path.relative(workspaceProductRoot, output)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
