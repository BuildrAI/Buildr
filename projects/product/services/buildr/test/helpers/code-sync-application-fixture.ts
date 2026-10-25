import { copyCodeSyncRepositories } from './code-operation-seeds.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeSyncApplication } from '../../src/modules/code/application/code-sync-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS, CODE_HTTP_PATHS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { runCodeGitMutation } from '../../src/modules/code/infrastructure/code-git-mutation-runner.ts';
import { acquireCodeGitOperation } from '../../src/modules/code/infrastructure/code-git-operation-lock.ts';
import { observeGitCheckoutReadIdentity } from '../../src/infrastructure/git/checkout-read-identity.ts';
import { codeGitConfigurationFixture } from './code-git-configuration-fixture.ts';

export function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-sync-'))), root = path.join(base, 'repository'), remote = path.join(base, 'remote.git'), peer = path.join(base, 'peer');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['-C', location, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  const write = (file: string, content: string, location = root) => fs.writeFileSync(path.join(location, file), content);
  const commitAt = (location: string, message: string) => { gitAt(location, 'add', '--all'); gitAt(location, 'commit', '-qm', message); return gitAt(location, 'rev-parse', 'HEAD'); };
  const commit = (message = 'local') => commitAt(root, message);
  const initial = copyCodeSyncRepositories(base, format);
  let registered = root;
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo', code: 'repo', name: 'Sync Fixture', source: { type: 'workspace', path: registered } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const input = () => ({ repositoryId: 'repo', worktreeId: app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!.worktreeId });
  const request = () => ({ ...input(), expectedRevision: app.syncContext(root, input()).revision });
  const peerCommit = (file = 'remote.txt', content = 'remote\n') => { write(file, content, peer); const head = commitAt(peer, 'remote change'); gitAt(peer, 'push', 'origin', 'main'); return head; };
  const isolated = (run: typeof runCodeGitMutation) => createCodeSyncApplication({ source: (_root, location) => {
    const identity = observeGitCheckoutReadIdentity(registered);
    if (location.repositoryId !== 'repo' || identity.id !== location.worktreeId) throw Object.assign(Error('identity changed'), { code: 'code_worktree_identity_changed' });
    return { repositoryId: 'repo', worktreeId: identity.id, checkoutId: identity.id, taskId: null, commitHash: null, worktreeGroupId: 'main', location: identity.root, version: '当前文件', kind: 'default' };
  }, run });
  const index = () => fs.readFileSync(git('rev-parse', '--path-format=absolute', '--git-path', 'index'));
  return { base, root, remote, peer, git, gitAt, write, commit, commitAt, initial, app, input, request, peerCommit, isolated, index, replaceRegistration: (location: string) => { registered = location; } };
}
export const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
export function sessionApplication(f: ReturnType<typeof fixture>, onResolve: (count: number) => void) {
  let resolutions = 0;
  return createCodeApplication({
    assetCatalog: () => ({ repositories: [{ id: 'repo', code: 'repo', name: 'Sync Fixture', source: { type: 'workspace', path: f.root } }], services: [], projects: [] }),
    resolveSourceRoot: (_root, source) => { onResolve(++resolutions); return source.path; },
    readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null,
  });
}
