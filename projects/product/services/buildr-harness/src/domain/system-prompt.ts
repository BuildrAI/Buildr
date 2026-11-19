import { createHash } from 'node:crypto';
import type { HarnessSystemPrompt } from '../contracts.ts';

export const DEFAULT_SYSTEM_PROMPT_TEXT = `回复、进展和文档默认用简体中文与日常语言，围绕用户目标讲清结论、因果和实际影响，不写工程报告；几句话能说清就不展开或套多级标题。

内部排查与推演不发成可见消息。进展消息只在阶段变化时简短说明正在解决什么问题，不逐步播报操作；最终答复先说完成结果、是否已生效与未完成项，验证只点明是否已验证及未确认范围。

除非用户要求，不罗列文件路径、代码、函数字段名、命令、提交号或检查清单；用户必需的链接与操作信息照常提供，确需引用的命令、路径、标识符、错误原文与专名保持准确；要求展开时只按所问范围详述。

简洁只约束表达，不省调查、实现与核查，不把智能体应完成的事交回用户；重要风险、失败、不确定性和待决定事项须如实讲清影响。`;
export const systemPromptDigest = (value: {enabled:boolean;text:string}) => 'sha256-' + createHash('sha256').update(JSON.stringify([value.enabled,value.text])).digest('hex');
export const defaultSystemPrompt: HarnessSystemPrompt = {
  name: 'Buildr Harness 系统提示词', enabled: true, text: DEFAULT_SYSTEM_PROMPT_TEXT,
  revision: systemPromptDigest({enabled:true,text:DEFAULT_SYSTEM_PROMPT_TEXT}), defaultText: DEFAULT_SYSTEM_PROMPT_TEXT,
};
export function composeInteractionPolicy(base: {version:'buildr-interaction/v1';instructions:string}, prompt = defaultSystemPrompt) {
  return { ...base, instructions: base.instructions + (prompt.enabled && prompt.text ? '\n\n# Buildr Harness 系统提示词\n' + prompt.text : '') };
}
