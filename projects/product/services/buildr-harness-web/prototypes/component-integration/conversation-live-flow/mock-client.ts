import type { AgentConversationsClient } from '../../features/agent-conversations/api/agent-conversations-api';
import type { ConversationView } from '../../features/agent-conversations/types';
import { connection, model, sampleConversation } from './fixtures';

/** The real history reads this in-memory adapter. Unimplemented actions never fall through to a host. */
export function mockConversationClient(current: { current: ConversationView }): AgentConversationsClient {
  const methods: Partial<AgentConversationsClient> = {
    connections: async () => ({ connections: [connection] }),
    modelCatalog: async () => ({ models: [model], hasSnapshot: true }),
    pending: async () => ({ conversations: [] }),
    listAll: async options => {
      const rows = [current.current, { ...sampleConversation(), id: 'earlier-demo', title: '核对服务启动范围', activity: { version: 1, seenThrough: 1, updatedAt: new Date().toISOString(), active: false }, run: { ...sampleConversation().run!, id: 'earlier-run', status: 'completed' as const } }];
      const filtered = rows.filter(row => (!options?.query || row.title.includes(options.query)) && (!options?.workspaceId || row.workspaceId === options.workspaceId) && (!options?.activeOnly || row.run?.status === 'running') && (!options?.hidden || row.hidden));
      return { conversations: filtered, total: filtered.length, stats: { agents: current.current.run?.status === 'running' ? [{ label: 'codex', count: 1 }] : [], models: current.current.run?.status === 'running' ? [{ label: 'gpt-6.1-sol', count: 1 }] : [] } };
    },
    read: async () => current.current,
    seen: async () => ({ activity: { version: 1, seenThrough: 1, updatedAt: new Date().toISOString(), active: false } }),
    subscribe: async (_workspaceId, _id, signal) => new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true }); }),
  };
  return new Proxy(methods, { get(target, key) { if (key in target) return target[key as keyof AgentConversationsClient]; return async () => { throw new Error('这是模拟页面，此操作不会连接真实服务。'); }; } }) as AgentConversationsClient;
}
