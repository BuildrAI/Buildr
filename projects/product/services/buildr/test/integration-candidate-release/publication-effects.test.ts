import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { completePublicationEffects } from '../../tools/release/release-publication.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';
import { readReleaseArtifact } from '../../tools/release/release-artifact.ts';

const git = (repo: string, args: string[]) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

test('publication effects use the real artifact and recover each external partial result', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publication-effects-'));
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
  const tag = `v${version}`;
  const notes = 'Concrete fixture release notes.\n';
  for (const failure of ['none', 'tag-before-npm', 'npm-response-lost', 'github-denied', 'github-response-lost', 'registry-smoke', 'integrity-conflict']) {
    await t.test(failure, async sub => {
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
      let installed = 0;
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
      sub.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
      const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const fetchImpl: typeof fetch = (url, init) => fetch(`${api}${new URL(String(url)).pathname}`, init);
      const dependencies = {
        fetchImpl,
        publish: async (args: string[]) => {
          assert.equal(args[0], artifact.tarball, 'the exact prebuilt tarball is consumed');
          try { const response = await fetch(`${api}/registry-write`, { method: 'PUT', body: fs.readFileSync(args[0]!) }); return { status: response.status === 201 ? 0 : 1 }; }
          catch { return { status: 1 }; }
        },
        registryWait: { attempts: 2, delayMs: 1 },
        registryInstall: () => {
          if (failure === 'registry-smoke' && !repaired) throw new Error('injected install read failure');
          installed++;
          const prefix = path.join(repo, 'installed');
          const cli = process.platform === 'win32' ? 'npm.cmd' : 'npm';
          const result = spawnSync(cli, ['install', '--offline', '--ignore-scripts', '--prefix', prefix, artifact.tarball], { encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, npm_config_cache: path.join(repo, 'cache') } });
          assert.equal(result.status, 0, result.stderr);
          const metadata = JSON.parse(fs.readFileSync(path.join(prefix, 'node_modules/@buildr-ai/buildr/package.json'), 'utf8'));
          assert.equal(metadata.version, version);
          return { status: 'passed' };
        },
      };
      const options = { context: { release: { version }, convergence: { mainCommit: source }, workflow: { repository: 'BuildrAI/Buildr' } }, artifact, repo, token: 'local-test-service', notes };
      const first = await completePublicationEffects(options, dependencies);
      if (failure === 'integrity-conflict') {
        assert.equal(first.status, 'failed');
        assert.equal(writes, 0);
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
      assert.ok(installed >= 1);
    });
  }
});
