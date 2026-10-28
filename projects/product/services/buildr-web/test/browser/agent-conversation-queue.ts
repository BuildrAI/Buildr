import fs from 'node:fs';
import path from 'node:path';
import { AGENT_CONVERSATION_GROUPS, type AgentConversationGroup } from './agent-conversation-groups.ts';

/**
 * 仅在一次验证中共享的队列。创建目录是原子领取；已领取但未结束的组
 * 不自动重放，避免把崩溃或未知副作用误报为通过。
 */
export function* claimAgentConversationGroups(root: string): Generator<AgentConversationGroup> {
  for (const group of AGENT_CONVERSATION_GROUPS) {
    const directory = path.join(root, group);
    try { fs.mkdirSync(directory); }
    catch (error: any) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    fs.writeFileSync(path.join(directory, 'owner'), `${process.pid}\n`, { flag: 'wx' });
    process.stderr.write(`[agent-conversation-queue] group=${group} worker=${process.pid} phase=claimed\n`);
    yield group;
  }
}

/** 完成标记仅表示已尝试，不代表测试通过；通过与失败由测试进程决定。 */
export function finishAgentConversationGroup(root: string, group: string): void {
  if (!AGENT_CONVERSATION_GROUPS.some(known => known === group)) throw new Error('未知对话测试组。');
  fs.writeFileSync(path.join(root, group, 'finished'), '', { flag: 'wx' });
  process.stderr.write(`[agent-conversation-queue] group=${group} worker=${process.pid} phase=attempted\n`);
}

export function inspectAgentConversationQueue(root: string): {
  unclaimed: string[]; unfinished: string[]; attempted: string[];
} {
  const unclaimed: string[] = [], unfinished: string[] = [], attempted: string[] = [];
  for (const group of AGENT_CONVERSATION_GROUPS) {
    const directory = path.join(root, group);
    if (!fs.existsSync(directory)) unclaimed.push(group);
    else if (!fs.existsSync(path.join(directory, 'finished'))) unfinished.push(group);
    else attempted.push(group);
  }
  return { unclaimed, unfinished, attempted };
}
