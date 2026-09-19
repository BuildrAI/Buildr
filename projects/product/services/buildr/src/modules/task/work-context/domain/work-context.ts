const text = { type: 'string', minLength: 1, maxLength: 12000, pattern: '\\S' };
const shortText = { ...text, maxLength: 300 };
const nullable = (value: any) => ({ anyOf: [value, { type: 'null' }] });
const closed = (properties: any, required: string[] = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const ref = (name: string) => ({ $ref: `#/$defs/${name}` });
const digest = { type: 'string', pattern: '^sha256-[0-9a-f]{64}$' };
const expected = { anyOf: [digest, { const: 'absent' }] };
const kind = { enum: ['decision', 'acceptance', 'question'] };
export const TASK_WORK_CONTEXT_DEFINITIONS = {
  TaskWorkAttention: closed({ id: shortText, kind, reason: text, state: { enum: ['pending', 'resolved'] }, createdAt: text, response: nullable(closed({ text, recordedAt: text })) }),
  TaskWorkContext: closed({ progress: text, nextStep: text, updatedAt: text, attention: nullable(ref('TaskWorkAttention')) }),
  TaskWorkContextResponse: closed({ schemaVersion: { const: 'buildr.task-work-context/v1' }, taskId: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$' }, context: nullable(ref('TaskWorkContext')), contextDigest: nullable(digest) }),
  TaskWorkContextsRequest: closed({ ids: { type: 'string', maxLength: 30000 } }),
  TaskWorkContextsResponse: closed({ schemaVersion: { const: 'buildr.task-work-context-list/v1' }, items: { type: 'array', items: ref('TaskWorkContextResponse') } }),
  TaskWorkContextRecordRequest: closed({ expectedContextDigest: expected, progress: text, nextStep: text, attention: nullable(closed({ kind, reason: text })) }, ['expectedContextDigest', 'progress', 'nextStep']),
  TaskWorkContextRespondRequest: closed({ expectedContextDigest: digest, attentionId: shortText, response: text }),
};
export function taskWorkContextError(code: string, message: string, status = 400, details?: unknown): Error { return Object.assign(new Error(message), { code, status, details }); }
function invalid(field: string): never { throw taskWorkContextError('task_work_context_input_invalid', `工作摘要字段无效：${field}。`, 400, { field }); }
function object(value: unknown, fields: string[], required = fields): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('input');
  const input = value as Record<string, any>;
  for (const field of Object.keys(input)) if (!fields.includes(field)) invalid(field);
  for (const field of required) if (!Object.hasOwn(input, field)) invalid(field);
  return input;
}
function nonempty(value: unknown, field: string, maximum = 12000): void { if (typeof value !== 'string' || !value.trim() || value.length > maximum) invalid(field); }
function digestValue(value: unknown, absent = false): void { if (!(absent && value === 'absent') && (typeof value !== 'string' || !/^sha256-[0-9a-f]{64}$/.test(value))) invalid('contextDigest'); }
function attentionInput(value: unknown): void { const input = object(value, ['kind', 'reason']); if (!['decision', 'acceptance', 'question'].includes(input.kind)) invalid('attention.kind'); nonempty(input.reason, 'attention.reason'); }
export function validateTaskWorkContext(name: 'TaskWorkContextResponse' | 'TaskWorkContextRecordRequest' | 'TaskWorkContextRespondRequest', value: unknown): void {
  if (name === 'TaskWorkContextRecordRequest') {
    const input = object(value, ['expectedContextDigest', 'progress', 'nextStep', 'attention'], ['expectedContextDigest', 'progress', 'nextStep']);
    digestValue(input.expectedContextDigest, true); nonempty(input.progress, 'progress'); nonempty(input.nextStep, 'nextStep');
    if (Object.hasOwn(input, 'attention') && input.attention !== null) attentionInput(input.attention);
  } else if (name === 'TaskWorkContextRespondRequest') {
    const input = object(value, ['expectedContextDigest', 'attentionId', 'response']);
    digestValue(input.expectedContextDigest); nonempty(input.attentionId, 'attentionId', 300); nonempty(input.response, 'response');
  } else {
    const input = object(value, ['schemaVersion', 'taskId', 'context', 'contextDigest']);
    if (input.schemaVersion !== 'buildr.task-work-context/v1' || typeof input.taskId !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(input.taskId)) invalid('taskId');
    if (input.context === null) { if (input.contextDigest !== null) invalid('contextDigest'); return; }
    digestValue(input.contextDigest);
    const context = object(input.context, ['progress', 'nextStep', 'updatedAt', 'attention']);
    nonempty(context.progress, 'progress'); nonempty(context.nextStep, 'nextStep'); nonempty(context.updatedAt, 'updatedAt');
    if (context.attention === null) return;
    const attention = object(context.attention, ['id', 'kind', 'reason', 'state', 'createdAt', 'response']);
    nonempty(attention.id, 'attention.id', 300); attentionInput({ kind: attention.kind, reason: attention.reason }); nonempty(attention.createdAt, 'attention.createdAt');
    if (!['pending', 'resolved'].includes(attention.state) || (attention.state === 'resolved') !== (attention.response !== null)) invalid('attention.state');
    if (attention.response !== null) { const response = object(attention.response, ['text', 'recordedAt']); nonempty(response.text, 'response.text'); nonempty(response.recordedAt, 'response.recordedAt'); }
  }
}
