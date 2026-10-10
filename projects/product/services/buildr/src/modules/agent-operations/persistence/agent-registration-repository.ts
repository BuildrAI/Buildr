import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { agentFailure, type AgentRegistration } from '../domain/agent-operations.ts';

type Registry = { schemaVersion: 'buildr.agent-registrations/v1'; defaultAgentId: string | null; agents: AgentRegistration[] };
export const registrationRevision = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty = (): Registry => ({ schemaVersion: 'buildr.agent-registrations/v1', defaultAgentId: null, agents: [] });
const fields = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
function canonical(value: unknown): Registry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw agentFailure('agent_registry_invalid', '本机智能体（Agent）登记无法读取。', 409);
  const item = value as Registry;
  if (!fields(item, ['schemaVersion', 'defaultAgentId', 'agents']) || item.schemaVersion !== 'buildr.agent-registrations/v1' || !Array.isArray(item.agents) || item.agents.length > 32) throw agentFailure('agent_registry_invalid', '本机智能体（Agent）登记格式无效。', 409);
  const ids = new Set<string>();
  for (const agent of item.agents) {
    if (!agent || typeof agent !== 'object' || !fields(agent, ['id', 'kind', 'label', 'executable', 'codexHome', 'version']) || !/^agent-[a-f0-9-]{36}$/.test(agent.id) || ids.has(agent.id) || agent.kind !== 'codex' || typeof agent.label !== 'string' || !agent.label.trim() || agent.label.length > 100 || !path.isAbsolute(agent.executable || '') || !path.isAbsolute(agent.codexHome || '') || typeof agent.version !== 'string' || !agent.version) throw agentFailure('agent_registry_invalid', '本机智能体（Agent）登记条目无效。', 409);
    ids.add(agent.id);
  }
  if (item.defaultAgentId !== null && !ids.has(item.defaultAgentId)) throw agentFailure('agent_registry_invalid', '默认智能体（Agent）没有对应登记。', 409);
  return item;
}
export class AgentRegistrationRepository {
  readonly file: string;
  constructor(dataRoot: string) { this.file = path.join(dataRoot, 'agent-registrations.json'); }
  read(): { registry: Registry; revision: string } {
    let registry: Registry;
    try {
      const stat = fs.lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) throw agentFailure('agent_registry_invalid', '本机智能体（Agent）登记文件无效。', 409);
      registry = canonical(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') registry = empty();
      else if ((error as { code?: string }).code === 'agent_registry_invalid') throw error;
      else throw agentFailure('agent_registry_invalid', '本机智能体（Agent）登记无法读取，请由智能体核对本机文件。', 409);
    }
    return { registry: structuredClone(registry), revision: registrationRevision(registry) };
  }
  mutate(expectedRevision: string, change: (current: Registry) => Registry) {
    if (typeof expectedRevision !== 'string' || !expectedRevision) throw agentFailure('agent_revision_required', '接入或选择需要已观察的登记版本。');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      return withExclusiveFileLock(this.file + '.lock', this.file, () => {
        const current = this.read();
        if (current.revision !== expectedRevision) throw agentFailure('agent_registry_changed', '智能体（Agent）登记或默认选择已变化，请刷新后重试。', 409);
        const next = canonical(change(current.registry));
        if (registrationRevision(next) !== current.revision) atomicWriteJson(this.file, next, { mode: 0o600 });
        return this.read();
      }, { timeoutMs: 0 });
    } catch (error) {
      if ((error as { code?: string }).code === 'buildr_exclusive_file_lock_timeout') throw agentFailure('agent_registry_busy', '智能体（Agent）登记正在被修改，请稍后重试。', 409);
      throw error;
    }
  }
}
