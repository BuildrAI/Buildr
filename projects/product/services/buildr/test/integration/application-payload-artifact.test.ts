import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readReleaseArtifact } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { GENERATED_USER_REGISTRY_RESOURCE_SOURCES } from '../../src/infrastructure/product-layout.ts';
import { candidateArtifact, runNpm, serviceRoot, testContextConsumerFixture } from '../helpers/application-payload-release.ts';

test('npm release artifact freezes one tarball with complete payload and no platform runtime', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-payload-'));
  try {
    const { artifact, payloadDigest }: any = await candidateArtifact(root);
    const readback: any = readReleaseArtifact(artifact.manifestPath, {
      packageName: '@buildr-ai/buildr',
      version: artifact.manifest.version,
      applicationPayloadDigest: payloadDigest,
    });
    assert.equal(readback.tarball, artifact.tarball);
    // Inspect the actual packed resource: a source-only fix must reach the distributed skill.
    const skillPath = 'payload/product/resources/runtime/skills/install-dsh-plugin/SKILL.md';
    const packedSkill = spawnSync('tar', ['-xOf', artifact.tarball, `package/${skillPath}`], { encoding: 'utf8' });
    assert.equal(packedSkill.status, 0, packedSkill.stderr);
    assert.equal(packedSkill.stdout, fs.readFileSync(path.join(serviceRoot, 'resources/runtime/skills/install-dsh-plugin/SKILL.md'), 'utf8'));
    for (const resource of [
      'workspace/skills/buildr/task-manager/SKILL.md',
      'workspace/skills/buildr/task-triage/SKILL.md',
      'workspace/skills/buildr/task-triage/references/structured-handoff.md',
      'runtime/skills/buildr/SKILL.md',
      'runtime/skills/buildr/references/local-services.md',
    ]) {
      const packed = spawnSync('tar', ['-xOf', artifact.tarball, `package/payload/product/resources/${resource}`], { encoding: 'utf8' });
      assert.equal(packed.status, 0, packed.stderr);
      assert.equal(packed.stdout, fs.readFileSync(path.join(serviceRoot, 'resources', resource), 'utf8'), `distributed task guidance: ${resource}`);
    }
    assert.match(artifact.manifest.generatedArtifactIdentity, /^sha256-[a-f0-9]{64}$/);
    const paths: any = artifact.manifest.inventory.map((entry: any) => entry.path);
    for (const required of [
      'runtime/buildr.cjs',
      'scripts/postinstall.mjs',
      'test-context.mjs',
      'build/test-context/index.js',
      'build/test-context/index.d.ts',
      'payload/runtime/read-worker.cjs',
      'payload/runtime/upstream-openspec-worker.cjs',
      'payload/product/web-dist/index.html',
      'payload/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'payload/product/resources/manifest.yml',
      'payload/product/resources/installation/launcher/Buildr.icns',
      'payload/product/resources/installation/launcher/Buildr.ico',
    ]) assert.equal(paths.includes(required), true, required);
    assert.equal(paths.some((value: any) => /(^|\/)node(?:\.exe)?(\/|$)/iu.test(value)), false);
    assert.equal(paths.some((value: any) => value.endsWith('/preparation.yml')), false);
    assert.equal(paths.some((value: any) => value.includes('/services/buildr-web/')), false);
    assert.equal(paths.some((value: any) => value.includes('/node_modules/typescript/')), false);
    assert.deepEqual(paths.filter((value: any) => /(^|\/)launchers?(\/|$)/iu.test(value)), [
      'payload/product/resources/installation/launcher/Buildr.icns',
      'payload/product/resources/installation/launcher/Buildr.ico',
    ]);
    assert.equal(paths.some((value: any) => /\.(?:app|pkg|msi|map)$/iu.test(value)), false);
    assert.equal(paths.some((value: any) => value.endsWith('.ts') && !value.endsWith('.d.ts')), false);
    assert.equal(paths.some((value: any) => /(?:^|\/)typescript(?:\/|$)/u.test(value)), false);
    assert.equal(paths.some((value: any) => /(?:^|\/)@types\/node(?:\/|$)/u.test(value)), false);
    for (const relativePath of GENERATED_USER_REGISTRY_RESOURCE_SOURCES) {
      assert.equal(paths.includes(`payload/product/${relativePath}`), false, relativePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('installed Candidate exposes the same Test Context ESM and strict TypeScript contract', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-test-context-'));
  try {
    const { artifact }: any = await candidateArtifact(root);
    const consumerRoot: any = path.join(root, 'consumer');
    fs.mkdirSync(consumerRoot, { recursive: true });
    for (const file of ['consumer.ts', 'runtime.mjs', 'tsconfig.json']) {
      fs.copyFileSync(path.join(testContextConsumerFixture, file), path.join(consumerRoot, file));
    }
    fs.writeFileSync(path.join(consumerRoot, 'package.json'), '{"type":"module"}\n');
    const installed: any = runNpm(['install', '--offline', '--ignore-scripts', '--prefix', consumerRoot, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: path.join(root, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const runtime: any = spawnSync(process.execPath, [path.join(consumerRoot, 'runtime.mjs')], { cwd: consumerRoot, encoding: 'utf8' });
    assert.equal(runtime.status, 0, runtime.stderr || runtime.stdout);
    const types: any = spawnSync(process.execPath, [
      path.join(serviceRoot, 'node_modules/typescript/bin/tsc'),
      '--project', path.join(consumerRoot, 'tsconfig.json'),
      '--typeRoots', path.join(serviceRoot, 'node_modules/@types'),
    ], { cwd: consumerRoot, encoding: 'utf8' });
    assert.equal(types.status, 0, types.stderr || types.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
