import crypto from 'node:crypto';
import { connectionFailure, inputObject } from './connection.ts';
import type { XxlJobConfiguration, XxlJobScope } from './xxl-job-types.ts';
export type * from './xxl-job-types.ts';

export const XXL_JOB_RESPONSE_BYTES = 4 * 1024 * 1024;
export const XXL_JOB_LOG_BYTES = 256 * 1024;
export const XXL_JOB_SCAN_PAGES = 50;
export const XXL_JOB_CONCURRENCY_LIMIT = '写入前再次核对当前配置；远端没有原子比较并交换（CAS），读取与写入之间仍可能发生其他入口修改。';
export function xxlJobText(value: unknown, label: string, max = 255, empty = false, multiline = false): string {
  if (typeof value !== 'string' || !value.isWellFormed() || [...value].length > max || value.includes('\0') || !multiline && /[\u0000-\u001f\u007f]/u.test(value) || !empty && !value.trim()) throw connectionFailure('xxl_job_input_invalid', `${label}无效。`);
  return value;
}
export function xxlJobInteger(value: unknown, label: string, min = 1, max = Number.MAX_SAFE_INTEGER, fallback?: number): number {
  const result = value === undefined && fallback !== undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || Number(result) < min || Number(result) > max) throw connectionFailure('xxl_job_input_invalid', `${label}必须为 ${min}—${max} 的整数。`);
  return Number(result);
}
export function xxlJobApiBase(consoleUrl: string): string { return new URL(consoleUrl).href.replace(/\/+$/u, ''); }
export function xxlJobScope(value: unknown): XxlJobScope {
  const input = inputObject(value, ['executorId', 'appName']);
  return { executorId: xxlJobInteger(input.executorId, '执行器编号'), appName: xxlJobText(input.appName, 'AppName', 64) };
}
export function xxlJobConfiguration(value: unknown, previous?: XxlJobConfiguration): XxlJobConfiguration {
  const input = inputObject(value, ['consoleUrl', 'username', 'production', 'apiVersion', 'serviceBindings']);
  const current = { production: true, apiVersion: 'auto', serviceBindings: [], ...previous, ...input };
  const website = xxlJobText(current.consoleUrl, 'XXL-JOB 网站地址', 2048);
  let url: URL;
  try { url = new URL(website); } catch { throw connectionFailure('xxl_job_url_invalid', '请填写完整 HTTP/HTTPS XXL-JOB 网站地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || /[\s\\]/u.test(website)) throw connectionFailure('xxl_job_url_invalid', 'XXL-JOB 网站地址只能使用 HTTP/HTTPS，不能包含账号密码、查询参数、锚点或空白。');
  if (typeof current.production !== 'boolean') throw connectionFailure('xxl_job_input_invalid', '请明确选择是否为生产连接。');
  if (!['auto', '2.3.0'].includes(String(current.apiVersion))) throw connectionFailure('xxl_job_input_invalid', 'XXL-JOB 适配版本只支持 auto 或 2.3.0。');
  if (!Array.isArray(current.serviceBindings) || current.serviceBindings.length > 1000) throw connectionFailure('xxl_job_input_invalid', '服务关联必须为不超过 1000 条的数组。');
  const websiteChanged = previous !== undefined && xxlJobApiBase(previous.consoleUrl) !== xxlJobApiBase(url.href);
  const serviceBindings = (websiteChanged ? [] : current.serviceBindings).map(value => {
    const binding = inputObject(value, ['serviceId', 'executorId', 'appName']);
    const serviceId = xxlJobText(binding.serviceId, '服务编号', 128);
    if (serviceId !== serviceId.trim()) throw connectionFailure('xxl_job_input_invalid', '服务编号不能包含首尾空白。');
    return { serviceId, ...xxlJobScope({ executorId: binding.executorId, appName: binding.appName }) };
  });
  if (new Set(serviceBindings.map(value => value.serviceId)).size !== serviceBindings.length) throw connectionFailure('xxl_job_input_invalid', '同一服务在该连接只能关联一个执行器。');
  return { consoleUrl: url.href, username: xxlJobText(current.username, '用户名', 128), production: current.production, apiVersion: current.apiVersion as XxlJobConfiguration['apiVersion'], serviceBindings };
}
/** Only fields that express identity, configuration and explicit scheduling state contribute. */
export function xxlJobRevision(value: object): string {
  const input = value as Record<string, unknown>;
  const keys = ['id', 'jobGroup', 'glueType', 'glueRevision', 'triggerStatus', 'jobDesc', 'author', 'alarmEmail', 'scheduleType', 'scheduleConf', 'executorHandler', 'executorParam', 'executorRouteStrategy', 'executorBlockStrategy', 'executorTimeout', 'executorFailRetryCount', 'misfireStrategy', 'childJobId'];
  const stable = Object.fromEntries(keys.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
  return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
export function xxlJobExpectedRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/u.test(value)) throw connectionFailure('xxl_job_revision_required', '请提供刚读取的调度任务配置摘要。', 409);
  return value;
}
