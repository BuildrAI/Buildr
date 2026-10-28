import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { prepareDevelopmentWeb } from '../../tools/development/prepare-development-web.ts';

test('development Web preparation generates DTOs before building the ignored dist', async () => {
  const events: string[] = [];
  const result = await prepareDevelopmentWeb({
    prepareAgent: () => { events.push('prepare-agent'); return '/prepared/agent'; },
    outputRoot: '/tmp/buildr-development-web-output',
    generateDtos: async () => {
      events.push('generate-dtos');
      return ['/generated/dto.ts'];
    },
    build: (outputRoot) => {
      events.push(`build:${outputRoot}`);
      return outputRoot;
    },
  });
  assert.deepEqual(events, ['prepare-agent', 'generate-dtos', 'build:/tmp/buildr-development-web-output']);
  assert.deepEqual(result, {
    schemaVersion: 'buildr.development-web-preparation/v1',
    status: 'passed',
    root: '/tmp/buildr-development-web-output',
    generatedDtos: ['/generated/dto.ts'],
  });
});

test('development Web preparation does not build when DTO generation fails', async () => {
  let built = false;
  await assert.rejects(prepareDevelopmentWeb({
    prepareAgent: () => '/prepared/agent',
    generateDtos: async () => { throw new Error('dto-failed'); },
    build: (outputRoot) => {
      built = true;
      return outputRoot;
    },
  }), /dto-failed/);
  assert.equal(built, false);
});

test('development preparation preserves the previous app when Agent compilation fails', async () => {
  let generated = false, built = false;
  await assert.rejects(prepareDevelopmentWeb({
    prepareAgent: () => { throw new Error('agent-build-failed'); },
    generateDtos: async () => { generated = true; return []; },
    build: output => { built = true; return output; },
  }), /agent-build-failed/);
  assert.equal(generated, false); assert.equal(built, false);
});

test('development installation renders current Agent schemas even when the launcher cached the previous package', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-schema-refresh-'));
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  try {
    write('package.json', '{"type":"module"}');
    write('schema.ts', 'export const fields = ["text"];');
    const writers = {
      'workbench-dto': 'writeWorkbenchDto', 'runtime-system-dto': 'writeRuntimeSystemDto',
      'task-professional-dto': 'writeTaskProfessionalHttpDto', 'task-dto': 'writeTaskRecordHttpDto',
      'workspace-agent-assets-dto': 'writeWorkspaceAgentAssetsDtos',
    };
    for (const [file, name] of Object.entries(writers)) {
      write(`tools/codegen/contracts/${file}.ts`, `import { fields } from '../../../schema.ts';
        export async function ${name}() { return fields.map(field => '/generated/' + field); }`);
    }
    write('tools/build/web-dist.ts', 'export const buildWebDist = root => root;');
    write('tools/development/prepare-development-agent.ts', `import fs from 'node:fs';
      export function prepareDevelopmentAgent() {
        fs.writeFileSync(new URL('../../schema.ts', import.meta.url), 'export const fields = ["text", "continueRunId"];');
        return '/prepared/agent';
      }`);
    const entry = 'tools/development/prepare-development-web.ts';
    write(entry, fs.readFileSync(new URL('../../tools/development/prepare-development-web.ts', import.meta.url), 'utf8'));
    const preparation = await import(pathToFileURL(path.join(root, entry)).href);
    // Deliberately retain an old module graph in the parent launcher.
    assert.ok((await preparation.generateDevelopmentWebDtos()).every((file: string) => !file.endsWith('continueRunId')));
    const result = await preparation.prepareDevelopmentWeb({ outputRoot: path.join(root, 'web-dist') });
    assert.equal(result.generatedDtos.filter((file: string) => file.endsWith('continueRunId')).length, 5);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('installation can import preparation before the old Agent package contains newly required schemas', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-web-new-schema-'));
  const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  try{
    write('package.json','{"type":"module"}');write('schema.ts','export const schemas = {};');
    const writers={'workbench-dto':'writeWorkbenchDto','runtime-system-dto':'writeRuntimeSystemDto','task-professional-dto':'writeTaskProfessionalHttpDto','task-dto':'writeTaskRecordHttpDto','workspace-agent-assets-dto':'writeWorkspaceAgentAssetsDtos'};
    for(const [file,name] of Object.entries(writers))write(`tools/codegen/contracts/${file}.ts`, `import {schemas} from '../../../schema.ts';const required=schemas.startDraft.$id;export async function ${name}(){return ['/generated/'+required];}`);
    write('tools/build/web-dist.ts','export const buildWebDist=root=>root;');
    write('tools/development/prepare-development-agent.ts',`import fs from 'node:fs';export function prepareDevelopmentAgent(){fs.writeFileSync(new URL('../../schema.ts',import.meta.url),'export const schemas={startDraft:{$id:"draft-start"}};');return '/prepared/agent';}`);
    const entry='tools/development/prepare-development-web.ts';write(entry,fs.readFileSync(new URL('../../tools/development/prepare-development-web.ts',import.meta.url),'utf8'));
    // The module must load before compilation; eager catalog imports used to fail here.
    const preparation=await import(pathToFileURL(path.join(root,entry)).href);
    const result=await preparation.prepareDevelopmentWeb({outputRoot:path.join(root,'web-dist')});
    assert.equal(result.status,'passed');assert.equal(result.generatedDtos.length,5);assert.ok(result.generatedDtos.every((file:string)=>file.endsWith('draft-start')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
