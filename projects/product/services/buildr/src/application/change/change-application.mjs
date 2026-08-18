import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inspectChangeChecklist } from '../openspec/change-checklist.mjs';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACTIVE_PREFIX = 'active~';
const ARCHIVED_PREFIX = 'archived~';
const CHANGE_CONTENT_FILES = ['.openspec.yaml', 'brief.md', 'proposal.md', 'design.md', 'tasks.md'];
const UI_PREVIEW_MARKER = '<!-- buildr:ui-preview -->';
const UI_PREVIEW_MAX_DEPTH = 8;
const UI_PREVIEW_MAX_CANDIDATES = 200;
const UI_PREVIEW_MAX_PAGES = 20;
const UI_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function changeError(code, message, status = 400, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function assertObject(input, code, message) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw changeError(code, message);
}

function assertSafeSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    throw changeError('change_reference_invalid', `${label} 不合法。`, 400);
  }
  return value;
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isDirectory(file) {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true && fs.lstatSync(file).isSymbolicLink() === false;
  } catch {
    return false;
  }
}

function isFile(file) {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true && fs.lstatSync(file).isSymbolicLink() === false;
  } catch {
    return false;
  }
}

function readDirectories(root) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && SAFE_SEGMENT.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function artifact(file, root, includeContent) {
  const exists = isFile(file);
  return {
    exists,
    path: relativePath(root, file),
    ...(includeContent && exists ? { content: fs.readFileSync(file, 'utf8') } : {}),
  };
}

function specs(changeRoot, workspaceRoot, includeContent) {
  const specsRoot = path.join(changeRoot, 'specs');
  return readDirectories(specsRoot).flatMap((capability) => {
    const file = path.join(specsRoot, capability, 'spec.md');
    return isFile(file) ? [{ capability, ...artifact(file, workspaceRoot, includeContent) }] : [];
  });
}

function updatedAt(changeRoot) {
  const files = CHANGE_CONTENT_FILES.map((name) => path.join(changeRoot, name));
  for (const capability of readDirectories(path.join(changeRoot, 'specs'))) {
    files.push(path.join(changeRoot, 'specs', capability, 'spec.md'));
  }
  const timestamps = files.filter(isFile).map((file) => fs.statSync(file).mtimeMs);
  return new Date(Math.max(...timestamps, fs.statSync(changeRoot).mtimeMs)).toISOString();
}

function changeName(code, proposalFile) {
  if (!isFile(proposalFile)) return code;
  const heading = fs.readFileSync(proposalFile, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || code;
}

function uiPreviewTitle(content, relative) {
  const raw = content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const title = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return title || path.basename(relative, path.extname(relative));
}

function uiPreviewId(project, change, relative) {
  return crypto.createHash('sha256').update(`${project}\0${change}\0${relative}`).digest('hex').slice(0, 32);
}

function discoverUiPreviews(changeRoot) {
  const previews = [];
  const diagnostics = [];
  let candidates = 0;
  let stopped = false;

  function diagnostic(code, message, relative = null) {
    diagnostics.push({ code, message, ...(relative ? { path: relative } : {}) });
  }

  function visit(directory, depth) {
    if (stopped) return;
    if (depth > UI_PREVIEW_MAX_DEPTH) {
      diagnostic('ui_preview_depth_limit', `UI Preview 扫描深度超过 ${UI_PREVIEW_MAX_DEPTH} 层，已跳过更深目录。`, relativePath(changeRoot, directory));
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      diagnostic('ui_preview_directory_unreadable', 'UI Preview 目录当前不可读取。', relativePath(changeRoot, directory));
      return;
    }
    for (const entry of entries) {
      if (stopped) return;
      const file = path.join(directory, entry.name);
      const relative = relativePath(changeRoot, file);
      if (entry.isSymbolicLink()) {
        if (entry.name.toLowerCase().endsWith('.html')) diagnostic('ui_preview_symlink_ignored', 'UI Preview 只读取 Change 内的普通 HTML 文件，符号链接已忽略。', relative);
        continue;
      }
      if (entry.isDirectory()) {
        visit(file, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) continue;
      candidates += 1;
      if (candidates > UI_PREVIEW_MAX_CANDIDATES) {
        diagnostic('ui_preview_candidate_limit', `Change 中的 HTML 候选超过 ${UI_PREVIEW_MAX_CANDIDATES} 个，已停止扫描。`);
        stopped = true;
        return;
      }
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        diagnostic('ui_preview_file_unreadable', 'UI Preview HTML 当前不可读取。', relative);
        continue;
      }
      if (stat.size > UI_PREVIEW_MAX_BYTES) {
        diagnostic('ui_preview_file_too_large', `UI Preview HTML 超过 ${UI_PREVIEW_MAX_BYTES} bytes，已跳过。`, relative);
        continue;
      }
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        diagnostic('ui_preview_file_unreadable', 'UI Preview HTML 当前不可读取。', relative);
        continue;
      }
      if (!content.includes(UI_PREVIEW_MARKER)) continue;
      if (!/<head\b[^>]*>/i.test(content) || !/<body\b[^>]*>/i.test(content)) {
        diagnostic('ui_preview_document_incomplete', '带标记的 UI Preview 必须是包含 head 与 body 的完整 HTML。', relative);
        continue;
      }
      if (previews.length >= UI_PREVIEW_MAX_PAGES) {
        diagnostic('ui_preview_page_limit', `可展示的 UI Preview 页面超过 ${UI_PREVIEW_MAX_PAGES} 个，其余页面已跳过。`);
        stopped = true;
        return;
      }
      previews.push({
        path: relative,
        title: uiPreviewTitle(content, relative),
        html: content,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  visit(changeRoot, 0);
  return { previews, diagnostics };
}

function projectContext(runtime, targetRoot, projectCode) {
  assertSafeSegment(projectCode, 'Project code');
  const detail = runtime.projectDetail(targetRoot, projectCode);
  return {
    project: detail.project,
    projectRoot: path.join(targetRoot, detail.project.source.path),
  };
}

function buildChangeAtProjectRoot(targetRoot, project, projectRoot, directory, lifecycle, includeContent = false) {
  const changesRoot = path.join(projectRoot, 'openspec', 'changes');
  const changeRoot = lifecycle === 'active' ? path.join(changesRoot, directory) : path.join(changesRoot, 'archive', directory);
  const identityFile = path.join(changeRoot, '.openspec.yaml');
  if (!isDirectory(changeRoot) || !isFile(identityFile)) return null;
  const code = lifecycle === 'archived'
    ? directory.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)?.[1] || directory
    : directory;
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
    progress: inspectChangeChecklist(changeRoot),
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

function buildChange(targetRoot, project, directory, lifecycle, includeContent = false) {
  return buildChangeAtProjectRoot(targetRoot, project, path.join(targetRoot, project.source.path), directory, lifecycle, includeContent);
}

function findLogicalChange(targetRoot, project, projectRoot, code, includeContent = false) {
  const changesRoot = path.join(projectRoot, 'openspec', 'changes');
  const active = buildChangeAtProjectRoot(targetRoot, project, projectRoot, code, 'active', includeContent);
  if (active) return active;
  const archivedDirectories = readDirectories(path.join(changesRoot, 'archive'))
    .filter((directory) => (directory.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)?.[1] || directory) === code)
    .sort((left, right) => right.localeCompare(left));
  for (const directory of archivedDirectories) {
    const archived = buildChangeAtProjectRoot(targetRoot, project, projectRoot, directory, 'archived', includeContent);
    if (archived) return archived;
  }
  return null;
}

function decodeRef(ref) {
  if (typeof ref !== 'string') throw changeError('change_reference_invalid', 'Change reference 不合法。');
  const lifecycle = ref.startsWith(ACTIVE_PREFIX) ? 'active' : ref.startsWith(ARCHIVED_PREFIX) ? 'archived' : null;
  if (!lifecycle) throw changeError('change_reference_invalid', 'Change reference 不合法。');
  const directory = ref.slice(lifecycle === 'active' ? ACTIVE_PREFIX.length : ARCHIVED_PREFIX.length);
  assertSafeSegment(directory, 'Change reference');
  return { lifecycle, directory };
}

export function registerChangeApplication(runtime) {
  function taskScopedProjectRoot(targetRoot, taskId, projectCode, project) {
    const current = runtime.readTaskEnvironmentCurrent(targetRoot, taskId);
    if (!['ready', 'blocked'].includes(current.status) || !current.environment) return null;
    const scopes = Array.isArray(current.environment.scopes) ? current.environment.scopes : [];
    const direct = scopes.find((scope) => scope.selector === `project:${projectCode}`);
    if (direct) {
      if (direct.kind !== 'project' || direct.project !== projectCode || direct.sourcePath !== project.source.path) return null;
      if (typeof direct.executionRoot !== 'string' || typeof direct.validationRoot !== 'string') return null;
      const candidate = path.resolve(direct.executionRoot);
      return direct.shared === true || inside(direct.validationRoot, candidate) ? candidate : null;
    }
    const workspace = scopes.find((scope) => scope.selector === 'workspace');
    if (!workspace) return null;
    if (workspace.kind !== 'workspace' || workspace.sourcePath !== '.') return null;
    if (typeof workspace.executionRoot !== 'string' || typeof workspace.validationRoot !== 'string') return null;
    const executionRoot = path.resolve(workspace.executionRoot);
    if (!inside(workspace.validationRoot, executionRoot)) return null;
    const candidate = path.resolve(executionRoot, project.source.path);
    return inside(executionRoot, candidate) && inside(workspace.validationRoot, candidate) ? candidate : null;
  }

  function resolveTaskScopedChange(targetRoot, taskId, reference, { includeContent = false, allowMissingTask = false } = {}) {
    assertObject(reference, 'change_reference_invalid', 'Task-scoped Change reference 必须是对象。');
    const allowed = new Set(['project', 'change']);
    for (const field of Object.keys(reference)) if (!allowed.has(field)) throw changeError('change_reference_field_forbidden', `Task-scoped Change reference 不支持字段：${field}。`);
    const projectCode = assertSafeSegment(reference.project, 'Project code');
    const changeCode = assertSafeSegment(reference.change, 'Change code');
    let taskAvailable = true;
    try { runtime.readTaskRecordPersistence(targetRoot, taskId); } catch (error) {
      if (!allowMissingTask || error.code !== 'task_record_not_found') throw error;
      taskAvailable = false;
    }
    const { project, projectRoot } = projectContext(runtime, targetRoot, projectCode);
    const candidateRoot = taskAvailable ? taskScopedProjectRoot(targetRoot, taskId, projectCode, project) : null;
    const candidate = candidateRoot && isDirectory(candidateRoot) ? findLogicalChange(candidateRoot, project, candidateRoot, changeCode, includeContent) : null;
    const retained = findLogicalChange(targetRoot, project, projectRoot, changeCode, includeContent);
    const working = candidate
      ? { provenance: 'task-environment-candidate', root: candidateRoot, change: candidate }
      : retained
        ? { provenance: retained.lifecycle === 'active' ? 'retained-active' : 'retained-archive', root: projectRoot, change: retained }
        : null;
    return {
      schemaVersion: 'buildr.task-scoped-change-reference/v1',
      taskId,
      reference: { project: projectCode, change: changeCode },
      availability: working ? 'available' : 'unavailable',
      workingCopy: working,
      retainedBaseline: candidate && retained ? { provenance: retained.lifecycle === 'active' ? 'retained-baseline' : 'retained-archive', root: projectRoot, change: retained } : null,
      diagnostic: working ? null : { code: 'task_change_unavailable', message: `OpenSpec Change 当前不可用：${projectCode}/${changeCode}。` },
    };
  }

  function taskScopedChangeDetail(targetRoot, taskId, projectCode, changeCode) {
    const resolution = resolveTaskScopedChange(targetRoot, taskId, { project: projectCode, change: changeCode }, { includeContent: true });
    if (resolution.availability !== 'available') throw changeError('change_not_found', resolution.diagnostic.message, 404, resolution.reference);
    return { resolution };
  }

  function taskUiPreviewEntries(targetRoot, taskId) {
    const task = runtime.inspectTaskRecord(targetRoot, taskId);
    const previews = [];
    const diagnostics = [];
    for (const reference of task.record.changes) {
      const resolution = resolveTaskScopedChange(targetRoot, taskId, reference);
      if (resolution.availability !== 'available') {
        diagnostics.push({
          code: resolution.diagnostic?.code || 'task_change_unavailable',
          message: resolution.diagnostic?.message || `OpenSpec Change 当前不可用：${reference.project}/${reference.change}。`,
          project: reference.project,
          change: reference.change,
        });
        continue;
      }
      const working = resolution.workingCopy;
      const change = working.change;
      const base = working.provenance === 'task-environment-candidate' ? working.root : targetRoot;
      const changeRoot = path.resolve(base, change.artifacts.root);
      if (!inside(working.root, changeRoot) || !isDirectory(changeRoot)) {
        diagnostics.push({
          code: 'ui_preview_change_root_unavailable',
          message: `OpenSpec Change 的 UI Preview 根当前不可证明：${reference.project}/${reference.change}。`,
          project: reference.project,
          change: reference.change,
        });
        continue;
      }
      const discovered = discoverUiPreviews(changeRoot);
      previews.push(...discovered.previews.map((preview) => ({
        id: uiPreviewId(reference.project, reference.change, preview.path),
        project: reference.project,
        change: reference.change,
        lifecycle: change.lifecycle,
        provenance: working.provenance,
        ...preview,
      })));
      diagnostics.push(...discovered.diagnostics.map((diagnosticItem) => ({
        ...diagnosticItem,
        project: reference.project,
        change: reference.change,
      })));
    }
    return {
      taskId,
      previews: previews.sort((left, right) => left.id.localeCompare(right.id)),
      diagnostics,
    };
  }

  function taskUiPreviews(targetRoot, taskId) {
    const result = taskUiPreviewEntries(targetRoot, taskId);
    return {
      ...result,
      previews: result.previews.map(({ html, ...preview }) => preview),
    };
  }

  function taskUiPreview(targetRoot, taskId, previewId) {
    if (typeof previewId !== 'string' || !/^[a-f0-9]{32}$/.test(previewId)) {
      throw changeError('ui_preview_reference_invalid', 'UI Preview reference 不合法。', 400);
    }
    const result = taskUiPreviewEntries(targetRoot, taskId);
    const preview = result.previews.find((item) => item.id === previewId);
    if (!preview) throw changeError('ui_preview_not_found', 'UI Preview 页面不存在或当前不可用。', 404);
    return preview;
  }

  function listProjectChanges(targetRoot, projectCode) {
    const { project, projectRoot } = projectContext(runtime, targetRoot, projectCode);
    const changesRoot = path.join(projectRoot, 'openspec', 'changes');
    const active = readDirectories(changesRoot)
      .filter((directory) => directory !== 'archive')
      .map((directory) => buildChange(targetRoot, project, directory, 'active'));
    const archived = readDirectories(path.join(changesRoot, 'archive'))
      .map((directory) => buildChange(targetRoot, project, directory, 'archived'));
    return {
      project: { id: project.id, code: project.code, name: project.name },
      changes: [...active, ...archived].filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  function listChanges(targetRoot) {
    const projects = runtime.listProjects(targetRoot).projects;
    const changes = projects.flatMap((project) => listProjectChanges(targetRoot, project.code).changes)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects: projects.map(({ id, code, name }) => ({ id, code, name })), changes };
  }

  function changeDetail(targetRoot, projectCode, ref) {
    const { project } = projectContext(runtime, targetRoot, projectCode);
    const { lifecycle, directory } = decodeRef(ref);
    const change = buildChange(targetRoot, project, directory, lifecycle, true);
    if (!change) throw changeError('change_not_found', `Change 不存在：${projectCode}/${ref}。`, 404);
    return { change };
  }

  function generateChangeCreatePrompt(targetRoot, input) {
    assertObject(input, 'change_prompt_invalid', 'Change prompt 请求必须是对象。');
    const allowed = new Set(['projectCode', 'goal']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw changeError('change_prompt_field_forbidden', `Change prompt 不支持字段：${field}。`);
    const projectCode = String(input.projectCode || '').trim();
    const goal = String(input.goal || '').trim();
    const { project } = projectContext(runtime, targetRoot, projectCode);
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

  function generateChangeActionPrompt(targetRoot, input) {
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

  Object.assign(runtime, {
    listProjectChanges,
    listChanges,
    changeDetail,
    generateChangeCreatePrompt,
    generateChangeActionPrompt,
    resolveTaskScopedChange,
    taskScopedChangeDetail,
    taskUiPreviews,
    taskUiPreview,
  });
  return runtime;
}
