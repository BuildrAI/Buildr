import assert from 'node:assert/strict';
import test from 'node:test';
import {
  kibanaApiBase, kibanaConfiguration, kibanaTimeRange,
  type KibanaDataViewMetadata, type KibanaField,
} from '../../src/modules/connections/domain/kibana-connection.ts';
import {
  buildKibanaAggregateQuery, buildKibanaSearchQuery, validateKibanaQueryInput,
} from '../../src/modules/connections/infrastructure/kibana-query.ts';

const now = new Date('2026-10-14T08:00:00.000Z');
function field(name: string, esTypes: string[], extra: Partial<KibanaField> = {}): KibanaField {
  return { name, type: esTypes.includes('text') ? 'string' : esTypes[0], esTypes, searchable: true,
    aggregatable: !esTypes.includes('text'), readFromDocValues: !esTypes.includes('text'), unsupportedReasons: [], ...extra };
}
function view(): KibanaDataViewMetadata {
  return { id: 'logs', name: '测试日志', title: 'logs-*', timeFieldName: '@timestamp', observedAt: now.toISOString(),
    sourceFilters: [], fields: [field('@timestamp', ['date_nanos']), field('message', ['text']),
      field('message.keyword', ['keyword']), field('kubernetes.deployment.name', ['text']),
      field('kubernetes.deployment.name.keyword', ['keyword']), field('kubernetes.namespace', ['keyword']),
      field('trace.id', ['keyword']), field('log.level', ['keyword']), field('retry_count', ['long']), field('healthy', ['boolean'])] };
}

test('Kibana URLs retain proxy and space while removing transient website conditions', () => {
  const config = kibanaConfiguration({ consoleUrl: 'https://logs.example.invalid:443/gateway/kibana/s/test-space/app/discover?token=discard#temporary', username: 'reader' });
  assert.equal(config.consoleUrl, 'https://logs.example.invalid/gateway/kibana/s/test-space/app/discover');
  assert.equal(kibanaApiBase(config.consoleUrl), 'https://logs.example.invalid/gateway/kibana/s/test-space');
  assert.equal(config.dataViewId, null);
  assert.equal(kibanaConfiguration({ consoleUrl: 'http://logs.example.invalid/', username: 'reader', dataViewId: '' }).consoleUrl, 'http://logs.example.invalid/app/discover');
  for (const consoleUrl of ['file:///kibana', 'https://reader:password@logs.example.invalid', 'https://logs.example.invalid/app/management', 'https://logs.example.invalid/s', 'https://logs.example.invalid/api/status']) {
    assert.throws(() => kibanaConfiguration({ consoleUrl, username: 'reader' }), { code: 'kibana_url_invalid' });
  }
  assert.throws(() => kibanaConfiguration({ consoleUrl: config.consoleUrl, username: 'reader:other' }), { code: 'kibana_input_invalid' });
});

test('Kibana time ranges use UTC, one observed now, and retain nanosecond precision', () => {
  assert.deepEqual(kibanaTimeRange({}, now), { from: '2026-10-14T07:45:00.000Z', to: '2026-10-14T08:00:00.000Z' });
  assert.deepEqual(kibanaTimeRange({ since: '1.5h' }, now), { from: '2026-10-14T06:30:00.000Z', to: '2026-10-14T08:00:00.000Z' });
  assert.deepEqual(kibanaTimeRange({ from: '2026-10-14T15:00:00.123456789+08:00', to: '2026-10-14T15:00:00.123456790+08:00' }),
    { from: '2026-10-14T07:00:00.123456789Z', to: '2026-10-14T07:00:00.123456790Z' });
  assert.equal(kibanaTimeRange({ since: '1d' }, now).from, '2026-10-13T08:00:00.000Z');
  assert.equal(kibanaTimeRange({ since: '0.1ms' }, now).from, '2026-10-14T07:59:59.9999Z');
  assert.equal(kibanaTimeRange({ since: '0.000000001s' }, now).from, '2026-10-14T07:59:59.999999999Z');
  for (const input of [{ since: '0m' }, { since: '-1m' }, { since: '25h' }, { since: '1w' },
    { since: '1h', from: now.toISOString(), to: now.toISOString() }, { from: now.toISOString() },
    { from: '2026-10-14T07:00:00', to: '2026-10-14T08:00:00Z' },
    { from: '2026-10-14T08:00:00Z', to: '2026-10-14T07:00:00Z' },
    { from: '2026-02-30T07:00:00Z', to: '2026-03-01T08:00:00Z' }]) assert.throws(() => kibanaTimeRange(input, now), { code: 'kibana_time_invalid' });
});

test('Kibana exact shortcuts resolve keyword fields without analyzed-text fallback', () => {
  const result = buildKibanaSearchQuery(view(), { service: 'order-api', namespace: 'qa' }, now);
  assert.ok(result.resolvedFields.some(item => item.requestedField === 'kubernetes.deployment.name' && item.field === 'kubernetes.deployment.name.keyword'));
  const json = JSON.stringify(result.body.query);
  assert.ok(json.includes('"term":{"kubernetes.deployment.name.keyword":"order-api"}'));
  assert.ok(json.includes('"gte":"2026-10-14T07:45:00.000Z","lt":"2026-10-14T08:00:00.000Z"'));
  const missing = view(); missing.fields = missing.fields.filter(item => item.name !== 'kubernetes.deployment.name.keyword');
  assert.throws(() => buildKibanaSearchQuery(missing, { service: 'order-api' }, now), { code: /^kibana_/ });
  assert.throws(() => buildKibanaSearchQuery(missing, { filters: [{ field: 'absent.namespace', op: 'exists' }] }, now), { code: /^kibana_/ });
});

test('Kibana mixed mappings keep an exact candidate and disclose coverage limits', () => {
  const mixed = view(); mixed.fields.find(item => item.name === 'kubernetes.deployment.name')!.esTypes = ['text', 'keyword'];
  const result = buildKibanaSearchQuery(mixed, { service: 'order-api' }, now);
  assert.ok(result.warnings.some(item => item.code === 'field_mapping_mixed'));
  assert.ok(result.resolvedFields.some(item => item.field === 'kubernetes.deployment.name.keyword'));
  assert.ok(!JSON.stringify(result.body).includes('"term":{"kubernetes.deployment.name":'));
});

test('Kibana trace association uses structured and body paths without inheriting a service filter', () => {
  const result = buildKibanaSearchQuery(view(), { traceId: 'trace-123' }, now);
  assert.ok(result.resolvedFields.some(item => item.field === 'trace.id'));
  assert.ok(result.resolvedFields.some(item => item.field === 'message'));
  const json = JSON.stringify(result.body.query);
  assert.ok(json.includes('"minimum_should_match":1')); assert.ok(json.includes('"match_phrase":{"message":"trace-123"}'));
  assert.ok(json.includes('"term":{"trace.id":"trace-123"}')); assert.ok(!json.includes('kubernetes.deployment.name'));
  const onlyMessage = view(); onlyMessage.fields = onlyMessage.fields.filter(item => item.name !== 'trace.id');
  assert.ok(buildKibanaSearchQuery(onlyMessage, { traceId: 'trace-123' }, now).resolvedFields.some(item => item.field === 'message'));
  onlyMessage.fields = onlyMessage.fields.filter(item => item.name !== 'message');
  assert.throws(() => buildKibanaSearchQuery(onlyMessage, { traceId: 'trace-123' }, now), { code: /^kibana_/ });
});

test('Kibana rejects unavailable time, nested, runtime and scripted fields before constructing a query', () => {
  for (const kind of ['nested', 'runtime', 'scripted']) {
    const unsupported = view(); unsupported.fields.find(item => item.name === 'trace.id')!.unsupportedReasons = [kind];
    assert.throws(() => buildKibanaSearchQuery(unsupported, { filters: [{ field: 'trace.id', op: 'eq', value: 'trace' }] }, now), { code: /^kibana_/ });
  }
  for (const change of [null, 'missing', 'message']) {
    const invalid = view(); invalid.timeFieldName = change;
    assert.throws(() => buildKibanaSearchQuery(invalid, {}, now), { code: /^kibana_/ });
  }
  for (const extra of [{ searchable: false }, { esTypes: ['date', 'keyword'] }, { unsupportedReasons: ['scripted'] }]) {
    const invalid = view(); Object.assign(invalid.fields[0], extra);
    assert.throws(() => buildKibanaSearchQuery(invalid, {}, now), { code: /^kibana_/ });
  }
});

test('Kibana display exclusions retain hits while rejecting explicit excluded fields', () => {
  const filtered = view(); filtered.sourceFilters = ['message', 'kubernetes.*'];
  const result = buildKibanaSearchQuery(filtered, { contains: 'error' }, now);
  assert.ok(result.omittedFields.some(item => item.field === 'message'));
  assert.ok(!result.displayFields.includes('message'));
  assert.ok(!result.displayFields.includes('kubernetes.namespace'));
  assert.ok(JSON.stringify(result.body).includes('"match_phrase":{"message":"error"}'));
  assert.throws(() => buildKibanaSearchQuery(filtered, { fields: ['message'] }, now), { code: /^kibana_/ });
  const keyword = buildKibanaSearchQuery(view(), { fields: ['message.keyword'] }, now);
  assert.ok(keyword.displayFields.includes('message.keyword'));
  assert.notEqual(keyword.body._source, true);
});

test('Kibana input validation rejects unbounded, mistyped and arbitrary query inputs', () => {
  for (const input of [
    { limit: 501 }, { limit: 0 }, { order: 'random' }, { messageBytes: 256 * 1024 + 1 }, { fields: Array(21).fill('message') },
    { contains: '中'.repeat(1400) }, { filters: Array(21).fill({ field: 'message', op: 'exists' }) },
    { filters: [{ field: 'message', op: 'exists', value: 'unexpected' }] },
    { filters: [{ field: 'message', op: 'eq', value: { term: 'arbitrary' } }] },
    { filters: [{ field: 'message', op: 'eq', value: Infinity }] },
    { filters: [{ field: 'message', op: 'eq', value: 'x', script: 'forbidden' }] },
    { query: { match_all: {} } },
  ]) assert.throws(() => validateKibanaQueryInput(input, 'search', now), { code: /^(?:kibana|connection)_/ });
  assert.throws(() => buildKibanaSearchQuery(view(), { filters: [{ field: 'healthy', op: 'eq', value: 'true' }] }, now), { code: /^kibana_/ });
  assert.throws(() => buildKibanaSearchQuery(view(), { filters: [{ field: 'retry_count', op: 'eq', value: 'three' }] }, now), { code: /^kibana_/ });
  assert.doesNotThrow(() => buildKibanaSearchQuery(view(), { filters: [{ field: 'healthy', op: 'eq', value: true }, { field: 'retry_count', op: 'eq', value: 3 }] }, now));
});

test('Kibana terms aggregation uses bounded exact values and does not request log bodies', () => {
  const result = buildKibanaAggregateQuery(view(), { field: 'kubernetes.deployment.name', top: 25 }, now);
  assert.equal(result.resolvedField, 'kubernetes.deployment.name.keyword'); assert.equal(result.top, 25);
  assert.equal(result.body.size, 0); assert.notEqual(result.body._source, true);
  const json = JSON.stringify(result.body); assert.ok(json.includes('"terms"')); assert.ok(json.includes('"field":"kubernetes.deployment.name.keyword"'));
  assert.throws(() => buildKibanaAggregateQuery(view(), { field: 'message', top: 101 }, now), { code: /^kibana_/ });
  const invalid = view(); invalid.fields.find(item => item.name === 'message.keyword')!.aggregatable = false;
  assert.throws(() => buildKibanaAggregateQuery(invalid, { field: 'message' }, now), { code: /^kibana_/ });
});

test('Kibana doc-value display remains available when the field cannot be searched', () => {
  const nonSearchable = view();
  Object.assign(nonSearchable.fields.find(item => item.name === 'log.level')!, { searchable: false, readFromDocValues: true });
  const result = buildKibanaSearchQuery(nonSearchable, { fields: ['log.level'] }, now);
  assert.ok(result.displayFields.includes('log.level')); assert.ok(result.body.fields.some(item => item.field === 'log.level'));
  assert.throws(() => buildKibanaSearchQuery(nonSearchable, { filters: [{ field: 'log.level', op: 'eq', value: 'ERROR' }] }, now), { code: 'kibana_field_unsupported' });
  assert.throws(() => buildKibanaSearchQuery(nonSearchable, { filters: [{ field: 'log.level', op: 'exists' }] }, now), { code: 'kibana_field_unsupported' });
});

test('Kibana source exclusions cover parent paths and actual multi-field source parents', () => {
  const filtered = view(); filtered.sourceFilters = ['message', 'kubernetes'];
  assert.throws(() => buildKibanaSearchQuery(filtered, { fields: ['message.keyword'] }, now), { code: 'kibana_field_excluded' });
  assert.throws(() => buildKibanaSearchQuery(filtered, { fields: ['kubernetes.namespace'] }, now), { code: 'kibana_field_excluded' });
  const result = buildKibanaSearchQuery(filtered, { service: 'order-api', contains: 'failure' }, now);
  assert.ok(!result.displayFields.includes('message')); assert.ok(!result.displayFields.includes('kubernetes.namespace'));
  assert.ok(result.resolvedFields.some(item => item.field === 'kubernetes.deployment.name.keyword'));
  assert.ok(result.resolvedFields.some(item => item.field === 'message'));
  filtered.sourceFilters = ['private.original'];
  filtered.fields.push(Object.assign(field('public.raw', ['keyword']), { sourceField: 'private.original' }));
  assert.throws(() => buildKibanaSearchQuery(filtered, { fields: ['public.raw'] }, now), { code: 'kibana_field_excluded' });
});
