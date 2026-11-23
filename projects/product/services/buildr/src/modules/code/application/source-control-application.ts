import { createWorkbenchGitReads, sourceControlReadMeta as metadata } from '@buildr-ai/buildr-harness/workbench';
import { codeFailure, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { parseTaskCommitTrailer } from '../../task/commits/domain/task-commit.ts';
import type { CodeGitWorktree } from '../infrastructure/code-worktree-reader.ts';
import { codeWorktreeTaskKey, type readSourceControlTaskAssociations } from '../infrastructure/code-worktree-catalog.ts';
import { SOURCE_CONTROL_LIMITS, codeRevision, observeSourceControl, observeSourceControlAsync } from '../infrastructure/source-control-git-reader.ts';
import type { CodeReadDiagnostic, CodeSourceControlInput, CodeSourceControlResponse, CodeSourceControlRepository, CodeSourceControlWorktree, CodeRepositoryCloneStatus, CodeRepositoryCloneResult, CodeHistoryCommit } from './source-control-model.ts';

type Catalog = { repositories: Array<{ id: string; code: string; name: string; location: string; available: boolean; gitId: string | null; clone?: CodeRepositoryCloneStatus | null }>; selectedRepositoryIds: string[]; scopeReason: string; diagnostics: CodeReadDiagnostic[] };
type WorktreeReading = {
  worktrees: CodeGitWorktree[];
  source(worktreeId: string): CodeSource;
  prepareVerification?(sources: CodeSource[]): (source: CodeSource) => void;
  prepareVerificationAsync?(sources: CodeSource[]): Promise<(source: CodeSource) => void>;
};
type Dependencies = { repositories(root: string, taskId?: string, repositoryId?: string): Catalog; inventory(root:string,taskId?:string):Catalog; source(root: string, input: CodeSourceControlInput): CodeSource;worktrees(root:string,repositoryId:string,registered:Catalog['repositories'][number]):{worktrees:CodeGitWorktree[];source(worktreeId:string):CodeSource;prepareVerification(sources:CodeSource[]):(source:CodeSource)=>void}; worktreesAsync?(root:string,repositoryId:string,registered:Catalog['repositories'][number]):Promise<WorktreeReading>; taskAssociations?(root:string,repositories:CodeSourceControlRepository[],taskId?:string,deadline?:number):ReturnType<typeof readSourceControlTaskAssociations>; readTask?(root: string, taskId: string): { taskId: string; title: string }; repositoryCloneStatus?(root: string, repositoryId: string): CodeRepositoryCloneStatus; repositoryCloneRequest?(root: string, repositoryId: string): CodeRepositoryCloneResult };
const diagnostic = (error: unknown, repositoryId: string | null,worktreeId?:string): CodeReadDiagnostic => ({ code: (error as { code?: string })?.code || 'code_source_unavailable', message: error instanceof Error ? error.message : '代码来源暂不可读取。', repositoryId,...(worktreeId?{worktreeId}:{}) });
// The inventory pass and the live worktree read can report one unavailable repository
// through two layers; the same reason on the same source is one fact and the earlier
// (more specific) message wins.
const uniqueDiagnostics = (items: CodeReadDiagnostic[]): CodeReadDiagnostic[] => {
  const seen = new Map<string, CodeReadDiagnostic>();
  for (const item of items) { const key = item.code + ' ' + (item.repositoryId || '') + ' ' + (item.worktreeId || ''); if (!seen.has(key)) seen.set(key, item); }
  return [...seen.values()];
};
export function createSourceControlApplication(dependencies: Dependencies) {
  function cloneState(root:string,repositoryId:string):CodeRepositoryCloneStatus|null{
    try{return dependencies.repositoryCloneStatus?.(root,repositoryId)||null;}catch{return null;}
  }
  function repositoryClone(root:string,repositoryId:string):CodeRepositoryCloneResult{
    if(!repositoryId)throw codeFailure('code_repository_required','必须选择已登记代码库。');
    const result=dependencies.repositoryCloneRequest?.(root,repositoryId);
    if(!result)throw codeFailure('code_clone_unavailable','克隆能力不可用。',503);
    return result;
  }
  function sourceControlInventory(root:string,input:CodeSourceControlInput={}):CodeSourceControlResponse{
    if(Object.entries(input).some(([key,value])=>key!=='taskId'&&value!==undefined))throw codeFailure('code_inventory_input_invalid','代码库清单只接受任务范围参数。');
    if(input.taskId!==undefined&&(typeof input.taskId!=='string'||!input.taskId))throw codeFailure('code_inventory_input_invalid','任务范围必须指定有效任务。');
    const catalog=dependencies.inventory(root,input.taskId);
    const repositories:CodeSourceControlRepository[]=[...new Map(catalog.repositories.map(repository=>[repository.id,repository])).values()].map(repository=>({...repository,available:false,source:null,status:'unavailable',clone:null,branch:null,head:null,upstream:null,ahead:null,behind:null,fileCount:null,changes:[],observedRevision:null,diagnostics:[{code:'code_source_control_pending',message:'代码库已登记，状态正在读取。',repositoryId:repository.id}],worktrees:[],worktreeCount:null,worktreeCoverage:{limit:SOURCE_CONTROL_LIMITS.worktrees,total:null,read:0,truncated:false}}));
    return {...metadata(codeRevision(repositories.map(repository=>[repository.id,repository.code,repository.name,repository.location])),SOURCE_CONTROL_LIMITS.repositories,false,[...catalog.diagnostics,...repositories.flatMap(repository=>repository.diagnostics)]),repositories,selectedRepositoryIds:catalog.selectedRepositoryIds,selectedWorktreeIds:[],selectedWorktrees:[],worktreeCoverage:{limit:SOURCE_CONTROL_LIMITS.totalWorktrees,total:repositories.length?null:0,read:0,truncated:false},scopeReason:catalog.scopeReason};
  }
  function verifySource(root:string,input:CodeSourceControlInput,source:CodeSource){
    const current=dependencies.source(root,{...input,worktreeId:source.worktreeId||input.worktreeId});
    if(current.worktreeId!==source.worktreeId||current.location!==source.location)throw codeFailure('code_worktree_identity_changed','读取期间工作树身份已变化，请刷新后继续。',409);
  }
  type StatusRead = {
    source: CodeSource;
    accept(value: ReturnType<typeof observeSourceControl>): void;
    fail(error: unknown): void;
  };
  type PendingVerification = {
    source: CodeSource;
    commit(): void;
    fail(error: unknown): void;
  };
  type ScanStep =
    | { kind: 'open'; registered: Catalog['repositories'][number] }
    | { kind: 'verify'; reading: WorktreeReading; uncached: StatusRead[]; toVerify: PendingVerification[] };

  const WORKER_STATUS_CONCURRENCY = 6;

  function applyVerification(verify: (source: CodeSource) => void, toVerify: PendingVerification[]) {
    for (const item of toVerify) {
      try { verify(item.source); item.commit(); }
      catch (error) { item.fail(error); }
    }
  }

  function failAllVerification(error: unknown, toVerify: PendingVerification[]) {
    for (const item of toVerify) item.fail(error);
  }

  function sourceControl(root: string, input: CodeSourceControlInput = {}, observedWorktrees: CodeSourceControlWorktree[] = []): CodeSourceControlResponse {
    const scan = scanSourceControl(root, input, observedWorktrees);
    let step = scan.next();
    while (!step.done) {
      try {
        if (step.value.kind === 'open') {
          step = scan.next(dependencies.worktrees(root, step.value.registered.id, step.value.registered));
          continue;
        }
        const { reading, uncached, toVerify } = step.value;
        for (const read of uncached) {
          try { read.accept(observeSourceControl(read.source)); }
          catch (error) { read.fail(error); }
        }
        if (toVerify.length) {
          try {
            const verify = reading.prepareVerification!(toVerify.map(item => item.source));
            applyVerification(verify, toVerify);
          } catch (error) {
            failAllVerification(error, toVerify);
          }
        }
        step = scan.next();
      } catch (error) {
        step = scan.throw(error);
      }
    }
    return step.value;
  }

  async function sourceControlInWorker(root: string, input: CodeSourceControlInput = {}, observedWorktrees: CodeSourceControlWorktree[] = []): Promise<CodeSourceControlResponse> {
    // Each Web read worker handles one request at a time. Bound the number
    // of child Git processes even when both workers have cold requests.
    const scan = scanSourceControl(root, input, observedWorktrees);
    let step = scan.next();
    while (!step.done) {
      try {
        if (step.value.kind === 'open') {
          const reading = dependencies.worktreesAsync
            ? await dependencies.worktreesAsync(root, step.value.registered.id, step.value.registered)
            : dependencies.worktrees(root, step.value.registered.id, step.value.registered);
          step = scan.next(reading);
          continue;
        }
        const { reading, uncached, toVerify } = step.value;
        for (let offset = 0; offset < uncached.length; offset += WORKER_STATUS_CONCURRENCY) {
          const chunk = uncached.slice(offset, offset + WORKER_STATUS_CONCURRENCY);
          const settled = await Promise.allSettled(chunk.map(read => observeSourceControlAsync(read.source)));
          for (const [index, read] of chunk.entries()) {
            const outcome = settled[index];
            if (outcome.status === 'fulfilled') read.accept(outcome.value);
            else read.fail(outcome.reason);
          }
        }
        if (toVerify.length) {
          try {
            const sources = toVerify.map(item => item.source);
            const verify = reading.prepareVerificationAsync
              ? await reading.prepareVerificationAsync(sources)
              : reading.prepareVerification!(sources);
            applyVerification(verify, toVerify);
          } catch (error) {
            failAllVerification(error, toVerify);
          }
        }
        step = scan.next();
      } catch (error) {
        step = scan.throw(error);
      }
    }
    return step.value;
  }

  function* scanSourceControl(root: string, input: CodeSourceControlInput, observedWorktrees: CodeSourceControlWorktree[]): Generator<ScanStep, CodeSourceControlResponse, any> {
    if(input.repositoryId!==undefined&&(typeof input.repositoryId!=='string'||!input.repositoryId))throw codeFailure('code_repository_required','必须选择已登记代码库。');
    const catalog = dependencies.repositories(root,undefined,input.repositoryId), repositories: CodeSourceControlRepository[] = [];
    const diagnostics = [...catalog.diagnostics]; let truncated = false,statusAttempts=0;const deadline=Date.now()+SOURCE_CONTROL_LIMITS.statusReadMs;
    for (const [index, registered] of [...new Map(catalog.repositories.map(repository => [repository.id, repository])).values()].entries()) {
      const clone=registered.clone===undefined ? cloneState(root,registered.id) : registered.clone;
      const output: CodeSourceControlRepository = { ...registered, source: null, status: 'unavailable', clone:clone?.state?{state:clone.state,diagnostic:clone.diagnostic,startedAt:clone.startedAt}:null, branch: null, head: null, upstream: null, ahead: null, behind: null, fileCount: null, changes: [], observedRevision: null, diagnostics: [],worktrees:[],worktreeCount:null,worktreeCoverage:{limit:SOURCE_CONTROL_LIMITS.worktrees,total:null,read:0,truncated:false} };
      repositories.push(output);
      if (clone?.state) {
        output.available = false;
        output.diagnostics.push({ code: clone.state === 'cloning' ? 'code_repository_cloning' : 'code_repository_clone_failed', message: clone.diagnostic || '代码库正在克隆，尚未准备完成。', repositoryId: registered.id });
        diagnostics.push(...output.diagnostics);
        continue;
      }
      try {
        const reading: WorktreeReading = yield { kind: 'open', registered };
        const worktrees=reading.worktrees;output.worktreeCount=worktrees.length;output.worktreeCoverage.total=worktrees.length;
        const uncached: StatusRead[] = [], toVerify: PendingVerification[] = [];
        for(const [position,worktree]of worktrees.entries()){
          const checkout={...worktree,available:false,source:null as CodeSource|null,status:'unavailable' as 'complete'|'partial'|'unavailable',upstream:null as string|null,ahead:null as number|null,behind:null as number|null,taskId:null as string|null,taskTitle:null as string|null,taskDiagnostic:null as string|null,fileCount:null as number|null,changes:[] as CodeSourceControlRepository['changes'],observedRevision:null as string|null,readAt:new Date().toISOString(),coverage:{fileLimit:SOURCE_CONTROL_LIMITS.files,truncated:false},diagnostics:[] as CodeReadDiagnostic[]};output.worktrees.push(checkout);
          try{
            if(index>=SOURCE_CONTROL_LIMITS.repositories||position>=SOURCE_CONTROL_LIMITS.worktrees||statusAttempts>=SOURCE_CONTROL_LIMITS.totalWorktrees||Date.now()>=deadline){truncated=true;output.worktreeCoverage.truncated=true;throw codeFailure('code_worktree_read_limit','超出本次读取预算（128个代码库、共128个检出、12秒），保留Git清单但状态尚未确认。',413);}
            statusAttempts++;
            const source=reading.source(worktree.worktreeId);
            // Only background HTTP observations supply these short-lived values.
            // Inventory, checkout identity and closing registration checks stay live.
            const cached = observedWorktrees.find(value => value.worktreeId === worktree.worktreeId && value.location === source.location
              && value.source?.repositoryId === registered.id && value.status === 'complete' && value.available && !value.diagnostics.length
              && value.branch === worktree.branch && value.head === worktree.head && Date.now() >= Date.parse(value.readAt) && Date.now() - Date.parse(value.readAt) < 10_000);
            if (cached) {
              toVerify.push({
                source,
                commit() {
                  Object.assign(checkout, {available:true, source:{...source,version:cached.source!.version}, status:cached.status, branch:cached.branch, head:cached.head,
                    upstream:cached.upstream,ahead:cached.ahead,behind:cached.behind,fileCount:cached.fileCount,changes:cached.changes,
                    observedRevision:cached.observedRevision,coverage:cached.coverage,readAt:cached.readAt});
                  output.worktreeCoverage.read++;
                },
                fail(error) { checkout.diagnostics.push(diagnostic(error, registered.id, worktree.worktreeId)); },
              });
              continue;
            }
            uncached.push({
              source,
              accept(observed) {
                toVerify.push({
                  source,
                  commit() {
                    const currentVersion = observed.branch || observed.head;
                    source.version = currentVersion ? currentVersion + ' · 当前文件' : '当前文件';
                    Object.assign(checkout, {available:true,source,status:observed.truncated?'partial':'complete',branch:observed.branch,head:observed.head,upstream:observed.upstream,ahead:observed.ahead,behind:observed.behind,fileCount:observed.fileCount,changes:observed.files,observedRevision:observed.observedRevision,coverage:{fileLimit:SOURCE_CONTROL_LIMITS.files,truncated:observed.truncated}});
                    output.worktreeCoverage.read++;
                    if (observed.truncated) {
                      truncated = true;
                      checkout.diagnostics.push({code:'code_changes_truncated',message:'单个检出最多返回1000个路径的变更元信息，已确认数量仍包含其余路径。',repositoryId:registered.id,worktreeId:worktree.worktreeId});
                    }
                  },
                  fail(error) { checkout.diagnostics.push(diagnostic(error, registered.id, worktree.worktreeId)); },
                });
              },
              fail(error) { checkout.diagnostics.push(diagnostic(error, registered.id, worktree.worktreeId)); },
            });
          }catch(error){checkout.diagnostics.push(diagnostic(error,registered.id,worktree.worktreeId));}
        }
        if (uncached.length || toVerify.length) yield { kind: 'verify', reading, uncached, toVerify };
        for (const checkout of output.worktrees) output.diagnostics.push(...checkout.diagnostics);
        const primary=output.worktrees.find(worktree=>worktree.isRegistered);
        if(primary)Object.assign(output,{source:primary.source,branch:primary.branch,head:primary.head,upstream:primary.upstream,ahead:primary.ahead,behind:primary.behind,changes:primary.changes,observedRevision:primary.observedRevision});
        output.available=output.worktrees.some(worktree=>worktree.available);
        output.fileCount=output.worktrees.every(worktree=>worktree.fileCount!==null)?output.worktrees.reduce((total,worktree)=>total+worktree.fileCount!,0):null;
        output.status=output.worktrees.every(worktree=>worktree.status==='complete')?'complete':output.available?'partial':'unavailable';
        if(output.available)output.clone=null;
      } catch (error) { output.available = false; output.diagnostics.push(diagnostic(error, registered.id)); }
      diagnostics.push(...output.diagnostics);
    }
    let selectedRepositoryIds:string[]=[],selectedWorktreeIds:string[]=[],scopeReason=input.repositoryId?'显示指定代码库和 Git 实际登记工作树':'显示全部代码库和 Git 实际登记工作树';
    if(input.taskId){
      try{
        const scoped=dependencies.repositories(root,input.taskId,input.repositoryId);selectedRepositoryIds=scoped.selectedRepositoryIds.filter(id=>repositories.some(repository=>repository.id===id));diagnostics.push(...scoped.diagnostics);let fallback=false;
        for(const repositoryId of selectedRepositoryIds){
          let source:CodeSource|undefined;
          try{source=dependencies.source(root,{repositoryId,taskId:input.taskId});}catch(error){diagnostics.push(diagnostic(error,repositoryId));fallback=true;try{source=dependencies.source(root,{repositoryId});}catch(fallbackError){diagnostics.push(diagnostic(fallbackError,repositoryId));}}
          if(source?.worktreeId&&repositories.some(repository=>repository.id===repositoryId&&repository.worktrees.some(worktree=>worktree.worktreeId===source?.worktreeId)))selectedWorktreeIds.push(source.worktreeId);
          fallback||=!!source&&source.kind!=='task';
        }
        scopeReason=selectedWorktreeIds.length?`按已核对任务范围预选 ${selectedWorktreeIds.length} 个检出，仍保留全部 Git 工作树`+(fallback?'；无独立工作树的代码库使用登记目录':''):'任务没有可确认的检出范围，显示全部 Git 工作树';
      }catch(error){diagnostics.push(diagnostic(error,null));scopeReason='任务范围暂不可核对，仍显示全部 Git 实际登记工作树';}
    }
    try {
      const associations=dependencies.taskAssociations?.(root,repositories,input.taskId,deadline);
      if(associations)for(const repository of repositories)for(const worktree of repository.worktrees){const association=associations.get(codeWorktreeTaskKey(repository.id,worktree.worktreeId));if(association)Object.assign(worktree,association);}
    } catch {
      for(const repository of repositories)for(const worktree of repository.worktrees)if(!worktree.isMain)worktree.taskDiagnostic='任务目录关联当前不可读取。';
    }
    const selectedWorktrees=repositories.flatMap(repository=>repository.worktrees.filter(worktree=>selectedWorktreeIds.includes(worktree.worktreeId)).map(worktree=>({repositoryId:repository.id,worktreeId:worktree.worktreeId})));
    const worktreeCoverage={limit:SOURCE_CONTROL_LIMITS.totalWorktrees,total:repositories.every(repository=>repository.worktreeCount!==null)?repositories.reduce((total,repository)=>total+repository.worktreeCount!,0):null,read:repositories.reduce((total,repository)=>total+repository.worktreeCoverage.read,0),truncated:repositories.some(repository=>repository.worktreeCoverage.truncated)};
    return { ...metadata(codeRevision(repositories.map(repository => [repository.id,repository.worktrees.map(worktree=>[worktree.worktreeId,worktree.observedRevision,worktree.status,worktree.taskId,worktree.taskTitle,worktree.taskDiagnostic]), repository.status])), SOURCE_CONTROL_LIMITS.repositories, truncated, uniqueDiagnostics(diagnostics)), repositories, selectedRepositoryIds,selectedWorktreeIds:[...new Set(selectedWorktreeIds)],selectedWorktrees,worktreeCoverage, scopeReason };
  }

  function decorate(root: string, commits: CodeHistoryCommit[]) {
    const tasks = new Map<string, { taskId: string; title: string } | null>();
    for (const commit of commits) {
      const trailer = parseTaskCommitTrailer(commit.message);
      if (trailer.diagnostic) { commit.taskDiagnostic = trailer.diagnostic === 'conflict' ? '任务尾注冲突，未建立关联。' : '任务尾注无效，未建立关联。'; continue; }
      if (!trailer.taskId) continue;
      if (!tasks.has(trailer.taskId)) { try { tasks.set(trailer.taskId, dependencies.readTask?.(root, trailer.taskId) || null); } catch { tasks.set(trailer.taskId, null); } }
      const task = tasks.get(trailer.taskId);
      if (task?.taskId === trailer.taskId) { commit.taskId = task.taskId; commit.taskTitle = task.title; }
      else commit.taskDiagnostic = '尾注指定的任务当前不可读取，未建立可点击关联。';
    }
    return commits;
  }
  return Object.freeze({ sourceControl, sourceControlInWorker, sourceControlInventory, repositoryClone, ...createWorkbenchGitReads({ source: dependencies.source, verifySource, decorate }) });
}
