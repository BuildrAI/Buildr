import fs from 'node:fs';
import path from 'node:path';
import { observeDirectoryCheckouts, observeDirectoryRepositories, resolveDirectoryCheckout, resolveDirectoryRepository } from './directory-checkouts.ts';
import { directoryWorktreeActions } from './directory-worktree-actions.ts';
import { createHash } from 'node:crypto';
import { createGitBranchOperations } from '../workbench/git-branch-operations.ts';
import { createCodeFetchApplication, type CodeFetchTarget } from '../workbench/code-fetch-application.ts';
import { createCodeSyncApplication } from '../workbench/code-sync-application.ts';
import { readCodePushSnapshot } from '../workbench/code-commit-snapshot.ts';
import { pushObservedCodeSource } from '../workbench/code-push-operation.ts';
import { assertCodeRevision, observeSourceControl, observeSourceControlAsync } from '../workbench/source-control-git-reader.ts';
import { acquireCodeGitOperation } from '../workbench/code-git-operation-lock.ts';
import { openDirectory } from '../workbench/open-directory.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import type { HarnessDirectory, HarnessDirectoryHost } from './directory-host.ts';
import { DIRECTORY_SOURCE_ID } from './directory-host.ts';
import { codeFailure, codeGit, gitCommonDirectory, localPath, readCodeDirectory, relativeCodePath, type CodeSource } from '../workbench/code-file-reader.ts';
import { isCodeImagePath, readCodeFile } from '../workbench/code-file-content.ts';
import { searchCode } from '../workbench/code-search.ts';
import { editableSourceRevision, readEditableFile, saveObservedEditableFile } from '../workbench/editable-file.ts';
import { insideFilesystemPath } from '../workbench/filesystem-path-identity.ts';
import { createWorkbenchGitReads } from '../workbench/source-control-reads.ts';
import type { CodeSourceControlInput } from '../workbench/source-control-read-types.ts';
import { localGitIdentity, mutateLocalGit, observeLocalGit } from '../workbench/local-git.ts';
import { createCodeCommitApplication } from '../workbench/code-commit-application.ts';
import { createCodeDiscardApplication } from '../workbench/code-discard-application.ts';
import { createCodeCommitMaterialReader } from '../workbench/code-commit-material.ts';
import { createCodeCommitMessageApplication } from '../workbench/code-commit-message-application.ts';
import { readDirectoryCommitGuidance } from '../workbench/code-commit-guidance-model.ts';
import type { CodeGeneration } from '../workbench/code-generation.ts';

const operations = {
  checkouts: [],
  catalog: ['repositoryPath'],
  'open-folder': ['path'],
  directory: ['path','showIgnored'],
  search: ['query','mode','showIgnored'],
  file: ['path','page','line','matchQuery','expectedRevision'],
  editor: ['path'],
  save: ['path','content','expectedFileId','expectedSourceRevision','expectedRevision'],
  status: [],
  authors: ['repositoryId','worktreeId','branch'],
  branches: [],
  'worktree-context': [],
  'worktree-write': ['action','expectedRevision','name'],
  'branch-switch': ['targetRef','expectedTargetHash','expectedRevision','localName'],
  'fetch-context': [],
  fetch: ['expectedRevision','repositories'],
  'sync-context': [],
  sync: ['expectedRevision'],
  'push-context': [],
  push: ['expectedRevision'],
  'commit-context': ['repositoryId','worktreeId'],
  'commit-changes': ['repositoryId','worktreeId','expectedRevision','message','mode'],
  'commit-push': ['repositoryId','worktreeId','expectedHead','expectedPushRevision'],
  'commit-message': ['repositoryId','worktreeId','expectedRevision','modelAccountId','modelId','accountIdentity','accountRevision','label','serviceTier','reasoningEffort'],
  'commit-message-run': ['runId'],
  'commit-message-cancel': ['runId'],
  'discard-context': ['repositoryId','worktreeId','path'],
  'discard-changes': ['repositoryId','worktreeId','expectedRevision','path'],
  history: ['repositoryId','worktreeId','branch','authorEmail','query','cursor','limit','expectedRevision'],
  commit: ['repositoryId','worktreeId','commitHash','expectedRevision'],
  diff: ['repositoryId','worktreeId','commitHash','path','area','expectedRevision'],
  'source-file': ['repositoryId','worktreeId','commitHash','path','area','expectedRevision','page','line','matchQuery'],
  'git-write': ['action','worktreeId','expectedRevision','path','message'],
} as const;
export type DirectoryWorkbenchOperation = keyof typeof operations;
export const directoryWorkbenchWrites = (operation: string) => [
  'save','git-write','open-folder','worktree-write','branch-switch','fetch','sync','push',
  'commit-changes','commit-push','commit-message','commit-message-cancel','discard-changes',
].includes(operation);
const invalid = () => new AgentServiceError('agent_directory_workbench_input_invalid','请选择准确目录和当前观察版本；工作台请求无效。',400);

function inspectFetchTargets(value: unknown): CodeFetchTarget[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) throw invalid();
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid();
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.some(key => !['repositoryId', 'expectedGitId', 'expectedCheckoutId'].includes(key))) throw invalid();
    if (typeof record.repositoryId !== 'string' || !record.repositoryId || record.repositoryId.length > 4096 || record.repositoryId.includes('\0')) throw invalid();
    for (const optional of ['expectedGitId', 'expectedCheckoutId'] as const) {
      const candidate = record[optional];
      if (candidate !== null && candidate !== undefined && (typeof candidate !== 'string' || candidate.length > 4096 || candidate.includes('\0'))) throw invalid();
    }
    return {
      repositoryId: record.repositoryId,
      expectedGitId: (record.expectedGitId ?? null) as string | null,
      expectedCheckoutId: (record.expectedCheckoutId ?? null) as string | null,
    };
  });
}

function inspectInput(operation: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations,operation)) throw invalid();
  const allowed = new Set<string>(['scopeId','scopeRevision','checkoutId','repositoryPath',...operations[operation as DirectoryWorkbenchOperation]]);
  if (Object.keys(input).some(key=>!allowed.has(key))) throw invalid();
  for (const [key,value] of Object.entries(input)) {
    if (key==='showIgnored') { if (typeof value!=='boolean') throw invalid(); continue; }
    if (['page','line','limit'].includes(key)) { if (!Number.isSafeInteger(value)) throw invalid(); continue; }
    if (key==='repositories') { inspectFetchTargets(value); continue; }
    const maxBytes = key === 'content' ? Infinity : key === 'message' ? 32 * 1024 : 4096;
    if (typeof value!=='string' || value.includes('\0') || (Number.isFinite(maxBytes) && Buffer.byteLength(value) > maxBytes)) throw invalid();
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

export type DirectoryWorkbenchOptions = {
  open?: typeof openDirectory;
  generation?: CodeGeneration;
};

export function createDirectoryWorkbench(
  directories: Pick<HarnessDirectoryHost,'resolveDirectory'>,
  optionsOrOpen: typeof openDirectory | DirectoryWorkbenchOptions = openDirectory,
) {
  const open = typeof optionsOrOpen === 'function' ? optionsOrOpen : (optionsOrOpen.open ?? openDirectory);
  const generation = typeof optionsOrOpen === 'function' ? undefined : optionsOrOpen.generation;
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
      if (input.repositoryId !== undefined && input.repositoryId !== source.repositoryId) throw codeFailure('code_worktree_identity_changed','Git 来源或工作树身份已变化，请刷新。',409);
      if (input.worktreeId !== undefined && input.worktreeId !== git.id) throw codeFailure('code_worktree_identity_changed','Git 来源或工作树身份已变化，请刷新。',409);
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
    const commitApp=createCodeCommitApplication({
      source:(_root,target)=>gitSource(target),
      prepareCommitSync:(_root,target)=>sync().prepareCommitSync('',target),
    });
    const discardApp=createCodeDiscardApplication({
      source:(_root,target)=>gitSource(target),
    });
    const requireRevision=()=>{if(!input.expectedRevision)throw invalid();return input.expectedRevision as string;};
    const relative=()=>relativeCodePath(input.path??'');
    const readEditor=()=>{
      const source=current(), name=relative();
      localPath(source,name);
      const observed=readEditableFile({rootPath:source.location,path:name,sourceRevision:editableSourceRevision(source.location,{...scopeQuery,checkoutId:source.checkoutId}),locationLabel:scope().name||path.basename(source.location),versionLabel:source.version}, file=>
        path.relative(source.location,file).split(path.sep).join('/')==='.buildr/builtin-receipts.json'
          ? {code:'file_generated',message:'此文件由 Buildr 维护，请使用对应维护入口。'} : null);
      verifyFileSource(source);
      return {
        ...observed,
        snapshot: {
          ...observed.snapshot,
          selector: { kind: 'code' as const, repositoryId: source.repositoryId, checkoutId: source.checkoutId, path: name },
        },
      };
    };
    switch (operation) {
      case 'checkouts': {if(input.checkoutId!==undefined||input.repositoryPath!==undefined)throw invalid();const directory=scope(),result=observeDirectoryRepositories(directory.rootPath,directory.ref.id);scope();return result;}
      case 'catalog': {
        if (input.checkoutId !== undefined) throw invalid();
        const directory = scope();
        const base = fileSource(directory);
        const discovered = observeDirectoryRepositories(directory.rootPath, directory.ref.id);
        const targetRelative = input.repositoryPath !== undefined ? relativeCodePath(input.repositoryPath, true) : null;
        const selectedRepos = targetRelative === null ? discovered.repositories : discovered.repositories.filter(repo => repo.path === targetRelative);
        const repositories = [];
        for (const repo of selectedRepos) {
          let gitId: string | null = null;
          const primaryLocation = repo.checkouts.members.find(member => member.id === repo.checkouts.defaultId)?.location ?? repo.checkouts.members[0]?.location;
          if (primaryLocation) {
            try { gitId = 'sha256-' + createHash('sha256').update(localGitIdentity(primaryLocation).commonDir).digest('hex'); }
            catch { gitId = null; }
          }
          const members: Array<{
            id: string; worktreeId: string; name: string; location: string; isMain: boolean; isRegistered: boolean;
            branch: string | null; head: string | null; upstream: string | null; ahead: number | null; behind: number | null;
            files: ReturnType<typeof observeSourceControl>['files']; fileCount: number | null; truncated: boolean;
            observedRevision: string | null; status: 'ready' | 'clean' | 'offline' | 'partial'; diagnostics: string[]; readAt: string;
          }> = new Array(repo.checkouts.members.length);
          let cursor = 0;
          const workers = Array.from({ length: Math.min(6, repo.checkouts.members.length) }, async () => {
            for (;;) {
              const index = cursor++;
              if (index >= repo.checkouts.members.length) return;
              const member = repo.checkouts.members[index]!;
              const readAt = new Date().toISOString();
              try {
                const memberSource: CodeSource = {
                  ...base, allowNonGit: undefined, repositoryId: repo.id, checkoutId: member.id,
                  worktreeId: member.id, location: member.location, version: member.branch || member.head || '当前文件',
                  kind: 'worktree', commitHash: null,
                };
                const observed = await observeSourceControlAsync(memberSource);
                members[index] = {
                  id: member.id, worktreeId: member.id, name: member.name, location: member.location,
                  isMain: member.isMain, isRegistered: member.id === repo.checkouts.defaultId,
                  branch: observed.branch, head: observed.head, upstream: observed.upstream,
                  ahead: observed.ahead, behind: observed.behind, files: observed.files,
                  fileCount: observed.fileCount, truncated: observed.truncated,
                  observedRevision: observed.observedRevision,
                  status: observed.truncated ? 'partial' : observed.fileCount ? 'ready' : 'clean',
                  diagnostics: [], readAt,
                };
              } catch (error) {
                members[index] = {
                  id: member.id, worktreeId: member.id, name: member.name, location: member.location,
                  isMain: member.isMain, isRegistered: member.id === repo.checkouts.defaultId,
                  branch: member.branch, head: member.head, upstream: null,
                  ahead: null, behind: null, files: [], fileCount: null, truncated: false,
                  observedRevision: null, status: 'offline',
                  diagnostics: [error instanceof Error ? error.message : '无法读取该工作树状态。'],
                  readAt,
                };
              }
            }
          });
          await Promise.all(workers);
          repositories.push({ ...repo, gitId, members });
        }
        scope();
        return { repositories, truncated: discovered.truncated, diagnostic: discovered.diagnostic, readAt: new Date().toISOString() };
      }
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
      case 'file': {
        const source=current(), name=relative(), result=await readCodeFile(source,name,input);
        verifyFileSource(source);
        let editorSnapshot: ReturnType<typeof readEditor>['snapshot'] | undefined;
        if (input.page === undefined && !isCodeImagePath(name) && result.kind !== 'image' && result.kind !== 'unsupported' && !result.truncated) {
          try { editorSnapshot = readEditor().snapshot; } catch { /* Read-only viewer remains available when editable snapshot cannot be prepared. */ }
        }
        return editorSnapshot ? { ...result, editorSnapshot } : result;
      }
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
      case 'branch-switch': return branches().switchBranch('',{...gitTarget(),targetRef:input.targetRef,expectedTargetHash:input.expectedTargetHash,expectedRevision:requireRevision(),...(input.localName!==undefined?{localName:input.localName}:{})});
      case 'fetch-context': {const {remotes,revision}=fetchContext();return {remotes,revision};}
      case 'fetch': {
        if (input.repositories !== undefined) {
          if (input.checkoutId !== undefined || input.repositoryPath !== undefined) throw invalid();
          const directory = scope();
          const targets = inspectFetchTargets(input.repositories);
          const discovered = observeDirectoryRepositories(directory.rootPath, directory.ref.id);
          const locations = new Map<string, string>();
          for (const repo of discovered.repositories) {
            const primary = repo.checkouts.members.find(member => member.id === repo.checkouts.defaultId)?.location ?? repo.checkouts.members[0]?.location;
            if (primary) locations.set(repo.id, primary);
          }
          return createCodeFetchApplication({
            registeredLocation: (_root, repositoryId) => {
              const location = locations.get(repositoryId);
              if (!location) throw codeFailure('code_repository_missing', '代码库不存在或当前不可读取。');
              return location;
            },
          }).fetch('', { repositories: targets });
        }
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
      case 'commit-context': return commitApp.commitContext('', gitTarget());
      case 'commit-changes': {
        const target = gitTarget();
        return commitApp.commitChanges('', { ...target, expectedRevision: requireRevision(), message: input.message, mode: input.mode });
      }
      case 'commit-push': {
        const target = gitTarget();
        return commitApp.push('', { ...target, expectedHead: input.expectedHead, expectedPushRevision: input.expectedPushRevision });
      }
      case 'commit-message': {
        if (!generation) throw codeFailure('code_generation_unavailable', '当前环境未启用提交说明生成服务。', 503);
        const directory = scope();
        const target = gitTarget();
        if (['modelAccountId','modelId','accountIdentity','accountRevision','label'].some(key => typeof input[key] !== 'string' || !input[key])) throw invalid();
        const commitMessageApp = createCodeCommitMessageApplication({
          commitSnapshot: (_root, location, options) => commitApp.commitSnapshot('', location, options),
          commitGuidance: (_root, snapshot) => readDirectoryCommitGuidance(directory.rootPath, snapshot),
          commitMaterial: createCodeCommitMaterialReader(),
          startGeneration: generationInput => generation.start(generationInput),
        });
        return commitMessageApp.generateCommitMessage(directory.rootPath, {
          ...target,
          expectedRevision: requireRevision(),
          modelAccountId: input.modelAccountId,
          modelId: input.modelId,
          accountIdentity: input.accountIdentity,
          accountRevision: input.accountRevision,
          label: input.label,
          ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
          ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
        });
      }
      case 'commit-message-run': {
        if (!generation) throw codeFailure('code_generation_unavailable', '当前环境未启用提交说明生成服务。', 503);
        if (typeof input.runId !== 'string' || !input.runId) throw invalid();
        return generation.read(scope().rootPath, input.runId);
      }
      case 'commit-message-cancel': {
        if (!generation) throw codeFailure('code_generation_unavailable', '当前环境未启用提交说明生成服务。', 503);
        if (typeof input.runId !== 'string' || !input.runId) throw invalid();
        return generation.cancel(scope().rootPath, input.runId);
      }
      case 'discard-context': {
        const target = gitTarget();
        return discardApp.discardContext('', { ...target, ...(input.path !== undefined ? { path: input.path } : {}) });
      }
      case 'discard-changes': {
        const target = gitTarget();
        return discardApp.discardChanges('', { ...target, expectedRevision: requireRevision(), ...(input.path !== undefined ? { path: input.path } : {}) });
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
          case 'authors':return reads.authors('',input);
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
  const failure=error as {code?:string;status?:number;message?:string;details?:unknown};
  if (failure.status && typeof failure.code==='string' && /^(?:code|file)_[a-z0-9_]+$/.test(failure.code)) throw new AgentServiceError('agent_workbench_'+failure.code,failure.message||'工作台操作未完成。',failure.status,failure.details);
  throw error;
}
