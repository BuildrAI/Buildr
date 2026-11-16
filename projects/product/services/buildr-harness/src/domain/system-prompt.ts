import { createHash } from 'node:crypto';
import type { HarnessSystemPrompt } from '../contracts.ts';

export const DEFAULT_SYSTEM_PROMPT_TEXT = `默认简洁、直接、高效地表达，优先说明结论、结果和必要决定。
用户未明确要求时，避免展开大段文档正文、技术细节、内部流程和非必要术语，只提供理解结果、作出决定和验收所需的信息。需要依据时简要说明，详细内容按需展开。
简洁不得降低调查、执行和交付质量，也不得省略重要风险、失败、未完成事项和不确定性。用户明确要求详细解释或完整交付时，应充分满足，不机械压缩。`;
export const systemPromptDigest = (value: {enabled:boolean;text:string}) => 'sha256-' + createHash('sha256').update(JSON.stringify([value.enabled,value.text])).digest('hex');
export const defaultSystemPrompt: HarnessSystemPrompt = {
  name: 'Buildr Harness 系统提示词', enabled: true, text: DEFAULT_SYSTEM_PROMPT_TEXT,
  revision: systemPromptDigest({enabled:true,text:DEFAULT_SYSTEM_PROMPT_TEXT}), defaultText: DEFAULT_SYSTEM_PROMPT_TEXT,
};
export function composeInteractionPolicy(base: {version:'buildr-interaction/v1';instructions:string}, prompt = defaultSystemPrompt) {
  return { ...base, instructions: base.instructions + (prompt.enabled && prompt.text ? '\n\n# Buildr Harness 系统提示词\n' + prompt.text : '') };
}
