import { copyEmptyCodeRepository } from './code-operation-seeds.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeCommitApplication } from '../../src/modules/code/application/code-commit-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { runCodeGitMutation } from '../../src/modules/code/infrastructure/code-git-mutation-runner.ts';

export function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commit-operation-')), root = path.join(base, 'repository');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['-C', location, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  copyEmptyCodeRepository(root, format, 'Commit Fixture', 'fixture@example.com');
  const write = (file: string, value: string, directory = root) => fs.writeFileSync(path.join(directory, file), value);
  const commit = (message = 'base') => { git('add', '--all'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo-one', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const input = () => ({ repositoryId: 'repo-one', worktreeId: app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!.worktreeId });
  const request = (message = 'all current changes', mode: 'commit' | 'commit-push' | 'commit-sync' = 'commit', location = input()) => ({ ...location, expectedRevision: app.commitContext(root, location).revision, message, mode });
  const index = () => { const file = git('rev-parse', '--path-format=absolute', '--git-path', 'index'); return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; };
  const remote = () => { const target = path.join(base, 'remote.git'); gitAt(base, 'init', '--bare', '--object-format=' + format, target); git('remote', 'add', 'origin', target); git('push', '-u', 'origin', 'main'); return target; };
  return { base, root, app, git, gitAt, write, commit, input, request, index, remote };
}
export const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
export function advanceRemote(f: ReturnType<typeof fixture>, remote: string, file = 'remote.txt', value = 'remote\n') {
  const writer = path.join(f.base, 'remote-writer');
  f.gitAt(f.base, 'clone', remote, writer); f.gitAt(writer, 'checkout', 'main');
  f.gitAt(writer, 'config', 'user.name', 'Remote Fixture'); f.gitAt(writer, 'config', 'user.email', 'remote@example.com'); f.gitAt(writer, 'config', 'commit.gpgSign', 'false');
  f.write(file, value, writer); f.gitAt(writer, 'add', '--all'); f.gitAt(writer, 'commit', '-qm', 'remote advance'); f.gitAt(writer, 'push', 'origin', 'main');
  return f.gitAt(writer, 'rev-parse', 'HEAD');
}
export const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export async function waitForFile(file: string) {
  const until = Date.now() + 10_000;
  while (!fs.existsSync(file) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fs.existsSync(file), true, 'Git fixture hook did not reach its stage');
}
