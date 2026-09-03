import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildApplicationPayload } from '../../tools/release/application-payload.mjs';
import { createReleaseArtifact, readReleaseArtifact } from '../../tools/release/release-artifact.mjs';
import { inspectCandidatePaths } from '../../test/verification/release/open-source-candidate.mjs';
import {
  CANDIDATE_PACK_METADATA_ENV,
  CANDIDATE_RELEASE_MANIFEST_ENV,
  CANDIDATE_TARBALL_ENV,
  readSharedCandidatePackage,
} from '../../test/verification/release/candidate-package.mjs';
import {
  preserveLauncherFailureEvidence,
  RELEASE_LAUNCHER_READINESS_TIMEOUT_MS,
  resolveReleaseSmokeSource,
  waitForWebReadiness,
} from '../../test/verification/release/release-smoke.mjs';
import { createVerificationExecutor } from '../../test/verification/executor.mjs';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('release smoke readiness retries a stale instance connection while startup continues', async (t) => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-readiness-'));
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appData, 'instance.json'), JSON.stringify({ url: 'http://127.0.0.1:64218', secret: 'test' }));
  let attempts = 0;

  const health = await waitForWebReadiness({
    appData,
    async fetchHealth() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      return {
        status: 200,
        async json() { return { schemaVersion: 'buildr.local-app-health/v1', status: 'ready' }; },
      };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(health.status, 'ready');
});

test('release smoke readiness fails on an independent wall-clock budget with process diagnostics', async (t) => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-readiness-timeout-'));
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appData, 'instance.json'), JSON.stringify({ url: 'http://127.0.0.1:64219', secret: 'must-not-leak', pid: process.pid }));
  let clock = 0;

  await assert.rejects(
    () => waitForWebReadiness({
      appData,
      timeoutMs: 120,
      pollIntervalMs: 50,
      now: () => clock,
      wait: async (delayMs) => { clock += delayMs; },
      async fetchHealth() { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); },
    }),
    (error) => {
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

test('release smoke preserves redacted Launcher evidence beside phase diagnostics before cleanup', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const diagnostics = path.join(root, 'diagnostics');
  const phaseOutput = path.join(diagnostics, 'release-tarball-smoke.phases.jsonl');
  const appData = path.join(root, 'app-data');
  const launcherHome = path.join(root, 'launcher-home');
  const launcherLog = path.join(launcherHome, 'Library', 'Logs', 'Buildr', 'launcher.log');
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
  const error = new Error('not ready');
  error.readiness = {
    elapsedMs: 15_000,
    budgetMs: 15_000,
    process: { pid: 4321, parentPid: 4000, processGroupId: 4321, alive: false, observation: 'pid-exited' },
  };

  const retained = preserveLauncherFailureEvidence({
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
  const serialized = fs.readFileSync(retained.evidencePath, 'utf8');
  assert.doesNotMatch(serialized, /must-not-persist/);
  const evidence = JSON.parse(serialized);
  assert.equal(evidence.schemaVersion, 'buildr.release-launcher-failure-evidence/v1');
  assert.equal(evidence.instance.secretPresent, true);
  assert.equal(evidence.process.processGroupId, 4321);
  assert.equal(evidence.elapsedMs, 15_000);
  assert.match(evidence.launcherLog.sha256, /^sha256-[a-f0-9]{64}$/u);
  assert.match(fs.readFileSync(retained.retainedLogPath, 'utf8'), /Node identity/);
  assert.equal(fs.readFileSync(phaseOutput, 'utf8'), 'phase-evidence\n', 'phase evidence must remain intact');
});

test('Host Node executor can bind the matrix runtime without reading development .node-version', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-host-node-matrix-'));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-open-source-deletion-'));
  try {
    fs.writeFileSync(path.join(root, 'kept.md'), 'public candidate\n');
    assert.deepEqual(inspectCandidatePaths(root, ['kept.md', 'deleted.md']), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shared candidate package requires a matching immutable tarball and metadata pair', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-candidate-package-'));
  try {
    const tarball = path.join(root, 'buildr-ai-buildr-0.1.0.tgz');
    const metadataPath = path.join(root, 'npm-pack.json');
    fs.writeFileSync(tarball, 'fixture');
    fs.writeFileSync(metadataPath, `${JSON.stringify([{ filename: path.basename(tarball), files: [{ path: 'package.json' }] }])}\n`);
    const shared = readSharedCandidatePackage({
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-artifact-'));
  try {
    const generated = createGeneratedReleaseInputs(path.join(root, 'generated'), '0'.repeat(40));
    const payload = await buildApplicationPayload(path.join(root, 'payload'), '0'.repeat(40), { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
    const artifact = createReleaseArtifact(payload.root, path.join(root, 'artifact'), { testContextRoot: generated.testContextRoot });
    assert.equal(artifact.manifest.schemaVersion, 'buildr.release-artifact/v1');
    assert.equal(artifact.manifest.packageName, '@buildr-ai/buildr');
    assert.equal(artifact.manifest.version.length > 0, true);
    assert.match(artifact.manifest.sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.manifest.integrity, /^sha512-/);
    assert.equal(artifact.manifest.applicationPayloadDigest, payload.manifest.applicationPayloadDigest);
    assert.equal(artifact.manifest.inventory.some((entry) => entry.path === 'package.json'), true);
    assert.equal(readReleaseArtifact(artifact.manifestPath).tarball, artifact.tarball);

    const forbiddenRepackRoot = path.join(root, 'must-not-repack');
    const execute = createVerificationExecutor({
      productRoot: serviceRoot,
      artifactDirectory: forbiddenRepackRoot,
      env: {
        [CANDIDATE_TARBALL_ENV]: artifact.tarball,
        [CANDIDATE_PACK_METADATA_ENV]: artifact.packMetadataPath,
        [CANDIDATE_RELEASE_MANIFEST_ENV]: artifact.manifestPath,
      },
    });
    const reused = await execute({ id: 'candidate-tarball', name: 'reuse external artifact', executor: { type: 'candidate-artifact' } });
    assert.equal(reused.status, 'passed', reused.stderr);
    assert.equal(fs.existsSync(forbiddenRepackRoot), false, 'external Candidate artifact must prevent another npm pack');

    const smokeSource = resolveReleaseSmokeSource({ BUILDR_RELEASE_ARTIFACT_MANIFEST: artifact.manifestPath });
    assert.equal(smokeSource.kind, 'release-artifact');
    assert.equal(smokeSource.installTarget, artifact.tarball);
    assert.equal(smokeSource.expectedVersion, artifact.manifest.version);

    fs.appendFileSync(artifact.tarball, 'mutated');
    assert.throws(() => readReleaseArtifact(artifact.manifestPath), /size does not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
