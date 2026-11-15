import { randomUUID } from 'node:crypto';

/** The reminder only joins the next request; it never replaces assistant prose. */
const reminder = '（系统提醒）你已经连续几步只调用工具、没有可见说明。按工作指引，在下一段工具执行前先用一句简短的话说明接下来做什么及其目的，再继续调用工具；同一目的的连续调用可以共用一次说明。';

type ReminderState = { silent: number; reminded: boolean };
const reminderSource = 'buildr:narration-reminder';
/** 只有真实用户发言开启新的一段；插件注入的上下文与提醒不属于用户说明。 */
function userInput(event: any): boolean {
  const kind = event?.data?.source?.kind;
  return !kind || kind === 'user';
}
function visibleAssistantText(content: unknown): boolean {
  if (typeof content === 'string') return Boolean(content.trim());
  return Array.isArray(content) && content.some((part: any) => (part?.type === 'text' || part?.type === 'input_text') && String(part.text ?? '').trim());
}

/**
 * Buildr 要求每段工具执行前有可见说明。模型偶尔会连续多步只调用工具，
 * 这里按连续无文本步数注入一次提醒：不拦截工具、不事后补写，出现可见文字即重置。
 */
export const inject: string[] = [];

export function apply(ctx: any, config: { threshold?: number } = {}): void {
  const threshold = Math.max(2, Math.trunc(Number(config.threshold ?? 6)) || 6);
  const states = new WeakMap<object, ReminderState>();
  const stateOf = (session: object): ReminderState => {
    let current = states.get(session);
    if (!current) { current = { silent: 0, reminded: false }; states.set(session, current); }
    return current;
  };
  ctx.on('session/event', (session: any, event: any) => {
    const current = stateOf(session);
    if (event?.type === 'assistant/message') {
      if (visibleAssistantText(event.data?.message?.content)) { current.silent = 0; current.reminded = false; }
      else current.silent += 1;
      return;
    }
    // 自己注入的提醒会以 user/message 回放：不能把它当成用户说明重置计数，否则同一段会反复提醒。
    if (event?.type === 'turn/start' || event?.type === 'user/message' && userInput(event)) {
      current.silent = 0; current.reminded = false;
    }
  });
  ctx.on('agent/pre-step', async ({ agent, step, signal }: any, next: () => Promise<any>) => {
    const decision = await next();
    if (decision?.kind === 'reject' || signal?.aborted || !(step > 1)) return decision;
    const current = stateOf(agent.session);
    if (current.reminded || current.silent < threshold) return decision;
    const messages = Array.isArray(decision.messages) ? decision.messages : [];
    if (messages.some((message: any) => message?.source?.kind === reminderSource)) return decision;
    current.reminded = true;
    return { ...decision, messages: [...messages, reminderMessage()] };
  });
}

function reminderMessage(): any {
  return { id: randomUUID(), role: 'user', content: [{ type: 'text', text: reminder }], source: { kind: reminderSource } };
}
