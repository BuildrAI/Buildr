import fs from 'node:fs';
import path from 'node:path';
import { inspectChangeChecklist } from './change-checklist.ts';

export type ChangeLifecycle = 'active' | 'archived';
export type Project = { id: string; code: string; name: string; source: { type?: string; path: string } };
type Artifact = { exists: boolean; path: string; content?: string };
export type ChangeModel = {
  ref: string;
  code: string;
  name: string;
  lifecycle: ChangeLifecycle;
  project: { id: string; code: string; name: string };
  updatedAt: string;
  progress: unknown;
  brief: Artifact & { kind: string };
  artifacts: { root: string; proposal: Artifact; design: Artifact; tasks: Artifact; specs: Array<Artifact & { capability: string }> };
};
export type PrototypePage = { path: string; title: string; html: string; sizeBytes: number; updatedAt: string };
export type PrototypeDiagnostic = { code: string; message: string; path?: string; project?: string; change?: string };
export type ProjectQuery = {
  projectDetail(root: string, code: string): { project: Project };
  listProjects(root: string): { projects: Project[] };
  resolveSourceRoot(root: string, source: Project['source']): string;
};
type InspectChecklist = (root: string) => unknown;
type ChangeError = Error & { code: string; status: number; details?: unknown };

const SAFE_SEGMENT: RegExp = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACTIVE_PREFIX = 'active~';
const ARCHIVED_PREFIX = 'archived~';
const CHANGE_CONTENT_FILES = ['.openspec.yaml', 'brief.md', 'proposal.md', 'design.md', 'tasks.md'];
const UI_PROTOTYPE_MARKER = '<!-- buildr:ui-prototype -->';
const UI_PROTOTYPE_MAX_DEPTH = 8;
const UI_PROTOTYPE_MAX_CANDIDATES = 200;
const UI_PROTOTYPE_MAX_PAGES = 20;
const UI_PROTOTYPE_MAX_BYTES = 2 * 1024 * 1024;

function changeError(code: string, message: string, status = 400, details?: unknown): ChangeError {
  const error = Object.assign(new Error(message), { code, status });
  if (details !== undefined) Object.assign(error, { details });
  return error;
}

function assertObject(input: unknown, code: string, message: string): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw changeError(code, message);
}

function assertSafeSegment(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    throw changeError('change_reference_invalid', `${label} 不合法。`, 400);
  }
  return value;
}

function relativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function isDirectory(file: string): boolean {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true && fs.lstatSync(file).isSymbolicLink() === false;
  } catch {
    return false;
  }
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true && fs.lstatSync(file).isSymbolicLink() === false;
  } catch {
    return false;
  }
}

function readDirectories(root: string): string[] {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && SAFE_SEGMENT.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function artifact(file: string, root: string, includeContent: boolean): Artifact {
  const exists = isFile(file);
  return {
    exists,
    path: relativePath(root, file),
    ...(includeContent && exists ? { content: fs.readFileSync(file, 'utf8') } : {}),
  };
}

function specs(changeRoot: string, workspaceRoot: string, includeContent: boolean): Array<Artifact & { capability: string }> {
  const specsRoot = path.join(changeRoot, 'specs');
  return readDirectories(specsRoot).flatMap((capability) => {
    const file = path.join(specsRoot, capability, 'spec.md');
    return isFile(file) ? [{ capability, ...artifact(file, workspaceRoot, includeContent) }] : [];
  });
}

function updatedAt(changeRoot: string): string {
  const files = CHANGE_CONTENT_FILES.map((name) => path.join(changeRoot, name));
  for (const capability of readDirectories(path.join(changeRoot, 'specs'))) {
    files.push(path.join(changeRoot, 'specs', capability, 'spec.md'));
  }
  const timestamps = files.filter(isFile).map((file) => fs.statSync(file).mtimeMs);
  return new Date(Math.max(...timestamps, fs.statSync(changeRoot).mtimeMs)).toISOString();
}

function changeName(code: string, proposalFile: string): string {
  if (!isFile(proposalFile)) return code;
  const heading = fs.readFileSync(proposalFile, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || code;
}

function uiPrototypeTitle(content: string, relative: string): string {
  const raw = content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const title = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return title || path.basename(relative, path.extname(relative));
}

function discoverUiPrototypes(changeRoot: string): { prototypes: PrototypePage[]; diagnostics: PrototypeDiagnostic[] } {
  const prototypes: PrototypePage[] = [];
  const diagnostics: PrototypeDiagnostic[] = [];
  let candidates = 0;
  let stopped = false;

  function diagnostic(code: string, message: string, relative?: string) {
    diagnostics.push({ code, message, ...(relative ? { path: relative } : {}) });
  }

  function visit(directory: string, depth: number): void {
    if (stopped) return;
    if (depth > UI_PROTOTYPE_MAX_DEPTH) {
      diagnostic('ui_prototype_depth_limit', `UI Prototype 扫描深度超过 ${UI_PROTOTYPE_MAX_DEPTH} 层，已跳过更深目录。`, relativePath(changeRoot, directory));
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      diagnostic('ui_prototype_directory_unreadable', 'UI Prototype 目录当前不可读取。', relativePath(changeRoot, directory));
      return;
    }
    for (const entry of entries) {
      if (stopped) return;
      const file = path.join(directory, entry.name);
      const relative = relativePath(changeRoot, file);
      if (entry.isSymbolicLink()) {
        if (entry.name.toLowerCase().endsWith('.html')) diagnostic('ui_prototype_symlink_ignored', 'UI Prototype 只读取 Change 内的普通 HTML 文件，符号链接已忽略。', relative);
        continue;
      }
      if (entry.isDirectory()) {
        visit(file, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) continue;
      candidates += 1;
      if (candidates > UI_PROTOTYPE_MAX_CANDIDATES) {
        diagnostic('ui_prototype_candidate_limit', `Change 中的 HTML 候选超过 ${UI_PROTOTYPE_MAX_CANDIDATES} 个，已停止扫描。`);
        stopped = true;
        return;
      }
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        diagnostic('ui_prototype_file_unreadable', 'UI Prototype HTML 当前不可读取。', relative);
        continue;
      }
      if (stat.size > UI_PROTOTYPE_MAX_BYTES) {
        diagnostic('ui_prototype_file_too_large', `UI Prototype HTML 超过 ${UI_PROTOTYPE_MAX_BYTES} bytes，已跳过。`, relative);
        continue;
      }
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        diagnostic('ui_prototype_file_unreadable', 'UI Prototype HTML 当前不可读取。', relative);
        continue;
      }
      if (!content.includes(UI_PROTOTYPE_MARKER)) continue;
      if (!/<head\b[^>]*>/i.test(content) || !/<body\b[^>]*>/i.test(content)) {
        diagnostic('ui_prototype_document_incomplete', '带标记的 UI Prototype 必须是包含 head 与 body 的完整 HTML。', relative);
        continue;
      }
      if (prototypes.length >= UI_PROTOTYPE_MAX_PAGES) {
        diagnostic('ui_prototype_page_limit', `可展示的 UI Prototype 页面超过 ${UI_PROTOTYPE_MAX_PAGES} 个，其余页面已跳过。`);
        stopped = true;
        return;
      }
      prototypes.push({
        path: relative,
        title: uiPrototypeTitle(content, relative),
        html: content,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  visit(changeRoot, 0);
  return { prototypes, diagnostics };
}

function projectContext(projectQuery: ProjectQuery, targetRoot: string, projectCode: string): { project: Project; projectRoot: string } {
  assertSafeSegment(projectCode, 'Project code');
  const detail = projectQuery.projectDetail(targetRoot, projectCode);
  return {
    project: detail.project,
    projectRoot: projectQuery.resolveSourceRoot(targetRoot, detail.project.source),
  };
}

function archivedChangeCode(directory: string): string {
  return directory.match(/^\d{4}-\d{2}-\d{2}-(?:\d{2}-)?(.+)$/)?.[1] || directory;
}

function buildChangeAtProjectRoot(targetRoot: string, project: Project, projectRoot: string, directory: string, lifecycle: ChangeLifecycle, includeContent: boolean, inspectChecklist: InspectChecklist): ChangeModel | null {
  const changesRoot = path.join(projectRoot, 'openspec', 'changes');
  const changeRoot = lifecycle === 'active' ? path.join(changesRoot, directory) : path.join(changesRoot, 'archive', directory);
  const identityFile = path.join(changeRoot, '.openspec.yaml');
  if (!isDirectory(changeRoot) || !isFile(identityFile)) return null;
  const code = lifecycle === 'archived' ? archivedChangeCode(directory) : directory;
  const proposal = artifact(path.join(changeRoot, 'proposal.md'), targetRoot, includeContent);
  const brief = {
    kind: 'buildr-companion',
    ...artifact(path.join(changeRoot, 'brief.md'), targetRoot, includeContent),
  };
  const design = artifact(path.join(changeRoot, 'design.md'), targetRoot, includeContent);
  const tasks = artifact(path.join(changeRoot, 'tasks.md'), targetRoot, includeContent);
  const changeSpecs = specs(changeRoot, targetRoot, includeContent);
  return {
    ref: `${lifecycle === 'active' ? ACTIVE_PREFIX : ARCHIVED_PREFIX}${directory}`,
    code,
    name: changeName(code, path.join(changeRoot, 'proposal.md')),
    lifecycle,
    project: { id: project.id, code: project.code, name: project.name },
    updatedAt: updatedAt(changeRoot),
    progress: inspectChecklist(changeRoot),
    brief,
    artifacts: {
      root: relativePath(targetRoot, changeRoot),
      proposal,
      design,
      tasks,
      specs: changeSpecs,
    },
  };
}

function buildChange(projectQuery: ProjectQuery, targetRoot: string, project: Project, directory: string, lifecycle: ChangeLifecycle, includeContent: boolean, inspectChecklist: InspectChecklist): ChangeModel | null {
  return buildChangeAtProjectRoot(targetRoot, project, projectQuery.resolveSourceRoot(targetRoot, project.source), directory, lifecycle, includeContent, inspectChecklist);
}

function findLogicalChange(targetRoot: string, project: Project, projectRoot: string, code: string, includeContent: boolean, inspectChecklist: InspectChecklist): ChangeModel | null {
  const changesRoot = path.join(projectRoot, 'openspec', 'changes');
  const active = buildChangeAtProjectRoot(targetRoot, project, projectRoot, code, 'active', includeContent, inspectChecklist);
  if (active) return active;
  const archivedDirectories = readDirectories(path.join(changesRoot, 'archive'))
    .filter((directory) => archivedChangeCode(directory) === code)
    .sort((left, right) => right.localeCompare(left));
  for (const directory of archivedDirectories) {
    const archived = buildChangeAtProjectRoot(targetRoot, project, projectRoot, directory, 'archived', includeContent, inspectChecklist);
    if (archived) return archived;
  }
  return null;
}

function decodeRef(ref: unknown): { lifecycle: ChangeLifecycle; directory: string } {
  if (typeof ref !== 'string') throw changeError('change_reference_invalid', 'Change reference 不合法。');
  const lifecycle = ref.startsWith(ACTIVE_PREFIX) ? 'active' : ref.startsWith(ARCHIVED_PREFIX) ? 'archived' : null;
  if (!lifecycle) throw changeError('change_reference_invalid', 'Change reference 不合法。');
  const directory = ref.slice(lifecycle === 'active' ? ACTIVE_PREFIX.length : ARCHIVED_PREFIX.length);
  assertSafeSegment(directory, 'Change reference');
  return { lifecycle, directory };
}

export function createChangeQuery(projectQuery: ProjectQuery) {
  const requiredProjectQuery = projectQuery;
  function listProjectChanges(targetRoot: string, projectCode: string): { project: { id: string; code: string; name: string }; changes: ChangeModel[] } {
    const { project, projectRoot } = projectContext(requiredProjectQuery, targetRoot, projectCode);
    const changesRoot = path.join(projectRoot, 'openspec', 'changes');
    const active = readDirectories(changesRoot)
      .filter((directory) => directory !== 'archive')
      .map((directory) => buildChange(requiredProjectQuery, targetRoot, project, directory, 'active', false, inspectChangeChecklist));
    const archived = readDirectories(path.join(changesRoot, 'archive'))
      .map((directory) => buildChange(requiredProjectQuery, targetRoot, project, directory, 'archived', false, inspectChangeChecklist));
    return {
      project: { id: project.id, code: project.code, name: project.name },
      changes: [...active, ...archived].filter((change): change is ChangeModel => change !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  function listChanges(targetRoot: string): { projects: Array<{ id: string; code: string; name: string }>; changes: ChangeModel[] } {
    const projects = requiredProjectQuery.listProjects(targetRoot).projects;
    const changes = projects.flatMap((project) => listProjectChanges(targetRoot, project.code).changes)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects: projects.map(({ id, code, name }) => ({ id, code, name })), changes };
  }

  function changeDetail(targetRoot: string, projectCode: string, ref: string): { change: ChangeModel } {
    const { project } = projectContext(requiredProjectQuery, targetRoot, projectCode);
    const { lifecycle, directory } = decodeRef(ref);
    const change = buildChange(requiredProjectQuery, targetRoot, project, directory, lifecycle, true, inspectChangeChecklist);
    if (!change) throw changeError('change_not_found', `Change 不存在：${projectCode}/${ref}。`, 404);
    return { change };
  }

  function generateChangeCreatePrompt(targetRoot: string, input: unknown): { prompt: string; copiedMeansCreated: false } {
    assertObject(input, 'change_prompt_invalid', 'Change prompt 请求必须是对象。');
    const allowed = new Set(['projectCode', 'goal']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw changeError('change_prompt_field_forbidden', `Change prompt 不支持字段：${field}。`);
    const projectCode = String(input.projectCode || '').trim();
    const goal = String(input.goal || '').trim();
    const { project } = projectContext(requiredProjectQuery, targetRoot, projectCode);
    if (!goal) throw changeError('change_prompt_goal_required', '请填写本次变更目标。');
    return {
      prompt: [
        `请在 Buildr 工作空间的项目“${project.name}（${project.code}）”中发起一个新的变更。`,
        '',
        `变更目标：${goal}`,
        '',
        '执行要求：',
        '1. 读取并遵循当前工作空间的 OpenSpec 与任务路由 Skill。',
        '2. 先澄清范围、边界与验收标准，再创建合法且唯一的变更标识。',
        '3. 生成提案、设计、增量规格与任务，并完成适用的契约检查。',
        '4. 不要仅因为复制了这段提示词就把变更视为已经创建。',
      ].join('\n'),
      copiedMeansCreated: false,
    };
  }

  function generateChangeActionPrompt(targetRoot: string, input: unknown): { prompt: string; copiedMeansCreated: false } {
    assertObject(input, 'change_prompt_invalid', 'Change prompt 请求必须是对象。');
    const allowed = new Set(['projectCode', 'ref', 'action']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw changeError('change_prompt_field_forbidden', `Change prompt 不支持字段：${field}。`);
    const action = input.action === 'review' ? 'review' : input.action === 'continue' ? 'continue' : null;
    if (!action) throw changeError('change_prompt_action_invalid', 'Change action 仅支持 continue 或 review。');
    const { change } = changeDetail(targetRoot, String(input.projectCode || '').trim(), String(input.ref || '').trim());
    const actionText = action === 'review' ? '审查' : '继续推进';
    const archivedWarning = change.lifecycle === 'archived'
      ? ['', '注意：这是已归档 Change。默认只读，不要修改历史归档；若发现新需求，应先判断是否创建新的 Change。']
      : [];
    return {
      prompt: [
        `请${actionText}项目“${change.project.name}（${change.project.code}）”中的变更“${change.code}”。`,
        '',
        `变更路径：${change.artifacts.root}`,
        `生命周期：${change.lifecycle === 'active' ? '进行中' : '已归档'}`,
        ...archivedWarning,
        '',
        '执行要求：',
        '1. 读取该变更的提案、设计、增量规格与任务，并遵循适用 Skill。',
        action === 'review' ? '2. 对照契约、任务状态、实现和验证证据给出审查结论；不要直接修改。' : '2. 从未完成任务继续，按任务完成情况及时更新 checkbox，并运行适用验证。',
        '3. 明确说明已完成、未完成、阻塞与验证边界。',
      ].join('\n'),
      copiedMeansCreated: false,
    };
  }

  return Object.freeze({
    listProjectChanges,
    listChanges,
    changeDetail,
    generateChangeCreatePrompt,
    generateChangeActionPrompt,
    findLogicalChange: (targetRoot: string, project: Project, projectRoot: string, code: string, includeContent = false) => {
      assertSafeSegment(code, 'Change code');
      return findLogicalChange(targetRoot, project, projectRoot, code, includeContent, inspectChangeChecklist);
    },
    discoverUiPrototypes,
  });
}

export type ChangeQuery = ReturnType<typeof createChangeQuery>;
