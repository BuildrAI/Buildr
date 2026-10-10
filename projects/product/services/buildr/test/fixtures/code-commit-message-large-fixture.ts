import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import { defaultTestContextPool } from '../context/node-test.ts';
import { WORKSPACE_FOUNDATION_CONTEXT_KEY } from '../context/profiles.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_QUERY } from '../../src/modules/workspace/module.ts';

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const digest = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
export const LARGE_TEXT_BYTES = 5 * 1024 * 1024 + 128;
export const LARGE_PATH_COUNT = 93;
export const LARGE_TEXT_MARKER = 'LARGE_BODY_NOT_INITIAL_PROMPT';
export const LARGE_HTML_MARKER = 'HTML_BODY_NOT_INITIAL_PROMPT';

/** All Git setup belongs to this disposable lease; the generated worktree is never committed. */
export function largeCommitMessageFixture(t: TestContext) {
  const prepared = defaultTestContextPool().acquire(WORKSPACE_FOUNDATION_CONTEXT_KEY, {name: 'commit-message-large-http'});
  const base = fs.realpathSync(prepared.base), root = fs.realpathSync(prepared.root);
  const previous = {app: process.env.BUILDR_APP_DATA_DIR, product: process.env.BUILDR_PRODUCT_DATA_DIR}, cleanup: Array<() => void | Promise<void>> = [];
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  t.after(async () => {
    try {for (const close of cleanup.toReversed()) await close();}
    finally {
      prepared.release();
      if (previous.app === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous.app;
      if (previous.product === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = previous.product;
    }
  });
  const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (directory: string, args: string[]) => execFileSync('git', ['--no-optional-locks', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], {encoding: 'utf8', env: {...gitEnvironment, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'}, stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git(root, ['init', '--initial-branch=fixture-main']);
  git(root, ['config', 'user.name', 'Large Generation Fixture']); git(root, ['config', 'user.email', 'large-fixture@example.invalid']);
  const writer = createRuntime(), query = runtimeProvide(writer, WORKSPACE_QUERY);
  let catalog = writer.assetCatalog(root);
  if (catalog.migrationRequired) catalog = writer.migrateAssetCatalog(root, {revision: catalog.revision});
  let repository = catalog.repositories.find((item: {source: unknown}) => {try {return fs.realpathSync(query.resolveSourceRoot(root, item.source)) === root;} catch {return false;}});
  if (!repository) {
    catalog = writer.createCatalogRepository(root, {revision: catalog.revision, code: 'large-context', name: '大规模只读生成', path: root});
    repository = catalog.repositories.find((item: {code: string}) => item.code === 'large-context');
  }
  assert.ok(repository);
  git(root, ['add', '-A']); git(root, ['commit', '-qm', 'chore: large generation baseline']);
  const location = path.join(base, 'large-source-worktree');
  git(root, ['worktree', 'add', '-b', 'fixture/large-context', location, 'HEAD']);
  assert.equal(git(location, ['status', '--porcelain=v2', '--untracked-files=all']), '', '大规模变更从干净独立工作树开始');
  const files: string[] = [];
  const write = (relative: string, content: Buffer | string) => {const file = path.join(location, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, content); files.push(relative);};
  const prefix = 'export const largeContextIntent = "ON_DEMAND_LARGE_CONTEXT";\n';
  const line = '// ' + LARGE_TEXT_MARKER + ' deterministic padding is unrelated to the changed intent.\n';
  write('src/large-input.ts', prefix + line.repeat(Math.ceil(LARGE_TEXT_BYTES / line.length)).slice(0, LARGE_TEXT_BYTES - Buffer.byteLength(prefix)));
  for (const relative of ['prototype/body.html', 'prototype/viewer.html', 'prototype/rebuilt/body.html', 'prototype/rebuilt/viewer.html']) {
    const header = '<!doctype html><!-- buildr:ui-prototype --><html><head><title>Large fixture</title></head><body><script>/*';
    write(relative, header + (LARGE_HTML_MARKER + ' bundled data\n').repeat(Math.ceil(1024 * 1024 / (LARGE_HTML_MARKER.length + 14))).slice(0, 1024 * 1024) + '*/</script></body></html>\n');
  }
  write('assets/icon.bin', Buffer.alloc(128 * 1024, 0));
  for (let index = 0; index < 87; index++) write('src/support/file-' + String(index).padStart(3, '0') + '.ts', 'export const support' + index + ' = ' + index + ';\n');
  files.sort(); assert.equal(files.length, LARGE_PATH_COUNT);
  const home = path.join(base, 'codex-home'); fs.mkdirSync(home);
  const executable = path.join(base, 'codex-large-fixture');
  fs.writeFileSync(executable, '#!/bin/sh\nexport BUILDR_FAKE_CODEX_MODE=success\nexec ' + quote(process.execPath) + ' ' + quote(path.resolve(import.meta.dirname, 'agent-codex-app-server.ts')) + ' "$@"\n', {mode: 0o755});
  const observe = () => {
    const index = git(location, ['rev-parse', '--path-format=absolute', '--git-path', 'index']);
    return {head: git(location, ['rev-parse', 'HEAD']), mainHead: git(root, ['rev-parse', 'HEAD']), index: digest(fs.readFileSync(index)), status: git(location, ['status', '--porcelain=v2', '-z', '--untracked-files=all']), files: files.map(relative => ({path: relative, digest: digest(fs.readFileSync(path.join(location, relative)))}))};
  };
  const messages = (): Record<string, unknown>[] => fs.existsSync(path.join(home, 'protocol.jsonl')) ? fs.readFileSync(path.join(home, 'protocol.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return {base, root, location: fs.realpathSync(location), repositoryId: repository.id as string, home, executable, files, observe, messages, onCleanup: (close: () => void | Promise<void>) => cleanup.push(close), totalBytes: files.reduce((total, file) => total + fs.statSync(path.join(location, file)).size, 0), gitCommonDirectory: fs.realpathSync(git(location, ['rev-parse', '--path-format=absolute', '--git-common-dir']))};
}
