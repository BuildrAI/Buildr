import path from 'node:path';
import { readVerifiedReadonlyBytes } from '../../../../infrastructure/filesystem/verified-readonly-file.ts';
import process from 'node:process';
import { assertNoUnknownOptions, hasFlag, optionValue, positionalArgs } from '../../../../infrastructure/cli-arguments.ts';
import { sourceError, SOURCE_LIMITS } from '../../application/source-observations.ts';
import type { createSourceQuery } from '../../application/source-query.ts';

async function readInput(input: string, signal: AbortSignal): Promise<unknown> {
  let chunks: Buffer[] = []; let size = 0;
  if (input === '-') {
    for await (const chunk of process.stdin) {
      signal.throwIfAborted();
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > SOURCE_LIMITS.inputBytes) throw sourceError('source_input_limit', '来源观察输入超过 2 MiB。');
      chunks.push(bytes);
    }
  } else {
    const absolute = path.resolve(input);
    chunks = [readVerifiedReadonlyBytes(path.dirname(absolute), path.basename(absolute), SOURCE_LIMITS.inputBytes)];
  }
  const content = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  return JSON.parse(content);
}
export function createSourceInspectCli(application: ReturnType<typeof createSourceQuery> | null) {
  return Object.freeze({
    key: 'agent-assets source inspect', surface: 'agent-machine',
    summary: '被动只读核对规则、技能与明确对象的来源；不启动服务、不修复投射。',
    help: ['Usage: buildr agent-assets source inspect --target <workspace> --input <file|-> [--json]', '', '标准输入或文件承载 buildr.agent-asset-source-observations/v1。mode 可选 metadata 或 content（默认）；metadata 仅返回身份、定位、版本与证明，不返回 current/observed 正文。返回 buildr.agent-asset-source-result/v1；局部未知或冲突不影响其他对象，不证明历史治理、采纳或任务完成。'],
    match: ({ domain, action, runtimeId }: { domain?: string; action?: string; runtimeId?: string }) => domain === 'agent-assets' && action === 'source' && runtimeId === 'inspect',
    async run(_runtime: unknown, context: { argv: string[] }) {
      const args = context.argv.slice(5);
      assertNoUnknownOptions(args, new Set(['--target', '--input', '--json']), new Set(['--json']));
      if (positionalArgs(args, new Set(['--json'])).length) throw sourceError('source_input_invalid', '来源读取不接受额外位置参数。');
      const target = optionValue(args, '--target', null); const input = optionValue(args, '--input', null);
      if (!target || !input) throw sourceError('source_input_invalid', '--target 与 --input 必须明确指定。');
      if (!application) throw sourceError('source_read_unavailable', '来源只读能力尚未装配。');
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); if (input === '-') process.stdin.destroy(sourceError('source_timeout', '标准输入等待超时。')); }, SOURCE_LIMITS.timeoutMs);
      try {
        const result = application.inspect(target, await readInput(input, controller.signal), { signal: controller.signal });
        process.stdout.write(hasFlag(args, '--json') ? `${JSON.stringify(result)}\n` : `${result.items.map(item => `${item.id}: ${item.status}`).join('\n')}\n`);
        return result;
      } finally { clearTimeout(timer); }
    },
  });
}
