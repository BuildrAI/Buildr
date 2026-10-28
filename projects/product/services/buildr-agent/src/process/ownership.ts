import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentProcessIdentity, AgentRuntimeUnit } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';

export interface ProcessRecord { identity: AgentProcessIdentity; origin: string; token: string }
export interface ProcessBootstrap { dataRoot: string; profileId: string; runtime: AgentRuntimeUnit; token: string; legacySourceId?: string; autoContinueInterrupted?: boolean }
export const controlRoot = (dataRoot: string) => path.join(path.resolve(dataRoot), 'agent-service', 'process');
export function privateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new AgentServiceError('agent_process_storage_unsafe', '执行后台目录来源不安全。', 409);
  fs.chmodSync(directory, 0o700);
}
export function readPrivate<T>(filename: string): T | undefined {
  let info: fs.Stats;
  try { info = fs.lstatSync(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 1024 * 1024) throw new AgentServiceError('agent_process_storage_unsafe', '执行后台记录来源不安全。', 409);
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new AgentServiceError('agent_process_record_invalid', '执行后台记录损坏，原内容已保留。', 409); }
}
export function writePrivate(filename: string, value: unknown): void {
  privateDirectory(path.dirname(filename));
  if (fs.existsSync(filename)) readPrivate(filename);
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function live(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
interface LockIdentity { pid: number; nonce: string }
export function readLock(dataRoot: string, name: 'owner' | 'startup'): LockIdentity | undefined {
  const filename = path.join(controlRoot(dataRoot), name + '.lock');
  const info = fs.lstatSync(filename, {throwIfNoEntry:false});
  if (!info) return;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new AgentServiceError('agent_process_storage_unsafe', '执行持有记录来源不安全。', 409);
  const identity = readPrivate<LockIdentity>(path.join(filename, 'identity.json'));
  if (!identity && !fs.existsSync(filename)) return;
  if (!identity || !Number.isSafeInteger(identity.pid) || identity.pid < 1 || typeof identity.nonce !== 'string') throw new AgentServiceError('agent_process_record_invalid', '执行持有记录不完整，原内容已保留。', 409);
  return identity;
}
export function claim(dataRoot: string, name: 'owner' | 'startup'): { release(): void } {
  const directory = controlRoot(dataRoot); privateDirectory(directory);
  const filename = path.join(directory, name + '.lock');
  const value = { pid: process.pid, nonce: randomUUID() };
  const stage = path.join(directory, '.' + name + '-' + value.nonce);
  privateDirectory(stage);
  writePrivate(path.join(stage, 'identity.json'), value);
  const publish = () => fs.renameSync(stage, filename);
  try {
    try { publish(); }
    catch (error) {
      if (!fs.existsSync(filename)) throw error;
      const prior = readLock(dataRoot, name);
      if (!prior || live(prior.pid)) throw new AgentServiceError('agent_process_owned', '执行后台正在启动或仍被准确实例持有。', 409);
      const reclaim = filename + '.reclaim';
      try { fs.mkdirSync(reclaim, { mode: 0o700 }); }
      catch { throw new AgentServiceError('agent_process_owned', '持有记录正在核对，未接管已有实例。', 409); }
      try {
        const current = readLock(dataRoot, name);
        if (!current || current.nonce !== prior.nonce || live(current.pid)) throw new AgentServiceError('agent_process_owned', '执行后台持有记录已变化。', 409);
        const retired = stage + '-retired';
        fs.renameSync(filename, retired);
        fs.rmSync(retired, {recursive:true});
        try { publish(); } catch { throw new AgentServiceError('agent_process_owned', '执行后台已被其他入口持有。', 409); }
      } finally { fs.rmdirSync(reclaim); }
    }
  } finally { if (fs.existsSync(stage)) fs.rmSync(stage, {recursive:true}); }
  return { release() {
    if (readLock(dataRoot, name)?.nonce !== value.nonce) return;
    const retired = filename + '-released-' + value.nonce;
    fs.renameSync(filename, retired); fs.rmSync(retired, {recursive:true});
  } };
}
export function readProcessRecord(dataRoot: string): ProcessRecord | undefined {
  return readPrivate<ProcessRecord>(path.join(controlRoot(dataRoot), 'instance.json'));
}
export function clearProcessRecord(dataRoot: string, instanceId: string): void {
  const filename = path.join(controlRoot(dataRoot), 'instance.json');
  if (readPrivate<ProcessRecord>(filename)?.identity.instanceId === instanceId) fs.unlinkSync(filename);
}
