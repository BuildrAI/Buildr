import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import type { AgentProgramManager, ConnectionView, ProgramUpgradeInput, ProgramUpgradeView } from '../contracts.ts';
import type { ConnectionApplication } from './connection-application.ts';
import type { ProgramUpdates } from './program-updates.ts';
import { compareVersions } from './program-updates.ts';
import { expected, fail, safeDiagnostic } from '../domain/agent-state.ts';
import { isProgramReleaseVersion } from '../executors/program-policy.ts';

type Attempt = { view: ProgramUpgradeView; observed: ConnectionView; controller: AbortController; work?: Promise<void> };
const active = (view: ProgramUpgradeView) => ['downloading','waiting','restarting'].includes(view.state);

/** One explicit version target per connection. No global install or prompt replay. */
export class ProgramUpgrades {
  private attempts = new Map<string, Attempt>();
  private restored = new Map<string, ProgramUpgradeView>();
  private closing = false;
  private options: { root: string; connections: ConnectionApplication; programs: AgentProgramManager; checks: ProgramUpdates; release(connectionId: string): Promise<boolean>; now(): string };
  constructor(options: ProgramUpgrades['options']) { this.options = options; }
  private file(id: string): string { return path.join(this.options.root, 'program-upgrades', id + '.json'); }
  private persist(view: ProgramUpgradeView): void {
    const file = this.file(view.connectionId); fs.mkdirSync(path.dirname(file), {recursive:true,mode:0o700});
    const temporary = file + '.' + randomUUID();
    try { fs.writeFileSync(temporary, JSON.stringify(view) + '\n', {mode:0o600,flag:'wx'}); fs.renameSync(temporary,file); }
    finally { fs.rmSync(temporary,{force:true}); }
  }
  read(id: string): ProgramUpgradeView | undefined {
    this.options.connections.get(id);
    const attempt = this.attempts.get(id); if (attempt) return structuredClone(attempt.view);
    if (this.restored.has(id)) return structuredClone(this.restored.get(id));
    const file = this.file(id); if (!fs.existsSync(file)) return;
    let view: ProgramUpgradeView;
    try {
      const info = fs.lstatSync(file); if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error();
      view = JSON.parse(fs.readFileSync(file,'utf8'));
      if (view.connectionId !== id || typeof view.id !== 'string' || typeof view.expectedVersion !== 'string' || typeof view.executable !== 'string' || typeof view.updatedAt !== 'string' || !['downloading','waiting','restarting','completed','failed','interrupted'].includes(view.state)) throw new Error();
    } catch { view = {id:'unconfirmed',connectionId:id,expectedVersion:'unknown',executable:this.options.connections.get(id).executable ?? '',state:'interrupted',message:'上次更新记录无法核实，请重新检查当前程序后重试。',updatedAt:this.options.now()}; }
    if (active(view)) { view.state = 'interrupted'; view.message = '后台已重启，上次更新未确认完成；不会自动重放，请重新检查后重试。'; this.persist(view); }
    this.restored.set(id,view); return structuredClone(view);
  }
  begin(id: string, input: ProgramUpgradeInput): ProgramUpgradeView {
    if (this.closing) fail('agent_service_closing','智能体后台正在退出。',503);
    const connection = this.options.connections.get(id);
    const current = this.attempts.get(id);
    if (current?.work) {
      if (current.view.expectedVersion === input.expectedVersion && current.observed.revision === input.expectedRevision && current.observed.executable === connection.executable) return structuredClone(current.view);
      fail('agent_program_update_busy','该智能体已有更新正在进行，请等待完成。',409);
    }
    expected(connection.revision,input.expectedRevision);
    if (!connection.enabled || !connection.executable) fail('agent_program_not_connected','请先准备并连接该智能体。',409);
    if (!isProgramReleaseVersion(input.expectedVersion)) fail('agent_program_update_version_invalid','更新版本无效。');
    const attempt: Attempt = {view:{id:randomUUID(),connectionId:id,expectedVersion:input.expectedVersion,executable:connection.executable,state:'downloading',message:'正在核对并下载更新。',updatedAt:this.options.now()},observed:connection,controller:new AbortController()};
    this.persist(attempt.view); this.attempts.set(id,attempt); this.restored.delete(id);
    attempt.work = this.run(attempt).catch(error => {
      this.update(attempt,this.closing?'interrupted':'failed',this.closing?'后台已退出，更新未确认完成；请重新检查后重试。':'更新未完成，当前接入和记录已保留。' + safeDiagnostic(error));
    }).finally(()=>{attempt.work=undefined;});
    return structuredClone(attempt.view);
  }
  private update(attempt: Attempt, state: ProgramUpgradeView['state'], message: string): void {
    attempt.view.state=state;attempt.view.message=message;attempt.view.updatedAt=this.options.now();this.persist(attempt.view);
  }
  private stillBound(attempt: Attempt): void {
    const current=this.options.connections.get(attempt.view.connectionId),old=attempt.observed;
    if (current.executable!==old.executable || current.configPath!==old.configPath || current.enabled!==old.enabled) fail('agent_revision_conflict','程序绑定已变化，请重新检查。',409);
  }
  private async run(attempt: Attempt): Promise<void> {
    const {view,observed,controller}=attempt,signal=controller.signal,id=view.connectionId;
    const checked=(await this.options.checks.check({connectionId:id})).programs.find(item=>item.connectionId===id)!;
    signal.throwIfAborted();this.stillBound(attempt);
    if (checked.latestVersion!==view.expectedVersion || !checked.currentVersion) fail('agent_program_update_target_changed','官方发布版本或当前程序已变化，请重新检查。',409);
    const previous=observed.provider==='qoder'?checked.currentReleaseVersion:checked.currentVersion;
    const order=previous?compareVersions(previous,view.expectedVersion):null;
    if (order!==null && order>0 || order===0 && checked.managed) fail('agent_program_update_not_newer','目标版本不高于当前版本，无需更新。',409);
    const executable=await this.options.programs.install({provider:observed.provider,version:view.expectedVersion,signal,progress:message=>this.update(attempt,'downloading',message)});
    signal.throwIfAborted();this.stillBound(attempt);
    const catalog=await this.options.programs.discover({provider:observed.provider,boundExecutable:executable,signal});
    const candidate=catalog.candidates.find(item=>item.compatible&&item.version);
    if (!candidate?.version || (compareVersions(candidate.version,checked.currentVersion)??-1)<0) fail('agent_program_update_verification_failed','新版程序校验失败或会降级，未切换原接入。');
    view.installedExecutable=executable;view.currentVersion=candidate.version;
    this.update(attempt,'waiting','下载完成，等待当前工作结束后重启。');
    while (true) {
      signal.throwIfAborted();this.stillBound(attempt);
      const release=this.options.connections.acquireProgramChange(id);
      if (release) {
        try {
          if (await this.options.release(id)) {
            signal.throwIfAborted();this.stillBound(attempt);
            this.update(attempt,'restarting','正在切换并重启智能体。');
            await this.options.connections.replaceProgram(id,observed,executable);
            this.update(attempt,'completed','更新完成，下一次执行将使用新版。');
            // Version checking may fail independently after a successful activation.
            void this.options.checks.check({connectionId:id}).catch(()=>{});
            return;
          }
        } finally { release(); }
      }
      await wait(1000,undefined,{signal});
    }
  }
  activity(): Array<{kind:string;count:number}> { const count=[...this.attempts.values()].filter(item=>item.work).length;return count?[{kind:'program-upgrade',count}]:[]; }
  beginClosing(): void { this.closing=true;for(const attempt of this.attempts.values())if(attempt.view.state!=='restarting')attempt.controller.abort(); }
  async close(): Promise<void> { this.beginClosing();await Promise.allSettled([...this.attempts.values()].map(item=>item.work)); }
}
