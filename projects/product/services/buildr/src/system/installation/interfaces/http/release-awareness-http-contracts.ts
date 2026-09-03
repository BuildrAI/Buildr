import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/system-installation';
const text = { type: 'string', minLength: 1 };
const nullableText = { type: ['string', 'null'] };
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });

const track = closed({
  track: { enum: ['stable', 'candidate'] }, tag: text, label: text,
  version: nullableText, observedVersion: nullableText, status: text,
  available: { type: 'boolean' }, installable: { type: 'boolean' }, seen: { type: 'boolean' },
  newlyObserved: { type: 'boolean' }, notified: { type: 'boolean' }, shouldNotify: { type: 'boolean' },
}, ['track', 'tag', 'label', 'version', 'observedVersion', 'status', 'available', 'installable', 'seen', 'newlyObserved', 'notified', 'shouldNotify']);

export const RELEASE_AWARENESS_HTTP_SCHEMAS = Object.freeze({
  request: schema('release-awareness/request', 'ReleaseAwarenessRequest', closed({})),
  response: schema('release-awareness/response', 'ReleaseAwarenessResponse', closed({
    schemaVersion: { const: 'buildr.release-awareness/v1' }, mode: text, channel: text,
    current: { type: 'object', additionalProperties: true, required: ['version'], properties: { version: text } },
    selectedTrack: { enum: ['stable', 'candidate'] },
    tracks: closed({ stable: track, candidate: track }, ['stable', 'candidate']),
    notices: { type: 'array', items: { type: 'object', additionalProperties: true } },
    observedAt: nullableText,
    freshness: closed({ status: text, source: text, checkedAt: nullableText }, ['status', 'source', 'checkedAt']),
    status: text, blockingReasons: { type: 'array', items: text }, nextActions: { type: 'array', items: text },
  }, ['schemaVersion', 'mode', 'channel', 'current', 'selectedTrack', 'tracks', 'notices', 'observedAt', 'freshness', 'status', 'blockingReasons', 'nextActions'])),
  errorResponse: schema('error/response', 'SystemInstallationHttpErrorResponse', closed({ error: closed({ code: text, message: text, details: true }, ['code', 'message']) }, ['error'])),
});

export const RELEASE_AWARENESS_HTTP_OPERATIONS = Object.freeze([Object.freeze({
  id: 'system-installation.release-awareness', owner: 'system-installation', method: 'GET', path: '/api/v1/release-awareness',
  disposition: 'migrated-json', responseKind: 'json',
  requestSchemaId: RELEASE_AWARENESS_HTTP_SCHEMAS.request.$id,
  successSchemaId: RELEASE_AWARENESS_HTTP_SCHEMAS.response.$id,
  errorSchemaId: RELEASE_AWARENESS_HTTP_SCHEMAS.errorResponse.$id,
})]);

export const RELEASE_AWARENESS_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(RELEASE_AWARENESS_HTTP_SCHEMAS));

export function validateReleaseAwarenessHttp(schemaId: any, value: any, phase: any = 'request') {
  const result = RELEASE_AWARENESS_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const error: Error & Record<string, any> = new Error(`Release Awareness HTTP ${phase} DTO 不符合契约。`);
  error.code = phase === 'request' ? 'release_awareness_http_request_invalid' : 'release_awareness_http_response_invalid';
  error.status = phase === 'request' ? 400 : 500;
  error.details = { operationId: 'system-installation.release-awareness', schemaId, errors: result.errors };
  throw error;
}
