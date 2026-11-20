import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, relativeCodePath, type CodeSource } from './code-file-reader.ts';
import { readCodeFile } from './code-file-content.ts';
import { readSourceControlImages, type CodeImageFile } from './source-control-image-reader.ts';
import { readCodeConfiguredAuthor } from './code-author-identity.ts';
import { SOURCE_CONTROL_LIMITS, assertCodeRevision, assertSourceControlPath, codeRevision, observeSourceControl, readIndexEntry, readSourceControlRefs, sourceControlHistoryTips, readRawCodeCommit, readRawCodeCommits, listCodeCommitIds, readCodeCommitFiles, readCodePatch, workingCodeChange } from './source-control-git-reader.ts';
import type { CodeHistoryCommit } from './source-control-types.ts';
import type { CodeReadMeta, CodeReadDiagnostic, CodeSourceControlInput, CodeHistoryResponse, CodeAuthorsResponse, CodeCommitResponse, CodeDiffResponse, CodeSourceFileResponse } from './source-control-read-types.ts';

export function sourceControlReadMeta(observedRevision: string, limit: number, truncated = false, diagnostics: CodeReadDiagnostic[] = [], nextCursor: string | null = null): CodeReadMeta {
  return { readAt: new Date().toISOString(), observedRevision, coverage: { limit, truncated, nextCursor }, diagnostics };
}
function requireRepository(input: CodeSourceControlInput) { if (!input.repositoryId) throw codeFailure('code_repository_required', '必须选择准确代码库。'); }
function validateInput(input: CodeSourceControlInput) {
  if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SOURCE_CONTROL_LIMITS.history)) throw codeFailure('code_history_limit_invalid', '历史条数必须为 1–200。');
  if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 200 || input.query.includes('\0'))) throw codeFailure('code_query_invalid', '历史关键词最长 200 个字符。');
  if (input.authorEmail !== undefined && (typeof input.authorEmail !== 'string' || !input.authorEmail || input.authorEmail.length > 320 || /[\0\r\n]/.test(input.authorEmail))) throw codeFailure('code_author_invalid', '作者（Author）邮箱身份无效。');
  if (input.branch !== undefined && (typeof input.branch !== 'string' || !input.branch || input.branch.length > 1024 || /[\0\r\n]/.test(input.branch))) throw codeFailure('code_branch_invalid', '历史分支（Branch）范围无效。');
  if (input.area !== undefined && !['unstaged', 'staged', 'untracked', 'working', 'commit'].includes(input.area)) throw codeFailure('code_area_invalid', '比较层无效。');
}

/** The host resolves and revalidates a concrete source; task decoration is optional. */
export function createWorkbenchGitReads(dependencies: {
  source(root: string, input: CodeSourceControlInput): CodeSource;
  verifySource(root: string, input: CodeSourceControlInput, source: CodeSource): void;
  decorate?(root: string, commits: CodeHistoryCommit[]): void;
}) {
  const { verifySource } = dependencies;
  function decorate(root: string, commits: CodeHistoryCommit[], refs: ReturnType<typeof readSourceControlRefs>) {
    for (const commit of commits) {
      commit.branches = refs.rows.filter(row => row[0].startsWith('refs/heads/') && row[1] === commit.hash).map(row => row[0].slice(11));
      commit.tags = refs.rows.filter(row => row[0].startsWith('refs/tags/') && (row[2] || row[1]) === commit.hash).map(row => row[0].slice(10));
    }
    dependencies.decorate?.(root, commits);
    return commits;
  }
  function history(root: string, input: CodeSourceControlInput): CodeHistoryResponse {
    requireRepository(input); validateInput(input);
    const source = dependencies.source(root, input), refs = readSourceControlRefs(source);
    const tips = sourceControlHistoryTips(refs, input.branch);
    const revision = codeRevision([refs.revision, input.branch || 'HEAD', input.query || null, input.authorEmail || null]);
    assertCodeRevision(revision, input.expectedRevision);
    let offset = 0;
    if (input.cursor) {
      try { const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString()); if (cursor.revision !== revision || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw Error(); offset = cursor.offset; }
      catch { throw codeFailure('code_history_cursor_changed', '历史范围或引用已变化，请刷新后继续读取。', 409); }
    }
    const listing = listCodeCommitIds(source, tips), objects = readRawCodeCommits(source, listing.ids), commits = objects.commits;
    const query = (input.query || '').trim().toLowerCase();
    const matching = commits.filter(commit => (!input.authorEmail || commit.authorEmail === input.authorEmail) && (!query || [commit.message, commit.authorName, commit.authorEmail, commit.hash].join('\n').toLowerCase().includes(query)));
    const limit = input.limit || SOURCE_CONTROL_LIMITS.history, selected = decorate(root, matching.slice(offset, offset + limit), refs);
    const more = offset + limit < matching.length, nextCursor = more ? Buffer.from(JSON.stringify({ revision, offset: offset + limit })).toString('base64url') : null;
    assertCodeRevision(refs.revision, readSourceControlRefs(source).revision);
    const diagnostics:CodeReadDiagnostic[] = listing.truncated ? [{ code: 'code_history_scan_truncated', message: '只检查最近 2000 个本机可达提交，较早历史尚未读取。', repositoryId: source.repositoryId }] : [];
    if(objects.truncated)diagnostics.push({code:'code_history_bytes_truncated',message:'部分提交说明超过本次 8 MiB 对象读取上限，保留其他已读取提交。',repositoryId:source.repositoryId});
    verifySource(root,input,source);
    return { ...sourceControlReadMeta(revision, SOURCE_CONTROL_LIMITS.scan, listing.truncated || objects.truncated || more, diagnostics, nextCursor), source, branches: refs.branches, commits: selected };
  }
  function authors(root: string, input: CodeSourceControlInput): CodeAuthorsResponse {
    requireRepository(input); validateInput(input);
    const source = dependencies.source(root, input), refs = readSourceControlRefs(source);
    const identity = () => {
      try { return { currentAuthor: readCodeConfiguredAuthor(source), unavailable: false }; }
      catch { return { currentAuthor: null, unavailable: true }; }
    };
    const observedIdentity = identity();
    const listing = listCodeCommitIds(source, sourceControlHistoryTips(refs, input.branch));
    const objects = readRawCodeCommits(source, listing.ids), byEmail = new Map<string, { name: string; email: string }>();
    for (const commit of objects.commits) if (commit.authorEmail && !byEmail.has(commit.authorEmail)) byEmail.set(commit.authorEmail, { name: commit.authorName, email: commit.authorEmail });
    const revision = codeRevision([refs.revision, input.branch || 'HEAD', 'authors', observedIdentity]);
    assertCodeRevision(revision, input.expectedRevision);
    assertCodeRevision(refs.revision, readSourceControlRefs(source).revision); verifySource(root, input, source);
    assertCodeRevision(codeRevision(observedIdentity), codeRevision(identity()));
    const truncated = listing.truncated || objects.truncated;
    const diagnostics: CodeReadDiagnostic[] = truncated ? [{ code: 'code_authors_truncated', message: '作者（Author）候选只覆盖最近 2000 条可达提交（Commit）及本次 8 MiB 对象读取范围。', repositoryId: source.repositoryId }] : [];
    if (observedIdentity.unavailable) diagnostics.push({ code: 'code_author_identity_unavailable', message: '当前 Git 作者（Author）身份暂不可确认，仍可选择其他作者（Author）筛选。', repositoryId: source.repositoryId });
    return { ...sourceControlReadMeta(revision, SOURCE_CONTROL_LIMITS.scan, truncated, diagnostics), source, currentAuthor: observedIdentity.currentAuthor, authors: [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)) };
  }
  function commit(root: string, input: CodeSourceControlInput): CodeCommitResponse {
    requireRepository(input); if (!input.commitHash) throw codeFailure('code_commit_required', '必须提供完整提交标识。');
    const source = dependencies.source(root, input), value = readRawCodeCommit(source, input.commitHash);
    const revision = 'git:' + value.hash; assertCodeRevision(revision, input.expectedRevision);
    const files = readCodeCommitFiles(source, value.hash, value.parents[0] || null);
    decorate(root, [value], readSourceControlRefs(source));
    verifySource(root,input,source);
    return { ...sourceControlReadMeta(revision, SOURCE_CONTROL_LIMITS.files, files.truncated), source, commit: value, baseHash: value.parents[0] || null, files: files.files };
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
      if (input.area === 'working') { const comparison = workingCodeChange(source, status, input.path!); file = comparison?.file; baseHash = comparison?.hasBase ? status.head : null; }
      else { file = status.files.find(file => file.path === input.path && file.area === input.area); baseHash = input.area === 'staged' ? status.head : null; }
    }
    if (!file) throw codeFailure('code_changed_file_missing', '所选文件不在当前比较层，请刷新列表。', 404);
    let patch: string | null, binary = false, truncated = false, untrackedContent:CodeImageFile|undefined;
    const diagnostics: CodeReadDiagnostic[] = [];
    if (file.status === 'conflicted') {
      patch = null;
      diagnostics.push({code:'code_file_conflicted',message:'文件仍有冲突，没有唯一索引基线，不能作普通双向比较；可查看当前全文。',repositoryId:source.repositoryId});
    } else if (input.area === 'working' && file.status === 'deleted' && !baseHash) {
      patch = ''; file = {...file, additions: 0, deletions: 0};
    } else if (input.area === 'untracked' || input.area === 'working' && file.status === 'added') {
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
    return { ...sourceControlReadMeta(revision, SOURCE_CONTROL_LIMITS.patchLines, truncated,diagnostics), source, area: input.area, file, patch, binary, baseHash, ...(imagePreview ? {imagePreview} : {}) };
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
    return { ...result, ...sourceControlReadMeta(result.revision, result.limitBytes, result.truncated) };
  }
  return Object.freeze({ history, authors, commit, diff, sourceFile });
}
