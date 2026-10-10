import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyComposition } from '../../tools/verify-composition.ts';
import { ownedBuildRoot } from '../../tools/prepare-source-sdk.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
test('the complete composition survives relocation and rejects a missing installed producer', async t => {
  const bundle = process.env.BUILDR_DSH_COMPOSITION_ROOT;
  if (!bundle) return t.skip('full verification supplies its actually built composition');
  const stage = await mkdtemp(join(ownedBuildRoot(root), 'dsh-composition-package-test-'));
  const relocated = join(stage, 'relocated');
  await cp(bundle, relocated, { recursive: true });
  const checked = await verifyComposition(relocated);
  assert.ok(checked.fileCount > 31, 'the installable package includes the producer and presentation components');
  const manifest = JSON.parse(await readFile(join(relocated, 'package.json'), 'utf8'));
  assert.equal(manifest.dsh.client, undefined, 'only the composition registers the packaged client');
  const definition = JSON.parse(await readFile(join(relocated, 'runtime-composition/definition.json'), 'utf8'));
  const producer = join(relocated, 'runtime-composition', definition.modules['@deepseek-ai/dsh-tools']);
  await rm(producer);
  await assert.rejects(verifyComposition(relocated), /composition bytes differ/);
  await rm(stage, { recursive: true });
});

test('the complete composition rejects an added install hook', async t => {
  const bundle = process.env.BUILDR_DSH_COMPOSITION_DEV_ROOT;
  if (!bundle) return t.skip('full verification supplies its actually built development composition');
  const stage = await mkdtemp(join(ownedBuildRoot(root), 'dsh-composition-hook-test-'));
  const relocated = join(stage, 'relocated'); await cp(bundle, relocated, { recursive: true });
  const file = join(relocated, 'package.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.scripts = { postinstall: 'node install.js' }; await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyComposition(relocated), /installation hooks/);
  await rm(stage, { recursive: true });
});
