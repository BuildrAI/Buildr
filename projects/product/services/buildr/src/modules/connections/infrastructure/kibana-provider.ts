import { connectionFailure, inputObject, passwordInput, type ConnectionProvider } from '../domain/connection.ts';
import { KIBANA_METADATA_BYTES, KIBANA_QUERY_CHANNEL, KIBANA_RESPONSE_BYTES, kibanaApiBase, kibanaConfiguration, kibanaDataViewId, kibanaInteger, kibanaText, type KibanaAggregateInput, type KibanaAggregateResult, type KibanaConfiguration, type KibanaDataView, type KibanaDataViewMetadata, type KibanaExecution, type KibanaFieldsInput, type KibanaField, type KibanaLogRow, type KibanaOperations, type KibanaQueryResult, type KibanaSearchInput, type KibanaSearchResult, type KibanaTestResult, type KibanaViewsInput, type KibanaWarning } from '../domain/kibana-connection.ts';
import { buildKibanaAggregateQuery, buildKibanaSearchQuery, validateKibanaQueryInput } from './kibana-query.ts';

export type KibanaHttpOptions = { fetch?: typeof globalThis.fetch; timeoutMs?: number; now?: () => Date; maxMetadataBytes?: number; maxResponseBytes?: number };
type KibanaProvider = ConnectionProvider & { kibana: KibanaOperations };
const sensitiveKey = /(?:^|[.\[\]_-])(?:authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|password|access[-_]?token|refresh[-_]?token|api[-_]?key)$/iu;
const sensitiveText = /((?:proxy[-_]?authorization|authorization|set[-_]?cookie|cookie)\s*:\s*)[^\r\n]+/giu;
const secretPair = /((?:["']?(?:password|access_token|refresh_token|api_key|authorization|proxy[-_]?authorization|cookie|set[-_]?cookie)["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/giu;
function redactor(credentials: Record<string, unknown>, config: Record<string, unknown>) {
  const password = typeof credentials.password === 'string' ? credentials.password : '', username = typeof config.username === 'string' ? config.username : '';
  const auth = Buffer.from(username + ':' + password, 'utf8').toString('base64');
  const secrets = [password, 'Basic ' + auth, auth].filter(Boolean).sort((a, b) => b.length - a.length);
  let count = 0;
  const text = (value: string): string => {
    let result = value;
    for (const secret of secrets) result = result.replaceAll(secret, () => { count++; return '[REDACTED]'; });
    result = result.replace(sensitiveText, (match, prefix: string) => { if (match.slice(prefix.length) === '[REDACTED]') return match; count++; return prefix + '[REDACTED]'; });
    result = result.replace(secretPair, (match, prefix: string) => { if (['[REDACTED]', '"[REDACTED]"', "'[REDACTED]'"].includes(match.slice(prefix.length))) return match; count++; return prefix + '"[REDACTED]"'; });
    return result;
  };
  const visit = (value: unknown, externalKeys = false): unknown => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(item => visit(item, externalKeys));
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        const safeKey = externalKeys ? text(key) : key;
        if (sensitiveKey.test(key)) { if (item !== '[REDACTED]') count++; result[safeKey] = '[REDACTED]'; }
        else result[safeKey] = visit(item, externalKeys || key === 'fields');
      }
      return result;
    }
    return value;
  };
  return { text, visit, count: () => count };
}
/** Every application entry can apply the same secret and final JSON boundary. */
export function sanitizeKibanaOutput<T>(value: T, credentials: Record<string, unknown>, config: Record<string, unknown>): T {
  const scrub = redactor(credentials, config), result = scrub.visit(value) as T;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const root = result as Record<string, unknown>;
    const rows = Array.isArray(root.rows) ? root.rows as KibanaLogRow[] : [];
    const originalRows = (value as Record<string, unknown>).rows as KibanaLogRow[] | undefined;
    rows.forEach((row, index) => {
      const original = originalRows?.[index];
      if (original && (row._index !== original._index || row._id !== original._id)) row.documentIdentityAvailable = false;
    });
    if (scrub.count()) {
      root.redactionCount = Number(root.redactionCount || 0) + scrub.count();
      if (Array.isArray(root.warnings) && !root.warnings.some((warning: KibanaWarning) => warning.code === 'sensitive_values_redacted')) root.warnings.push({ code: 'sensitive_values_redacted', message: '已遮蔽已定义敏感键、文本请求头及当前认证值；此处理不能识别任意业务秘密。' });
    }
  }
  const json = JSON.stringify(result);
  if (!json || !json.isWellFormed() || Buffer.byteLength(json) > KIBANA_RESPONSE_BYTES) throw connectionFailure('kibana_output_too_large', 'Kibana 最终输出超过 4 MiB，请减少条数、字段或正文大小。', 413);
  return result;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 返回结构不受支持，未解释成成功空结果。', 502);
  return value as Record<string, unknown>;
}
function remoteText(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value) > max || /[\u0000-\u001f\u007f]/u.test(value)) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 返回的身份或元数据不受支持。', 502);
  return value;
}
function natural(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 返回的执行计数不受支持。', 502);
  return Number(value);
}
function summary(value: Record<string, unknown>): KibanaDataView {
  const id = remoteText(value.id, 1024), title = remoteText(value.title);
  if (!id || !title) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 返回的数据视图（Data View）身份不完整。', 502);
  return { id, name: value.name === undefined ? title : remoteText(value.name), title, timeFieldName: value.timeFieldName === undefined || value.timeFieldName === null ? null : remoteText(value.timeFieldName, 1024), ...(value.type ? { type: remoteText(value.type, 128) } : {}) };
}
class KibanaClient {
  readonly config: KibanaConfiguration;
  readonly target: string;
  readonly signal: AbortSignal;
  readonly now: Date;
  readonly warnings: KibanaWarning[];
  private readonly fetcher: typeof globalThis.fetch;
  private readonly auth: string;
  private readonly options: KibanaHttpOptions;
  constructor(config: Record<string, unknown>, credentials: Record<string, unknown>, options: KibanaHttpOptions) {
    this.config = kibanaConfiguration(config); this.target = kibanaApiBase(this.config.consoleUrl); this.options = options;
    if (!Object.hasOwn(credentials, 'password')) throw connectionFailure('connection_credentials_missing', '该 Kibana 连接尚未在本机配置认证信息。', 409);
    this.auth = 'Basic ' + Buffer.from(this.config.username + ':' + passwordInput(credentials.password), 'utf8').toString('base64');
    this.fetcher = options.fetch || globalThis.fetch; this.signal = AbortSignal.timeout(options.timeoutMs ?? 15_000); this.now = options.now?.() || new Date();
    this.warnings = this.target.startsWith('http:') ? [{ code: 'http_plaintext', message: '当前 HTTP 连接以明文传输认证及日志，建议使用 HTTPS 与只读账号。' }] : [];
  }
  async request(route: string, body?: Record<string, unknown>, metadata = true, signal = this.signal): Promise<unknown> {
    try {
      signal.throwIfAborted();
      const request = this.fetcher(this.target + route, { method: body ? 'POST' : 'GET', headers: { Accept: 'application/json', Authorization: this.auth, ...(body ? { 'Content-Type': 'application/json', 'kbn-xsrf': 'true' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal });
      const response = await abortable(request, signal);
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw connectionFailure('kibana_redirect_rejected', 'Kibana 请求发生重定向，已阻止认证信息转发，请配置实际目标地址。', 502); }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw connectionFailure('kibana_access_denied', 'Kibana 认证或账号权限不足。', 403);
        if (response.status === 404) throw connectionFailure(route.startsWith('/api/data_views/data_view/') ? 'kibana_data_view_missing' : 'kibana_route_unsupported', route.startsWith('/api/data_views/data_view/') ? '指定数据视图（Data View）不存在或当前账号不可见。' : '当前 Kibana 未提供受支持的查询接口，请核对目标及兼容范围。', 404);
        if (response.status === 429) throw connectionFailure('kibana_rate_limited', 'Kibana 已限流，未自动重发请求。', 429);
        throw connectionFailure('kibana_request_failed', 'Kibana 拒绝本次只读请求，请检查目标、账号权限及接口兼容性。', 502);
      }
      const maximum = metadata ? this.options.maxMetadataBytes ?? KIBANA_METADATA_BYTES : this.options.maxResponseBytes ?? KIBANA_RESPONSE_BYTES;
      if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw connectionFailure('kibana_response_too_large', 'Kibana 响应超过字节限制，请缩小查询范围。', 413); }
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const chunk = await abortable(reader.read(), signal);
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > maximum) { await reader.cancel(); throw connectionFailure('kibana_response_too_large', 'Kibana 响应超过字节限制，请缩小查询范围。', 413); }
            chunks.push(chunk.value);
          }
        } catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
      }
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { throw connectionFailure('kibana_protocol_unsupported', 'Kibana 响应不是受支持的 UTF-8 JSON，未解释成成功空结果。', 502); }
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && code.startsWith('kibana_')) throw error;
      throw connectionFailure(signal.aborted ? 'kibana_timeout' : 'kibana_unreachable', signal.aborted ? 'Kibana 动作超时，未自动重发请求。' : '无法连接 Kibana，请检查地址、证书与网络；未自动重发请求。', signal.aborted ? 504 : 502);
    }
  }
  async version(): Promise<string | null> {
    try {
      const value = object(await this.request('/api/status', undefined, true, AbortSignal.any([this.signal, AbortSignal.timeout(Math.min(this.options.timeoutMs ?? 15_000, 2000))])));
      const version = remoteText(object(value.version).number, 100);
      if (version) return version;
    } catch { /* Optional diagnostic never cancels the shared query action. */ }
    this.warnings.push({ code: 'server_version_unknown', message: '当前服务器版本无法核验；兼容性依据本次实际通道及响应结构。' });
    return null;
  }
  async dataView(id: string): Promise<KibanaDataViewMetadata> {
    const value = object(object(await this.request('/api/data_views/data_view/' + encodeURIComponent(id))).data_view), identity = summary(value);
    if (identity.id !== id) throw connectionFailure('kibana_data_view_mismatch', 'Kibana 返回的数据视图（Data View）编号与本次请求不一致。', 502);
    let fields = value.fields;
    if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch { throw connectionFailure('kibana_protocol_unsupported', 'Kibana 字段目录不能核验。', 502); } }
    if (!Array.isArray(fields)) {
      const keyed = object(fields);
      fields = Object.entries(keyed).map(([name, item]) => {
        const field = object(item);
        if (field.name !== name) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 字段目录的键与字段名不一致。', 502);
        return field;
      });
    }
    const runtime = value.runtimeFieldMap === undefined ? {} : object(value.runtimeFieldMap);
    const parsedFields: KibanaField[] = (fields as unknown[]).map(item => {
      const field = object(item), name = remoteText(field.name, 1024), esTypes = field.esTypes === undefined ? [] : field.esTypes;
      if (!Array.isArray(esTypes) || esTypes.some(type => typeof type !== 'string') || typeof field.searchable !== 'boolean' || typeof field.aggregatable !== 'boolean') throw connectionFailure('kibana_protocol_unsupported', 'Kibana 字段能力不能核验。', 502);
      const subtype = field.subType ? object(field.subType) : {}, nested = subtype.nested, multi = subtype.multi, reasons: string[] = [];
      if (nested && object(nested).path) reasons.push('nested_field');
      if (field.scripted === true) reasons.push('scripted_field');
      if (Object.hasOwn(runtime, name) || field.runtimeField !== undefined || field.isRuntimeField === true) reasons.push('runtime_field');
      if (!esTypes.length) reasons.push('mapping_types_unavailable');
      if (esTypes.some(type => ['object', 'nested', '_source'].includes(type))) reasons.push('non_leaf_field');
      return { name, type: typeof field.type === 'string' ? remoteText(field.type, 128) : 'unknown', esTypes: esTypes as string[], searchable: field.searchable, aggregatable: field.aggregatable, readFromDocValues: field.readFromDocValues === true, unsupportedReasons: reasons, ...(multi ? { sourceField: remoteText(object(multi).parent, 1024) } : {}) };
    });
    if (new Set(parsedFields.map(field => field.name)).size !== parsedFields.length) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 字段目录包含重复身份。', 502);
    if (value.sourceFilters !== undefined && !Array.isArray(value.sourceFilters)) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 展示排除不能核验。', 502);
    const sourceFilters = (value.sourceFilters as unknown[] | undefined || []).map(item => remoteText(typeof item === 'string' ? item : object(item).value, 1024));
    return { ...identity, fields: parsedFields, sourceFilters, observedAt: this.now.toISOString() };
  }
  async query(view: KibanaDataViewMetadata, body: Record<string, unknown>) {
    const wrapper = object(await this.request(KIBANA_QUERY_CHANNEL, { params: { index: view.title, track_total_hits: false, timeout: '5s', body } }, false));
    const raw = object(wrapper.rawResponse), shards = object(raw._shards), hits = object(raw.hits);
    if (typeof wrapper.isRunning !== 'boolean' || typeof wrapper.isPartial !== 'boolean' || typeof raw.timed_out !== 'boolean' || !Array.isArray(hits.hits)) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 搜索响应缺少可核验执行状态或命中结构。', 502);
    const execution: KibanaExecution = { isRunning: wrapper.isRunning, isPartial: wrapper.isPartial, timedOut: raw.timed_out, shards: { total: natural(shards.total), successful: natural(shards.successful), skipped: natural(shards.skipped), failed: natural(shards.failed) } };
    if (execution.shards.successful + execution.shards.failed > execution.shards.total || execution.shards.skipped > execution.shards.successful) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 分片执行计数不一致。', 502);
    return { raw, hits: hits.hits as unknown[], execution };
  }
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(signal.reason); signal.addEventListener('abort', rejectAbort, { once: true }); });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener('abort', rejectAbort); }
}
function identity(view: KibanaDataViewMetadata): KibanaDataView { const { fields: _fields, sourceFilters: _sourceFilters, observedAt: _observedAt, ...result } = view; return result; }
function page(input: KibanaViewsInput, fields = false) {
  inputObject(input, ['name', 'offset', 'limit', ...(fields ? ['dataViewId'] : [])]);
  return { name: input.name === undefined ? '' : kibanaText(input.name, '名称过滤', 1024, true), offset: kibanaInteger(input.offset, 0, Number.MAX_SAFE_INTEGER, 0), limit: kibanaInteger(input.limit, 100, 500) };
}
function completion(execution: KibanaExecution, warnings: KibanaWarning[]) {
  const reasons: string[] = [];
  if (execution.isRunning) reasons.push('search_running');
  if (execution.isPartial) reasons.push('search_partial');
  if (execution.timedOut) reasons.push('search_timed_out');
  if (execution.shards.failed) reasons.push('shards_failed');
  if (execution.shards.successful + execution.shards.failed < execution.shards.total) reasons.push('shards_incomplete');
  if (!execution.shards.total) reasons.push('no_target_shards');
  if (warnings.some(item => item.code === 'field_mapping_mixed')) reasons.push('field_mapping_mixed');
  reasons.forEach(code => warnings.push({ code, message: code === 'no_target_shards' ? '本次没有目标分片，不能证明日志读取权限或目标覆盖。' : '本次结果存在执行或字段覆盖限制，不能视为完整结果。' }));
  return reasons;
}
function queryResult(client: KibanaClient, view: KibanaDataViewMetadata, version: string | null, query: ReturnType<typeof buildKibanaSearchQuery> | ReturnType<typeof buildKibanaAggregateQuery>, execution: KibanaExecution): KibanaQueryResult {
  const warnings = [...client.warnings, ...query.warnings], incompleteReasons = completion(execution, warnings);
  return { target: client.target, serverVersion: version, queryChannel: KIBANA_QUERY_CHANNEL, dataView: identity(view), observedAt: view.observedAt, timeRange: query.timeRange, conditions: query.conditions, resolvedFields: query.resolvedFields, execution, warnings, incomplete: !!incompleteReasons.length, incompleteReasons };
}
function truncate(value: string, maximum: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(value) <= maximum) return { text: value, truncated: false };
  let bytes = 0, result = '';
  for (const character of value) { const length = Buffer.byteLength(character); if (bytes + length > maximum) break; result += character; bytes += length; }
  return { text: result, truncated: true };
}
function row(value: unknown, query: ReturnType<typeof buildKibanaSearchQuery>, credentials: Record<string, unknown>, config: Record<string, unknown>): KibanaLogRow {
  const hit = object(value), index = remoteText(hit._index, KIBANA_RESPONSE_BYTES), id = remoteText(hit._id, KIBANA_RESPONSE_BYTES);
  if (!index || !id) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 命中文档缺少可复查身份。', 502);
  const mapped = hit.fields === undefined ? {} : object(hit.fields), fields: Record<string, unknown[]> = {}, missingFields: string[] = [];
  for (const field of query.displayFields) {
    if (mapped[field] === undefined) missingFields.push(field);
    else if (!Array.isArray(mapped[field])) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 映射字段取值不是受支持数组。', 502);
    else fields[field] = mapped[field] as unknown[];
  }
  const scrub = redactor(credentials, config);
  let message: string | null = null, messageTruncated = false, messageUnavailableReason = query.messageUnavailableReason;
  if (query.sourceMessage) {
    const source = hit._source === undefined ? {} : object(hit._source);
    if (source.message === undefined) messageUnavailableReason = 'document_field_missing';
    else if (typeof source.message !== 'string' || !source.message.isWellFormed()) messageUnavailableReason = 'document_message_not_text';
    else { const truncated = truncate(scrub.text(source.message), query.messageBytes); message = truncated.text; messageTruncated = truncated.truncated; }
  }
  if (hit._ignored !== undefined && (!Array.isArray(hit._ignored) || hit._ignored.some(item => typeof item !== 'string'))) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 忽略字段摘要不受支持。', 502);
  const ignoredValues = hit.ignored_field_values === undefined ? [] : Object.keys(object(hit.ignored_field_values));
  const timestamp = query.readFields.includes(query.time.name) ? mapped[query.time.name] : undefined;
  if (timestamp !== undefined && (!Array.isArray(timestamp) || timestamp.some(item => typeof item !== 'string'))) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 时间字段未返回日期文本数组。', 502);
  const original: KibanaLogRow = { _index: index, _id: id, documentIdentityAvailable: true, timestamp: timestamp as unknown[] || null, fields, missingFields, ignoredFields: [...new Set([...(hit._ignored as string[] || []), ...ignoredValues])], message, ...(messageUnavailableReason ? { messageUnavailableReason } : {}), messageTruncated, redactionCount: 0 };
  const result = scrub.visit(original) as KibanaLogRow;
  for (const [name, values] of Object.entries(result.fields)) if (name === 'message' || name.startsWith('message.')) result.fields[name] = values.map(value => {
    if (typeof value !== 'string') return value;
    const truncated = truncate(value, query.messageBytes); if (truncated.truncated) result.messageTruncated = true; return truncated.text;
  });
  result.redactionCount = scrub.count(); result.documentIdentityAvailable = result._index === index && result._id === id;
  return result;
}
async function safe<T>(config: Record<string, unknown>, credentials: Record<string, unknown>, action: () => Promise<T>): Promise<T> {
  try { return sanitizeKibanaOutput(await action(), credentials, config); }
  catch (error) {
    const current = error as { code?: string; status?: number; message?: string };
    if (typeof current.code === 'string' && (current.code.startsWith('kibana_') || current.code.startsWith('connection_'))) throw connectionFailure(current.code, redactor(credentials, config).text(current.message || 'Kibana 操作失败。'), current.status || 400);
    throw connectionFailure('kibana_request_failed', 'Kibana 操作未完成，未返回远端错误正文或自动重试。', 502);
  }
}
export function createKibanaProvider(options: KibanaHttpOptions = {}): KibanaProvider {
  const operations: KibanaOperations = {
    async views(config, credentials, input = {}) {
      const pagination = page(input);
      return safe(config, credentials, async () => {
        const client = new KibanaClient(config, credentials, options), version = client.version();
        const value = object(await client.request('/api/data_views'));
        if (!Array.isArray(value.data_view)) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 可见视图列表结构不受支持。', 502);
        const listed = value.data_view.map(item => summary(object(item))).filter(item => (item.name + '\n' + item.title).toLowerCase().includes(pagination.name.toLowerCase())).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        if (new Set(listed.map(item => item.id)).size !== listed.length) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 视图列表包含重复编号。', 502);
        const dataViews = listed.slice(pagination.offset, pagination.offset + pagination.limit);
        return { target: client.target, serverVersion: await version, warnings: client.warnings, dataViews, total: listed.length, offset: pagination.offset, limit: pagination.limit, limitReached: pagination.offset + dataViews.length < listed.length };
      });
    },
    async fields(config, credentials, input = {}) {
      inputObject(input, ['name', 'offset', 'limit', 'dataViewId']); const pagination = page(input, true);
      return safe(config, credentials, async () => {
        const client = new KibanaClient(config, credentials, options), id = kibanaDataViewId(client.config, input.dataViewId), version = client.version(), view = await client.dataView(id);
        const listed = view.fields.filter(field => field.name.toLowerCase().includes(pagination.name.toLowerCase())).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0), fields = listed.slice(pagination.offset, pagination.offset + pagination.limit);
        return { target: client.target, serverVersion: await version, warnings: client.warnings, dataView: identity(view), observedAt: view.observedAt, sourceFilters: view.sourceFilters, fields, total: listed.length, offset: pagination.offset, limit: pagination.limit, limitReached: pagination.offset + fields.length < listed.length };
      });
    },
    async search(config, credentials, input) {
      const now = options.now?.() || new Date(); validateKibanaQueryInput(input, 'search', now);
      return safe(config, credentials, async () => {
        const client = new KibanaClient(config, credentials, { ...options, now: () => now }), id = kibanaDataViewId(client.config, input.dataViewId), version = client.version(), view = await client.dataView(id), query = buildKibanaSearchQuery(view, input, now), response = await client.query(view, query.body);
        if (response.hits.length > query.limit) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 返回的命中超过本次请求条数，未接受扩大范围的响应。', 502);
        const rows = response.hits.map(hit => row(hit, query, credentials, config)), common = queryResult(client, view, await version, query, response.execution), limitReached = rows.length === query.limit;
        if (limitReached) { common.incompleteReasons.push('row_limit_reached'); common.warnings.push({ code: 'row_limit_reached', message: '已达到本次条数上限；这不证明存在下一页或完整覆盖。' }); }
        if (rows.some(item => item.messageTruncated)) { common.incompleteReasons.push('message_truncated'); common.warnings.push({ code: 'message_truncated', message: '部分正文已按完整字符边界截断，可缩小范围或提高正文上限继续观察。' }); }
        const redactionCount = rows.reduce((sum, item) => sum + item.redactionCount, 0);
        if (redactionCount) common.warnings.push({ code: 'sensitive_values_redacted', message: '已遮蔽已定义敏感信息；此处理不能识别任意业务秘密。' });
        return { ...common, incomplete: !!common.incompleteReasons.length, rows, rowCount: rows.length, rowLimit: query.limit, limitReached, displayFields: query.displayFields, omittedFields: query.omittedFields, order: query.order, messageBytes: query.messageBytes, redactionCount } satisfies KibanaSearchResult;
      });
    },
    async aggregate(config, credentials, input) {
      const now = options.now?.() || new Date(); validateKibanaQueryInput(input, 'aggregate', now);
      return safe(config, credentials, async () => {
        const client = new KibanaClient(config, credentials, { ...options, now: () => now }), id = kibanaDataViewId(client.config, input.dataViewId), version = client.version(), view = await client.dataView(id), query = buildKibanaAggregateQuery(view, input, now), response = await client.query(view, query.body);
        const group = object(object(response.raw.aggregations).groups);
        if (!Array.isArray(group.buckets) || group.buckets.length > query.top) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 分组统计结构不受支持。', 502);
        const buckets = group.buckets.map(item => { const bucket = object(item); if (!['string', 'number', 'boolean'].includes(typeof bucket.key) || typeof bucket.key === 'number' && !Number.isFinite(bucket.key)) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 分组键不是受支持标量。', 502); return { key: bucket.key as string | number | boolean, docCount: natural(bucket.doc_count) }; });
        const sumOtherDocCount = natural(group.sum_other_doc_count), docCountErrorUpperBound = natural(group.doc_count_error_upper_bound), common = queryResult(client, view, await version, query, response.execution), limitReached = buckets.length === query.top;
        if (limitReached || sumOtherDocCount) { common.incompleteReasons.push('aggregation_top_limited'); common.warnings.push({ code: 'aggregation_top_limited', message: '本次只返回前若干分组，不能把顶部统计视为全部分组。' }); }
        if (docCountErrorUpperBound) { common.incompleteReasons.push('aggregation_count_approximate'); common.warnings.push({ code: 'aggregation_count_approximate', message: '分组计数存在误差，不能视为全量精确统计。' }); }
        return { ...common, incomplete: !!common.incompleteReasons.length, field: query.field, resolvedField: query.resolvedField, top: query.top, buckets, sumOtherDocCount, docCountErrorUpperBound, limitReached } satisfies KibanaAggregateResult;
      });
    },
  };
  return {
    category: 'logs', type: 'kibana',
    validateConfig: (value, previous) => kibanaConfiguration(value, previous as KibanaConfiguration | undefined),
    validateCredentials: value => { const input = inputObject(value, ['password']); return { password: passwordInput(input.password) }; },
    authenticationTargetIdentity: config => { const current = kibanaConfiguration(config); return JSON.stringify(['logs', 'kibana', kibanaApiBase(current.consoleUrl), current.username]); },
    async test(config, credentials) {
      return safe(config, credentials, async () => {
        const started = Date.now(), client = new KibanaClient(config, credentials, options), id = kibanaDataViewId(client.config, undefined), version = client.version(), view = await client.dataView(id), query = buildKibanaSearchQuery(view, {}, client.now);
        const response = await client.query(view, { query: query.body.query, size: 0, _source: false });
        if (response.hits.length) throw connectionFailure('kibana_protocol_unsupported', 'Kibana 未遵循最小查询的零正文条数限制，查询能力未验证。', 502);
        const reasons = completion(response.execution, []);
        if (reasons.length) throw connectionFailure('kibana_search_unverified', 'Kibana 最小查询尚未完整验证：' + reasons.join('、') + '。', 422);
        const serverVersion = await version, kibana: KibanaTestResult = { dataView: identity(view), searchVerified: true, queryChannel: KIBANA_QUERY_CHANNEL, warnings: client.warnings };
        return { ok: true as const, ...(serverVersion ? { serverVersion } : {}), elapsedMs: Date.now() - started, kibana };
      });
    },
    kibana: operations,
  };
}
