import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  TASK_EXECUTION_RECORD_LIMITS,
  TASK_EXECUTION_RECORD_REDACTION_VERSION,
  normalizeTaskExecutionRecord,
  taskExecutionRecordError,
} from '../../domain/task-execution-record/task-execution-record.mjs';

const BODY_FILES = Object.freeze({
  'summary.json': 'json',
  'stdout.txt': 'text',
  'stderr.txt': 'text',
  'timeline.json': 'json',
  'diagnostics.json': 'json',
});
const MANIFEST_FILE = '.record-manifest.json';
const MANIFEST_RESERVE_BYTES = 64 * 1024;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function bodyError(code, message, status = 400, details = undefined, nextAction = undefined) {
  return taskExecutionRecordError(code, message, status, details, nextAction);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function redactText(value, workspaceRoot) {
  let result = value;
  result = result.replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/giu, '<redacted-private-key>');
  result = result.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, '$1 <redacted>');
  result = result.replace(/\b(token|password|passwd|secret|credential|api[_-]?key)\b\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1$2<redacted>');
  const root = path.resolve(workspaceRoot);
  result = result.replace(new RegExp(escapeRegExp(root), 'gu'), '<workspace>');
  result = result.replace(/(?<![A-Za-z0-9:])\/(?:[A-Za-z0-9._~!$&'()+,;=:@%-]+\/)*[A-Za-z0-9._~!$&'()+,;=:@%-]+/gu, '<redacted-path>');
  result = result.replace(/\b[A-Za-z]:\\(?:[^\s"'<>|:*?]+\\)*[^\s"'<>|:*?]*/gu, '<redacted-path>');
  return result;
}

function redactJson(value, workspaceRoot, key = '') {
  if (/(?:token|password|passwd|secret|credential|api[_-]?key)/iu.test(key)) return '<redacted>';
  if (typeof value === 'string') return redactText(value, workspaceRoot);
  if (Array.isArray(value)) return value.map((item) => redactJson(item, workspaceRoot));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactJson(item, workspaceRoot, name)]));
  }
  return value;
}

function utf8Prefix(value, maxBytes) {
  if (maxBytes <= 0) return '';
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

function truncateText(value, limit) {
  const bytes = Buffer.byteLength(value);
  if (bytes <= limit) return { content: value, truncated: false };
  const marker = '\n<buildr:truncated>\n';
  return { content: `${utf8Prefix(value, Math.max(0, limit - Buffer.byteLength(marker)))}${marker}`, truncated: true };
}

function truncateJson(value, limit, originalSizeBytes) {
  if (Buffer.byteLength(value) <= limit) return { content: value, truncated: false };
  const envelope = (preview) => `${JSON.stringify({ schemaVersion: 'buildr.task-execution-record-truncated-json/v1', truncated: true, originalSizeBytes, preview })}\n`;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(envelope(value.slice(0, middle))) <= limit) low = middle;
    else high = middle - 1;
  }
  const content = envelope(value.slice(0, low));
  if (Buffer.byteLength(content) > limit) throw bodyError('task_execution_record_json_limit_too_small', 'JSON正文剩余配额不足以保存安全截断信封。', 409, { limit });
  return { content, truncated: true };
}

function normalizeFiles(files, workspaceRoot) {
  if (!Array.isArray(files) || files.length === 0) throw bodyError('task_execution_record_body_files_invalid', 'files必须是非空数组。');
  const names = new Set();
  let remaining = TASK_EXECUTION_RECORD_LIMITS.recordBytes - MANIFEST_RESERVE_BYTES;
  let originalTotal = 0;
  let anyTruncated = false;
  const prepared = [];
  for (const [index, item] of files.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw bodyError('task_execution_record_body_file_invalid', '正文文件必须是对象。');
    for (const field of Object.keys(item)) if (!['name', 'content'].includes(field)) throw bodyError('task_execution_record_body_field_forbidden', `正文文件不支持字段：${field}。`, 400, { field });
    if (typeof item.name !== 'string' || !Object.hasOwn(BODY_FILES, item.name)) throw bodyError('task_execution_record_body_name_forbidden', `正文文件名不受支持：${String(item.name)}。`, 400, { name: item.name });
    if (names.has(item.name)) throw bodyError('task_execution_record_body_name_duplicate', `正文文件重复：${item.name}。`, 400, { name: item.name });
    names.add(item.name);
    const format = BODY_FILES[item.name];
    let original;
    let redacted;
    if (format === 'json') {
      try {
        const parsed = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
        if (parsed === undefined) throw new Error('undefined');
        original = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
        redacted = `${JSON.stringify(redactJson(parsed, workspaceRoot))}\n`;
      } catch (error) {
        throw bodyError('task_execution_record_body_json_invalid', `${item.name} 必须是有效JSON：${error.message}`, 400, { name: item.name });
      }
    } else {
      if (typeof item.content !== 'string' && !Buffer.isBuffer(item.content)) throw bodyError('task_execution_record_body_text_invalid', `${item.name} 必须是UTF-8文本。`, 400, { name: item.name });
      original = Buffer.isBuffer(item.content) ? item.content.toString('utf8') : item.content;
      redacted = redactText(original, workspaceRoot);
    }
    const originalSizeBytes = Buffer.byteLength(original);
    originalTotal += originalSizeBytes;
    const filesRemaining = files.length - index;
    const limit = Math.min(TASK_EXECUTION_RECORD_LIMITS.fileBytes, Math.floor(remaining / filesRemaining));
    const bounded = format === 'json' ? truncateJson(redacted, limit, originalSizeBytes) : truncateText(redacted, limit);
    const content = Buffer.from(bounded.content, 'utf8');
    remaining -= content.length;
    anyTruncated ||= bounded.truncated;
    prepared.push({ name: item.name, content, digest: digest(content), storedSizeBytes: content.length, originalSizeBytes, truncated: bounded.truncated });
  }
  return { files: prepared, originalSizeBytes: originalTotal, truncated: anyTruncated };
}

function assertDirectory(directory, { create = false } = {}) {
  if (create && !fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw bodyError('task_execution_record_body_path_unsafe', `正文路径必须是非symlink目录：${directory}`, 409, { directory });
}

function prepareOwnerRoot(workspaceRoot, owner) {
  const parts = ['.buildr', 'local', 'task-execution-records', owner];
  let current = path.resolve(workspaceRoot);
  assertDirectory(current);
  for (const part of parts) {
    current = path.join(current, part);
    assertDirectory(current, { create: true });
  }
  return current;
}

function syncFile(file, content) {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

function syncDirectory(directory) {
  try {
    const descriptor = fs.openSync(directory, 'r');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  } catch {}
}

function manifestBody(manifest, locator) {
  return {
    locator,
    digest: digest(Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8')),
    storedSizeBytes: manifest.storedSizeBytes,
    originalSizeBytes: manifest.originalSizeBytes,
    truncated: manifest.truncated,
  };
}

function readPublished(directory, expectedRecord) {
  assertDirectory(directory);
  const allowed = new Set([...Object.keys(BODY_FILES), MANIFEST_FILE]);
  for (const entry of fs.readdirSync(directory)) {
    if (!allowed.has(entry)) throw bodyError('task_execution_record_body_unknown_entry', `正文目录包含未知entry：${entry}。`, 409, { entry });
    const stat = fs.lstatSync(path.join(directory, entry));
    if (!stat.isFile() || stat.isSymbolicLink()) throw bodyError('task_execution_record_body_entry_unsafe', `正文entry必须是普通文件：${entry}。`, 409, { entry });
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(directory, MANIFEST_FILE), 'utf8')); }
  catch (error) { throw bodyError('task_execution_record_body_manifest_invalid', `正文manifest无效：${error.message}`, 409); }
  if (manifest.schemaVersion !== 'buildr.task-execution-record-body-manifest/v1' || manifest.recordId !== expectedRecord.recordId || manifest.taskId !== expectedRecord.taskId || manifest.owner !== expectedRecord.owner || manifest.redactionVersion !== TASK_EXECUTION_RECORD_REDACTION_VERSION) {
    throw bodyError('task_execution_record_body_manifest_mismatch', '已发布正文manifest与record不匹配。', 409, { recordId: expectedRecord.recordId });
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw bodyError('task_execution_record_body_manifest_invalid', '正文manifest files必须是非空数组。', 409);
  const manifestNames = new Set();
  for (const file of manifest.files) {
    if (!Object.hasOwn(BODY_FILES, file.name)) throw bodyError('task_execution_record_body_manifest_invalid', '正文manifest包含未知文件。', 409, { name: file.name });
    if (manifestNames.has(file.name)) throw bodyError('task_execution_record_body_manifest_invalid', '正文manifest包含重复文件。', 409, { name: file.name });
    manifestNames.add(file.name);
    const content = fs.readFileSync(path.join(directory, file.name));
    if (content.length !== file.storedSizeBytes || digest(content) !== file.digest) throw bodyError('task_execution_record_body_integrity_mismatch', `正文完整性不匹配：${file.name}。`, 409, { name: file.name });
  }
  const actualNames = fs.readdirSync(directory).filter((name) => name !== MANIFEST_FILE);
  if (actualNames.length !== manifestNames.size || actualNames.some((name) => !manifestNames.has(name))) throw bodyError('task_execution_record_body_manifest_invalid', '正文目录与manifest文件集合不一致。', 409);
  const fileBytes = manifest.files.reduce((sum, file) => sum + file.storedSizeBytes, 0);
  const manifestBytes = fs.statSync(path.join(directory, MANIFEST_FILE)).size;
  if (manifest.storedSizeBytes !== fileBytes + manifestBytes || manifest.storedSizeBytes > TASK_EXECUTION_RECORD_LIMITS.recordBytes) throw bodyError('task_execution_record_body_manifest_invalid', '正文manifest stored size不一致。', 409);
  const locator = `.buildr/local/task-execution-records/${expectedRecord.owner}/${expectedRecord.recordId}/`;
  return manifestBody(manifest, locator);
}

export function registerTaskExecutionRecordBodyStore(runtime) {
  function publishTaskExecutionRecordBody(targetRoot, recordValue, files) {
    const record = normalizeTaskExecutionRecord(recordValue);
    if (record.lifecycleStatus !== 'open') throw bodyError('task_execution_record_body_publish_not_open', '只有open record可以发布正文。', 409, { recordId: record.recordId });
    const root = path.resolve(targetRoot);
    const prepared = normalizeFiles(files, root);
    const ownerRoot = prepareOwnerRoot(root, record.owner);
    const finalDirectory = path.join(ownerRoot, record.recordId);
    if (fs.existsSync(finalDirectory)) return readPublished(finalDirectory, record);
    const staging = path.join(ownerRoot, `.staging-${record.recordId}-${crypto.randomUUID()}`);
    fs.mkdirSync(staging, { mode: 0o700 });
    try {
      for (const file of prepared.files) syncFile(path.join(staging, file.name), file.content);
      const manifestBase = {
        schemaVersion: 'buildr.task-execution-record-body-manifest/v1',
        recordId: record.recordId,
        taskId: record.taskId,
        owner: record.owner,
        redactionVersion: TASK_EXECUTION_RECORD_REDACTION_VERSION,
        originalSizeBytes: prepared.originalSizeBytes,
        truncated: prepared.truncated,
        files: prepared.files.map(({ content: _content, ...file }) => file),
      };
      let manifest = { ...manifestBase, storedSizeBytes: prepared.files.reduce((sum, file) => sum + file.storedSizeBytes, 0) };
      let manifestContent;
      for (;;) {
        manifestContent = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
        const storedSizeBytes = prepared.files.reduce((sum, file) => sum + file.storedSizeBytes, 0) + manifestContent.length;
        if (storedSizeBytes === manifest.storedSizeBytes) break;
        manifest = { ...manifest, storedSizeBytes };
      }
      if (manifest.storedSizeBytes > TASK_EXECUTION_RECORD_LIMITS.recordBytes) throw bodyError('task_execution_record_body_record_limit_exceeded', '正文目录超过16 MiB record上限。', 409);
      syncFile(path.join(staging, MANIFEST_FILE), manifestContent);
      syncDirectory(staging);
      fs.renameSync(staging, finalDirectory);
      syncDirectory(ownerRoot);
      return readPublished(finalDirectory, record);
    } finally {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  function cleanupTaskExecutionRecordBody(targetRoot, recordValue) {
    const record = normalizeTaskExecutionRecord(recordValue);
    if (record.lifecycleStatus !== 'cleanup_pending') throw bodyError('task_execution_record_body_cleanup_not_pending', '只有cleanup_pending record可以删除正文。', 409, { recordId: record.recordId });
    const root = path.resolve(targetRoot);
    const expectedLocator = `.buildr/local/task-execution-records/${record.owner}/${record.recordId}/`;
    if (record.body.locator !== expectedLocator) throw bodyError('task_execution_record_body_locator_mismatch', 'record locator不是其owned正文目录。', 409, { expectedLocator, locator: record.body.locator });
    const directory = path.join(root, ...expectedLocator.split('/').filter(Boolean));
    if (!fs.existsSync(directory)) return { removed: false, locator: expectedLocator };
    readPublished(directory, record);
    for (const entry of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, entry));
    fs.rmdirSync(directory);
    syncDirectory(path.dirname(directory));
    return { removed: true, locator: expectedLocator };
  }

  function verifyTaskExecutionRecordBody(targetRoot, recordValue) {
    const record = normalizeTaskExecutionRecord(recordValue);
    if (!record.body.locator) throw bodyError('task_execution_record_body_locator_missing', 'record没有可验证的正文locator。', 409, { recordId: record.recordId });
    const expectedLocator = `.buildr/local/task-execution-records/${record.owner}/${record.recordId}/`;
    if (record.body.locator !== expectedLocator) throw bodyError('task_execution_record_body_locator_mismatch', 'record locator不是其owned正文目录。', 409, { expectedLocator, locator: record.body.locator });
    const body = readPublished(path.join(path.resolve(targetRoot), ...expectedLocator.split('/').filter(Boolean)), record);
    if (body.digest !== record.body.digest || body.storedSizeBytes !== record.body.storedSizeBytes || body.originalSizeBytes !== record.body.originalSizeBytes || body.truncated !== record.body.truncated) throw bodyError('task_execution_record_body_metadata_mismatch', '正文manifest与SQLite metadata不一致。', 409, { recordId: record.recordId });
    return body;
  }

  Object.assign(runtime, {
    taskExecutionRecordBodyFiles: BODY_FILES,
    publishTaskExecutionRecordBody,
    verifyTaskExecutionRecordBody,
    cleanupTaskExecutionRecordBody,
  });
  return runtime;
}
