import fs from 'node:fs';
import path from 'node:path';
import { acquireCodeGitOperation } from '../workbench/code-git-operation-lock.ts';
import { codeFailure, codeGit, type CodeSource } from '../workbench/code-file-reader.ts';
import { assertNoExternalCheckoutFilters } from '../workbench/code-branch-switch.ts';
import { readGitWorktreeRecords } from '../workbench/git-worktree-list.ts';
import { localGitIdentity, observeLocalGit } from '../workbench/local-git.ts';
import { assertCodeRevision, codeRevision } from '../workbench/source-control-git-reader.ts';
import { normalizeFilesystemPath, sameFilesystemPath } from '../workbench/filesystem-path-identity.ts';
import { runCodeGitMutation } from '../workbench/code-git-mutation-runner.ts';

const unavailable=(message:string)=>codeFailure('code_worktree_action_unavailable',message,409);
const gitText=(source:CodeSource,args:string[])=>codeGit(source.location,args).toString('utf8').trim();

export function directoryWorktreeActions(resolve:()=>{source:CodeSource;repositoryRoot:string}) {
  function observe() {
    const {source,repositoryRoot}=resolve(), git=localGitIdentity(source.location);
    const status=observeLocalGit(source), listing=readGitWorktreeRecords(repositoryRoot);
    const manager=path.join(repositoryRoot,'.worktrees');
    const state=fs.lstatSync(manager,{throwIfNoEntry:false});
    const managerReady=!state||(state.isDirectory()&&!state.isSymbolicLink()&&normalizeFilesystemPath(fs.realpathSync(manager))===normalizeFilesystemPath(manager));
    const ignoredStatus=gitText(source,['status','--porcelain=v1','--ignored','--untracked-files=all','-z']);
    const removeReason=git.isMain||sameFilesystemPath(repositoryRoot,source.location)?'不能移除主工作树或当前仓库的入口目录。':!status.branchRef?'游离提交没有本地分支保全，不能移除。':status.unsupported|| (ignoredStatus?'工作树包含改动、未跟踪或忽略文件，不能移除。':null);
    const createReason=status.unsupported||(!status.state.head?'当前没有可用的起点提交。':null)||(managerReady?null:'工作树父目录不是可核对的真实目录。');
    const revision=codeRevision([source.worktreeId,repositoryRoot,status.revision,listing,ignoredStatus,managerReady,state?.ino,state?.dev]);
    return {source,manager,revision,head:status.state.head,branch:status.state.branch,createReason,removeReason};
  }
  return {
    context(){const {source,manager,revision,head,branch,createReason,removeReason}=observe();return {location:source.location,manager,revision,head,branch,createReason,removeReason};},
    async execute(action:'create'|'remove',revision:string,name?:string) {
      const {source}=resolve(),release=acquireCodeGitOperation(source);
      try {
        const before=observe();assertCodeRevision(before.revision,revision);
        if(action==='create') {
          if(before.createReason)throw unavailable(before.createReason);
          if(!name||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw unavailable('请填写有效的单段工作树名称和新分支名。');
          const destination=path.join(before.manager,name);
          if(fs.lstatSync(destination,{throwIfNoEntry:false}))throw unavailable('目标工作树目录已被占用。');
          codeGit(source.location,['check-ref-format','refs/heads/'+name]);
          // A complete checkout can run conversions even for paths unchanged from HEAD.
          const files=codeGit(source.location,['ls-tree','-r','--name-only','-z',before.head!]).toString().split('\0').filter(Boolean);
          assertNoExternalCheckoutFilters(source,before.head!,files);
          assertCodeRevision(observe().revision,revision);
          if(!fs.existsSync(before.manager))fs.mkdirSync(before.manager);
          const result=await runCodeGitMutation(source,['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','worktree','add','-b',name,'--',destination,before.head!]);
          if(!result.ok)throw unavailable('未确认工作树创建结果，请刷新清单核对，不要自动重试。');
          const added=localGitIdentity(destination);
          if(!sameFilesystemPath(added.commonDir,localGitIdentity(source.location).commonDir))throw unavailable('创建后无法确认工作树身份，请刷新核对。');
          return {status:'succeeded',message:'已创建工作树与本地分支。',checkoutId:added.id};
        }
        if(name!==undefined||before.removeReason)throw unavailable(before.removeReason??'移除不接受新的工作树名。');
        assertCodeRevision(observe().revision,revision);
        const result=await runCodeGitMutation(source,['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','worktree','remove','--',source.location]);
        if(!result.ok||fs.lstatSync(source.location,{throwIfNoEntry:false}))throw unavailable('未确认工作树移除结果，请刷新清单核对；没有删除分支。');
        return {status:'succeeded',message:'已移除工作树目录，本地分支保留。',checkoutId:null};
      }finally{release();}
    },
  };
}
