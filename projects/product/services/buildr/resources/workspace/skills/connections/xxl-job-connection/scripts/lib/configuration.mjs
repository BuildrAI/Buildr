import crypto from 'node:crypto';
import { connectionFailure, inputObject } from './errors.mjs';
export const XXL_JOB_RESPONSE_BYTES = 4 * 1024 * 1024;
export const XXL_JOB_LOG_BYTES = 256 * 1024;
export const XXL_JOB_SCAN_PAGES = 50;
export const XXL_JOB_CONCURRENCY_LIMIT = '写入前再次核对当前配置；远端没有原子比较并交换（CAS），读取与写入之间仍可能发生其他入口修改。';
export function xxlJobText(value         , label        , max = 255, empty = false, multiline = false)         {
  if (typeof value !== 'string' || !value.isWellFormed() || [...value].length > max || value.includes('\0') || !multiline && /[\u0000-\u001f\u007f]/u.test(value) || !empty && !value.trim()) throw connectionFailure('xxl_job_input_invalid', `${label}无效。`);
  return value;
}
export function xxlJobInteger(value         , label        , min = 1, max = Number.MAX_SAFE_INTEGER, fallback         )         {
  const result = value === undefined && fallback !== undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || Number(result) < min || Number(result) > max) throw connectionFailure('xxl_job_input_invalid', `${label}必须为 ${min}—${max} 的整数。`);
  return Number(result);
}
export function xxlJobApiBase(consoleUrl        )         { return new URL(consoleUrl).href.replace(/\/+$/u, ''); }
export function xxlJobScope(value         )              {
  const input = inputObject(value, ['executorId', 'appName']);
  return { executorId: xxlJobInteger(input.executorId, '执行器编号'), appName: xxlJobText(input.appName, 'AppName', 64) };
}
export function xxlJobConfiguration(value) {
  const input = inputObject(value, ['consoleUrl', 'username', 'production', 'apiVersion']);
  const current = { production: true, apiVersion: 'auto', ...input };
  const website = xxlJobText(current.consoleUrl, 'XXL-JOB 网站地址', 2048);
  let url;
  try { url = new URL(website); } catch { throw connectionFailure('xxl_job_url_invalid', '请填写完整 HTTP/HTTPS XXL-JOB 网站地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || /[\s\\]/u.test(website)) throw connectionFailure('xxl_job_url_invalid', 'XXL-JOB 网站地址只能使用 HTTP/HTTPS，不能包含账号密码、查询参数、锚点或空白。');
  if (typeof current.production !== 'boolean') throw connectionFailure('xxl_job_input_invalid', '请明确选择是否为生产连接。');
  if (!['auto', '2.3.0'].includes(current.apiVersion)) throw connectionFailure('xxl_job_input_invalid', 'XXL-JOB 适配版本只支持 auto 或 2.3.0。');
  const username = xxlJobText(current.username, '用户名', 128);
  if (username !== username.trim()) throw connectionFailure('xxl_job_input_invalid', '用户名不能包含首尾空白。');
  return { consoleUrl: url.href, username, production: current.production, apiVersion: current.apiVersion };
}
/** Only fields that express identity, configuration and explicit scheduling state contribute. */
export function xxlJobRevision(value        )         {
  const input = value                           ;
  const keys = ['id', 'jobGroup', 'glueType', 'glueRevision', 'triggerStatus', 'jobDesc', 'author', 'alarmEmail', 'scheduleType', 'scheduleConf', 'executorHandler', 'executorParam', 'executorRouteStrategy', 'executorBlockStrategy', 'executorTimeout', 'executorFailRetryCount', 'misfireStrategy', 'childJobId'];
  const stable = Object.fromEntries(keys.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
  return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
export function xxlJobExpectedRevision(value         )         {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/u.test(value)) throw connectionFailure('xxl_job_revision_required', '请提供刚读取的调度任务配置摘要。', 409);
  return value;
}
