import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { completePublicationEffects } from '../../../../../../skills/buildr-release/scripts/release-publication.ts';
import { publishFrozenArtifact } from '../../../../../../skills/buildr-release/scripts/trusted-publish.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';
import { readReleaseArtifact } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { createVerificationPhaseRecorder, VERIFICATION_PHASE_TIMING_PREFIX } from '../verification/timing/phases.ts';

const phaseScope = 'integration-candidate-release-effects';
const diagnosticRoot = process.env.BUILDR_DIAGNOSTICS_OUTPUT;
const phaseOutput = process.env.BUILDR_VERIFICATION_PHASE_OUTPUT;
const progressOutput = diagnosticRoot ? path.join(diagnosticRoot, `publication-effects-progress-${process.pid}.jsonl`) : null;
const phaseRecorder = createVerificationPhaseRecorder(phaseScope);
let progressCount = 0;

function childFacts(value: any): Record<string, unknown> {
  const errorCode = value?.error?.code ?? value?.code;
  return {
    ...(Number.isSafeInteger(value?.pid) && value.pid > 0 ? { childPid: value.pid } : {}),
    ...(value?.status === null || Number.isSafeInteger(value?.status) ? { childExitCode: value.status } : {}),
    ...(value?.signal === null || /^SIG[A-Z0-9]{1,16}$/.test(value?.signal ?? '') ? { childSignal: value.signal } : {}),
    ...(typeof errorCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(errorCode) ? { childErrorCode: errorCode } : {}),
  };
}

function progress(id: string, status: 'started' | 'passed' | 'failed', startedAt: number, facts: Record<string, unknown> = {}): void {
  if (progressCount >= 128) return;
  progressCount++;
  const record = status === 'started'
    ? { id, status, startedAt: new Date(startedAt).toISOString() }
    : phaseRecorder.record(id, startedAt, Date.now(), status);
  const output = `${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({ scope: phaseScope, pid: process.pid, sequence: progressCount, ...record, ...facts })}\n`;
  // Synchronous, bounded breadcrumbs survive a parent timeout; diagnostic I/O cannot replace a test result.
  try { fs.writeSync(process.stderr.fd, output); } catch {}
  for (const target of [phaseOutput, progressOutput]) {
    if (!target) continue;
    try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.appendFileSync(target, output, 'utf8'); } catch {}
  }
}

function retainInstallFailure(result: any, count: number): Record<string, unknown> {
  if (!diagnosticRoot) return {};
  const retained: Record<string, unknown> = {};
  for (const stream of ['stdout', 'stderr'] as const) {
    const bytes = Buffer.from(String(result[stream] ?? ''), 'utf8');
    try {
      fs.mkdirSync(diagnosticRoot, { recursive: true });
      fs.writeFileSync(path.join(diagnosticRoot, `publication-effects-install-${process.pid}-${count}.${stream}.log`), bytes.subarray(0, 8 * 1024));
      retained[`${stream}Retained`] = true;
      retained[`${stream}Truncated`] = bytes.length > 8 * 1024;
    } catch {}
  }
  return retained;
}

const git = (repo: string, args: string[]) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

test('publication failure and checkpoints preserve an unknown pair check without attempting npm publication', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publication-compatibility-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'), remote = path.join(root, 'remote.git');
  fs.mkdirSync(repo); git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Buildr Test']); git(repo, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(repo, 'value'), 'source'); git(repo, ['add', 'value']); git(repo, ['commit', '-m', 'source']);
  git(repo, ['init', '--bare', remote]); git(repo, ['remote', 'add', 'origin', remote]);
  const source = git(repo, ['rev-parse', 'HEAD']), built = await createReleaseArtifactFixture(path.join(root, 'artifact'), source);
  const artifact = readReleaseArtifact(built.manifestPath), version = artifact.manifest.version;
  const checkpoints: any[] = [];
  const result = await completePublicationEffects({ context: { release: { version }, convergence: { mainCommit: source },
    workflow: { repository: 'BuildrAI/Buildr' } }, artifact, repo, notes: 'Fixture notes.', token: 'local-test-service',
    checkpoint: (value: any) => checkpoints.push(structuredClone(value)),
  }, {
    fetchImpl: async (url: any) => {
      if (String(url).includes('/git/ref/')) return new Response(JSON.stringify({ object: { type: 'commit', sha: source } }), { status: 200 });
      return new Response(JSON.stringify(String(url).includes('registry.npmjs.org') ? { name: '@buildr-ai/buildr', 'dist-tags': { latest: '0.0.1' } } : {}),
        { status: String(url).includes('registry.npmjs.org') && !String(url).endsWith(`/${version}`) ? 200 : 404 });
    },
    observePublishedPackageArtifact: async () => ({ observation: { status: 'present', artifact: {
      packageName: '@buildr-ai/buildr-dsh-plugin', version: '0.1.0-rc.1', origin: 'registry', compatibility: null,
      integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`, artifactSha256: '1'.repeat(64),
    } }, bytes: Buffer.from('plugin') }),
    verifyBuildrPluginPair: () => { throw Object.assign(new Error('spawn missing npm'), { code: 'ENOENT' }); },
    publish: () => assert.fail('an unproved pair cannot reach npm publication'),
  });
  assert.equal(result.status, 'failed'); assert.equal(result.failure.code, 'release-package-compatibility-blocked');
  const compatibility = result.failure.compatibility;
  assert.equal(compatibility.checks[0].features[0].status, 'unknown');
  assert.equal(compatibility.pairDiagnostics[0].errorCode, 'ENOENT');
  assert.equal(compatibility.pairDiagnostics[0].message, 'spawn missing npm');
  assert.deepEqual(checkpoints.at(-1).steps.at(-1).compatibility, compatibility);
  assert.equal(result.effects.some((effect: any) => effect.type.includes('npm')), false);
});

test('publication effects use the real artifact and recover each external partial result', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publication-effects-'));
  t.after(() => {
    const startedAt = Date.now();
    progress('root-cleanup', 'started', startedAt);
    try { fs.rmSync(root, { recursive: true, force: true }); progress('root-cleanup', 'passed', startedAt, { cleanup: 'cleaned' }); }
    catch (error) { progress('root-cleanup', 'failed', startedAt, { cleanup: 'failed', ...childFacts(error) }); throw error; }
  });
  const npmCache = path.join(root, 'npm-content-cache');
  let realInstallCount = 0;
  let consumerChecks = 0;
  let injectedConsumerFailures = 0;
  let installDurationMs = 0;
  const sourceRepo = path.join(root, 'source');
  fs.mkdirSync(sourceRepo);
  git(sourceRepo, ['init', '-b', 'main']);
  git(sourceRepo, ['config', 'user.name', 'Buildr Test']);
  git(sourceRepo, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(sourceRepo, 'value'), 'source');
  git(sourceRepo, ['add', 'value']); git(sourceRepo, ['commit', '-m', 'source']);
  const source = git(sourceRepo, ['rev-parse', 'HEAD']);
  const built = await createReleaseArtifactFixture(path.join(root, 'artifact'), source);
  const artifact = readReleaseArtifact(built.manifestPath);
  const version = artifact.manifest.version;
  const tag = `v${version}`;
  const notes = 'Concrete fixture release notes.\n';
  const prefix = path.join(root, 'installed');
  const installedMetadataPath = path.join(prefix, 'node_modules/@buildr-ai/buildr/package.json');
  const assertInstalledPackage = () => {
    const metadata = JSON.parse(fs.readFileSync(installedMetadataPath, 'utf8'));
    assert.equal(metadata.name, artifact.manifest.packageName);
    assert.equal(metadata.version, version);
  };
  // The artifact and consumer input are identical in every recovery scenario.
  // Prove the real offline installation once; the scenarios below exercise the
  // publication protocol and independently inspect that installed package.
  const installStartedAt = Date.now();
  const cli = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  realInstallCount++;
  progress('registry-install', 'started', installStartedAt, { realInstallCount });
  const installation = spawnSync(cli, ['install', '--offline', '--ignore-scripts', '--prefix', prefix, artifact.tarball], { encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, npm_config_cache: npmCache } });
  installDurationMs += Date.now() - installStartedAt;
  progress('registry-install', installation.status === 0 ? 'passed' : 'failed', installStartedAt, {
    realInstallCount, ...childFacts(installation),
    ...(installation.status === 0 ? {} : retainInstallFailure(installation, realInstallCount)),
  });
  assert.equal(installation.status, 0, installation.stderr);
  assertInstalledPackage();
  const installedMetadata = fs.readFileSync(installedMetadataPath, 'utf8');
  try {
    fs.writeFileSync(installedMetadataPath, JSON.stringify({ ...JSON.parse(installedMetadata), version: '0.0.0-wrong' }));
    assert.throws(assertInstalledPackage, assert.AssertionError, 'a stale installed package cannot satisfy a recovery check');
  } finally { fs.writeFileSync(installedMetadataPath, installedMetadata); }
  assertInstalledPackage();
  for (const failure of ['none', 'tag-before-npm', 'npm-response-lost', 'github-denied', 'github-response-lost', 'registry-smoke', 'integrity-conflict']) {
    await t.test(failure, async sub => {
      const scenarioStartedAt = Date.now();
      let scenarioStatus: 'passed' | 'failed' = 'passed';
      let scenarioFailureFacts: Record<string, unknown> = {};
      progress(`scenario-${failure}`, 'started', scenarioStartedAt, { failure });
      try {
        const repo = path.join(root, failure);
        git(sourceRepo, ['clone', '--quiet', sourceRepo, repo]);
        const remote = path.join(root, `${failure}.git`);
        git(sourceRepo, ['init', '--bare', remote]);
        git(repo, ['remote', 'set-url', 'origin', remote]);
        let published = failure === 'integrity-conflict';
        let integrity = failure === 'integrity-conflict' ? 'sha512-Y29uZmxpY3Q=' : artifact.manifest.integrity;
        let next: string | null = published ? version : null;
        let release: any = null;
        let failed = false;
        let writes = 0;
        let releaseWrites = 0;
        let scenarioConsumerChecks = 0;
        let repaired = false;
        const server = http.createServer((req, res) => {
          const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
          if (req.url?.startsWith('/repos/')) {
            if (req.url.includes('/git/ref/')) {
              const observed = git(repo, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}^{}`, `refs/tags/${tag}`]);
              if (!observed) return json(404, {});
              return json(200, { object: { type: 'commit', sha: source } });
            }
            if (req.url.endsWith('/releases/latest')) return json(200, { tag_name: 'v0.0.1' });
            if (req.method === 'POST') {
              if (failure === 'github-denied' && !repaired) return json(403, {});
              releaseWrites++;
              release = { tag_name: tag, name: tag, body: notes, draft: false, prerelease: true, assets: [] };
              if (failure === 'github-response-lost' && !failed) { failed = true; req.socket.destroy(); return; }
              return json(201, release);
            }
            return json(release ? 200 : 404, release || {});
          }
          if (req.method === 'PUT') {
            writes++;
            if (failure === 'tag-before-npm' && !repaired) return json(503, {});
            published = true; next = version;
            if (failure === 'npm-response-lost' && !failed) { failed = true; req.socket.destroy(); return; }
            return json(201, {});
          }
          if (req.url?.endsWith(`/${version}`)) return json(published ? 200 : 404, { name: '@buildr-ai/buildr', version, dist: { integrity } });
          json(200, { name: '@buildr-ai/buildr', 'dist-tags': { latest: '0.0.1', next } });
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        sub.after(() => new Promise<void>(resolve => {
          const startedAt = Date.now();
          progress('server-cleanup', 'started', startedAt, { failure });
          server.closeAllConnections();
          server.close(error => {
            progress('server-cleanup', error ? 'failed' : 'passed', startedAt, { failure, cleanup: error ? 'failed' : 'cleaned', ...childFacts(error) });
            resolve();
          });
        }));
        const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        const fetchImpl: typeof fetch = (url, init) => fetch(`${api}${new URL(String(url)).pathname}`, init);
        const dependencies = {
          fetchImpl,
          observePublishedPackageArtifact: async () => ({ observation: { status: 'absent', packageName: '@buildr-ai/buildr-dsh-plugin' } }),
          publish: async (args: string[]) => {
            assert.equal(args[0], artifact.tarball, 'the exact prebuilt tarball is consumed');
            try { const response = await fetch(`${api}/registry-write`, { method: 'PUT', body: fs.readFileSync(args[0]!) }); return { status: response.status === 201 ? 0 : 1 }; }
            catch { return { status: 1 }; }
          },
          registryWait: { attempts: 2, delayMs: 1 },
          registryInstall: () => {
            if (failure === 'registry-smoke' && !repaired) {
              injectedConsumerFailures++;
              const startedAt = Date.now();
              progress('registry-install-injected-failure', 'started', startedAt, { failure, consumerChecks, injected: true });
              progress('registry-install-injected-failure', 'passed', startedAt, { failure, consumerChecks, injected: true, expectedFailure: true });
              throw new Error('injected install read failure');
            }
            const checkStartedAt = Date.now();
            scenarioConsumerChecks++;
            consumerChecks++;
            assertInstalledPackage();
            progress('installed-package-check', 'passed', checkStartedAt, { failure, consumerChecks, scenarioConsumerChecks, realInstallCount });
            return { status: 'passed' };
          },
        };
        const options = { context: { release: { version }, convergence: { mainCommit: source }, workflow: { repository: 'BuildrAI/Buildr' } }, artifact, repo, token: 'local-test-service', notes };
        const first = await completePublicationEffects(options, dependencies);
        if (failure === 'integrity-conflict') {
          assert.equal(first.status, 'failed');
          assert.equal(writes, 0);
          assert.equal(scenarioConsumerChecks, 0, 'conflicting bytes never reach the package consumer');
          assert.equal(git(repo, ['ls-remote', 'origin', `refs/tags/${tag}`]), '');
          return;
        }
        if (['tag-before-npm', 'github-denied', 'registry-smoke'].includes(failure)) {
          assert.equal(first.status, 'failed');
          assert.ok(git(repo, ['ls-remote', 'origin', `refs/tags/${tag}`]));
          if (failure !== 'tag-before-npm') assert.equal(first.values.registry.published, true);
          repaired = true;
          const second = await completePublicationEffects(options, dependencies);
          assert.equal(second.status, 'passed', JSON.stringify(second.failure));
          assert.equal(writes, failure === 'tag-before-npm' ? 2 : 1, 'published bytes are never sent twice');
        } else assert.equal(first.status, 'passed', JSON.stringify(first.failure));
        const writesBefore = writes;
        const third = await completePublicationEffects(options, dependencies);
        assert.equal(third.status, 'passed');
        assert.equal(writes, writesBefore);
        assert.equal(releaseWrites, 1);
        assert.equal(scenarioConsumerChecks, 2, 'recovery and idempotent continuation both request package consumption');
      } catch (error) {
        scenarioStatus = 'failed';
        scenarioFailureFacts = childFacts(error);
        throw error;
      } finally {
        progress(`scenario-${failure}`, scenarioStatus, scenarioStartedAt, { failure, consumerChecks, realInstallCount, bodyCompleted: true, ...scenarioFailureFacts });
      }
    });
  }
  assert.equal(realInstallCount, 1);
  assert.equal(consumerChecks, 12);
  assert.equal(injectedConsumerFailures, 1);
  assert.equal(readReleaseArtifact(built.manifestPath).manifest.sha256, artifact.manifest.sha256, 'all scenarios retain the original frozen bytes');
  t.diagnostic(`publication real installs=${realInstallCount} durationMs=${installDurationMs} protocol consumer checks=${consumerChecks}`);
});

test('publishFrozenArtifact converges on delayed registry propagation without republishing', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publish-readback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRepo = path.join(root, 'source');
  fs.mkdirSync(sourceRepo);
  git(sourceRepo, ['init', '-b', 'main']);
  git(sourceRepo, ['config', 'user.name', 'Buildr Test']);
  git(sourceRepo, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(sourceRepo, 'value'), 'source');
  git(sourceRepo, ['add', 'value']); git(sourceRepo, ['commit', '-m', 'source']);
  const source = git(sourceRepo, ['rev-parse', 'HEAD']);
  const built = await createReleaseArtifactFixture(path.join(root, 'artifact'), source);
  const artifact = readReleaseArtifact(built.manifestPath);
  const version = artifact.manifest.version;
  const npmTag = version.includes('-') ? 'next' : 'latest';

  let published = false;
  let visible = false;
  let puts = 0;
  let reads = 0;
  const server = http.createServer((req, res) => {
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'PUT') { puts++; published = true; return json(201, {}); }
    if (req.url?.endsWith(`/${version}`)) {
      reads++;
      if (published && reads >= 3) visible = true;
      return json(visible ? 200 : 404, { name: '@buildr-ai/buildr', version, dist: { integrity: artifact.manifest.integrity } });
    }
    return json(200, { name: '@buildr-ai/buildr', 'dist-tags': { latest: '0.0.1', next: published ? version : null } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const fetchImpl: typeof fetch = (url, init) => fetch(`${api}${new URL(String(url)).pathname}`, init);
  const result = await publishFrozenArtifact({ manifestPath: built.manifestPath, npmTag }, {
    fetchImpl,
    publish: async (args: string[]) => {
      assert.equal(args[0], artifact.tarball, 'the exact prebuilt tarball is consumed');
      const response = await fetch(`${api}/registry-write`, { method: 'PUT', body: fs.readFileSync(args[0]!) });
      return { status: response.status === 201 ? 0 : 1, stdout: '', stderr: '' };
    },
    registryWait: { attempts: 6, delayMs: 1 },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.action, 'published');
  assert.equal(puts, 1, 'npm publish is dispatched exactly once even though the registry propagated late');
  assert.ok(reads >= 3, `readback polled until propagation converged (reads=${reads})`);
});

test('publishFrozenArtifact reports unconfirmed after the bounded window and never republishes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publish-unconfirmed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRepo = path.join(root, 'source');
  fs.mkdirSync(sourceRepo);
  git(sourceRepo, ['init', '-b', 'main']);
  git(sourceRepo, ['config', 'user.name', 'Buildr Test']);
  git(sourceRepo, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(sourceRepo, 'value'), 'source');
  git(sourceRepo, ['add', 'value']); git(sourceRepo, ['commit', '-m', 'source']);
  const source = git(sourceRepo, ['rev-parse', 'HEAD']);
  const built = await createReleaseArtifactFixture(path.join(root, 'artifact'), source);
  const artifact = readReleaseArtifact(built.manifestPath);
  const version = artifact.manifest.version;
  const npmTag = version.includes('-') ? 'next' : 'latest';

  let publishCalls = 0;
  const server = http.createServer((req, res) => {
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url?.endsWith(`/${version}`)) return json(404, {});
    return json(200, { name: '@buildr-ai/buildr', 'dist-tags': { latest: '0.0.1', next: null } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const fetchImpl: typeof fetch = (url, init) => fetch(`${api}${new URL(String(url)).pathname}`, init);
  const result = await publishFrozenArtifact({ manifestPath: built.manifestPath, npmTag }, {
    fetchImpl,
    publish: async () => { publishCalls++; return { status: 0, stdout: '', stderr: '' }; },
    registryWait: { attempts: 3, delayMs: 1 },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.action, 'readback-required');
  assert.equal(result.diagnostic.code, 'npm-publication-unconfirmed');
  assert.equal(publishCalls, 1, 'the bounded window expires without a second publish');
});

