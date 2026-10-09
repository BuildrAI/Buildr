import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildApplicationPayload } from '../../tools/release/application-payload.ts';
import { createReleaseArtifact, readReleaseArtifact } from '../../tools/release/release-artifact.ts';
import { inspectCandidateFile, inspectCandidatePaths } from '../verification/release/open-source-candidate.ts';
import {
  CANDIDATE_PACK_METADATA_ENV,
  CANDIDATE_RELEASE_MANIFEST_ENV,
  CANDIDATE_TARBALL_ENV,
  readSharedCandidatePackage,
} from '../verification/release/candidate-package.ts';
import {
  preserveLauncherFailureEvidence,
  RELEASE_LAUNCHER_READINESS_TIMEOUT_MS,
  resolveReleaseSmokeSource,
  waitForWebReadiness,
} from '../verification/release/release-smoke.ts';
import { createVerificationExecutor } from '../verification/executor.ts';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');
const existingSourceAssets = [
  'projects/product/openspec/changes/archive/2026-10-03-add-code-source-control/prototypes/viewer.html',
  'projects/product/openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/prototypes/source/reader-preview.htm',
  'projects/product/openspec/changes/archive/2026-10-09-add-source-control-branches/prototypes/source-control-branches-viewer.html',
  'projects/product/services/dsh-plugin/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch',
  'projects/product/services/dsh-plugin/sdk-patches/dsh-v0.2.0-rc.2-event-sources.patch',
];

test('release smoke readiness retries a stale instance connection while startup continues', async (t: any) => {
  const appData: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-readiness-'));
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appData, 'instance.json'), JSON.stringify({ url: 'http://127.0.0.1:64218', secret: 'test' }));
  let attempts: any = 0;

  const health: any = await waitForWebReadiness({
    appData,
    async fetchHealth(): Promise<any>  {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      return {
        status: 200,
        async json(): Promise<any>  { return { schemaVersion: 'buildr.local-app-health/v1', status: 'ready' }; },
      };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(health.status, 'ready');
});

test('release smoke readiness fails on an independent wall-clock budget with process diagnostics', async (t: any) => {
  const appData: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-readiness-timeout-'));
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appData, 'instance.json'), JSON.stringify({ url: 'http://127.0.0.1:64219', secret: 'must-not-leak', pid: process.pid }));
  let clock: any = 0;

  await assert.rejects(
    () => waitForWebReadiness({
      appData,
      timeoutMs: 120,
      pollIntervalMs: 50,
      now: () => clock,
      wait: async (delayMs: any) => { clock += delayMs; },
      async fetchHealth(): Promise<any>  { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); },
    }),
    (error: any) => {
      assert.match(error.message, /within 120ms: elapsed=120ms/);
      assert.doesNotMatch(error.message, /must-not-leak/);
      assert.equal(error.readiness.budgetMs, 120);
      assert.equal(error.readiness.elapsedMs, 120);
      assert.equal(error.readiness.process.pid, process.pid);
      assert.equal(error.readiness.process.alive, true);
      assert.equal(error.readiness.lastConnectionError, 'ECONNREFUSED');
      return true;
    },
  );
  assert.equal(RELEASE_LAUNCHER_READINESS_TIMEOUT_MS, 15_000);
});

test('release smoke preserves redacted Launcher evidence beside phase diagnostics before cleanup', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const diagnostics: any = path.join(root, 'diagnostics');
  const phaseOutput: any = path.join(diagnostics, 'release-tarball-smoke.phases.jsonl');
  const appData: any = path.join(root, 'app-data');
  const launcherHome: any = path.join(root, 'launcher-home');
  const launcherLog: any = path.join(launcherHome, 'Library', 'Logs', 'Buildr', 'launcher.log');
  fs.mkdirSync(path.dirname(launcherLog), { recursive: true });
  fs.mkdirSync(diagnostics, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  fs.writeFileSync(phaseOutput, 'phase-evidence\n');
  fs.writeFileSync(launcherLog, 'Node identity: executable=/exact/node version=24.19.0 pathHead=/exact\nlauncher failed\n');
  fs.writeFileSync(path.join(appData, 'instance.json'), JSON.stringify({
    schemaVersion: 'buildr.local-app-instance/v1',
    url: 'http://127.0.0.1:4457',
    secret: 'must-not-persist',
    pid: 4321,
  }));
  const error: Error & Record<string, any> = new Error('not ready');
  error.readiness = {
    elapsedMs: 15_000,
    budgetMs: 15_000,
    process: { pid: 4321, parentPid: 4000, processGroupId: 4321, alive: false, observation: 'pid-exited' },
  };

  const retained: any = preserveLauncherFailureEvidence({
    appData,
    launcherHome,
    launcherTarget: path.join(root, 'Applications', 'Buildr Web.app'),
    nodeAudit: { schemaVersion: 'buildr.exact-node-execution-environment/v1', executable: '/exact/node', version: '24.19.0', bin: '/exact', pathHead: '/exact', identity: `sha256-${'a'.repeat(64)}` },
    startup: 'default-port',
    startedAt: Date.now() - 15_000,
    error,
    env: { BUILDR_VERIFICATION_PHASE_OUTPUT: phaseOutput },
  });

  assert.equal(retained.evidencePath, path.join(diagnostics, 'release-tarball-smoke.launcher-failure.json'));
  assert.equal(retained.retainedLogPath, path.join(diagnostics, 'release-tarball-smoke.launcher.log'));
  const serialized: any = fs.readFileSync(retained.evidencePath, 'utf8');
  assert.doesNotMatch(serialized, /must-not-persist/);
  const evidence: any = JSON.parse(serialized);
  assert.equal(evidence.schemaVersion, 'buildr.release-launcher-failure-evidence/v1');
  assert.equal(evidence.instance.secretPresent, true);
  assert.equal(evidence.process.processGroupId, 4321);
  assert.equal(evidence.elapsedMs, 15_000);
  assert.match(evidence.launcherLog.sha256, /^sha256-[a-f0-9]{64}$/u);
  assert.match(fs.readFileSync(retained.retainedLogPath, 'utf8'), /Node identity/);
  assert.equal(fs.readFileSync(phaseOutput, 'utf8'), 'phase-evidence\n', 'phase evidence must remain intact');
});

test('Host Node executor can bind the matrix runtime without reading development .node-version', (t: any) => {
  const projectRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-host-node-matrix-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(projectRoot, '.node-version'), '0.0.0\n');
  assert.doesNotThrow(() => createVerificationExecutor({
    productRoot: serviceRoot,
    projectRoot,
    diagnosticsDirectory: path.join(projectRoot, 'diagnostics'),
    artifactDirectory: path.join(projectRoot, 'artifact'),
    expectedNodeVersion: null,
  }));
  assert.throws(() => createVerificationExecutor({
    productRoot: serviceRoot,
    projectRoot,
    diagnosticsDirectory: path.join(projectRoot, 'diagnostics'),
    artifactDirectory: path.join(projectRoot, 'artifact'),
  }), /does not match required 0\.0\.0/u);
});

test('open-source candidate ignores tracked paths deleted from the frozen worktree', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-open-source-deletion-'));
  try {
    fs.writeFileSync(path.join(root, 'kept.md'), 'public candidate\n');
    assert.deepEqual(inspectCandidatePaths(root, ['kept.md', 'deleted.md']), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('existing readers and manifest-bound SDK patches retain only their exact source identity', () => {
  assert.deepEqual(inspectCandidatePaths(workspaceRoot, existingSourceAssets), []);
  for (const relativePath of existingSourceAssets) {
    const content = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
    const changed = String.fromCharCode(content.charCodeAt(0) ^ 1) + content.slice(1);
    assert.equal(Buffer.byteLength(changed), Buffer.byteLength(content));
    assert.ok(inspectCandidateFile(relativePath, changed).some((item: any) => item.rule === 'candidate.large-file'), relativePath);
    assert.ok(inspectCandidateFile('unknown-source-asset.txt', content).some((item: any) => item.rule === 'candidate.large-file'));
    assert.ok(inspectCandidateFile(relativePath, content, Buffer.byteLength(content) + 1).some((item: any) => item.rule === 'candidate.large-file'));
    const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const privateIdentity = ['fixture', 'private.test'].join('@');
    const findings = inspectCandidateFile(relativePath, `${content}\n${privateKey}\n${privateIdentity}`);
    assert.ok(findings.some((item: any) => item.rule === 'candidate.large-file'));
    assert.ok(findings.some((item: any) => item.rule === 'secret.private-key'));
    assert.ok(findings.some((item: any) => item.rule === 'private.email-address'));
    assert.equal(JSON.stringify(findings).includes(privateKey), false);
    assert.equal(JSON.stringify(findings).includes(privateIdentity), false);
  }
});

test('frozen SDK patch size requires its existing source manifest path, upstream and hash', (t: any) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-asset-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relativePath of existingSourceAssets.filter((item) => item.endsWith('.patch'))) {
    const patch = path.join(root, relativePath);
    const manifestRelativePath = relativePath.replace(/\.patch$/, '.json');
    const manifestPath = path.join(root, manifestRelativePath);
    const original = JSON.parse(fs.readFileSync(path.join(workspaceRoot, manifestRelativePath), 'utf8'));
    fs.mkdirSync(path.dirname(patch), { recursive: true });
    fs.copyFileSync(path.join(workspaceRoot, relativePath), patch);
    const check = () => inspectCandidatePaths(root, [relativePath]);
    assert.ok(check().some((item: any) => item.rule === 'candidate.large-file'), 'missing manifest');
    fs.writeFileSync(manifestPath, '{');
    assert.ok(check().some((item: any) => item.rule === 'candidate.large-file'), 'invalid JSON');
    fs.writeFileSync(manifestPath, JSON.stringify(original));
    assert.deepEqual(check(), []);
    for (const [field, changed] of [
      ['schemaVersion', { ...original, schemaVersion: 'buildr.dsh-source-patch/v1' }],
      ['patch.path', { ...original, patch: { ...original.patch, path: 'other.patch' } }],
      ['patch.sha256', { ...original, patch: { ...original.patch, sha256: '0'.repeat(64) } }],
      ['upstream.tag', { ...original, upstream: { ...original.upstream, tag: 'other' } }],
      ['upstream.commit', { ...original, upstream: { ...original.upstream, commit: '0'.repeat(40) } }],
      ['upstream.version', { ...original, upstream: { ...original.upstream, version: '0.0.0' } }],
    ]) {
      fs.writeFileSync(manifestPath, JSON.stringify(changed));
      assert.ok(check().some((item: any) => item.rule === 'candidate.large-file'), `${relativePath}: ${field}`);
    }
  }
});

test('shared candidate package requires a matching immutable tarball and metadata pair', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-candidate-package-'));
  try {
    const tarball: any = path.join(root, 'buildr-ai-buildr-0.1.0.tgz');
    const metadataPath: any = path.join(root, 'npm-pack.json');
    fs.writeFileSync(tarball, 'fixture');
    fs.writeFileSync(metadataPath, `${JSON.stringify([{ filename: path.basename(tarball), files: [{ path: 'package.json' }] }])}\n`);
    const shared: any = readSharedCandidatePackage({
      BUILDR_CANDIDATE_TARBALL: tarball,
      BUILDR_CANDIDATE_PACK_METADATA: metadataPath,
    });
    assert.equal(shared.tarball, tarball);
    assert.deepEqual(shared.metadata.files, [{ path: 'package.json' }]);
    assert.throws(() => readSharedCandidatePackage({ BUILDR_CANDIDATE_TARBALL: tarball }), /requires both/);
    fs.writeFileSync(metadataPath, `${JSON.stringify([{ filename: 'other.tgz', files: [] }])}\n`);
    assert.throws(() => readSharedCandidatePackage({
      BUILDR_CANDIDATE_TARBALL: tarball,
      BUILDR_CANDIDATE_PACK_METADATA: metadataPath,
    }), /filename does not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('release artifact preparation packs once and detects mutated bytes', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-artifact-'));
  try {
    const generated: any = createGeneratedReleaseInputs(path.join(root, 'generated'), '0'.repeat(40));
    const payload: any = await buildApplicationPayload(path.join(root, 'payload'), '0'.repeat(40), { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
    const artifact: any = createReleaseArtifact(payload.root, path.join(root, 'artifact'), { testContextRoot: generated.testContextRoot });
    assert.equal(artifact.manifest.schemaVersion, 'buildr.release-artifact/v1');
    assert.equal(artifact.manifest.packageName, '@buildr-ai/buildr');
    assert.equal(artifact.manifest.version.length > 0, true);
    assert.match(artifact.manifest.sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.manifest.integrity, /^sha512-/);
    assert.equal(artifact.manifest.applicationPayloadDigest, payload.manifest.applicationPayloadDigest);
    assert.equal(artifact.manifest.inventory.some((entry: any) => entry.path === 'package.json'), true);
    assert.equal(readReleaseArtifact(artifact.manifestPath).tarball, artifact.tarball);

    const forbiddenRepackRoot: any = path.join(root, 'must-not-repack');
    const execute: any = createVerificationExecutor({
      productRoot: serviceRoot,
      artifactDirectory: forbiddenRepackRoot,
      env: {
        [CANDIDATE_TARBALL_ENV]: artifact.tarball,
        [CANDIDATE_PACK_METADATA_ENV]: artifact.packMetadataPath,
        [CANDIDATE_RELEASE_MANIFEST_ENV]: artifact.manifestPath,
      },
    });
    const reused: any = await execute({ id: 'candidate-tarball', name: 'reuse external artifact', executor: { type: 'candidate-artifact' } });
    assert.equal(reused.status, 'passed', reused.stderr);
    assert.equal(fs.existsSync(forbiddenRepackRoot), false, 'external Candidate artifact must prevent another npm pack');

    const smokeSource: any = resolveReleaseSmokeSource({ BUILDR_RELEASE_ARTIFACT_MANIFEST: artifact.manifestPath });
    assert.equal(smokeSource.kind, 'release-artifact');
    assert.equal(smokeSource.installTarget, artifact.tarball);
    assert.equal(smokeSource.expectedVersion, artifact.manifest.version);

    fs.appendFileSync(artifact.tarball, 'mutated');
    assert.throws(() => readReleaseArtifact(artifact.manifestPath), /size does not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
