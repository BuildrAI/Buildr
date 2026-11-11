import { Ajv } from 'ajv';
import type { ExecutorRequest } from '../../contracts.ts';

/** ACP form elicitation is a typed native request, never a question inferred from prose. */
export function qoderForm(params: Record<string, unknown>, id: string): {
  request: ExecutorRequest;
  answer(value: unknown): { action: 'accept'; content: Record<string, unknown> };
} {
  if (params.mode !== undefined && params.mode !== 'form') throw new Error('qoder_cn_elicitation_mode_unsupported');
  const schema = params.requestedSchema as any;
  if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object' ||
      Array.isArray(schema.properties) || Object.keys(schema.properties).length > 12) throw new Error('qoder_cn_elicitation_schema_unsupported');
  const properties = Object.entries(schema.properties) as Array<[string, any]>;
  if (!properties.length || properties.some(([key]) => ['__proto__','constructor','prototype'].includes(key))) throw new Error('qoder_cn_elicitation_schema_unsupported');
  const choices = (field: any): Array<{ id: string; label: string }> | undefined => {
    const values = field.enum ?? (field.oneOf ?? field.anyOf)?.map((option: any) => option.const);
    if (!Array.isArray(values)) return;
    if (!values.length || values.length > 100 || values.some(value => !['string','number','boolean'].includes(typeof value))) throw new Error('qoder_cn_elicitation_schema_unsupported');
    return values.map((value, index) => ({ id: String(value), label: String((field.oneOf ?? field.anyOf)?.[index]?.title ?? value) }));
  };
  const questions = properties.map(([key, field]) => {
    if (!field || field.format !== undefined || field.items?.format !== undefined || !['string','number','integer','boolean','array'].includes(field.type)) throw new Error('qoder_cn_elicitation_schema_unsupported');
    if (field.type === 'array' && (!field.items || !choices(field.items))) throw new Error('qoder_cn_elicitation_schema_unsupported');
    const options = field.type === 'boolean' ? [{ id: 'true', label: '是' }, { id: 'false', label: '否' }]
      : choices(field.type === 'array' ? field.items : field);
    return { id: key, label: [field.title ?? key, field.description].filter(Boolean).join('\n'),
      ...(options ? { options } : {}), multiple: field.type === 'array', allowOther: !options };
  });
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validate = ajv.compile(schema);
  function typed(field: any, value: unknown): unknown {
    if (field.type === 'array') {
      if (!Array.isArray(value)) throw new Error('qoder_cn_question_answer_invalid');
      return value.map(item => typed(field.items, item));
    }
    if (Array.isArray(value)) {
      if (value.length !== 1) throw new Error('qoder_cn_question_answer_invalid');
      value = value[0];
    }
    if (field.type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true';
    if (['number','integer'].includes(field.type) && typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return value;
  }
  return {
    request: { id, kind: 'question', blocking: true, title: typeof params.message === 'string' ? params.message : '需要你的回答', questions },
    answer(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('qoder_cn_question_answer_invalid');
      const supplied = value as Record<string, unknown>, content: Record<string, unknown> = {};
      if (Object.keys(supplied).some(key => !Object.hasOwn(schema.properties, key))) throw new Error('qoder_cn_question_answer_invalid');
      for (const [key, field] of properties) if (Object.hasOwn(supplied, key)) content[key] = typed(field, supplied[key]);
      if (!validate(content)) throw new Error('qoder_cn_question_answer_invalid');
      return { action: 'accept', content };
    },
  };
}
