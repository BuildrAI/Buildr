import fs from 'node:fs';
import path from 'node:path';
import { connectionFailure } from './errors.mjs';

const protectedFields = new Set(['revision', 'expectedRevision', 'authenticationRevision', 'teamRevision', 'localRevision', 'definitionRevision', 'md5', 'expectedMd5', 'contentSha256', 'beforeSha256', 'afterSha256']);
const sensitiveKey = /^(?:password|accessToken|access_token|refresh_token|authorization|proxy-authorization|cookie|set-cookie)$/iu;

/** Keeps raw configuration in private artifacts; sanitization is an output boundary only. */
export function createOutputProtection(secrets = new Set()) {
  const text = value => {
    const patterns = [...secrets].filter(value => typeof value === 'string' && value.length).sort((a, b) => b.length - a.length);
    const expression = patterns.length ? new RegExp(patterns.map(value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|'), 'gu') : null;
    let result = expression ? value.replace(expression, '[REDACTED]') : value;
    result = result.replace(/((?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+/giu, '$1[REDACTED]');
    return result.replace(/((?:["']?(?:password|accessToken|access_token|refresh_token)["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/giu, '$1[REDACTED]');
  };
  const visit = value => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : protectedFields.has(key) ? entry : visit(entry)]));
  };
  return { secrets, text, visit };
}

/** Reserve the caller's known path before any remote action; never overwrite. */
export function openPrivateResult(filename) {
  if (filename === undefined) return null;
  let descriptor;
  const target = path.resolve(filename);
  try { descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); }
  catch { throw connectionFailure('nacos_result_file_invalid', '无法独占创建指定私有结果文件；未发起网络操作，也不会覆盖已有文件。', 409); }
  return {
    write(result) {
      try {
        const current = fs.lstatSync(target), opened = fs.fstatSync(descriptor);
        if (!current.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino) throw new Error('result replaced');
        fs.writeFileSync(descriptor, JSON.stringify(result) + '\n', { encoding: 'utf8' });
        fs.fsyncSync(descriptor);
        return { privateResultWritten: true };
      } catch {
        return { privateResultWritten: false, privateResultError: { code: 'nacos_result_file_write_failed', message: '私有结果保存未完成；普通输出保留本次操作事实。若已发布或结果未知，先调查实际配置，不要重发。' } };
      }
    },
    close() { try { fs.closeSync(descriptor); } catch {} },
  };
}
