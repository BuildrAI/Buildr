import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { isTaskRecordId, normalizeTaskRecord, taskRecordError } from '../../domain/task-record/task-record.mjs';
import { observeGitCheckoutIdentity } from '../git/checkout-identity.mjs';

function digest(content) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function regularDirectory(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function regularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function parse(content, label, taskId) {
  try {
    const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join('; '));
    return normalizeTaskRecord(document.toJS({ mapAsMap: false }), { expectedTaskId: taskId });
  } catch (error) {
    if (error.code === 'task_record_identity_mismatch') throw error;
    throw taskRecordError('task_record_invalid', `${label} 无法读取：${error.message}`, 409, {
      path: label,
      cause: error.code || 'invalid_yaml',
      ...(error.details?.field === undefined ? {} : { field: error.details.field }),
    }, '修复或恢复原 Task Record 后重新执行。');
  }
}

export function renderTaskRecord(record) {
  const normalized = normalizeTaskRecord(record, { expectedTaskId: record?.taskId });
  return YAML.stringify(normalized, { lineWidth: 0 });
}

export function registerTaskRecordRepository(runtime) {
  function assertCanonicalTaskWorkspace(targetRoot) {
    const root = path.resolve(targetRoot);
    try {
      runtime.assertInitializedBuildrWorkspace(root);
    } catch (error) {
      throw taskRecordError('task_record_workspace_invalid', error.message, 409, { target: root }, '显式选择一个已初始化的 canonical Workspace。');
    }
    const checkout = observeGitCheckoutIdentity(root);
    if (checkout?.linkedWorktree) {
      throw taskRecordError('task_record_workspace_not_canonical', 'Task Record target 必须是 canonical Workspace，不能是 task worktree checkout。', 409, { target: root }, '显式传入 retained canonical Workspace 的路径。');
    }
    return root;
  }

  function taskRecordsRoot(targetRoot) {
    return path.join(assertCanonicalTaskWorkspace(targetRoot), '.buildr', 'tasks');
  }

  function taskRecordDirectory(targetRoot, taskId) {
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    const root = taskRecordsRoot(targetRoot);
    const directory = path.resolve(root, taskId);
    if (path.dirname(directory) !== root) throw taskRecordError('task_record_path_escape', 'Task Record path 逃逸。', 400, { taskId });
    return directory;
  }

  function taskRecordPath(targetRoot, taskId) {
    return path.join(taskRecordDirectory(targetRoot, taskId), 'task.yml');
  }

  function taskRecordPresence(targetRoot, taskId) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const directory = taskRecordDirectory(root, taskId);
    const file = path.join(directory, 'task.yml');
    if (!fs.existsSync(directory)) return { status: 'absent', directory, file };
    if (regularDirectory(directory) && regularFile(file)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        parse(content, path.relative(root, file).split(path.sep).join('/'), taskId);
        return { status: 'record', directory, file };
      } catch (error) {
        return { status: 'invalid', directory, file, error };
      }
    }
    return { status: 'occupied', directory, file };
  }

  function occupiedTaskRecordError(taskId, presence) {
    return taskRecordError('task_record_path_occupied', `Task Record 路径已被占用但不是有效记录：${taskId}。`, 409, {
      taskId,
      path: presence.file,
    }, '检查并恢复该 Task 目录中的 task.yml 后重试；Buildr 不会覆盖或清理其他模块文件。');
  }

  function readTaskRecordPersistence(targetRoot, taskId) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const directory = taskRecordDirectory(root, taskId);
    const file = path.join(directory, 'task.yml');
    const presence = taskRecordPresence(root, taskId);
    if (presence.status === 'absent') {
      throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId, path: file }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
    }
    if (presence.status === 'invalid') throw presence.error;
    if (presence.status === 'occupied') throw occupiedTaskRecordError(taskId, presence);
    const content = fs.readFileSync(file, 'utf8');
    return { root, directory, file, content, recordDigest: digest(content), record: parse(content, path.relative(root, file).split(path.sep).join('/'), taskId) };
  }

  function listTaskRecordPersistence(targetRoot) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const tasksRoot = path.join(root, '.buildr', 'tasks');
    if (!fs.existsSync(tasksRoot)) return { root, tasksRoot, records: [], diagnostics: [] };
    if (!regularDirectory(tasksRoot)) {
      throw taskRecordError('task_record_root_invalid', '.buildr/tasks 必须是普通目录。', 409, { path: '.buildr/tasks' }, '恢复 .buildr/tasks 目录后刷新。');
    }
    const records = [];
    const diagnostics = [];
    for (const entry of fs.readdirSync(tasksRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !isTaskRecordId(entry.name)) {
        diagnostics.push({ taskId: entry.name, code: 'task_record_entry_invalid', message: `任务目录不合法：${entry.name}。` });
        continue;
      }
      try {
        records.push(readTaskRecordPersistence(root, entry.name));
      } catch (error) {
        diagnostics.push({ taskId: entry.name, code: error.code || 'task_record_invalid', message: error.message, details: error.details });
      }
    }
    return { root, tasksRoot, records, diagnostics };
  }

  function writeTaskRecordPersistence(targetRoot, record) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const normalized = normalizeTaskRecord(record, { expectedTaskId: record?.taskId });
    const content = renderTaskRecord(normalized);
    parse(content, path.relative(root, taskRecordPath(root, normalized.taskId)).split(path.sep).join('/'), normalized.taskId);
    const file = taskRecordPath(root, normalized.taskId);
    const presence = taskRecordPresence(root, normalized.taskId);
    if (presence.status === 'absent') throw taskRecordError('task_record_not_found', `Task Record 不存在：${normalized.taskId}。`, 404, { taskId: normalized.taskId, path: file }, `运行 buildr task create ${normalized.taskId} 创建正式 Task Record。`);
    if (presence.status === 'invalid') throw presence.error;
    if (presence.status === 'occupied') throw occupiedTaskRecordError(normalized.taskId, presence);
    runtime.atomicWriteFile(file, content);
    return readTaskRecordPersistence(root, normalized.taskId);
  }

  function createTaskRecordPersistence(targetRoot, record) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const normalized = normalizeTaskRecord(record, { expectedTaskId: record?.taskId });
    const content = renderTaskRecord(normalized);
    const tasksRoot = path.join(root, '.buildr', 'tasks');
    const directory = taskRecordDirectory(root, normalized.taskId);
    const file = path.join(directory, 'task.yml');
    parse(content, path.relative(root, file).split(path.sep).join('/'), normalized.taskId);

    fs.mkdirSync(tasksRoot, { recursive: true });
    if (!regularDirectory(tasksRoot)) {
      throw taskRecordError('task_record_root_invalid', '.buildr/tasks 必须是普通目录。', 409, { path: '.buildr/tasks' }, '恢复 .buildr/tasks 目录后重试。');
    }
    const before = taskRecordPresence(root, normalized.taskId);
    if (before.status === 'record') throw taskRecordError('task_record_already_exists', `Task Record 已存在：${normalized.taskId}。`, 409, { taskId: normalized.taskId }, `运行 buildr task inspect ${normalized.taskId} 查看现有记录。`);
    if (before.status === 'invalid') throw before.error;
    if (before.status === 'occupied') throw occupiedTaskRecordError(normalized.taskId, before);

    try {
      fs.mkdirSync(directory);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = taskRecordPresence(root, normalized.taskId);
      if (current.status === 'record') throw taskRecordError('task_record_already_exists', `Task Record 已存在：${normalized.taskId}。`, 409, { taskId: normalized.taskId }, `运行 buildr task inspect ${normalized.taskId} 查看现有记录。`);
      if (current.status === 'invalid') throw current.error;
      throw occupiedTaskRecordError(normalized.taskId, current);
    }

    try {
      runtime.atomicWriteFile(file, content);
    } catch (error) {
      if (!fs.existsSync(file) && regularDirectory(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
      throw error;
    }
    return readTaskRecordPersistence(root, normalized.taskId);
  }

  Object.assign(runtime, {
    assertCanonicalTaskWorkspace,
    taskRecordsRoot,
    taskRecordDirectory,
    taskRecordPath,
    taskRecordPresence,
    readTaskRecordPersistence,
    listTaskRecordPersistence,
    createTaskRecordPersistence,
    writeTaskRecordPersistence,
    renderTaskRecord,
  });
  return runtime;
}
