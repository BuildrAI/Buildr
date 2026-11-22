import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { codeFailure, codeGit, gitCommonDirectory, relativeCodePath, type CodeSource } from './code-file-reader.ts';
import { assertCodeRevision, assertSourceControlPath, codeRevision, observeSourceControl } from './source-control-git-reader.ts';
import { runCodeGitMutation } from './code-git-mutation-runner.ts';
import { acquireCodeGitOperation } from './code-git-operation-lock.ts';
import { sameFilesystemPath } from './filesystem-path-identity.ts';
import { observeGitCheckoutReadIdentity } from './checkout-read-identity.ts';

const limit = 16 * 1024 * 1024;
const text = (source: CodeSource, args: string[]) => codeGit(source.location, args).toString('utf8').trim();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const unsafe = (message: string) => codeFailure('code_local_git_unavailable', message, 409);
const unavailable = (message: string) => codeFailure('code_checkout_unavailable', message, 409);
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

/** Choosing a subdirectory or one linked checkout does not authorize its parent or other worktrees. */
export function localGitIdentity(root: string) {
  let rootOutput: string, gitDir: string;
  try {
    const output = codeGit(root, ['rev-parse', '--show-toplevel', '--absolute-git-dir']).toString().trim();
    const rows = output.split('\n');
    if (rows.length !== 2) throw new Error('unexpected git location');
    [rootOutput, gitDir] = rows;
  } catch { throw unavailable('当前目录不是可读取的 Git 工作树；资源管理器仍可使用。'); }
  if (!sameFilesystemPath(root, rootOutput)) throw unavailable('当前目录是仓库子目录。请明确选择 Git 工作树根目录后使用源代码管理。');
  gitDir = fs.realpathSync(gitDir);
  const commonDir = gitCommonDirectory(root);
  const identity = observeGitCheckoutReadIdentity(root);
  if(!sameFilesystemPath(gitDir,identity.gitDirectory)||!sameFilesystemPath(commonDir,identity.commonDirectory)) throw unavailable('Git 工作树身份已变化。');
  return { id: identity.id, gitDir, commonDir, isMain: sameFilesystemPath(gitDir, commonDir) };
}

function indexBytes(index: string): Buffer | null {
  const stat = fs.lstatSync(index, {throwIfNoEntry:false});
  if (!stat) return null;
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw unsafe('无法在读取上限内核对普通 Git 索引；请在原 Git 工具中处理。');
  const fd = fs.openSync(index, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    if (before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size || !before.isFile() || before.nlink !== 1) throw unsafe('Git 索引已变化，请刷新。');
    const result = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < result.length) {
      const count = fs.readSync(fd,result,length,result.length-length,null);
      if (!count) break;
      length += count;
    }
    const after = fs.fstatSync(fd);
    const named = fs.lstatSync(index);
    if (length !== stat.size || [after,named].some(current => current.ino !== stat.ino || current.dev !== stat.dev || current.size !== stat.size || current.ctimeMs !== stat.ctimeMs || current.mtimeMs !== stat.mtimeMs)) throw unsafe('Git 索引在读取期间已变化，请刷新。');
    return result.subarray(0,length);
  } finally { fs.closeSync(fd); }
}

const operationFiles = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_START'];
function configuredHooks(source: CodeSource) {
  return ['pre-commit','prepare-commit-msg','commit-msg','post-commit'].some(hook => {
    const location = text(source,['rev-parse','--path-format=absolute','--git-path','hooks/'+hook]);
    try { fs.accessSync(path.resolve(source.location,location),fs.constants.X_OK); return true; }
    catch (error) { if (['ENOENT','ENOTDIR','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return false; throw error; }
  });
}

export function observeLocalGit(source: CodeSource, expected?: string) {
  const git = localGitIdentity(source.location);
  if (source.worktreeId !== git.id) throw unavailable('Git 工作树身份已变化，请重新核对目录。');
  const indexPath = path.join(git.gitDir,'index');
  const bytes = indexBytes(indexPath);
  const indexDigest = bytes && hash(bytes);
  const state = observeSourceControl(source);
  const config = codeGit(source.location,['config','--null','--list']);
  let branchRef: string | null = null;
  try { branchRef = text(source,['symbolic-ref','-q','HEAD']); } catch { /* Detached HEAD is observable but not a commit target here. */ }
  const ongoing = operationFiles.some(name => fs.existsSync(path.join(git.gitDir,name))) || state.files.some(file => file.status==='conflicted');
  const staged = state.files.filter(file=>file.area==='staged');
  const unsupported = state.truncated ? '变更列表不完整，不能核对写入范围。' : ongoing ? '当前位置有未结束的 Git 操作或冲突。' : null;
  const commitUnavailable = unsupported || (!branchRef?.startsWith('refs/heads/') ? '请选择具名本地分支；当前游离提交保持只读提交。' : null)
    || (!staged.length ? '请先明确暂存准备提交的文件。' : null)
    || (configuredHooks(source) ? '代码库配置了提交钩子，请使用原生 Git 提交以保留其规则。' : null);
  const revision = codeRevision([git.id, state.observedRevision, indexDigest, hash(config), branchRef, unsupported, commitUnavailable]);
  const after = indexBytes(indexPath);
  if ((after && hash(after)) !== indexDigest || localGitIdentity(source.location).id !== git.id) throw unsafe('Git 索引或工作树已变化，请刷新。');
  assertCodeRevision(revision, expected);
  return { state, git, indexPath, indexDigest, bytes, branchRef, unsupported, commitUnavailable, revision };
}

/** Prepare a new index separately, then install it under Git's native index lock.
 * Local commit pins an immutable tree and advances only the observed branch with compare-and-swap. */
export async function mutateLocalGit(resolve: () => CodeSource, input:{action:'stage'|'unstage'|'commit';expectedRevision:string;path?:string;message?:string}) {
  const source = resolve();
  const release = acquireCodeGitOperation(source);
  let fd: number | undefined, indexLock: string | undefined, temporary: string | undefined;
  let lockIdentity: fs.Stats | undefined;
  const ownsLock = () => {
    if (!indexLock || !lockIdentity) return false;
    const stat=fs.lstatSync(indexLock,{throwIfNoEntry:false});
    return stat?.dev===lockIdentity.dev && stat?.ino===lockIdentity.ino;
  };
  try {
    const before = observeLocalGit(resolve(),input.expectedRevision);
    if (before.unsupported) throw unsafe(before.unsupported);
    if (input.action==='commit' && before.commitUnavailable) throw unsafe(before.commitUnavailable);
    indexLock = before.indexPath + '.lock';
    try { fd=fs.openSync(indexLock,'wx',0o600); lockIdentity=fs.fstatSync(fd); }
    catch (error) { if ((error as NodeJS.ErrnoException).code==='EEXIST') throw unsafe('索引正在被其他 Git 操作使用。'); throw error; }
    temporary = before.indexPath + '.buildr-' + randomUUID();
    const env={ GIT_INDEX_FILE:temporary };
    const run = async (args:string[], stdin?:string) => {
      const result=await runCodeGitMutation(source,['-c','core.fsmonitor=false',...args],{env,input:stdin});
      if (!result.ok) throw unsafe(result.timedOut ? 'Git 操作结果尚未确认，请刷新核对，不要自动重试。' : 'Git 未完成此操作；请核对当前索引、Git 配置和作者身份。');
      return result.stdout.trim();
    };
    const verify = () => {
      if (!ownsLock()) throw unsafe('Git 索引锁身份已变化，未更新索引。');
      const current=resolve();
      if (current.worktreeId!==source.worktreeId || current.location!==source.location) throw unsafe('工作树身份已变化。');
      observeLocalGit(current,before.revision);
    };
    verify();
    if (before.bytes) fs.writeFileSync(temporary,before.bytes,{flag:'wx',mode:0o600});
    else await run(['read-tree','--empty']);
    if (input.action!=='commit') {
      const relative=relativeCodePath(input.path ?? '');
      const found=before.state.files.find(file=>file.path===relative && (input.action==='unstage'?file.area==='staged':file.area==='unstaged'||file.area==='untracked'));
      if (!found) throw unsafe('所选路径已不在对应比较层中，请刷新。');
      const paths=[relative,...(found.previousPath?[found.previousPath]:[])];
      for (const entry of paths) {
        assertSourceControlPath(source,entry);
        const stat=fs.lstatSync(path.join(source.location,entry),{throwIfNoEntry:false});
        if (stat && (!stat.isFile() || stat.nlink!==1)) throw unsafe('所选路径不是可核对的普通文件，请使用原 Git 工具。');
      }
      if (input.action==='stage') await run(['add','--',...paths]);
      else if (before.state.head) await run(['reset','-q',before.state.head,'--',...paths]);
      else await run(['rm','--cached','-q','--',...paths]);
      verify();
      const next=indexBytes(temporary);
      if (!next) throw unsafe('Git 未生成预期索引。');
      fs.writeFileSync(fd,next);
      fs.fsyncSync(fd);
      verify();
      fs.closeSync(fd);fd=undefined;
      if (!ownsLock()) throw unsafe('Git 索引锁身份已变化，未更新索引。');
      fs.renameSync(indexLock,before.indexPath);
      return { action:input.action, hash:null };
    }
    const tree=await run(['write-tree']);
    if (!oid.test(tree)) throw unsafe('无法确认暂存区树对象。');
    verify();
    const parents=before.state.head ? ['-p',before.state.head] : [];
    const commit=await run(['-c','user.useConfigOnly=true','commit-tree',tree,...parents,'-F','-'],input.message);
    if (!oid.test(commit)) throw unsafe('无法确认提交对象。');
    verify();
    const branch=before.branchRef!;
    const previous=before.state.head ?? '0'.repeat(commit.length);
    // Explicit branch, not HEAD: an unrelated branch must never be advanced.
    try { await run(['update-ref','--no-deref','-m','buildr: 提交已暂存变更',branch,commit,previous]); }
    catch (error) { if (text(source,['rev-parse','--verify',branch])!==commit) throw error; }
    return { action:input.action, hash:commit };
  } finally {
    if (fd!==undefined) fs.closeSync(fd);
    if (ownsLock()) fs.unlinkSync(indexLock!);
    if (temporary) for (const candidate of [temporary,temporary+'.lock']) {
      try { fs.unlinkSync(candidate); } catch (error) { if ((error as NodeJS.ErrnoException).code!=='ENOENT') { /* Never undo a confirmed native write for cleanup. */ } }
    }
    release();
  }
}
