#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { LOCAL_APP_HTTP_SCHEMAS } from '../../src/web/http/local-app-http-contracts.mjs';
import { RELEASE_AWARENESS_HTTP_SCHEMAS } from '../../src/system/installation/interfaces/http/release-awareness-http-contracts.mjs';
import { PUBLICATION_HTTP_SCHEMAS } from '../../src/system/publication/interfaces/http/publication-http-contracts.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const backend = path.join(serviceRoot, 'src/web/http/generated/runtime-system-http-dto.ts');
const web = path.join(productRoot, 'services/buildr-web/src/api/generated/runtime-system-http-dto.ts');
const catalogs = Object.freeze([
  ['localApp', LOCAL_APP_HTTP_SCHEMAS],
  ['releaseAwareness', RELEASE_AWARENESS_HTTP_SCHEMAS],
  ['publication', PUBLICATION_HTTP_SCHEMAS],
]);

export async function renderRuntimeSystemDto() {
  const parts = [];
  for (const [catalog, schemas] of catalogs) {
    for (const [key, value] of Object.entries(schemas)) {
      const { $schema: _draft, $id: _id, title: _title, ...body } = value;
      const name = `${value.title}_${catalog}_${key}`;
      const generated = await compile({ ...body, title: name }, name, {
        bannerComment: '', additionalProperties: false, enableConstEnums: false, strictIndexSignatures: true, unreachableDefinitions: false,
        style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
      });
      parts.push(generated.trim());
    }
  }
  return ['/* eslint-disable */', '// Generated from Runtime/System HTTP JSON Schemas. Do not edit.', '// Run: npm run contracts:generate:runtime-system', '', ...parts, ''].join('\n');
}

export async function checkRuntimeSystemDto() {
  const content = await renderRuntimeSystemDto();
  return [backend, web].filter((file) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content);
}

async function main() {
  const content = await renderRuntimeSystemDto();
  const drift = [backend, web].filter((file) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content);
  if (process.argv.includes('--check')) {
    if (drift.length) {
      console.error(`Runtime/System HTTP DTO drift: ${drift.map((file) => path.relative(productRoot, file)).join(', ')}`);
      process.exitCode = 1;
    }
    return;
  }
  for (const file of [backend, web]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`Generated ${path.relative(productRoot, file)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
