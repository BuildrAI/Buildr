import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ChangeQuery, ChangeModel, ChangeLifecycle, Project, PrototypePage, PrototypeDiagnostic } from '../../../openspec/module.ts';

type TaskPrototype = PrototypePage & { id: string; project: string; change: string; lifecycle: ChangeLifecycle; provenance: string };
type WorktreeRepository = { selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string };
export type OpenSpecQuery = Pick<ChangeQuery, 'findLogicalChange' | 'discoverUiPrototypes'>;
export type ProjectQuery = {
  projectDetail(root: string, code: string): { project: Project };
  resolveSourceRoot(root: string, source: Project['source']): string;
};
export type WorktreeQuery = { inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): { status: string; repositories: WorktreeRepository[] } };
type ChangeReference = { project: string; change: string };
type ChangeWorkingCopy = { provenance: string; root: string; change: ChangeModel };
type ChangeResolution = {
  schemaVersion: string;
  taskId: string;
  reference: ChangeReference;
  availability: 'available' | 'unavailable';
  workingCopy: ChangeWorkingCopy | null;
  retainedBaseline: ChangeWorkingCopy | null;
  diagnostic: { code: string; message: string } | null;
};
export type ChangeRuntime = {
  readTask(root: string, taskId: string): unknown;
  inspectTask(root: string, taskId: string): { record: { changes: ChangeReference[] } };
  [key: string]: unknown;
};
type ChangeApplicationOptions = { openSpecQuery?: OpenSpecQuery; projectQuery?: ProjectQuery; worktreeQuery?: WorktreeQuery };
type ChangeError = Error & { code: string; status: number; details?: unknown };

const SAFE_SEGMENT: RegExp = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function inside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function changeError(code: string, message: string, status = 400, details?: unknown): ChangeError {
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

function isDirectory(file: string): boolean {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true && fs.lstatSync(file).isSymbolicLink() === false;
  } catch {
    return false;
  }
}

function uiPrototypeId(project: string, change: string, relative: string): string {
  return crypto.createHash('sha256').update(`${project}\0${change}\0${relative}`).digest('hex').slice(0, 32);
}

function projectContext(projectQuery: ProjectQuery, targetRoot: string, projectCode: string): { project: Project; projectRoot: string } {
  assertSafeSegment(projectCode, 'Project code');
  const detail = projectQuery.projectDetail(targetRoot, projectCode);
  return {
    project: detail.project,
    projectRoot: projectQuery.resolveSourceRoot(targetRoot, detail.project.source),
  };
}

export function registerChangeApplication(runtime: ChangeRuntime, options: ChangeApplicationOptions = {}) {
  const { openSpecQuery, projectQuery, worktreeQuery } = options;
  if (!openSpecQuery || typeof openSpecQuery.findLogicalChange !== 'function' || typeof openSpecQuery.discoverUiPrototypes !== 'function') {
    throw changeError('change_openspec_query_missing', 'Change Application requires the OpenSpec Query capability.');
  }
  if (!projectQuery || typeof projectQuery.projectDetail !== 'function' || typeof projectQuery.resolveSourceRoot !== 'function') {
    throw changeError('change_project_query_missing', 'Change Application requires the Project Query capability.');
  }
  const requiredOpenSpecQuery = openSpecQuery;
  const requiredProjectQuery = projectQuery;
  function taskScopedProjectRoot(targetRoot: string, taskId: string, projectCode: string, project: Project): string | null {
    if (!worktreeQuery || typeof worktreeQuery.inspectGitWorktrees !== 'function') return null;
    const inspected = worktreeQuery.inspectGitWorktrees({ workspaceRoot: targetRoot, taskId });
    if (inspected.status !== 'ready') return null;
    const direct = inspected.repositories.find((repository) => repository.selector === `project:${projectCode}`);
    if (direct) {
      if (direct.entityType !== 'project' || direct.sourcePath !== project.source.path || direct.state !== 'ready') return null;
      return path.resolve(direct.checkoutPath);
    }
    const workspace = inspected.repositories.find((repository) => repository.selector === 'workspace');
    if (!workspace || workspace.entityType !== 'workspace' || workspace.sourcePath !== '.' || workspace.state !== 'ready') return null;
    const executionRoot = path.resolve(workspace.checkoutPath);
    const candidate = requiredProjectQuery.resolveSourceRoot(executionRoot, project.source);
    return inside(executionRoot, candidate) ? candidate : null;
  }

  function resolveTaskScopedChange(targetRoot: string, taskId: string, reference: unknown, options: { includeContent?: boolean; allowMissingTask?: boolean; taskRecordObserved?: boolean } = {}): ChangeResolution {
    const includeContent = options.includeContent || false;
    const allowMissingTask = options.allowMissingTask || false;
    assertObject(reference, 'change_reference_invalid', 'Task-scoped Change reference 必须是对象。');
    const allowed = new Set(['project', 'change']);
    for (const field of Object.keys(reference)) if (!allowed.has(field)) throw changeError('change_reference_field_forbidden', `Task-scoped Change reference 不支持字段：${field}。`);
    const projectCode = assertSafeSegment(reference.project, 'Project code');
    const changeCode = assertSafeSegment(reference.change, 'Change code');
    let taskAvailable = options.taskRecordObserved === true;
    if (!taskAvailable) {
      try { runtime.readTask(targetRoot, taskId); taskAvailable = true; } catch (error) {
        if (!allowMissingTask || !(error instanceof Error && 'code' in error && error.code === 'task_record_not_found')) throw error;
      }
    }
    const { project, projectRoot } = projectContext(requiredProjectQuery, targetRoot, projectCode);
    const candidateRoot = taskAvailable ? taskScopedProjectRoot(targetRoot, taskId, projectCode, project) : null;
    const candidate = candidateRoot && isDirectory(candidateRoot) ? requiredOpenSpecQuery.findLogicalChange(candidateRoot, project, candidateRoot, changeCode, includeContent) : null;
    const retained = requiredOpenSpecQuery.findLogicalChange(targetRoot, project, projectRoot, changeCode, includeContent);
    const working = candidate && candidateRoot
      ? { provenance: 'task-worktree-candidate', root: candidateRoot, change: candidate }
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

  function taskScopedChangeDetail(targetRoot: string, taskId: string, projectCode: string, changeCode: string): { resolution: ChangeResolution } {
    const resolution = resolveTaskScopedChange(targetRoot, taskId, { project: projectCode, change: changeCode }, { includeContent: true });
    if (resolution.availability !== 'available') throw changeError('change_not_found', resolution.diagnostic?.message || 'Change 不存在。', 404, resolution.reference);
    return { resolution };
  }

  function taskUiPrototypeEntries(targetRoot: string, taskId: string): { taskId: string; prototypes: TaskPrototype[]; diagnostics: PrototypeDiagnostic[] } {
    const task = runtime.inspectTask(targetRoot, taskId);
    const prototypes: TaskPrototype[] = [];
    const diagnostics: PrototypeDiagnostic[] = [];
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
      if (!working) continue;
      const change = working.change;
      const base = working.provenance === 'task-worktree-candidate' ? working.root : targetRoot;
      const changeRoot = path.resolve(base, change.artifacts.root);
      if (!inside(working.root, changeRoot) || !isDirectory(changeRoot)) {
        diagnostics.push({
          code: 'ui_prototype_change_root_unavailable',
          message: `OpenSpec Change 的 UI Prototype 根当前不可证明：${reference.project}/${reference.change}。`,
          project: reference.project,
          change: reference.change,
        });
        continue;
      }
      const discovered = requiredOpenSpecQuery.discoverUiPrototypes(changeRoot);
      prototypes.push(...discovered.prototypes.map((prototype) => ({
        id: uiPrototypeId(reference.project, reference.change, prototype.path),
        project: reference.project,
        change: reference.change,
        lifecycle: change.lifecycle,
        provenance: working.provenance,
        ...prototype,
      })));
      diagnostics.push(...discovered.diagnostics.map((diagnosticItem) => ({
        ...diagnosticItem,
        project: reference.project,
        change: reference.change,
      })));
    }
    return {
      taskId,
      prototypes: prototypes.sort((left, right) => left.id.localeCompare(right.id)),
      diagnostics,
    };
  }

  function taskUiPrototypes(targetRoot: string, taskId: string): { taskId: string; prototypes: Array<Omit<TaskPrototype, 'html'>>; diagnostics: PrototypeDiagnostic[] } {
    const result = taskUiPrototypeEntries(targetRoot, taskId);
    return {
      ...result,
      prototypes: result.prototypes.map(({ html, ...prototype }) => prototype),
    };
  }

  function taskUiPrototype(targetRoot: string, taskId: string, prototypeId: string): TaskPrototype {
    if (typeof prototypeId !== 'string' || !/^[a-f0-9]{32}$/.test(prototypeId)) {
      throw changeError('ui_prototype_reference_invalid', 'UI Prototype reference 不合法。', 400);
    }
    const result = taskUiPrototypeEntries(targetRoot, taskId);
    const prototype = result.prototypes.find((item) => item.id === prototypeId);
    if (!prototype) throw changeError('ui_prototype_not_found', 'UI Prototype 页面不存在或当前不可用。', 404);
    return prototype;
  }

  return Object.assign(runtime, {
    resolveTaskScopedChange,
    taskScopedChangeDetail,
    taskUiPrototypes,
    taskUiPrototype,
  });
}
