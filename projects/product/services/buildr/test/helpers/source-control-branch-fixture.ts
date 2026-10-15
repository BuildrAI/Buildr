import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** The browser host owns this data; UI writes use production HTTP only. */
export async function withSourceControlBranchFixture(
  input: { base: string; repository: string; peerRepository: string; startPoint: string; originalPath: string },
  verify: (fixture: any) => Promise<void>,
) {
  const git = (directory: string, args: string[], env: NodeJS.ProcessEnv = process.env) => {
    // Snapshot reads must not refresh another checkout's index and create a
    // filesystem event that masquerades as an external edit during the journey.
    const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: directory, encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
    return result.stdout.trim();
  };
  const root = fs.realpathSync(input.repository), peer = fs.realpathSync(input.peerRepository);
  const location = path.join(input.base, 'repo-a-worktrees', 'branch-actions');
  const remote = 'browser-origin', remoteDirectory = path.join(input.base, 'scm-branch-origin.git');
  const branch = 'fixture/team/current-review', alternate = 'fixture/team/alternate-review';
  const remoteName = 'feature/browser-review', remoteRef = 'refs/remotes/' + remote + '/' + remoteName;
  const historyPath = 'scm-browser-branches/history.ts', keepPath = 'scm-browser-branches/keep.txt';
  const authorName = '同名作者', authorEmail = 'first.author@example.com', otherEmail = 'second.author@example.com';
  const originalBranch = git(root, ['symbolic-ref', '--short', 'HEAD']);
  for (const reference of ['refs/heads/' + branch, 'refs/heads/' + alternate, 'refs/heads/' + remoteName, remoteRef]) {
    assert.equal(spawnSync('git', ['show-ref', '--verify', '--quiet', reference], { cwd: root }).status, 1, '验收引用必须尚不存在');
  }
  assert.ok(!git(root, ['remote']).split('\n').includes(remote), '验收远程名称必须尚不存在');
  let created = false, remoteAdded = false;
  const configFile = path.join(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])), 'config');
  let originalAuthorConfig: Buffer | null = null;
  const configureAuthor = (configuration: {name: string; email: string; userName?: string; userEmail?: string} | null) => {
    // Local empty values explicitly mask the host's global identity. Nothing
    // outside this disposable repository is changed or inferred from commits.
    const relative = path.relative(fs.realpathSync(input.base), fs.realpathSync(configFile));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), '作者配置只能修改隔离夹具自己的Git配置');
    originalAuthorConfig ||= fs.readFileSync(configFile);
    const values = {
      'author.name': configuration?.name || '', 'author.email': configuration?.email || '',
      'user.name': configuration?.userName ?? configuration?.name ?? '',
      'user.email': configuration?.userEmail ?? configuration?.email ?? '',
    };
    for (const [key,value] of Object.entries(values)) git(root, ['config', '--local', '--replace-all', key, value]);
  };
  try {
    git(root, ['worktree', 'add', '-b', branch, location, input.startPoint]); created = true;
    const commit = (email: string, message: string, text: string) => {
      fs.mkdirSync(path.join(location, path.dirname(historyPath)), { recursive: true });
      fs.writeFileSync(path.join(location, historyPath), text);
      git(location, ['add', '--', historyPath]);
      git(location, ['-c', 'commit.gpgSign=false', 'commit', '-qm', message], {
        ...process.env, GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: authorName, GIT_COMMITTER_EMAIL: email,
      });
      return git(location, ['rev-parse', 'HEAD']);
    };
    const first = commit(authorEmail, 'filter shared first author', 'export const branchHistory = 1;\n');
    const second = commit(otherEmail, 'filter shared second author', 'export const branchHistory = 2;\n');
    const tip = commit(authorEmail, 'filter unique first author', 'export const branchHistory = 3;\n');
    git(root, ['branch', alternate, first]);
    git(input.base, ['init', '--bare', '-q', remoteDirectory]);
    git(root, ['remote', 'add', remote, remoteDirectory]); remoteAdded = true;
    git(root, ['push', '--no-verify', '-q', remote, second + ':refs/heads/' + remoteName]);
    fs.writeFileSync(path.join(location, keepPath), 'preserve current work\n');
    const allLocations = [...new Set([root, peer].flatMap(repository => git(repository, ['worktree', 'list', '--porcelain', '-z']).split('\0').filter(field => field.startsWith('worktree ')).map(field => fs.realpathSync(field.slice(9)))))].sort();
    const digest = (file: string) => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    const observe = (directory: string) => {
      const index = git(directory, ['rev-parse', '--git-path', 'index']);
      return {
        location: directory, head: git(directory, ['rev-parse', 'HEAD']), branch: git(directory, ['symbolic-ref', '--short', 'HEAD']),
        status: git(directory, ['status', '--porcelain=v2', '-z', '--untracked-files=all']),
        index: digest(path.resolve(directory, index)),
        files: Object.fromEntries([input.originalPath, historyPath, keepPath].map(relative => [relative, digest(path.join(directory, relative))])),
      };
    };
    const otherPositions = (except: string) => allLocations.filter(directory => directory !== except).map(observe);
    const snapshot = () => ({
      positions: allLocations.map(observe),
      refs: [root, peer].map(repository => git(repository, ['for-each-ref', '--format=%(refname) %(objectname) %(upstream)'])),
      config: [root, peer].map(repository => git(repository, ['config', '--local', '--list'])),
    });
    await verify({
      location: fs.realpathSync(location), root, originalBranch, branch, alternate, remote, remoteName, remoteRef,
      historyPath, keepPath, authorName, authorEmail, otherEmail, first, second, tip,
      snapshot, otherPositions, observe, configureAuthor,
      liveRefresh: {
        // External tools own these changes. Browser actions still use production
        // HTTP; only this disposable checkout is written outside the product.
        path: historyPath,
        cachePath: 'scm-browser-branches/live-cache',
        createdDirectory: 'scm-browser-branches/live-auto-directory',
        createdFile: 'scm-browser-branches/live-auto-directory/nested/new.ts',
        prepareDirectoryCache: () => {
          for(let index=0;index<8;index++){
            const directory=path.join(location,'scm-browser-branches/live-cache/other-'+index);
            fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'file.ts'),'export const unrelated = '+index+';\n');
          }
        },
        createDirectory: () => {
          const file=path.join(location,'scm-browser-branches/live-auto-directory/nested/new.ts');
          fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'export const newlyCreated = true;\n');
        },
        removeDirectory: () => fs.rmSync(path.join(location,'scm-browser-branches/live-auto-directory'),{recursive:true}),
        removeUntrackedKeep: () => {
          assert.equal(fs.readFileSync(path.join(location, keepPath), 'utf8'), 'preserve current work\n');
          fs.unlinkSync(path.join(location, keepPath));
        },
        write: (text: string) => fs.writeFileSync(path.join(location, historyPath), text),
        restore: () => fs.writeFileSync(path.join(location, historyPath), git(location, ['show', 'HEAD:' + historyPath]) + '\n'),
        commit: (message: string, text: string) => commit(authorEmail, message, text),
      },
      publishRemoteBranch: (name = 'feature/added-after-observation') => {
        // Only the isolated bare remote changes; local remote-tracking refs stay stale until UI Fetch.
        git(remoteDirectory, ['update-ref', 'refs/heads/' + name, second]);
        return {name, remoteRef:'refs/remotes/' + remote + '/' + name};
      },
      keepContent: () => fs.readFileSync(path.join(location, keepPath), 'utf8'),
      blockCheckout: () => fs.writeFileSync(path.join(location, historyPath), 'preserve conflicting work\n'),
      localTracking: () => ({
        head: git(root, ['rev-parse', 'refs/heads/' + remoteName]),
        upstream: git(root, ['for-each-ref', '--format=%(upstream)', 'refs/heads/' + remoteName]),
      }),
    });
  } finally {
    // No force or restore touches the registered directory; all authored content
    // discarded below belongs solely to the disposable browser checkout.
    if (git(root, ['symbolic-ref', '--short', 'HEAD']) !== originalBranch) git(root, ['checkout', originalBranch]);
    if (originalAuthorConfig) fs.writeFileSync(configFile, originalAuthorConfig);
    if (created) git(root, ['worktree', 'remove', '--force', location]);
    for (const name of [remoteName, alternate, branch]) {
      if (spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/' + name], { cwd: root }).status === 0) git(root, ['branch', '-D', name]);
    }
    if (remoteAdded) git(root, ['remote', 'remove', remote]);
    fs.rmSync(remoteDirectory, { recursive: true, force: true });
  }
}
