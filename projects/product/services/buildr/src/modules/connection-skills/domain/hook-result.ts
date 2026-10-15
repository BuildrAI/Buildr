import { failure, object, type Values } from './instance.ts';

/** Only bounded declarative data can reach standard UI slots. Business output belongs to run. */
export function normalizeHookOutput(raw: unknown): Values {
  const value = object(raw);
  if (!['success', 'failure', 'unknown'].includes(String(value.status))) throw new Error('invalid status');
  const output: Values = { status: value.status };
  for (const name of ['checks', 'diagnostics', 'limitations', 'warnings']) {
    if (value[name] !== undefined && !Array.isArray(value[name])) throw new Error('invalid list');
    output[name] = (value[name] as unknown[] | undefined)?.slice(0, 100) || [];
  }
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) throw new Error('invalid options');
    output.options = value.options.slice(0, 1000).map(item => {
      const option = object(item);
      if (typeof option.value !== 'string') throw failure('connection_skill_hook_result_invalid', '动态选择项的编号必须是文本；本次未加载选择项。', 400);
      if (typeof option.label !== 'string' || option.label.length > 2048) throw new Error('invalid option');
      return { value: option.value, label: option.label };
    });
    output.truncated = value.truncated === true || value.options.length > 1000;
    if (value.options.length > 1000) (output.limitations as unknown[]).push('本次最多展示 1000 个选择项，结果不完整。');
  }
  if (value.error && typeof value.error === 'object' && typeof (value.error as Values).message === 'string') (output.diagnostics as unknown[]).push((value.error as Values).message);
  return output;
}
