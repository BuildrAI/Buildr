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

function normalizeQuestionTitle(message: unknown): string {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw || raw === 'Answer Questions' || /^The agent has (?:a question|\d+ questions)\.$/i.test(raw)) {
    return '需要你的回复';
  }
  return raw;
}

type QuestionOption = { id: string; label: string };
type QuestionView = NonNullable<ExecutorRequest['questions']>[number];

interface NativeAskQuestionGroup {
  index: number;
  questionId: string;
  selectKey?: string;
  otherKey: string;
  multiple: boolean;
  optionIds: Set<string>;
  question: QuestionView;
}

function extractChoices(field: any): QuestionOption[] | undefined {
  const values = field.enum ?? (field.oneOf ?? field.anyOf)?.map((option: any) => option.const);
  if (!Array.isArray(values)) return undefined;
  if (!values.length || values.length > 100 || values.some((val: unknown) => !['string', 'number', 'boolean'].includes(typeof val))) {
    throw new Error('antigravity_elicitation_schema_unsupported');
  }
  return values.map((val: unknown, index: number) => ({
    id: String(val),
    label: String((field.oneOf ?? field.anyOf)?.[index]?.title ?? val),
  }));
}

function isUnsupportedField(field: any): boolean {
  return !field
    || field.format !== undefined
    || field.items?.format !== undefined
    || !['string', 'number', 'integer', 'boolean', 'array'].includes(field.type);
}

function formatQuestionLabel(field: any, fallbackId: string): string {
  return [field.title ?? fallbackId, field.description].filter(Boolean).join('\n');
}

function isNativeOtherMetadata(field: any): boolean {
  return field.title === 'Other'
    || (typeof field.description === 'string' && field.description.startsWith('Optional free-form answer to:'));
}

function parseNativeAskQuestionGroups(
  schema: any,
  properties: Array<[string, any]>,
): NativeAskQuestionGroup[] | undefined {
  if (Array.isArray(schema.required) && schema.required.length > 0) return undefined;

  const byIndex = new Map<number, { selectKey?: string; selectField?: any; otherKey?: string; otherField?: any }>();
  for (const [key, field] of properties) {
    const match = key.match(/^q([1-9]\d*)(?:_(other))?$/);
    if (!match || isUnsupportedField(field) || !['string', 'array'].includes(field.type)) {
      return undefined;
    }
    const index = Number(match[1]);
    const entry = byIndex.get(index) ?? {};
    if (match[2]) {
      entry.otherKey = key;
      entry.otherField = field;
    } else {
      entry.selectKey = key;
      entry.selectField = field;
    }
    byIndex.set(index, entry);
  }

  if (!byIndex.size || byIndex.size > 12) return undefined;

  const groups: NativeAskQuestionGroup[] = [];
  for (const [index, entry] of [...byIndex.entries()].sort(([a], [b]) => a - b)) {
    const { selectKey, selectField, otherKey, otherField } = entry;
    if (!otherKey || !otherField || otherField.type !== 'string' || extractChoices(otherField)) {
      return undefined;
    }
    if (selectField && selectKey) {
      if (!isNativeOtherMetadata(otherField)) return undefined;
      const multiple = selectField.type === 'array';
      if (multiple) {
        if (!selectField.items || selectField.items.type !== 'string') return undefined;
      } else if (selectField.type !== 'string') {
        return undefined;
      }
      const options = multiple ? extractChoices(selectField.items) : extractChoices(selectField);
      if (!options?.length) return undefined;
      groups.push({
        index,
        questionId: selectKey,
        selectKey,
        otherKey,
        multiple,
        optionIds: new Set(options.map(option => option.id)),
        question: {
          id: selectKey,
          label: formatQuestionLabel(selectField, selectKey),
          options,
          multiple,
          allowOther: true,
        },
      });
    } else {
      groups.push({
        index,
        questionId: otherKey,
        otherKey,
        multiple: false,
        optionIds: new Set(),
        question: {
          id: otherKey,
          label: formatQuestionLabel(otherField, otherKey),
          multiple: false,
          allowOther: true,
        },
      });
    }
  }
  return groups;
}

function answerNativeAskQuestions(
  groups: readonly NativeAskQuestionGroup[],
  value: unknown,
): { action: 'accept'; content: Record<string, unknown> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentServiceError('agent_question_answer_invalid', '问题回答格式无效。', 400);
  }
  const supplied = value as Record<string, unknown>;
  const groupIds = new Set(groups.map(group => group.questionId));
  if (Object.keys(supplied).some(key => !groupIds.has(key))) {
    throw new AgentServiceError('agent_question_answer_invalid', '问题回答包含未知字段。', 400);
  }

  const content: Record<string, unknown> = {};
  for (const group of groups) {
    if (!Object.hasOwn(supplied, group.questionId)) {
      throw new AgentServiceError('agent_question_answer_invalid', '问题回答未通过字段校验，请核对必填项。', 400);
    }
    const raw = supplied[group.questionId];
    if (group.multiple) {
      if (!Array.isArray(raw)) {
        throw new AgentServiceError('agent_question_answer_invalid', '多选问题需要提交数组回答。', 400);
      }
      if (!raw.length || raw.some(item => typeof item !== 'string' || !item.trim())) {
        throw new AgentServiceError('agent_question_answer_invalid', '问题回答未通过字段校验，请核对必填项。', 400);
      }
      const selected: string[] = [];
      const custom: string[] = [];
      for (const item of raw) {
        if (group.optionIds.has(item)) selected.push(item);
        else custom.push(item);
      }
      if (selected.length && group.selectKey) content[group.selectKey] = selected;
      if (custom.length) content[group.otherKey] = custom.join('\n');
      continue;
    }

    let val = raw;
    if (Array.isArray(val)) {
      if (val.length !== 1) {
        throw new AgentServiceError('agent_question_answer_invalid', '单选问题只能提交单个选项。', 400);
      }
      val = val[0];
    }
    if (typeof val !== 'string' || !val.trim()) {
      throw new AgentServiceError('agent_question_answer_invalid', '问题回答未通过字段校验，请核对必填项。', 400);
    }
    if (group.selectKey && group.optionIds.has(val)) {
      content[group.selectKey] = val;
    } else {
      content[group.otherKey] = val;
    }
  }
  return { action: 'accept', content };
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
    || Object.keys(schema.properties).length > 24
  ) {
    throw new Error('antigravity_elicitation_schema_unsupported');
  }
  const properties = Object.entries(schema.properties) as Array<[string, any]>;
  if (!properties.length || properties.some(([key]) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    throw new Error('antigravity_elicitation_schema_unsupported');
  }

  const title = normalizeQuestionTitle(params.message);
  const nativeGroups = parseNativeAskQuestionGroups(schema, properties);
  if (nativeGroups) {
    return {
      request: {
        id,
        kind: 'question',
        blocking: true,
        title,
        questions: nativeGroups.map(group => group.question),
      },
      answer: value => answerNativeAskQuestions(nativeGroups, value),
    };
  }

  if (properties.length > 12) {
    throw new Error('antigravity_elicitation_schema_unsupported');
  }

  const questions = properties.map(([key, field]) => {
    if (isUnsupportedField(field)) {
      throw new Error('antigravity_elicitation_schema_unsupported');
    }
    if (field.type === 'array' && (!field.items || !extractChoices(field.items))) {
      throw new Error('antigravity_elicitation_schema_unsupported');
    }
    const declared = field.type === 'array' ? extractChoices(field.items) : extractChoices(field);
    const customAnswer = askUserQuestion && Boolean(declared)
      && (field.type === 'string' || (field.type === 'array' && field.items?.type === 'string'));
    const options = field.type === 'boolean'
      ? [{ id: 'true', label: '是' }, { id: 'false', label: '否' }]
      : declared;
    return {
      id: key,
      label: formatQuestionLabel(field, key),
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
            if (field.type === 'string' && extractChoices(field)) return [key, { type: 'string' }];
            if (field.type === 'array' && field.items?.type === 'string' && extractChoices(field.items)) {
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
      title,
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
