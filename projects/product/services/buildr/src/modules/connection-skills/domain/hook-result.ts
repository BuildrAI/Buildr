import { failure, object, type Values } from './instance.ts';

/** Only bounded declarative data can reach standard UI slots. Business output belongs to run. */
export function normalizeHookOutput(raw: unknown, secrets: readonly string[] = []): Values {
  const value = object(raw);
  if (typeof value.status !== 'string' || !['success', 'failure', 'unknown'].includes(value.status)) throw new Error('invalid status');
  const patterns = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const text = (input: string) => { for (const secret of patterns) input = input.split(secret).join('[已隐藏]'); return input; };
  const displayKeys = new Set(['message', 'label', 'name', 'status', 'code']);
  const display = (input: unknown): unknown => {
    if (typeof input === 'string') return text(input);
    if (Array.isArray(input)) return input.map(display);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, entry]) => [displayKeys.has(key) ? key : text(key), key === 'status' && typeof entry === 'string' && ['success', 'failure', 'unknown'].includes(entry) ? entry : display(entry)]));
    return input;
  };
  const output: Values = { status: value.status };
  for (const name of ['checks', 'diagnostics', 'limitations', 'warnings']) {
    if (value[name] !== undefined && !Array.isArray(value[name])) throw new Error('invalid list');
    output[name] = (value[name] as unknown[] | undefined)?.slice(0, 100).map(display) || [];
  }
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) throw new Error('invalid options');
    output.options = value.options.slice(0, 1000).map(item => {
      const option = object(item);
      if (typeof option.value !== 'string') throw failure('connection_skill_hook_result_invalid', '动态选择项的编号必须是文本；本次未加载选择项。', 400);
      const identity = option.value;
      if (patterns.some(secret => identity.includes(secret))) throw failure('connection_skill_hook_result_invalid', '动态选择项的编号与认证值重合，无法安全交付；本次未加载或替换任何选择项。', 400);
      if (typeof option.label !== 'string' || option.label.length > 2048) throw new Error('invalid option');
      return { value: option.value, label: text(option.label) };
    });
    output.truncated = value.truncated === true || value.options.length > 1000;
    if (value.options.length > 1000) (output.limitations as unknown[]).push('本次最多展示 1000 个选择项，结果不完整。');
  }
  if (value.error && typeof value.error === 'object' && typeof (value.error as Values).message === 'string') (output.diagnostics as unknown[]).push(text((value.error as Values).message as string));
  return output;
}
