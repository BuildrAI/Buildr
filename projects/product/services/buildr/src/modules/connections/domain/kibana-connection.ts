import { connectionFailure, inputObject } from './connection.ts';

export const KIBANA_RESPONSE_BYTES = 4 * 1024 * 1024;
export const KIBANA_METADATA_BYTES = 8 * 1024 * 1024;
export const KIBANA_QUERY_CHANNEL = '/internal/search/es';
export type { KibanaConfiguration, KibanaWarning, KibanaDataView, KibanaField, KibanaDataViewMetadata, KibanaViewsInput, KibanaFieldsInput, KibanaFilter, KibanaQueryInput, KibanaSearchInput, KibanaAggregateInput, KibanaTimeRange, KibanaResolvedField, KibanaExecution, KibanaBaseResult, KibanaViewsResult, KibanaFieldsResult, KibanaQueryResult, KibanaLogRow, KibanaSearchResult, KibanaAggregateResult, KibanaTestResult, KibanaOperations } from './kibana-types.ts';
import type { KibanaConfiguration, KibanaQueryInput, KibanaTimeRange } from './kibana-types.ts';

export function kibanaText(value: unknown, label: string, maxBytes: number, empty = false): string {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value) > maxBytes || /[\u0000-\u001f\u007f]/u.test(value) || !empty && !value.trim()) throw connectionFailure('kibana_input_invalid', `${label}无效。`);
  return value;
}
function website(value: unknown): { consoleUrl: string; apiBase: string } {
  const text = kibanaText(value, 'Kibana 网站地址', 2048);
  let url: URL;
  try { url = new URL(text); } catch { throw connectionFailure('kibana_url_invalid', '请填写完整 HTTP/HTTPS Kibana 基址或 Discover 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || /\\/u.test(text)) throw connectionFailure('kibana_url_invalid', 'Kibana 地址只接受 HTTP/HTTPS，不能内嵌账号或密码。');
  let path = url.pathname.replace(/\/+$/u, '');
  const app = path.indexOf('/app/');
  if (app !== -1) {
    if (path.slice(app) !== '/app/discover') throw connectionFailure('kibana_url_invalid', '请填写 Kibana 基址或 /app/discover 地址。');
    path = path.slice(0, app);
  }
  if (/\/(?:api|internal|app)(?:\/|$)/u.test(path) || /\/s\/(?:[^/]+\/|\/)/u.test(path) || /\/s$/u.test(path) || /%(?:2f|5c)/iu.test(path)) throw connectionFailure('kibana_url_invalid', '无法确定 Kibana 基址，请填写完整站点或 Discover 地址。');
  url.search = ''; url.hash = ''; url.pathname = path || '/';
  const apiBase = url.href.replace(/\/$/u, '');
  return { apiBase, consoleUrl: apiBase + '/app/discover' };
}
export function kibanaApiBase(consoleUrl: string): string { return website(consoleUrl).apiBase; }
export function kibanaConfiguration(value: unknown, previous?: KibanaConfiguration): KibanaConfiguration {
  const current = { dataViewId: null, ...previous, ...inputObject(value, ['consoleUrl', 'username', 'dataViewId']) };
  const username = kibanaText(current.username, '用户名', 128);
  if (username !== username.trim() || username.includes(':')) throw connectionFailure('kibana_input_invalid', '用户名不能包含冒号或前后空白。');
  return { consoleUrl: website(current.consoleUrl).consoleUrl, username, dataViewId: current.dataViewId === null || current.dataViewId === '' ? null : kibanaText(current.dataViewId, '数据视图编号', 1024) };
}
export function kibanaDataViewId(config: KibanaConfiguration, input: unknown): string {
  const id = input === undefined ? config.dataViewId : input;
  if (id === null || id === undefined || id === '') throw connectionFailure('kibana_data_view_required', '请先选择默认数据视图（Data View），或为本次操作指定编号。', 409);
  return kibanaText(id, '数据视图编号', 1024);
}
export function kibanaInteger(value: unknown, fallback: number, max: number, minimum = 1): number {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || Number(result) < minimum || Number(result) > max) throw connectionFailure('kibana_input_invalid', '条数、偏移或正文大小超出允许范围。');
  return Number(result);
}
function absoluteTime(value: unknown): { iso: string; nanos: bigint } {
  if (typeof value !== 'string') throw connectionFailure('kibana_time_invalid', '起止时间必须使用带时区的 ISO-8601 文本。');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) throw connectionFailure('kibana_time_invalid', '起止时间必须使用带时区的 ISO-8601 文本。');
  const parts = match.slice(1, 7).map(Number), [year, month, day, hour, minute, second] = parts;
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second || Number(match[10] || 0) > 23 || Number(match[11] || 0) > 59) throw connectionFailure('kibana_time_invalid', '起止时间包含无效日期或时区。');
  const offset = (Number(match[10] || 0) * 60 + Number(match[11] || 0)) * (match[9] === '-' ? -1 : 1);
  const millis = date.getTime() - offset * 60_000, fraction = match[7] || '';
  return { iso: new Date(millis).toISOString().slice(0, 19) + (fraction ? '.' + fraction : '') + 'Z', nanos: BigInt(millis) * 1_000_000n + BigInt(fraction.padEnd(9, '0') || '0') };
}
export function kibanaTimeRange(input: KibanaQueryInput, now = new Date()): KibanaTimeRange {
  if (input.since !== undefined && (input.from !== undefined || input.to !== undefined) || (input.from === undefined) !== (input.to === undefined)) throw connectionFailure('kibana_time_invalid', '相对时间与起止时间不能混用，起止时间必须成对提供。');
  if (input.from !== undefined) {
    const from = absoluteTime(input.from), to = absoluteTime(input.to), duration = to.nanos - from.nanos;
    if (duration <= 0n || duration > 86_400_000_000_000n) throw connectionFailure('kibana_time_invalid', '时间范围必须为正且最多 24 小时。');
    return { from: from.iso, to: to.iso };
  }
  const since = input.since === undefined ? '15m' : input.since;
  const match = typeof since === 'string' && since.length <= 128 ? /^(\d+)(?:\.(\d+))?(ms|s|m|h|d)$/u.exec(since) : null;
  const multiplier = { ms: 1_000_000n, s: 1_000_000_000n, m: 60_000_000_000n, h: 3_600_000_000_000n, d: 86_400_000_000_000n };
  if (!match || !Number.isFinite(now.getTime())) throw connectionFailure('kibana_time_invalid', '相对时间必须为正数及 ms/s/m/h/d，范围最多 24 小时。');
  const divisor = 10n ** BigInt((match[2] || '').length), numerator = BigInt(match[1] + (match[2] || '')) * multiplier[match[3] as keyof typeof multiplier];
  const duration = numerator / divisor;
  if (duration <= 0n || duration > 86_400_000_000_000n || numerator % divisor) throw connectionFailure('kibana_time_invalid', '相对时间必须为正且最多 24 小时，精度不能细于纳秒。');
  const to = BigInt(now.getTime()) * 1_000_000n, from = to - duration;
  const seconds = from / 1_000_000_000n - (from < 0n && from % 1_000_000_000n ? 1n : 0n), fraction = (from - seconds * 1_000_000_000n).toString().padStart(9, '0').replace(/0{1,6}$/u, '');
  return { from: new Date(Number(seconds * 1000n)).toISOString().slice(0, 19) + '.' + fraction + 'Z', to: now.toISOString() };
}
