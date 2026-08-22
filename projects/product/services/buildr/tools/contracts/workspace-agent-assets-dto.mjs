#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { WORKSPACE_HTTP_SCHEMAS } from '../../src/workspace/interfaces/http/workspace-http-contracts.mjs';
import { AGENT_ASSETS_HTTP_SCHEMAS } from '../../src/agent-assets/interfaces/http/agent-assets-http-contracts.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');

const targets = Object.freeze([
  { name: 'workspace-http-dto.ts', schemas: WORKSPACE_HTTP_SCHEMAS, backend: path.join(serviceRoot, 'src/workspace/interfaces/http/generated/workspace-http-dto.ts'), web: path.join(productRoot, 'services/buildr-web/src/api/generated/workspace-http-dto.ts') },
  { name: 'agent-assets-http-dto.ts', schemas: AGENT_ASSETS_HTTP_SCHEMAS, backend: path.join(serviceRoot, 'src/agent-assets/interfaces/http/generated/agent-assets-http-dto.ts'), web: path.join(productRoot, 'services/buildr-web/src/api/generated/agent-assets-http-dto.ts') },
]);

async function renderTarget(target) {
  const parts = [];
  for (const [key, schema] of Object.entries(target.schemas)) {
    const { $schema: _draft, $id: _id, title: _title, ...body } = schema;
    const generated = await compile({ ...body, title: `${schema.title}_${key}` }, `${schema.title}_${key}`, {
      bannerComment: '', additionalProperties: false, enableConstEnums: false, strictIndexSignatures: true, unreachableDefinitions: false,
      style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
    });
    parts.push(generated.trim());
  }
  return ['/* eslint-disable */', `// Generated from ${target.name.replace('-dto.ts', '')} JSON Schema. Do not edit.`, '// Run: npm run contracts:generate:workspace', '', ...parts, ''].join('\n');
}

export async function renderWorkspaceAgentAssetsDtos() {
  return Promise.all(targets.map(async (target) => ({ ...target, content: await renderTarget(target) })));
}

export async function checkWorkspaceAgentAssetsDtos() {
  const rendered = await renderWorkspaceAgentAssetsDtos();
  return rendered.flatMap((target) => [target.backend, target.web].filter((file) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== target.content));
}

async function main() {
  const check = process.argv.includes('--check');
  const rendered = await renderWorkspaceAgentAssetsDtos();
  if (check) {
    const drift = rendered.flatMap((target) => [target.backend, target.web].filter((file) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== target.content));
    if (drift.length) {
      console.error(`Workspace/Agent Assets HTTP DTO drift: ${drift.map((file) => path.relative(productRoot, file)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const target of rendered) {
    for (const file of [target.backend, target.web]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, target.content);
      console.log(`Generated ${path.relative(productRoot, file)}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
