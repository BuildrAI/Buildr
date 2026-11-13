import { Ajv } from 'ajv';
import type { ExecutorRequest } from '../../contracts.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';

export interface AntigravityPermissionOption {
  optionId: string;
  name: string;
  kind?: string;
}

function isPersistentGrantOption(optionId: string, kind: string | undefined): boolean {
  return /(?:always|persistent|forever|session)/i.test(optionId)
    || (typeof kind === 'string' && /(?:always|persistent|forever|session)/i.test(kind));
}

/**
 * Expose only single-request permission options; persistent grants (`allow_always`, etc.)
 * are excluded so "approve once" can never silently escalate to a standing grant.
 */
export function antigravityPermissionOptions(rawOptions: unknown): AntigravityPermissionOption[] {
  if (!Array.isArray(rawOptions)) return [];
  const filtered: AntigravityPermissionOption[] = [];
  for (const item of rawOptions) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.optionId !== 'string' || !rec.optionId.trim()) continue;
    const optionId = rec.optionId.trim();
    const kind = typeof rec.kind === 'string' ? rec.kind : undefined;
    if (isPersistentGrantOption(optionId, kind)) continue;
    filtered.push({
      optionId,
      name: typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : optionId,
      ...(kind ? { kind } : {}),
    });
  }
  return filtered;
}

export function antigravityPermissionOutcome(
  allowedOptions: readonly AntigravityPermissionOption[],
  answer: unknown,
): { outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' }; allowed: boolean } {
  const selectById = (candidateId: string) => {
    const exact = allowedOptions.find(opt => opt.optionId === candidateId);
    if (exact) {
      return {
        outcome: { outcome: 'selected' as const, optionId: exact.optionId },
        allowed: isAllowOption(exact),
      };
    }
    return undefined;
  };

  if (typeof answer === 'string') {
    const direct = selectById(answer);
    if (direct) return direct;
    if (['approve', 'accept', 'allow-once'].includes(answer)) {
      const allowOnce = allowedOptions.find(opt => opt.kind === 'allow_once' || opt.optionId === 'allow_once');
      if (allowOnce) return { outcome: { outcome: 'selected', optionId: allowOnce.optionId }, allowed: true };
    }
    if (['deny', 'decline', 'reject-once'].includes(answer)) {
      const rejectOnce = allowedOptions.find(opt => opt.kind === 'reject_once' || opt.optionId === 'reject_once');
      if (rejectOnce) return { outcome: { outcome: 'selected', optionId: rejectOnce.optionId }, allowed: false };
    }
    throw new AgentServiceError('agent_request_answer_invalid', '审批选项无效或不允许持久授权，请选择单次允许或拒绝。', 400);
  }

  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new AgentServiceError('agent_request_answer_invalid', '审批回答格式无效。', 400);
  }
  const value = answer as Record<string, unknown>;
  if (value.cancelled === true) {
    return { outcome: { outcome: 'cancelled' }, allowed: false };
  }
  if (typeof value.optionId === 'string') {
    const matched = selectById(value.optionId);
    if (!matched) {
      throw new AgentServiceError('agent_request_answer_invalid', '审批选项无效或不允许持久授权，请选择单次允许或拒绝。', 400);
    }
    return matched;
  }
  if (value.selected !== undefined) {
    if (typeof value.selected === 'string') {
      const matched = selectById(value.selected);
      if (!matched) {
        throw new AgentServiceError('agent_request_answer_invalid', '审批选项无效或不允许持久授权，请选择单次允许或拒绝。', 400);
      }
      return matched;
    }
    if (typeof value.selected === 'number' && Number.isInteger(value.selected)) {
      const opt = allowedOptions[value.selected];
      if (opt) return { outcome: { outcome: 'selected', optionId: opt.optionId }, allowed: isAllowOption(opt) };
    }
    throw new AgentServiceError('agent_request_answer_invalid', '审批选项无效或不允许持久授权，请选择单次允许或拒绝。', 400);
  }
  if (typeof value.approved === 'boolean') {
    const target = value.approved
      ? allowedOptions.find(opt => opt.kind === 'allow_once' || opt.optionId === 'allow_once')
      : allowedOptions.find(opt => opt.kind === 'reject_once' || opt.optionId === 'reject_once');
    if (target) return { outcome: { outcome: 'selected', optionId: target.optionId }, allowed: value.approved };
  }
  throw new AgentServiceError('agent_request_answer_invalid', '审批选项无效或不允许持久授权，请选择单次允许或拒绝。', 400);
}

function isAllowOption(option: AntigravityPermissionOption): boolean {
  return (typeof option.kind === 'string' && option.kind.startsWith('allow')) || option.optionId.startsWith('allow');
}

/** Convert ACP `elicitation/create` form schema into a typed Buildr question request. */
export function antigravityForm(
  params: Record<string, unknown>,
  id: string,
): {
  request: ExecutorRequest;
  answer(value: unknown): { action: 'accept'; content: Record<string, unknown> };
} {
  if (params.mode !== undefined && params.mode !== 'form') {
    throw new Error('antigravity_elicitation_mode_unsupported');
  }
  const askUserQuestion = (params._meta as any)?.antigravity?.toolName === 'AskUserQuestion';
  const schema = params.requestedSchema as any;
  if (
    !schema
    || schema.type !== 'object'
    || !schema.properties
    || typeof schema.properties !== 'object'
    || Array.isArray(schema.properties)
    || Object.keys(schema.properties).length > 12
  ) {
    throw new Error('antigravity_elicitation_schema_unsupported');
  }
  const properties = Object.entries(schema.properties) as Array<[string, any]>;
  if (!properties.length || properties.some(([key]) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    throw new Error('antigravity_elicitation_schema_unsupported');
  }
  const choices = (field: any): Array<{ id: string; label: string }> | undefined => {
    const values = field.enum ?? (field.oneOf ?? field.anyOf)?.map((option: any) => option.const);
    if (!Array.isArray(values)) return undefined;
    if (!values.length || values.length > 100 || values.some((val: unknown) => !['string', 'number', 'boolean'].includes(typeof val))) {
      throw new Error('antigravity_elicitation_schema_unsupported');
    }
    return values.map((val: unknown, index: number) => ({
      id: String(val),
      label: String((field.oneOf ?? field.anyOf)?.[index]?.title ?? val),
    }));
  };

  const questions = properties.map(([key, field]) => {
    if (
      !field
      || field.format !== undefined
      || field.items?.format !== undefined
      || !['string', 'number', 'integer', 'boolean', 'array'].includes(field.type)
    ) {
      throw new Error('antigravity_elicitation_schema_unsupported');
    }
    if (field.type === 'array' && (!field.items || !choices(field.items))) {
      throw new Error('antigravity_elicitation_schema_unsupported');
    }
    const declared = field.type === 'array' ? choices(field.items) : choices(field);
    const customAnswer = askUserQuestion && Boolean(declared)
      && (field.type === 'string' || (field.type === 'array' && field.items?.type === 'string'));
    const options = field.type === 'boolean'
      ? [{ id: 'true', label: '是' }, { id: 'false', label: '否' }]
      : declared;
    return {
      id: key,
      label: [field.title ?? key, field.description].filter(Boolean).join('\n'),
      ...(options ? { options } : {}),
      multiple: field.type === 'array',
      allowOther: customAnswer || !options,
    };
  });

  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validationSchema = askUserQuestion
    ? {
        ...schema,
        properties: Object.fromEntries(
          properties.map(([key, field]) => {
            if (field.type === 'string' && choices(field)) return [key, { type: 'string' }];
            if (field.type === 'array' && field.items?.type === 'string' && choices(field.items)) {
              return [
                key,
                {
                  type: 'array',
                  ...(field.minItems !== undefined ? { minItems: field.minItems } : {}),
                  items: { type: 'string' },
                },
              ];
            }
            return [key, field];
          }),
        ),
      }
    : schema;
  const validate = ajv.compile(validationSchema);

  function typed(field: any, raw: unknown): unknown {
    if (field.type === 'array') {
      if (!Array.isArray(raw)) throw new AgentServiceError('agent_question_answer_invalid', '多选问题需要提交数组回答。', 400);
      return raw.map(item => typed(field.items, item));
    }
    let val = raw;
    if (Array.isArray(val)) {
      if (val.length !== 1) throw new AgentServiceError('agent_question_answer_invalid', '单选问题只能提交单个选项。', 400);
      val = val[0];
    }
    if (field.type === 'boolean' && (val === 'true' || val === 'false')) return val === 'true';
    if (['number', 'integer'].includes(field.type) && typeof val === 'string' && val.trim() && Number.isFinite(Number(val))) {
      return Number(val);
    }
    return val;
  }

  return {
    request: {
      id,
      kind: 'question',
      blocking: true,
      title: typeof params.message === 'string' && params.message.trim() ? params.message.trim() : '需要你的回答',
      questions,
    },
    answer(value: unknown) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AgentServiceError('agent_question_answer_invalid', '问题回答格式无效。', 400);
      }
      const supplied = value as Record<string, unknown>;
      const content: Record<string, unknown> = {};
      if (Object.keys(supplied).some(key => !Object.hasOwn(schema.properties, key))) {
        throw new AgentServiceError('agent_question_answer_invalid', '问题回答包含未知字段。', 400);
      }
      for (const [key, field] of properties) {
        if (Object.hasOwn(supplied, key)) content[key] = typed(field, supplied[key]);
      }
      if (!validate(content)) {
        throw new AgentServiceError('agent_question_answer_invalid', '问题回答未通过字段校验，请核对必填项。', 400);
      }
      return { action: 'accept', content };
    },
  };
}
