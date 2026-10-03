import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, relativeCodePath, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { readCodeFile } from '../infrastructure/code-file-content.ts';
import { readSourceControlImages, type CodeImageFile } from '../infrastructure/source-control-image-reader.ts';
import { parseTaskCommitTrailer } from '../../task/commits/domain/task-commit.ts';
import type { CodeGitWorktree } from '../infrastructure/code-worktree-reader.ts';
import { codeWorktreeTaskKey, type readSourceControlTaskAssociations } from '../infrastructure/code-worktree-catalog.ts';
import { SOURCE_CONTROL_LIMITS, assertCodeRevision, assertSourceControlPath, codeRevision, observeSourceControl, readIndexEntry, readSourceControlRefs, readRawCodeCommit, readRawCodeCommits, listCodeCommitIds, readCodeCommitFiles, readCodePatch } from '../infrastructure/source-control-git-reader.ts';
import type { CodeReadMeta, CodeReadDiagnostic, CodeSourceControlInput, CodeSourceControlResponse, CodeSourceControlRepository, CodeHistoryCommit, CodeHistoryResponse, CodeCommitResponse, CodeDiffResponse, CodeSourceFileResponse } from './source-control-model.ts';

type Catalog = { repositories: Array<{ id: string; code: string; name: string; location: string; available: boolean; gitId: string | null }>; selectedRepositoryIds: string[]; scopeReason: string; diagnostics: CodeReadDiagnostic[] };
type Dependencies = { repositories(root: string, taskId?: string): Catalog; source(root: string, input: CodeSourceControlInput): CodeSource;worktrees(root:string,repositoryId:string):CodeGitWorktree[]; taskAssociations?(root:string,repositories:CodeSourceControlRepository[],taskId?:string,deadline?:number):ReturnType<typeof readSourceControlTaskAssociations>; readTask?(root: string, taskId: string): { taskId: string; title: string } };
const diagnostic = (error: unknown, repositoryId: string | null,worktreeId?:string): CodeReadDiagnostic => ({ code: (error as { code?: string })?.code || 'code_source_unavailable', message: error instanceof Error ? error.message : '代码来源暂不可读取。', repositoryId,...(worktreeId?{worktreeId}:{}) });
function metadata(observedRevision: string, limit: number, truncated = false, diagnostics: CodeReadDiagnostic[] = [], nextCursor: string | null = null): CodeReadMeta {
  return { readAt: new Date().toISOString(), observedRevision, coverage: { limit, truncated, nextCursor }, diagnostics };
}
function requireRepository(input: CodeSourceControlInput) { if (!input.repositoryId) throw codeFailure('code_repository_required', '必须选择已登记代码库。'); }
function validateInput(input: CodeSourceControlInput) {
  if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SOURCE_CONTROL_LIMITS.history)) throw codeFailure('code_history_limit_invalid', '历史条数必须为 1–200。');
  if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 200 || input.query.includes('\0'))) throw codeFailure('code_query_invalid', '历史关键词最长 200 个字符。');
  if (input.area !== undefined && !['unstaged', 'staged', 'untracked', 'commit'].includes(input.area)) throw codeFailure('code_area_invalid', '比较层无效。');
}

export function createSourceControlApplication(dependencies: Dependencies) {
  function verifySource(root:string,input:CodeSourceControlInput,source:CodeSource){
    const current=dependencies.source(root,{...input,worktreeId:source.worktreeId||input.worktreeId});
    if(current.worktreeId!==source.worktreeId||current.location!==source.location)throw codeFailure('code_worktree_identity_changed','读取期间工作树身份已变化，请刷新后继续。',409);
  }
  function sourceControl(root: string, input: CodeSourceControlInput = {}): CodeSourceControlResponse {
    const catalog = dependencies.repositories(root), repositories: CodeSourceControlRepository[] = [];
    const diagnostics = [...catalog.diagnostics]; let truncated = false,statusAttempts=0;const deadline=Date.now()+SOURCE_CONTROL_LIMITS.statusReadMs;
    for (const [index, registered] of [...new Map(catalog.repositories.map(repository => [repository.id, repository])).values()].entries()) {
      const output: CodeSourceControlRepository = { ...registered, source: null, status: 'unavailable', branch: null, head: null, upstream: null, ahead: null, behind: null, fileCount: null, changes: [], observedRevision: null, diagnostics: [],worktrees:[],worktreeCount:null,worktreeCoverage:{limit:SOURCE_CONTROL_LIMITS.worktrees,total:null,read:0,truncated:false} };
      repositories.push(output);
      try {
        const worktrees=dependencies.worktrees(root,registered.id);output.worktreeCount=worktrees.length;output.worktreeCoverage.total=worktrees.length;
        for(const [position,worktree]of worktrees.entries()){
          const checkout={...worktree,available:false,source:null as CodeSource|null,status:'unavailable' as 'complete'|'partial'|'unavailable',upstream:null as string|null,ahead:null as number|null,behind:null as number|null,taskId:null as string|null,taskTitle:null as string|null,taskDiagnostic:null as string|null,fileCount:null as number|null,changes:[] as CodeSourceControlRepository['changes'],observedRevision:null as string|null,readAt:new Date().toISOString(),coverage:{fileLimit:SOURCE_CONTROL_LIMITS.files,truncated:false},diagnostics:[] as CodeReadDiagnostic[]};output.worktrees.push(checkout);
          try{
            if(index>=SOURCE_CONTROL_LIMITS.repositories||position>=SOURCE_CONTROL_LIMITS.worktrees||statusAttempts>=SOURCE_CONTROL_LIMITS.totalWorktrees||Date.now()>=deadline){truncated=true;output.worktreeCoverage.truncated=true;throw codeFailure('code_worktree_read_limit','超出本次读取预算（128个代码库、共128个检出、12秒），保留Git清单但状态尚未确认。',413);}
            statusAttempts++;
            const source=dependencies.source(root,{repositoryId:registered.id,worktreeId:worktree.worktreeId}),observed=observeSourceControl(source);verifySource(root,{repositoryId:registered.id},source);
            Object.assign(checkout,{available:true,source,status:observed.truncated?'partial':'complete',branch:observed.branch,head:observed.head,upstream:observed.upstream,ahead:observed.ahead,behind:observed.behind,fileCount:observed.fileCount,changes:observed.files,observedRevision:observed.observedRevision,coverage:{fileLimit:SOURCE_CONTROL_LIMITS.files,truncated:observed.truncated}});output.worktreeCoverage.read++;
            if(observed.truncated){truncated=true;checkout.diagnostics.push({code:'code_changes_truncated',message:'单个检出最多返回1000个路径的变更元信息，已确认数量仍包含其余路径。',repositoryId:registered.id,worktreeId:worktree.worktreeId});}
          }catch(error){checkout.diagnostics.push(diagnostic(error,registered.id,worktree.worktreeId));}
          output.diagnostics.push(...checkout.diagnostics);
        }
        const primary=output.worktrees.find(worktree=>worktree.isRegistered);
        if(primary)Object.assign(output,{source:primary.source,branch:primary.branch,head:primary.head,upstream:primary.upstream,ahead:primary.ahead,behind:primary.behind,changes:primary.changes,observedRevision:primary.observedRevision});
        output.available=output.worktrees.some(worktree=>worktree.available);
        output.fileCount=output.worktrees.every(worktree=>worktree.fileCount!==null)?output.worktrees.reduce((total,worktree)=>total+worktree.fileCount!,0):null;
        output.status=output.worktrees.every(worktree=>worktree.status==='complete')?'complete':output.available?'partial':'unavailable';
      } catch (error) { output.available = false; output.diagnostics.push(diagnostic(error, registered.id)); }
      diagnostics.push(...output.diagnostics);
    }
    let selectedRepositoryIds:string[]=[],selectedWorktreeIds:string[]=[],scopeReason='显示全部代码库和 Git 实际登记工作树';
    if(input.taskId){
      try{
        const scoped=dependencies.repositories(root,input.taskId);selectedRepositoryIds=scoped.selectedRepositoryIds;diagnostics.push(...scoped.diagnostics);let fallback=false;
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
    return { ...metadata(codeRevision(repositories.map(repository => [repository.id,repository.worktrees.map(worktree=>[worktree.worktreeId,worktree.observedRevision,worktree.status,worktree.taskId,worktree.taskTitle,worktree.taskDiagnostic]), repository.status])), SOURCE_CONTROL_LIMITS.repositories, truncated, diagnostics), repositories, selectedRepositoryIds,selectedWorktreeIds:[...new Set(selectedWorktreeIds)],selectedWorktrees,worktreeCoverage, scopeReason };
  }

  function decorate(root: string, commits: CodeHistoryCommit[], refs: ReturnType<typeof readSourceControlRefs>) {
    const tasks = new Map<string, { taskId: string; title: string } | null>();
    for (const commit of commits) {
      commit.branches = refs.rows.filter(row => row[0].startsWith('refs/heads/') && row[1] === commit.hash).map(row => row[0].slice(11));
      commit.tags = refs.rows.filter(row => row[0].startsWith('refs/tags/') && (row[2] || row[1]) === commit.hash).map(row => row[0].slice(10));
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
  function history(root: string, input: CodeSourceControlInput): CodeHistoryResponse {
    requireRepository(input); validateInput(input);
    const source = dependencies.source(root, input), refs = readSourceControlRefs(source);
    let tips = refs.head ? [refs.head] : [];
    if (input.branch && input.branch !== 'HEAD') {
      const branch = refs.branches.find(branch => branch.name === input.branch);
      if (!branch && (refs.head || refs.current !== input.branch)) throw codeFailure('code_branch_missing', '所选本机分支不存在，请刷新分支清单。', 404);
      tips = branch ? [branch.hash] : [];
    }
    const revision = codeRevision([refs.revision, input.branch || 'HEAD', input.query || null]);
    assertCodeRevision(revision, input.expectedRevision);
    let offset = 0;
    if (input.cursor) {
      try { const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString()); if (cursor.revision !== revision || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw Error(); offset = cursor.offset; }
      catch { throw codeFailure('code_history_cursor_changed', '历史范围或引用已变化，请刷新后继续读取。', 409); }
    }
    const listing = listCodeCommitIds(source, tips), objects = readRawCodeCommits(source, listing.ids), commits = objects.commits;
    const query = (input.query || '').trim().toLowerCase();
    const matching = query ? commits.filter(commit => [commit.message, commit.authorName, commit.authorEmail, commit.hash].join('\n').toLowerCase().includes(query)) : commits;
    const limit = input.limit || SOURCE_CONTROL_LIMITS.history, selected = decorate(root, matching.slice(offset, offset + limit), refs);
    const more = offset + limit < matching.length, nextCursor = more ? Buffer.from(JSON.stringify({ revision, offset: offset + limit })).toString('base64url') : null;
    assertCodeRevision(refs.revision, readSourceControlRefs(source).revision);
    const diagnostics:CodeReadDiagnostic[] = listing.truncated ? [{ code: 'code_history_scan_truncated', message: '只检查最近 2000 个本机可达提交，较早历史尚未读取。', repositoryId: source.repositoryId }] : [];
    if(objects.truncated)diagnostics.push({code:'code_history_bytes_truncated',message:'部分提交说明超过本次 8 MiB 对象读取上限，保留其他已读取提交。',repositoryId:source.repositoryId});
    verifySource(root,input,source);
    return { ...metadata(revision, SOURCE_CONTROL_LIMITS.scan, listing.truncated || objects.truncated || more, diagnostics, nextCursor), source, branches: refs.branches, commits: selected };
  }
  function commit(root: string, input: CodeSourceControlInput): CodeCommitResponse {
    requireRepository(input); if (!input.commitHash) throw codeFailure('code_commit_required', '必须提供完整提交标识。');
    const source = dependencies.source(root, input), value = readRawCodeCommit(source, input.commitHash);
    const revision = 'git:' + value.hash; assertCodeRevision(revision, input.expectedRevision);
    const files = readCodeCommitFiles(source, value.hash, value.parents[0] || null);
    decorate(root, [value], readSourceControlRefs(source));
    verifySource(root,input,source);
    return { ...metadata(revision, SOURCE_CONTROL_LIMITS.files, files.truncated), source, commit: value, baseHash: value.parents[0] || null, files: files.files };
  }
  async function diff(root: string, input: CodeSourceControlInput): Promise<CodeDiffResponse> {
    requireRepository(input); validateInput(input); relativeCodePath(input.path || '');
    if (!input.area) throw codeFailure('code_area_required', '必须指定比较层。');
    const source = dependencies.source(root, input);
    let baseHash: string | null = null, file, revision: string;
    if (input.area === 'commit') {
      const result = commit(root, input); baseHash = result.baseHash; revision = result.observedRevision; file = result.files.find(file => file.path === input.path);
    } else {
      if (input.commitHash) throw codeFailure('code_area_commit_conflict', '未提交比较层不能同时指定历史提交。');
      const status = observeSourceControl(source); revision = status.observedRevision; assertCodeRevision(revision, input.expectedRevision);
      file = status.files.find(file => file.path === input.path && file.area === input.area); baseHash = input.area === 'staged' ? status.head : null;
    }
    if (!file) throw codeFailure('code_changed_file_missing', '所选文件不在当前比较层，请刷新列表。', 404);
    let patch: string | null, binary = false, truncated = false, untrackedContent:CodeImageFile|undefined;
    const diagnostics: CodeReadDiagnostic[] = [];
    if (file.status === 'conflicted') {
      patch = null;
      diagnostics.push({code:'code_file_conflicted',message:'文件仍有冲突，没有唯一索引基线，不能作普通双向比较；可查看当前全文。',repositoryId:source.repositoryId});
    } else if (input.area === 'untracked') {
      assertSourceControlPath(source, file.path);
      const stat = fs.lstatSync(path.join(source.location, file.path));
      if (!stat.isFile()) throw codeFailure('code_file_type_unsupported', '未跟踪文件不是可读取的普通文件。', 415);
      const content = await readCodeFile(source, file.path);
      untrackedContent = content;
      binary = content.kind === 'unsupported' || content.kind === 'image'; truncated = content.truncated;
      const lines = content.content.split('\n'); if (lines.at(-1) === '') lines.pop();
      const quote = (value:string) => /[\x00-\x20"\\]/.test(value) ? JSON.stringify(value) : value;
      const body = lines.slice(0,SOURCE_CONTROL_LIMITS.patchLines-6); truncated ||= body.length !== lines.length;
      patch = binary ? null : `diff --git ${quote('a/'+file.path)} ${quote('b/'+file.path)}\nnew file mode 100644\n--- /dev/null\n+++ ${quote('b/'+file.path)}\n@@ -0,0 +1,${lines.length} @@\n` + body.map(line => '+' + line).join('\n') + '\n';
      file = { ...file, additions: binary || content.truncated ? null : lines.length, deletions: binary ? null : 0 };
    } else {
      const result = readCodePatch(source, file, baseHash, input.commitHash); patch = result.patch; binary = result.binary; truncated = result.truncated;
      file = { ...file, additions: result.additions, deletions: result.deletions };
    }
    const imagePreview = await readSourceControlImages(source,file,baseHash,input.commitHash,untrackedContent);
    if (imagePreview) { binary = true; patch = null; truncated ||= Boolean(imagePreview.before?.truncated || imagePreview.after?.truncated); }
    if (input.area !== 'commit') assertCodeRevision(revision, observeSourceControl(source).observedRevision);
    verifySource(root,input,source);
    file = { ...file, preview: patch, previewTruncated: truncated };
    return { ...metadata(revision, SOURCE_CONTROL_LIMITS.patchLines, truncated,diagnostics), source, area: input.area, file, patch, binary, baseHash, ...(imagePreview ? {imagePreview} : {}) };
  }
  async function sourceFile(root: string, input: CodeSourceControlInput): Promise<CodeSourceFileResponse> {
    requireRepository(input); validateInput(input); relativeCodePath(input.path || '');
    if (input.commitHash && input.area && input.area !== 'commit') throw codeFailure('code_area_commit_conflict', '未提交文件比较层不能同时指定历史提交。');
    const source = dependencies.source(root, input), expected = input.expectedRevision;
    if (expected?.startsWith('scm:')) assertCodeRevision(observeSourceControl(source).observedRevision, expected);
    verifySource(root,input,source);
    const options = { page: input.page, line: input.line, matchQuery: input.matchQuery, expectedRevision: expected?.startsWith('scm:') ? undefined : expected };
    let result;
    if (input.area === 'staged') {
      if (input.commitHash) throw codeFailure('code_area_commit_conflict', '暂存文件不能同时指定历史提交。');
      const indexed = readIndexEntry(source, input.path!);
      result = await readCodeFile({ ...source, version: (source.version.split(' · ')[0] || '') + ' · 已暂存版本 · ' + indexed.hash }, input.path!, { ...options, indexBlob: indexed });
    } else {
      if (input.area === 'commit' && !input.commitHash) throw codeFailure('code_commit_required', '历史全文必须指定完整提交标识。');
      result = await readCodeFile(source, input.path!, options);
    }
    if (expected?.startsWith('scm:')) assertCodeRevision(observeSourceControl(source).observedRevision, expected);
    verifySource(root,input,source);
    return { ...result, ...metadata(result.revision, result.limitBytes, result.truncated) };
  }
  return Object.freeze({ sourceControl, history, commit, diff, sourceFile });
}
