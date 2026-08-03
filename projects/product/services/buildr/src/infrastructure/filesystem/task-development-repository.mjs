import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

import { normalizeTaskDevelopmentReceipt, taskDevelopmentError, taskDevelopmentDigest } from '../../domain/task-development/task-development.mjs';

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
    return normalizeTaskDevelopmentReceipt(document.toJS({ mapAsMap: false }), { expectedTaskId: taskId });
  } catch (error) {
    if (error.taskDevelopmentBusiness && error.code === 'task_development_task_identity_mismatch') throw error;
    throw taskDevelopmentError('task_development_receipt_invalid', `${label} 无法读取：${error.message}`, 409, {
      path: label,
      cause: error.code || 'invalid_yaml',
      ...(error.details?.field === undefined ? {} : { field: error.details.field }),
    }, '修复或恢复该 Development Receipt 后重新执行；不要绕过 Application 直接改写。');
  }
}

export function renderTaskDevelopmentReceipt(receipt) {
  const normalized = normalizeTaskDevelopmentReceipt(receipt, { expectedTaskId: receipt?.taskId });
  return YAML.stringify(normalized, { lineWidth: 0 });
}

export function registerTaskDevelopmentRepository(runtime) {
  function taskDevelopmentReceiptPath(targetRoot, taskId) {
    return path.join(runtime.taskRecordDirectory(targetRoot, taskId), 'development.yml');
  }

  function readTaskDevelopmentPersistence(targetRoot, taskId, { optional = true } = {}) {
    const io = runtime.taskDevelopmentIo || fs;
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    const directory = runtime.taskRecordDirectory(root, taskId);
    const file = taskDevelopmentReceiptPath(root, taskId);
    if (!regularDirectory(io, directory)) throw taskDevelopmentError('task_development_directory_invalid', 'Development Receipt 必须位于普通 Task 目录。', 409, { taskId, path: directory });
    if (!io.existsSync(file)) {
      if (optional) return null;
      throw taskDevelopmentError('task_development_receipt_not_found', `Development Receipt 不存在：${taskId}。`, 404, { taskId, path: file });
    }
    if (!regularFile(io, file)) throw taskDevelopmentError('task_development_path_occupied', `Development Receipt 路径已被占用：${taskId}。`, 409, { taskId, path: file }, '恢复 development.yml 为普通文件后重试；Buildr 不会覆盖其他文件类型。');
    let content;
    try { content = io.readFileSync(file, 'utf8'); } catch (error) {
      throw taskDevelopmentError('task_development_receipt_invalid', `${path.relative(root, file).split(path.sep).join('/')} 无法读取：${error.message}`, 409, { path: file, cause: error.code || 'read_failed' });
    }
    return { root, directory, file, content, receiptDigest: taskDevelopmentDigest(content), receipt: parse(content, path.relative(root, file).split(path.sep).join('/'), taskId) };
  }

  function writeTaskDevelopmentPersistence(targetRoot, receipt) {
    const io = runtime.taskDevelopmentIo || fs;
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    const normalized = normalizeTaskDevelopmentReceipt(receipt, { expectedTaskId: receipt?.taskId });
    const directory = runtime.taskRecordDirectory(root, normalized.taskId);
    const file = taskDevelopmentReceiptPath(root, normalized.taskId);
    let content;
    try {
      content = (runtime.taskDevelopmentSerialize || renderTaskDevelopmentReceipt)(normalized);
      parse(content, path.relative(root, file).split(path.sep).join('/'), normalized.taskId);
    } catch (error) {
      throw taskDevelopmentError('task_development_write_failed', `Development Receipt 写入失败（serialization）：${error.message}`, 500, { taskId: normalized.taskId, stage: 'serialization', path: file, rollback: { status: 'not-required' } });
    }
    if (!regularDirectory(io, directory)) throw taskDevelopmentError('task_development_directory_invalid', 'Development Receipt 必须位于普通 Task 目录。', 409, { taskId: normalized.taskId, path: directory });
    if (io.existsSync(file) && !regularFile(io, file)) throw taskDevelopmentError('task_development_path_occupied', `Development Receipt 路径已被占用：${normalized.taskId}。`, 409, { taskId: normalized.taskId, path: file });

    const existed = io.existsSync(file);
    const current = existed ? readTaskDevelopmentPersistence(root, normalized.taskId, { optional: false }) : null;
    const before = current?.content ?? null;
    const temporary = path.join(directory, `.development.yml.buildr-tmp-${process.pid}-${crypto.randomUUID()}`);
    let renamed = false;
    let stage = 'temporary-write';
    try {
      io.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      stage = 'temporary-validate';
      parse(io.readFileSync(temporary, 'utf8'), path.relative(root, temporary).split(path.sep).join('/'), normalized.taskId);
      stage = 'rename';
      io.renameSync(temporary, file);
      renamed = true;
      stage = 'post-read';
      const written = readTaskDevelopmentPersistence(root, normalized.taskId, { optional: false });
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
      } catch (failure) { rollbackError = failure; }
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch {}
      throw taskDevelopmentError('task_development_write_failed', `Development Receipt 写入失败（${stage}）：${error.message}`, 500, {
        taskId: normalized.taskId,
        stage,
        path: file,
        rollback: rollbackError ? { status: 'failed', message: rollbackError.message } : { status: 'restored' },
      }, rollbackError ? '停止写入并人工恢复该精确 Receipt；不要覆盖 sibling records。' : '原 current 已保留，可检查 filesystem 诊断后重试。');
    }
  }

  Object.assign(runtime, { taskDevelopmentReceiptPath, readTaskDevelopmentPersistence, writeTaskDevelopmentPersistence, renderTaskDevelopmentReceipt });
  return runtime;
}
