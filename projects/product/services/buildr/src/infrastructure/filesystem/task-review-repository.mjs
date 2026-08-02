import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

import { assertTaskReviewType, normalizeTaskReviewResult, taskReviewError } from '../../domain/task-review/task-review.mjs';

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

function parse(content, label, taskId, reviewType) {
  try {
    const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join('; '));
    return normalizeTaskReviewResult(document.toJS({ mapAsMap: false }), { expectedTaskId: taskId, expectedReviewType: reviewType });
  } catch (error) {
    if (error.taskReviewBusiness && ['task_review_task_identity_mismatch', 'task_review_type_identity_mismatch'].includes(error.code)) throw error;
    throw taskReviewError('task_review_result_invalid', `${label} 无法读取：${error.message}`, 409, {
      path: label,
      cause: error.code || 'invalid_yaml',
      ...(error.details?.field === undefined ? {} : { field: error.details.field }),
    }, '修复或恢复该 Task Review Result 后重新执行。');
  }
}

export function renderTaskReviewResult(result) {
  const normalized = normalizeTaskReviewResult(result, { expectedTaskId: result?.taskId, expectedReviewType: result?.reviewType });
  return YAML.stringify(normalized, { lineWidth: 0 });
}

export function registerTaskReviewRepository(runtime) {
  function taskReviewDirectory(targetRoot, taskId) {
    return path.join(runtime.taskRecordDirectory(targetRoot, taskId), 'reviews');
  }

  function taskReviewResultPath(targetRoot, taskId, reviewType) {
    assertTaskReviewType(reviewType);
    return path.join(taskReviewDirectory(targetRoot, taskId), `${reviewType}.yml`);
  }

  function readTaskReviewResultPersistence(targetRoot, taskId, reviewType, { optional = true } = {}) {
    const io = runtime.taskReviewIo || fs;
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const directory = taskReviewDirectory(task.root, taskId);
    const file = taskReviewResultPath(task.root, taskId, reviewType);
    if (!io.existsSync(directory)) {
      if (optional) return null;
      throw taskReviewError('task_review_result_not_found', `Task Review Result 不存在：${taskId}/${reviewType}。`, 404, { taskId, reviewType, path: file });
    }
    if (!regularDirectory(io, directory)) {
      throw taskReviewError('task_review_directory_invalid', 'Task Review reviews 路径必须是普通目录。', 409, { taskId, path: directory }, '恢复 reviews 目录后重试；Buildr 不会覆盖 symlink 或其他占用。');
    }
    if (!io.existsSync(file)) {
      if (optional) return null;
      throw taskReviewError('task_review_result_not_found', `Task Review Result 不存在：${taskId}/${reviewType}。`, 404, { taskId, reviewType, path: file });
    }
    if (!regularFile(io, file)) {
      throw taskReviewError('task_review_path_occupied', `Task Review Result 路径已被占用：${taskId}/${reviewType}。`, 409, { taskId, reviewType, path: file }, '恢复对应 Result 普通文件后重试；Buildr 不会覆盖其他文件类型。');
    }
    let content;
    try {
      content = io.readFileSync(file, 'utf8');
    } catch (error) {
      throw taskReviewError('task_review_result_invalid', `${path.relative(task.root, file).split(path.sep).join('/')} 无法读取：${error.message}`, 409, {
        path: path.relative(task.root, file).split(path.sep).join('/'),
        cause: error.code || 'read_failed',
      }, '恢复该 Task Review Result 的读取权限或有效 bytes 后重试。');
    }
    return {
      root: task.root,
      directory,
      file,
      content,
      resultDigest: digest(content),
      result: parse(content, path.relative(task.root, file).split(path.sep).join('/'), taskId, reviewType),
    };
  }

  function writeTaskReviewResultPersistence(targetRoot, result) {
    const io = runtime.taskReviewIo || fs;
    const task = runtime.readTaskRecordPersistence(targetRoot, result?.taskId);
    const normalized = normalizeTaskReviewResult(result, { expectedTaskId: task.record.taskId, expectedReviewType: result?.reviewType });
    const directory = taskReviewDirectory(task.root, normalized.taskId);
    const file = taskReviewResultPath(task.root, normalized.taskId, normalized.reviewType);
    let content;
    try {
      content = (runtime.taskReviewSerialize || renderTaskReviewResult)(normalized);
      parse(content, path.relative(task.root, file).split(path.sep).join('/'), normalized.taskId, normalized.reviewType);
    } catch (error) {
      throw taskReviewError('task_review_write_failed', `Task Review Result 写入失败（serialization）：${error.message}`, 500, {
        taskId: normalized.taskId,
        reviewType: normalized.reviewType,
        stage: 'serialization',
        path: file,
        rollback: { status: 'not-required' },
      }, '原 current 未变化；修复 serialization 后重试。');
    }

    let createdDirectory = false;
    try {
      if (!io.existsSync(directory)) {
        io.mkdirSync(directory);
        createdDirectory = true;
      } else if (!regularDirectory(io, directory)) {
        throw taskReviewError('task_review_directory_invalid', 'Task Review reviews 路径必须是普通目录。', 409, { taskId: normalized.taskId, path: directory });
      }
    } catch (error) {
      if (error.taskReviewBusiness) throw error;
      throw taskReviewError('task_review_write_failed', `Task Review Result 写入失败（directory-prepare）：${error.message}`, 500, {
        taskId: normalized.taskId,
        reviewType: normalized.reviewType,
        stage: 'directory-prepare',
        path: file,
        rollback: { status: 'not-required' },
      }, '原 current 未变化；修复 reviews 目录后重试。');
    }
    if (io.existsSync(file) && !regularFile(io, file)) {
      throw taskReviewError('task_review_path_occupied', `Task Review Result 路径已被占用：${normalized.taskId}/${normalized.reviewType}。`, 409, { taskId: normalized.taskId, reviewType: normalized.reviewType, path: file });
    }

    const existed = io.existsSync(file);
    const current = existed ? readTaskReviewResultPersistence(task.root, normalized.taskId, normalized.reviewType, { optional: false }) : null;
    const before = current?.content ?? null;
    const temporary = path.join(directory, `.${normalized.reviewType}.yml.buildr-tmp-${process.pid}-${crypto.randomUUID()}`);
    let renamed = false;
    let stage = 'temporary-write';
    try {
      io.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      stage = 'temporary-validate';
      parse(io.readFileSync(temporary, 'utf8'), path.relative(task.root, temporary).split(path.sep).join('/'), normalized.taskId, normalized.reviewType);
      stage = 'rename';
      io.renameSync(temporary, file);
      renamed = true;
      stage = 'post-read';
      const written = readTaskReviewResultPersistence(task.root, normalized.taskId, normalized.reviewType, { optional: false });
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
      try { if (createdDirectory && regularDirectory(io, directory) && io.readdirSync(directory).length === 0) io.rmdirSync(directory); } catch {}
      throw taskReviewError('task_review_write_failed', `Task Review Result 写入失败（${stage}）：${error.message}`, 500, {
        taskId: normalized.taskId,
        reviewType: normalized.reviewType,
        stage,
        path: file,
        rollback: rollbackError ? { status: 'failed', message: rollbackError.message } : { status: 'restored' },
      }, rollbackError ? '停止写入并人工恢复该精确 Result 文件；不要继续覆盖 sibling records。' : '原 current 已保留，可检查 filesystem 诊断后重试。');
    }
  }

  Object.assign(runtime, {
    taskReviewDirectory,
    taskReviewResultPath,
    readTaskReviewResultPersistence,
    writeTaskReviewResultPersistence,
    renderTaskReviewResult,
  });
  return runtime;
}
