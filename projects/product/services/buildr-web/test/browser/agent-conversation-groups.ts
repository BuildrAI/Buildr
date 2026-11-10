import { HISTORY_SCENARIO_CATALOG } from './agent-conversation-history-catalog.ts';

/** 逻辑分组保持可单独选择；完整运行可在隔离页面中复用较重的运行现场。 */
export const AGENT_CONVERSATION_GROUPS = Object.freeze(["setup","history","handoff","tasks","models","recovery","selection","video","children"] as const);
export type AgentConversationGroup = typeof AGENT_CONVERSATION_GROUPS[number];

const HISTORY_SCENARIO_IDS = Object.freeze(HISTORY_SCENARIO_CATALOG.map(scenario => scenario.id));

/** Two static batches run in separate isolated processes. Keeping setup,
 * tasks and recovery together preserves their ordering assumptions, while the
 * alternating history members balance the remaining scenario load. */
export const AGENT_CONVERSATION_BATCHES: ReadonlyArray<ReadonlyArray<string>> = Object.freeze([
  Object.freeze([
    'setup', 'tasks', 'recovery',
    ...HISTORY_SCENARIO_IDS.filter((_, index) => index % 3 === 0),
  ]),
  Object.freeze([
    'handoff', 'models', 'selection', 'video', 'children',
    ...HISTORY_SCENARIO_IDS.filter((_, index) => index % 3 !== 0),
  ]),
]);
export const AGENT_CONVERSATION_WORKERS = AGENT_CONVERSATION_BATCHES.length;

export function parseAgentConversationBatch(raw: string | undefined): string[] | null {
  if (!raw) return null;
  let groups: unknown;
  try { groups = JSON.parse(raw); } catch { throw new Error('BUILDR_AGENT_JOURNEY_BATCH 必须是场景组数组。'); }
  if (!Array.isArray(groups) || groups.length === 0 || new Set(groups).size !== groups.length
    || groups.some(group => !AGENT_CONVERSATION_GROUPS.some(known => known === group)
      && !HISTORY_SCENARIO_IDS.some(known => known === group))) {
    throw new Error('BUILDR_AGENT_JOURNEY_BATCH 必须包含互不重复的有效场景组或独立场景。');
  }
  return groups as string[];
}

/** 场景或准备失败后仍尝试其他组，最终保留真实失败。 */
export async function runAgentConversationBatch(
  groups: Iterable<string>,
  options: {
    preparePage: (index: number, group: string) => Promise<void>;
    runGroup: (group: string) => Promise<void>;
    afterGroup?: (group: string) => void;
    canContinue?: () => boolean;
  },
): Promise<void> {
  const failures: Error[] = [];
  const iterator = groups[Symbol.iterator]();
  let index = 0;
  while (true) {
    // Check before claiming more work: a broken or contaminated environment
    // must leave unclaimed groups available for another environment.
    if (options.canContinue && !options.canContinue()) {
      failures.push(new Error('对话测试现场不可复用，未领取的场景组需由其他现场执行。'));
      break;
    }
    const next = iterator.next();
    if (next.done) break;
    const group = next.value;
    try {
      await options.preparePage(index, group);
      await options.runGroup(group);
    } catch (cause) {
      failures.push(new Error(`对话场景组 ${group} 未完成。`, { cause }));
    } finally {
      try { options.afterGroup?.(group); }
      catch (cause) {
        failures.push(new Error(`对话场景组 ${group} 的执行记录未能保存。`, { cause }));
        break;
      }
    }
    index++;
  }
  if (failures.length) throw new AggregateError(failures, '对话场景批次包含失败。');
}
