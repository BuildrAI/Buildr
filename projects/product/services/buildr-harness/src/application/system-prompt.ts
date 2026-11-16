import path from 'node:path';
import { claimStorage, readPrivate, writePrivate } from '../process/ownership.ts';
import { expected, fail } from '../domain/agent-state.ts';
import { defaultSystemPrompt, systemPromptDigest } from '../domain/system-prompt.ts';
import type { HarnessSystemPrompt, HarnessSystemPromptInput } from '../contracts.ts';

/** One profile owns the editable preference; reading defaults does not write state. */
export class HarnessSystemPromptSettings {
  private readonly dataRoot:string;
  constructor(dataRoot:string) { this.dataRoot=dataRoot; }
  private get file() { return path.join(this.dataRoot,'agent-service','system-prompt.json'); }
  read():HarnessSystemPrompt {
    const saved = readPrivate<{enabled:boolean;text:string;revision:string}>(this.file);
    if (!saved) return {...defaultSystemPrompt};
    if (typeof saved.enabled !== 'boolean' || typeof saved.text !== 'string' || saved.text.length > 16000 || saved.revision !== systemPromptDigest(saved))
      fail('agent_system_prompt_invalid','系统提示词配置无效，已保留原内容。',409);
    return {...defaultSystemPrompt,...saved};
  }
  save(input:HarnessSystemPromptInput):HarnessSystemPrompt {
    if (typeof input.enabled !== 'boolean' || typeof input.text !== 'string' || input.text.length > 16000)
      fail('agent_system_prompt_invalid','系统提示词不得超过 16000 个字符。');
    const lock = claimStorage(this.dataRoot);
    try {
      const current = this.read(); expected(current.revision,input.expectedRevision);
      const next = {...defaultSystemPrompt,enabled:input.enabled,text:input.text,revision:systemPromptDigest(input)};
      if(next.revision !== current.revision) writePrivate(this.file,{enabled:next.enabled,text:next.text,revision:next.revision});
      return next;
    } finally { lock.release(); }
  }
}
