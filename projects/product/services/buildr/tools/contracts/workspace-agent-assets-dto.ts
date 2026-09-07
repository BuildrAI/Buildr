#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { WORKSPACE_HTTP_SCHEMAS } from '../../src/workspace/interfaces/http/workspace-http-contracts.ts';
import { AGENT_ASSETS_HTTP_SCHEMAS } from '../../src/agent-assets/interfaces/http/agent-assets-http-contracts.ts';
import { cliOutputRoot, contractOutputPaths } from './output-paths.ts';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const productRoot: any = path.resolve(serviceRoot, '../..');

const targets: any = Object.freeze([
  { name: 'workspace-http-dto.ts', backendRelative: 'workspace/interfaces/http', schemas: WORKSPACE_HTTP_SCHEMAS },
  { name: 'agent-assets-http-dto.ts', backendRelative: 'agent-assets/interfaces/http', schemas: AGENT_ASSETS_HTTP_SCHEMAS },
]);

async function renderTarget(target: any): Promise<any>  {
  const parts: any[] = [];
  for (const [key, schema] of Object.entries(target.schemas) as Array<[string, any]>) {
    const { $schema: _draft, $id: _id, title: _title, ...body }: any = schema;
    const generated: any = await compile({ ...body, title: `${schema.title}_${key}` }, `${schema.title}_${key}`, {
      bannerComment: '', additionalProperties: false, enableConstEnums: false, strictIndexSignatures: true, unreachableDefinitions: false,
      style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
    });
    parts.push(generated.trim());
  }
  return ['/* eslint-disable */', `// Generated from ${target.name.replace('-dto.ts', '')} JSON Schema. Do not edit.`, '// Run: npm run contracts:generate:workspace', '', ...parts, ''].join('\n');
}

export async function renderWorkspaceAgentAssetsDtos(outputRoot: any): Promise<any>  {
  return Promise.all(targets.map(async (target: any) => ({ ...target, ...contractOutputPaths(target.backendRelative, target.name, outputRoot), content: await renderTarget(target) })));
}

export async function checkWorkspaceAgentAssetsDtos(outputRoot: any): Promise<any>  {
  const rendered: any = await renderWorkspaceAgentAssetsDtos(outputRoot);
  return rendered.flatMap((target: any) => [target.backend, target.web].filter((file: any) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== target.content));
}

export async function writeWorkspaceAgentAssetsDtos(outputRoot: any = undefined): Promise<any>  {
  const rendered: any = await renderWorkspaceAgentAssetsDtos(outputRoot);
  const outputs: any[] = [];
  for (const target of rendered) {
    for (const file of [target.backend, target.web]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, target.content);
      outputs.push(file);
    }
  }
  return outputs;
}

async function main(): Promise<any>  {
  const check: any = process.argv.includes('--check');
  const outputRoot: any = cliOutputRoot(process.argv.slice(2));
  const rendered: any = await renderWorkspaceAgentAssetsDtos(outputRoot);
  if (check) {
    const drift: any = rendered.flatMap((target: any) => [target.backend, target.web].filter((file: any) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== target.content));
    if (drift.length) {
      console.error(`Workspace/Agent Assets HTTP DTO drift: ${drift.map((file: any) => path.relative(productRoot, file)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const file of await writeWorkspaceAgentAssetsDtos(outputRoot)) {
    console.log(`Generated ${path.relative(productRoot, file)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
