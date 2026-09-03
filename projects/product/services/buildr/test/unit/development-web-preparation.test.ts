import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareDevelopmentWeb } from '../../tools/development/prepare-development-web.ts';

test('development Web preparation generates DTOs before building the ignored dist', async () => {
  const events: string[] = [];
  const result = await prepareDevelopmentWeb({
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
  assert.deepEqual(events, ['generate-dtos', 'build:/tmp/buildr-development-web-output']);
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
    generateDtos: async () => { throw new Error('dto-failed'); },
    build: (outputRoot) => {
      built = true;
      return outputRoot;
    },
  }), /dto-failed/);
  assert.equal(built, false);
});
