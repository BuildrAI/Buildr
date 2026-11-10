import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { cachedSource, downloadDirectory, downloadRegistry, installSdkDependencies, MIRROR_REGISTRY, OFFICIAL_REGISTRY, sharedPnpmStore } from '../../tools/release-sdk-downloads.ts';
import { releaseSdkEnvironment, type ReleaseSdkCommand } from '../../tools/prepare-release-sdk.ts';

const build = resolve(import.meta.dirname, '../../build');
test('shared store discovery keeps host cache identity but not user credentials or npm configuration', t => {
  mkdirSync(build, { recursive: true });
  const root = mkdtempSync(join(build, 'download-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = releaseSdkEnvironment(process.execPath, join(root, 'empty.npmrc'), join(root, 'global.npmrc'));
  const run: ReleaseSdkCommand = (_file, args, options) => {
    assert.deepEqual(args, ['/tools/pnpm.cjs', 'store', 'path']);
    assert.equal(options.env.NPM_CONFIG_USERCONFIG, env.NPM_CONFIG_USERCONFIG);
    assert.equal(options.env.NODE_AUTH_TOKEN, undefined);
    assert.notEqual(options.env.HOME, root);
    return join(root, 'store');
  };
  assert.equal(sharedPnpmStore(process.execPath, '/tools/pnpm.cjs', run, env, root), join(root, 'store'));
  assert.equal(sharedPnpmStore(process.execPath, '/tools/pnpm.cjs', run, env, root), join(root, 'store'));
  const alias = join(root, 'alias'); symlinkSync(join(root, 'store'), alias);
  assert.throws(() => downloadDirectory(alias), /symlink/);
  assert.throws(() => downloadDirectory(join(alias, 'new')), /symlink/);
});
test('mirror fallback is bounded and never bypasses authentication, integrity, certificate or lock failures', () => {
  assert.equal(downloadRegistry(MIRROR_REGISTRY), MIRROR_REGISTRY);
  for (const invalid of ['http://registry.npmmirror.com/', 'https://token@registry.npmmirror.com/', 'https://evil.invalid/']) assert.throws(() => downloadRegistry(invalid));
  for (const code of ['ERR_PNPM_FETCH_404', 'ERR_PNPM_FETCH_503', 'ECONNRESET']) {
    const registries: string[] = [];
    assert.equal(installSdkDependencies('node', ['pnpm', 'install'], '.', { NPM_CONFIG_REGISTRY: MIRROR_REGISTRY }, (_file, _args, options) => {
      assert.equal(options.env.pnpm_config_registry, options.env.NPM_CONFIG_REGISTRY,
        'pnpm 11 and npm must select the same registry, including fallback');
      registries.push(options.env.NPM_CONFIG_REGISTRY!);
      if (registries.length === 1) throw new Error(code);
      return '';
    }), true);
    assert.deepEqual(registries, [MIRROR_REGISTRY, OFFICIAL_REGISTRY]);
  }
  for (const code of ['ERR_PNPM_TARBALL_INTEGRITY ETIMEDOUT', 'ERR_PNPM_OUTDATED_LOCKFILE', 'CERT_HAS_EXPIRED', 'ERR_PNPM_FETCH_401', 'unknown install failure']) {
    let calls = 0;
    assert.throws(() => installSdkDependencies('node', [], '.', { NPM_CONFIG_REGISTRY: MIRROR_REGISTRY }, () => { calls++; throw new Error(code); }));
    assert.equal(calls, 1);
  }
});
test('real Git cache serves two independent checkouts without contacting the missing upstream on a hit', async t => {
  mkdirSync(build, { recursive: true });
  const root = realpathSync(mkdtempSync(join(build, 'git-cache-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = join(root, 'upstream'); mkdirSync(upstream);
  const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git(upstream, ['init', '--quiet']);
  writeFileSync(join(upstream, 'input'), 'fixed bytes\n');
  git(upstream, ['add', '.']);
  git(upstream, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixed']);
  writeFileSync(join(upstream, 'input'), 'fixed bytes\nsecond commit\n');
  git(upstream, ['add', '.']);
  git(upstream, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'shallow boundary']);
  git(upstream, ['tag', 'fixed']);
  const commit = git(upstream, ['rev-parse', 'HEAD']);
  const run: ReleaseSdkCommand = (file, args, options) => execFileSync(file, args, { cwd: options.cwd, env: options.env, encoding: 'utf8', timeout: 10_000 }).trim();
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file' };
  const prepare = async (name: string) => {
    const source = join(root, name); mkdirSync(source); git(source, ['init', '--quiet']);
    const status = await cachedSource({ source, repository: upstream, tag: 'fixed', commit, cacheRoot: join(root, 'cache'), run, env });
    git(source, ['checkout', '--quiet', '--detach', commit]);
    assert.equal(readFileSync(join(source, 'input'), 'utf8'), 'fixed bytes\nsecond commit\n');
    return { source, status };
  };
  assert.equal((await prepare('first')).status, 'downloaded');
  rmSync(upstream, { recursive: true });
  const second = await prepare('second');
  assert.equal(second.status, 'hit');
  rmSync(join(root, 'cache'), { recursive: true });
  assert.equal(git(second.source, ['show', `${commit}:input`]), 'fixed bytes\nsecond commit');
});
