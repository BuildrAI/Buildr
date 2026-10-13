import { connectionFailure, type ConnectionProvider } from '../domain/connection.ts';
export type { ConnectionProvider } from '../domain/connection.ts';
/** Explicit provider selection; adding a type never changes another type's schema or actions. */
export class ConnectionProviderRegistry {
  private readonly providers: Map<string, ConnectionProvider>;
  constructor(providers: ConnectionProvider[]) { this.providers = new Map(); for (const provider of providers) { if (this.providers.has(provider.type)) throw new Error('Duplicate connection provider.'); this.providers.set(provider.type, provider); } }
  get(type: string, category: string): ConnectionProvider {
    const provider = this.providers.get(type);
    if (!provider || provider.category !== category) throw connectionFailure('connection_type_unsupported', '该连接类型尚未安装对应的操作能力。', 422);
    return provider;
  }
}
