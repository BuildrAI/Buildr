import path from 'node:path';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { claim, controlRoot, live, readLock, readPrivate, readProcessRecord } from './ownership.ts';

/** Called before shutting down a legacy in-process host. No live work migrates. */
export function assertAgentUpgradeIdle(dataRoot: string, options: {legacyHostRunning?: boolean} = {}): void {
  if (readProcessRecord(dataRoot)) return; // Already isolated: the host may detach freely.
  // Readiness can precede publication of instance.json. A verified in-progress
  // isolated startup is not a legacy in-process host.
  if (options.legacyHostRunning && ['owner','startup'].some(name => {const owner=readLock(dataRoot,name as 'owner'|'startup');return owner && live(owner.pid);})) return;
  // Older hosts have no atomic pause/admission contract. A disk-only idle
  // observation cannot rule out a send racing with shutdown or ephemeral work.
  if (options.legacyHostRunning && fs.existsSync(path.join(dataRoot,'agent-service'))) throw new AgentServiceError('agent_legacy_upgrade_requires_exit','首次启用独立执行后台前，请先让旧版工作空闲并关闭旧版；当前实例已保留，未搬迁或中断执行。',409);
  const repository = new ConversationRepository(path.join(dataRoot, 'agent-service'));
  if (repository.hasUnfinishedWork()) throw new AgentServiceError('agent_legacy_process_busy', '旧版仍有执行、待回应、辅助生成或未确认工具；请完成或核对后再升级。', 409);
  const connections = repository.listConnections();
  if (connections.some(value => ['initializing','waiting-browser','checking'].includes(value.view.loginAttempt?.state ?? ''))) throw new AgentServiceError('agent_legacy_process_busy', '旧版仍有登录操作，请完成后再升级。', 409);
  const accounts = readPrivate<{accounts?:Array<{loginAttempt?:{state:string}}>}>(path.join(dataRoot, 'agent-service/model-access/accounts.json'));
  if (accounts?.accounts?.some(value => ['initializing','waiting-browser','checking'].includes(value.loginAttempt?.state ?? ''))) throw new AgentServiceError('agent_legacy_process_busy', '旧版仍有模型登录操作，请完成后再升级。', 409);
}

const held = new AsyncLocalStorage<Set<string>>();
/** Offline maintenance participates in the same owner lock as process startup. */
export function withAgentDataOffline<T>(dataRoot: string, work: () => T): T {
  const key = path.resolve(dataRoot);
  if (held.getStore()?.has(key)) return work();
  const owner = claim(key, 'owner');
  const release = () => { owner.release(); };
  try {
    if (readProcessRecord(key)) throw new AgentServiceError('agent_process_offline_unconfirmed', '执行后台退出未确认，不能改写其私有资料。', 409);
    const stopped = readPrivate<{confirmed:boolean}>(path.join(controlRoot(key), 'last-stop.json'));
    if (stopped && !stopped.confirmed) throw new AgentServiceError('agent_process_offline_unconfirmed', '原执行或工具尚待核对，私有资料已保留。', 409);
    assertAgentUpgradeIdle(key);
    const result = held.run(new Set([...(held.getStore() ?? []), key]), work);
    if (result instanceof Promise) return result.finally(release) as T;
    release(); return result;
  } catch (error) { release(); throw error; }
}
