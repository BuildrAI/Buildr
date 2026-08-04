import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

import { normalizeTaskVerificationResult, taskVerificationError } from '../../domain/task-verification/task-verification.mjs';

function digest(content) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function regularDirectory(io, file) {
  try {
    const stat = io.lstatSync(file);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function regularFile(io, file) {
  try {
    const stat = io.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function parse(content, label, taskId) {
  try {
    const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join('; '));
    return normalizeTaskVerificationResult(document.toJS({ mapAsMap: false }), { expectedTaskId: taskId });
  } catch (error) {
    if (error.taskVerificationBusiness && error.code === 'task_verification_task_identity_mismatch') throw error;
    throw taskVerificationError('task_verification_result_invalid', `${label} 无法读取：${error.message}`, 409, {
      path: label,
      cause: error.code || 'invalid_yaml',
      ...(error.details?.field === undefined ? {} : { field: error.details.field }),
    }, '修复或恢复该 Task Verification Result 后重新执行。');
  }
}

export function renderTaskVerificationResult(result) {
  const normalized = normalizeTaskVerificationResult(result, { expectedTaskId: result?.taskId });
  return YAML.stringify(normalized, { lineWidth: 0 });
}

export function registerTaskVerificationRepository(runtime) {
  function taskVerificationResultPath(targetRoot, taskId) {
    return path.join(runtime.taskRecordDirectory(targetRoot, taskId), 'verification.yml');
  }

  function readTaskVerificationResultPersistence(targetRoot, taskId, { optional = true } = {}) {
    const io = runtime.taskVerificationIo || fs;
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const directory = runtime.taskRecordDirectory(task.root, taskId);
    const file = taskVerificationResultPath(task.root, taskId);
    if (!io.existsSync(directory)) {
      if (optional) return null;
      throw taskVerificationError('task_verification_result_not_found', `Task Verification Result 不存在：${taskId}。`, 404, { taskId, path: file });
    }
    if (!regularDirectory(io, directory)) {
      throw taskVerificationError('task_verification_directory_invalid', 'Task Verification 路径必须位于普通 Task 目录。', 409, { taskId, path: directory });
    }
    if (!io.existsSync(file)) {
      if (optional) return null;
      throw taskVerificationError('task_verification_result_not_found', `Task Verification Result 不存在：${taskId}。`, 404, { taskId, path: file });
    }
    if (!regularFile(io, file)) {
      throw taskVerificationError('task_verification_path_occupied', `Task Verification Result 路径已被占用：${taskId}。`, 409, { taskId, path: file }, '恢复 verification.yml 为普通文件后重试；Buildr 不会覆盖其他文件类型。');
    }
    let content;
    try {
      content = io.readFileSync(file, 'utf8');
    } catch (error) {
      throw taskVerificationError('task_verification_result_invalid', `${path.relative(task.root, file).split(path.sep).join('/')} 无法读取：${error.message}`, 409, {
        path: path.relative(task.root, file).split(path.sep).join('/'),
        cause: error.code || 'read_failed',
      }, '恢复该 Result 的读取权限或有效 bytes 后重试。');
    }
    return {
      root: task.root,
      directory,
      file,
      content,
      resultDigest: digest(content),
      result: parse(content, path.relative(task.root, file).split(path.sep).join('/'), taskId),
    };
  }

  function writeTaskVerificationResultPersistence(targetRoot, result) {
    const io = runtime.taskVerificationIo || fs;
    const task = runtime.readTaskRecordPersistence(targetRoot, result?.taskId);
    const normalized = normalizeTaskVerificationResult(result, { expectedTaskId: task.record.taskId });
    runtime.ensureTaskRecordDirectory(task.root, normalized.taskId, io);
    const directory = runtime.taskRecordDirectory(task.root, normalized.taskId);
    const file = taskVerificationResultPath(task.root, normalized.taskId);
    let content;
    try {
      content = (runtime.taskVerificationSerialize || renderTaskVerificationResult)(normalized);
      parse(content, path.relative(task.root, file).split(path.sep).join('/'), normalized.taskId);
    } catch (error) {
      throw taskVerificationError('task_verification_write_failed', `Task Verification Result 写入失败（serialization）：${error.message}`, 500, {
        taskId: normalized.taskId,
        stage: 'serialization',
        path: file,
        rollback: { status: 'not-required' },
      }, '原 current 未变化；修复 serialization 后重试。');
    }

    if (!regularDirectory(io, directory)) {
      throw taskVerificationError('task_verification_directory_invalid', 'Task Verification 路径必须位于普通 Task 目录。', 409, { taskId: normalized.taskId, path: directory });
    }
    if (io.existsSync(file) && !regularFile(io, file)) {
      throw taskVerificationError('task_verification_path_occupied', `Task Verification Result 路径已被占用：${normalized.taskId}。`, 409, { taskId: normalized.taskId, path: file });
    }

    const existed = io.existsSync(file);
    const current = existed ? readTaskVerificationResultPersistence(task.root, normalized.taskId, { optional: false }) : null;
    const before = current?.content ?? null;
    const temporary = path.join(directory, `.verification.yml.buildr-tmp-${process.pid}-${crypto.randomUUID()}`);
    let renamed = false;
    let stage = 'temporary-write';
    try {
      io.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      stage = 'temporary-validate';
      parse(io.readFileSync(temporary, 'utf8'), path.relative(task.root, temporary).split(path.sep).join('/'), normalized.taskId);
      stage = 'rename';
      io.renameSync(temporary, file);
      renamed = true;
      stage = 'post-read';
      const written = readTaskVerificationResultPersistence(task.root, normalized.taskId, { optional: false });
      return { ...written, created: !existed };
    } catch (error) {
      let rollbackError = null;
      try {
        if (renamed) {
          if (before !== null) {
            const rollback = `${temporary}.rollback`;
            io.writeFileSync(rollback, before, { flag: 'wx', mode: 0o600 });
            io.renameSync(rollback, file);
          } else if (io.existsSync(file)) io.unlinkSync(file);
        }
      } catch (failure) {
        rollbackError = failure;
      }
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch {}
      throw taskVerificationError('task_verification_write_failed', `Task Verification Result 写入失败（${stage}）：${error.message}`, 500, {
        taskId: normalized.taskId,
        stage,
        path: file,
        rollback: rollbackError ? { status: 'failed', message: rollbackError.message } : { status: 'restored' },
      }, rollbackError ? '停止写入并人工恢复该精确 Result 文件；不要继续覆盖 sibling records。' : '原 current 已保留，可检查 filesystem 诊断后重试。');
    }
  }

  Object.assign(runtime, {
    taskVerificationResultPath,
    readTaskVerificationResultPersistence,
    writeTaskVerificationResultPersistence,
    renderTaskVerificationResult,
  });
  return runtime;
}
