import fs from 'node:fs';
import path from 'node:path';
import { inspectChangeChecklist } from '../openspec/change-checklist.mjs';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACTIVE_PREFIX = 'active~';
const ARCHIVED_PREFIX = 'archived~';
const CHANGE_CONTENT_FILES = ['.openspec.yaml', 'brief.md', 'proposal.md', 'design.md', 'tasks.md'];

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
    const inspected = runtime.inspectTaskEnvironment(targetRoot, taskId);
    if (inspected.status !== 'ready' || !inspected.environment) return null;
    const direct = inspected.environment.scopes.find((scope) => scope.selector === `project:${projectCode}`);
    if (direct) return direct.executionRoot;
    const workspace = inspected.environment.scopes.find((scope) => scope.selector === 'workspace');
    if (!workspace) return null;
    const candidate = path.resolve(workspace.executionRoot, project.source.path);
    return inside(workspace.validationRoot, candidate) ? candidate : null;
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
  });
  return runtime;
}
