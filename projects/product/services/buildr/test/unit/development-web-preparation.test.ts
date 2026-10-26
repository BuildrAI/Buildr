import assert from 'node:assert/strict';
import test from 'node:test';

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
