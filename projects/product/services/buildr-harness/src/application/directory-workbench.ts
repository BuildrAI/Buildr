import fs from 'node:fs';
import path from 'node:path';
import { observeDirectoryCheckouts, observeDirectoryRepositories, resolveDirectoryCheckout, resolveDirectoryRepository } from './directory-checkouts.ts';
import { directoryWorktreeActions } from './directory-worktree-actions.ts';
import { createHash } from 'node:crypto';
import { createGitBranchOperations } from '../workbench/git-branch-operations.ts';
import { createCodeFetchApplication } from '../workbench/code-fetch-application.ts';
import { createCodeSyncApplication } from '../workbench/code-sync-application.ts';
import { readCodePushSnapshot } from '../workbench/code-commit-snapshot.ts';
import { pushObservedCodeSource } from '../workbench/code-push-operation.ts';
import { assertCodeRevision } from '../workbench/source-control-git-reader.ts';
import { acquireCodeGitOperation } from '../workbench/code-git-operation-lock.ts';
import { openDirectory } from '../workbench/open-directory.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import type { HarnessDirectory, HarnessDirectoryHost } from './directory-host.ts';
import { DIRECTORY_SOURCE_ID } from './directory-host.ts';
import { codeFailure, codeGit, gitCommonDirectory, localPath, readCodeDirectory, relativeCodePath, type CodeSource } from '../workbench/code-file-reader.ts';
import { readCodeFile } from '../workbench/code-file-content.ts';
import { searchCode } from '../workbench/code-search.ts';
import { editableSourceRevision, readEditableFile, saveObservedEditableFile } from '../workbench/editable-file.ts';
import { insideFilesystemPath } from '../workbench/filesystem-path-identity.ts';
import { createWorkbenchGitReads } from '../workbench/source-control-reads.ts';
import type { CodeSourceControlInput } from '../workbench/source-control-read-types.ts';
import { observeSourceControl } from '../workbench/source-control-git-reader.ts';
import { localGitIdentity, mutateLocalGit, observeLocalGit } from '../workbench/local-git.ts';

const operations = {
  checkouts: [],
  'open-folder': ['path'],
  directory: ['path','showIgnored'],
  search: ['query','mode','showIgnored'],
  file: ['path','page','line','matchQuery','expectedRevision'],
  editor: ['path'],
  save: ['path','content','expectedFileId','expectedSourceRevision','expectedRevision'],
  status: [],
  branches: [],
  'worktree-context': [],
  'worktree-write': ['action','expectedRevision','name'],
  'branch-switch': ['targetRef','expectedTargetHash','expectedRevision'],
  'fetch-context': [],
  fetch: ['expectedRevision'],
  'sync-context': [],
  sync: ['expectedRevision'],
  'push-context': [],
  push: ['expectedRevision'],
  history: ['repositoryId','worktreeId','query','cursor','limit','expectedRevision'],
  commit: ['repositoryId','worktreeId','commitHash','expectedRevision'],
  diff: ['repositoryId','worktreeId','commitHash','path','area','expectedRevision'],
  'source-file': ['repositoryId','worktreeId','commitHash','path','area','expectedRevision','page','line','matchQuery'],
  'git-write': ['action','worktreeId','expectedRevision','path','message'],
} as const;
export type DirectoryWorkbenchOperation = keyof typeof operations;
export const directoryWorkbenchWrites = (operation: string) => ['save','git-write','open-folder','worktree-write','branch-switch','fetch','sync','push'].includes(operation);
const invalid = () => new AgentServiceError('agent_directory_workbench_input_invalid','请选择准确目录和当前观察版本；工作台请求无效。',400);

function inspectInput(operation: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations,operation)) throw invalid();
  const allowed = new Set<string>(['scopeId','scopeRevision','checkoutId','repositoryPath',...operations[operation as DirectoryWorkbenchOperation]]);
  if (Object.keys(input).some(key=>!allowed.has(key))) throw invalid();
  for (const [key,value] of Object.entries(input)) {
    if (key==='showIgnored') { if (typeof value!=='boolean') throw invalid(); continue; }
    if (['page','line','limit'].includes(key)) { if (!Number.isSafeInteger(value)) throw invalid(); continue; }
    if (typeof value!=='string' || value.includes('\0') || (key!=='content' && value.length>4096)) throw invalid();
  }
  if (typeof input.scopeId!=='string'||!input.scopeId||typeof input.scopeRevision!=='string'||!input.scopeRevision) throw invalid();
  return input as Record<string, any>;
}

function fileSource(scope: HarnessDirectory): CodeSource {
  if (scope.rootPath.split(path.sep).some(segment=>segment.toLowerCase()==='.git')) throw codeFailure('code_path_forbidden','不能打开 Git 管理目录。',403);
  let metadata: string | undefined;
  try { metadata=gitCommonDirectory(scope.rootPath); } catch { /* A plain folder does not require Git. */ }
  if (metadata && insideFilesystemPath(metadata,scope.rootPath)) throw codeFailure('code_path_forbidden','不能打开 Git 管理目录。',403);
  return { repositoryId:scope.ref.id, checkoutId:scope.ref.id, location:scope.rootPath, version:'当前文件',kind:'default',commitHash:null,worktreeGroupId:null,taskId:null,allowNonGit:true };
}

export function createDirectoryWorkbench(directories: Pick<HarnessDirectoryHost,'resolveDirectory'>, open = openDirectory) {
  return async (operation: string, raw: Record<string, unknown>): Promise<unknown> => {
    const input=inspectInput(operation,raw);
    const scopeQuery={ref:{sourceId:DIRECTORY_SOURCE_ID,id:input.scopeId},expectedRevision:input.scopeRevision};
    const scope=()=>directories.resolveDirectory(scopeQuery);
    const current=()=>{
      const directory=scope(), source=fileSource(directory);
      if (input.checkoutId === undefined) {
        if (input.repositoryPath !== undefined) throw invalid();
        return source;
      }
      const repository=resolveDirectoryRepository(directory.rootPath,directory.ref.id,input.repositoryPath??'');
      const selected=resolveDirectoryCheckout(repository.location,input.checkoutId);
      return {...source, repositoryId:repository.id, location:selected.root, checkoutId:selected.git.id, worktreeId:selected.git.id};
    };
    const verifyFileSource=(source: CodeSource)=>{
      const latest=current();
      if (source.location!==latest.location || source.checkoutId!==latest.checkoutId || source.repositoryId!==latest.repositoryId) throw codeFailure('code_worktree_identity_changed','文件来源已变化，请刷新。',409);
    };
    const gitSource=(target: CodeSourceControlInput) => {
      const source=current(), git=localGitIdentity(source.location);
      if (target.repositoryId!==source.repositoryId || target.worktreeId!==git.id) throw codeFailure('code_worktree_identity_changed','Git 来源或工作树身份已变化，请刷新。',409);
      if (target.commitHash!==undefined&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(target.commitHash)) throw invalid();
      return {...source, allowNonGit:undefined, worktreeId:git.id,checkoutId:git.id,commitHash:target.commitHash??null,kind:target.commitHash?'commit' as const:'worktree' as const,version:target.commitHash??source.version};
    };
    const gitTarget=()=>{
      const source=current(), git=localGitIdentity(source.location);
      return {repositoryId:source.repositoryId,worktreeId:git.id};
    };
    const eligible=()=>gitSource(gitTarget());
    const fetchContext=()=>{
      const source=eligible(), git=localGitIdentity(source.location);
      const config=codeGit(source.location,['config','--null','--list'],1024*1024);
      const remotes=codeGit(source.location,['remote'],64*1024).toString('utf8').split('\n').filter(Boolean);
      const revision=createHash('sha256').update(JSON.stringify([git.id,config.toString('base64'),remotes])).digest('hex');
      return {source, target:{repositoryId:source.repositoryId,expectedGitId:'sha256-'+createHash('sha256').update(git.commonDir).digest('hex'),expectedCheckoutId:git.id},remotes,revision};
    };
    const branches=()=>createGitBranchOperations({source:(_root,target)=>gitSource(target),worktrees:source=>{
      const listing=observeDirectoryCheckouts(source.location);
      if(listing.truncated||listing.diagnostic) throw codeFailure('code_branch_observation_incomplete','工作树清单不完整，无法核对分支占用。',409);
      return {worktrees:listing.members.map(item=>({...item,worktreeId:item.id}))};
    }});
    const worktrees=()=>directoryWorktreeActions(()=>{
      const source=eligible(),directory=scope(),repository=resolveDirectoryRepository(directory.rootPath,directory.ref.id,input.repositoryPath??'');
      if(source.repositoryId!==repository.id)throw invalid();
      return {source,repositoryRoot:repository.location};
    });
    const sync=()=>createCodeSyncApplication({source:(_root,target)=>gitSource(target)});
    const requireRevision=()=>{if(!input.expectedRevision)throw invalid();return input.expectedRevision as string;};
    const relative=()=>relativeCodePath(input.path??'');
    const readEditor=()=>{
      const source=current(), name=relative();
      localPath(source,name);
      const observed=readEditableFile({rootPath:source.location,path:name,sourceRevision:editableSourceRevision(source.location,{...scopeQuery,checkoutId:source.checkoutId}),locationLabel:scope().name||path.basename(source.location),versionLabel:source.version}, file=>
        path.relative(source.location,file).split(path.sep).join('/')==='.buildr/builtin-receipts.json'
          ? {code:'file_generated',message:'此文件由 Buildr 维护，请使用对应维护入口。'} : null);
      verifyFileSource(source);
      return observed;
    };
    switch (operation) {
      case 'checkouts': {if(input.checkoutId!==undefined||input.repositoryPath!==undefined)throw invalid();const directory=scope(),result=observeDirectoryRepositories(directory.rootPath,directory.ref.id);scope();return result;}
      case 'open-folder': {
        const source=current(), file=localPath(source,relative());
        if (!relative() || !fs.statSync(file).isFile()) throw invalid();
        verifyFileSource(source);
        return open(path.dirname(file));
      }
      case 'directory': {const source=current(),result=readCodeDirectory(source,input.path??'',input.showIgnored===true);verifyFileSource(source);return result;}
      case 'search': {
        if (!['name','content'].includes(input.mode)||typeof input.query!=='string') throw invalid();
        const source=current(),result=searchCode(source,input.query,input.mode,input.showIgnored===true);verifyFileSource(source);return result;
      }
      case 'file': {const source=current(),result=await readCodeFile(source,relative(),input);verifyFileSource(source);return result;}
      case 'editor': return readEditor().snapshot;
      case 'save':
        if (['content','expectedFileId','expectedSourceRevision','expectedRevision'].some(key=>typeof input[key]!=='string'||key!=='content'&&!input[key])) throw invalid();
        return saveObservedEditableFile(readEditor,{expectedFileId:input.expectedFileId,expectedSourceRevision:input.expectedSourceRevision,expectedRevision:input.expectedRevision,content:input.content});
      case 'status': {
        const source=current(), git=localGitIdentity(source.location);
        const selected=gitSource({repositoryId:source.repositoryId,worktreeId:git.id});
        let state: ReturnType<typeof observeSourceControl>, writeRevision:string|null=null, writeUnavailable:string|null=null, commitUnavailable:string|null=null;
        try { const checked=observeLocalGit(selected);state=checked.state;writeRevision=checked.revision;writeUnavailable=checked.unsupported;commitUnavailable=checked.commitUnavailable; }
        catch (error) { state=observeSourceControl(selected);writeUnavailable=error instanceof Error?error.message:'Git 写入范围暂不可核对。';commitUnavailable=writeUnavailable; }
        gitSource({repositoryId:source.repositoryId,worktreeId:git.id});
        return {...state,repositoryId:source.repositoryId,worktreeId:git.id,location:source.location,isMain:git.isMain,writeRevision,writeUnavailable,commitUnavailable,readAt:new Date().toISOString()};
      }
      case 'worktree-context': return worktrees().context();
      case 'worktree-write':
        if(!['create','remove'].includes(input.action))throw invalid();
        return worktrees().execute(input.action,requireRevision(),input.name);
      case 'branches': return branches().branches('',gitTarget());
      case 'branch-switch': return branches().switchBranch('',{...gitTarget(),targetRef:input.targetRef,expectedTargetHash:input.expectedTargetHash,expectedRevision:requireRevision()});
      case 'fetch-context': {const {remotes,revision}=fetchContext();return {remotes,revision};}
      case 'fetch': {
        const before=fetchContext();assertCodeRevision(before.revision,requireRevision());
        return createCodeFetchApplication({registeredLocation:()=>{
          const fresh=fetchContext();assertCodeRevision(fresh.revision,before.revision);return fresh.source.location;
        }}).fetch('',{repositories:[before.target]});
      }
      case 'sync-context': return sync().syncContext('',gitTarget());
      case 'sync': return sync().sync('',{...gitTarget(),expectedRevision:requireRevision()});
      case 'push-context': {
        const {revision,target,available,reason,ahead}=readCodePushSnapshot(eligible());
        return {revision,target,available,reason,ahead};
      }
      case 'push': {
        const source=eligible(), release=acquireCodeGitOperation(source);
        const target={repositoryId:source.repositoryId,worktreeId:source.worktreeId!};
        try {
          const observed=readCodePushSnapshot(gitSource(target));assertCodeRevision(observed.revision,requireRevision());
          return await pushObservedCodeSource('',target,observed,(_root,value)=>gitSource(value));
        } finally {release();}
      }
      case 'git-write': {
        if (!['stage','unstage','commit'].includes(input.action)||!input.expectedRevision||!input.worktreeId) throw invalid();
        if (input.action==='commit') {
          if (input.path!==undefined || typeof input.message!=='string'||!input.message.trim()||Buffer.byteLength(input.message)>32768) throw invalid();
        } else if (input.message!==undefined||!relative()) throw invalid();
        return mutateLocalGit(()=>gitSource({repositoryId:current().repositoryId,worktreeId:input.worktreeId}),{action:input.action,path:input.path,message:input.message,expectedRevision:input.expectedRevision});
      }
      default: {
        const reads=createWorkbenchGitReads({source:(_root,target)=>gitSource(target),verifySource:(_root,target)=>{gitSource(target);}});
        switch (operation) {
          case 'history':return reads.history('',input);
          case 'commit':return reads.commit('',input);
          case 'diff':return reads.diff('',input);
          case 'source-file':return reads.sourceFile('',input);
        }
        throw invalid();
      }
    }
  };
}

/** Known workbench errors cross only the authenticated Harness transport. */
export function workbenchError(error: unknown): never {
  if (error instanceof AgentServiceError) throw error;
  const failure=error as {code?:string;status?:number;message?:string};
  if (failure.status && typeof failure.code==='string' && /^(?:code|file)_[a-z0-9_]+$/.test(failure.code)) throw new AgentServiceError('agent_workbench_'+failure.code,failure.message||'工作台操作未完成。',failure.status);
  throw error;
}
