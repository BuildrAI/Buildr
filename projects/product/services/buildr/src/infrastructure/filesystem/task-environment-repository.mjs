import fs from 'node:fs';
import path from 'node:path';

import { normalizeTaskEnvironmentReceipt, taskEnvironmentError } from '../../domain/task-environment/task-environment.mjs';

function regularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export function registerTaskEnvironmentRepository(runtime) {
  function canonicalRoot(targetRoot) {
    return fs.realpathSync(runtime.assertCanonicalTaskWorkspace(targetRoot));
  }

  function taskEnvironmentPath(targetRoot, taskId) {
    const root = canonicalRoot(targetRoot);
    const directory = runtime.taskRecordDirectory(root, taskId);
    return path.join(directory, 'environment.json');
  }

  function readTaskEnvironmentPersistence(targetRoot, taskId, { optional = false } = {}) {
    const root = canonicalRoot(targetRoot);
    runtime.readTaskRecordPersistence(root, taskId);
    const file = taskEnvironmentPath(root, taskId);
    if (!fs.existsSync(file)) {
      if (optional) return null;
      throw taskEnvironmentError('task_environment_not_found', `Environment Receipt 不存在：${taskId}。`, 404, { taskId, path: file }, `运行 buildr task environment prepare ${taskId}。`);
    }
    if (!regularFile(file)) throw taskEnvironmentError('task_environment_path_occupied', `Environment Receipt 路径不是普通文件：${file}。`, 409, { taskId, path: file }, '恢复原 environment.json 后重试。');
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
      throw taskEnvironmentError('task_environment_invalid', `Environment Receipt 无法读取：${error.message}`, 409, { taskId, path: file }, '修复或恢复原 environment.json 后重试。');
    }
    const receipt = normalizeTaskEnvironmentReceipt(value, { expectedTaskId: taskId, expectedWorkspaceRoot: root });
    return { root, directory: path.dirname(file), file, receipt };
  }

  function writeTaskEnvironmentPersistence(targetRoot, receipt) {
    const root = canonicalRoot(targetRoot);
    const task = runtime.readTaskRecordPersistence(root, receipt?.taskId);
    const normalized = normalizeTaskEnvironmentReceipt(receipt, { expectedTaskId: task.record.taskId, expectedWorkspaceRoot: root });
    const file = taskEnvironmentPath(root, normalized.taskId);
    runtime.atomicWriteJson(file, normalized);
    return readTaskEnvironmentPersistence(root, normalized.taskId);
  }

  Object.assign(runtime, { taskEnvironmentPath, readTaskEnvironmentPersistence, writeTaskEnvironmentPersistence });
  return runtime;
}
