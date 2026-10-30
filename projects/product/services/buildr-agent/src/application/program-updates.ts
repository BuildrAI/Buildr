import { AgentServiceError } from '../domain/agent-state.ts';
import type { AgentProgramManager, ConnectionView, ProgramUpdateView } from '../contracts.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../executors/program-policy.ts';
import { readProgramRelease } from '../executors/program-release.ts';

/** Observations only: never connects, installs or changes a binding. */
export class ProgramUpdates {
  private observations = new Map<string, ProgramUpdateView>();
  private pending = new Map<string, Promise<ProgramUpdateView>>();
  private controllers = new Set<AbortController>();
  private connections: () => ConnectionView[];
  private programs: AgentProgramManager;
  private now: () => string;
  private release: typeof readProgramRelease;
  constructor(connections: () => ConnectionView[], programs: AgentProgramManager,
    now = () => new Date().toISOString(), release = readProgramRelease) {
    this.connections = connections; this.programs = programs; this.now = now; this.release = release;
  }
  private empty(connection: ConnectionView): ProgramUpdateView {
    let policy: ReturnType<typeof nativeProgramPolicy> | undefined;
    try { policy = nativeProgramPolicy(connection.provider); } catch { /* Custom executors need their own release adapter. */ }
    return { connectionId: connection.id, revision: connection.revision, label: connection.label,
      provider: connection.provider, executable: connection.executable, status: connection.executable ? 'unchecked' : 'not-connected',
      versionKind: connection.provider === 'qoder' ? 'package' : 'program',
      packageName: policy?.package.replace(/@[^@]+$/, '') ?? connection.provider,
      updateUrl: policy?.url ?? '',
      ...(!policy ? {status:'unknown' as const,diagnostic:'该程序尚未提供官方版本检查方式。'} : {}) };
  }
  list(): { programs: ProgramUpdateView[] } {
    return { programs: this.connections().map(connection => {
      const previous = this.observations.get(connection.id);
      return previous && previous.revision === connection.revision && previous.executable === connection.executable ? previous : this.empty(connection);
    }) };
  }
  async check(input: { connectionId?: string } = {}): Promise<{ programs: ProgramUpdateView[] }> {
    const connections = this.connections().filter(connection => !input.connectionId || connection.id === input.connectionId);
    if (input.connectionId && !connections.length) throw new AgentServiceError('agent_connection_not_found', '未找到指定智能体接入。', 404);
    const observed = await Promise.all(connections.map(connection => this.observe(connection)));
    return { programs: this.list().programs.map(view => observed.some(item => item.connectionId === view.connectionId && item.status === 'stale')
      ? {...view, status: 'stale', diagnostic: '程序绑定已变化，请重新检查。'} : view) };
  }
  private observe(connection: ConnectionView): Promise<ProgramUpdateView> {
    const key = connection.id + ':' + connection.revision + ':' + connection.executable;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = this.inspect(connection).then(view => {
      const current = this.connections().find(item => item.id === connection.id);
      // Never let a late result replace a newer binding's observation.
      if (current?.revision === connection.revision && current.executable === connection.executable) this.observations.set(connection.id, view);
      return view;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
  private async inspect(connection: ConnectionView): Promise<ProgramUpdateView> {
    const view = this.empty(connection);
    if (!connection.executable) return view;
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 22_000); timer.unref();
    try {
      const catalog = await this.programs.discover({ provider: connection.provider, boundExecutable: connection.executable, signal: controller.signal });
      const candidate = catalog.candidates[0];
      if (!candidate?.version) throw new Error('program_unavailable');
      view.currentVersion = candidate.version;
      view.compatible = isCompatibleProgram(connection.provider, candidate.version);
      const release = await this.release(connection.provider, connection.executable, controller.signal);
      view.latestVersion = release.latestVersion;
      view.currentReleaseVersion = connection.provider === 'qoder' ? release.currentReleaseVersion : candidate.version;
      view.releaseSource = release.source;
      if (connection.provider === 'qoder' && !release.currentReleaseVersion) {
        view.status = 'unknown'; view.diagnostic = '无法核实当前配套软件包版本，不能将程序版本与软件包版本直接比较。';
      } else {
        const comparison = compareVersions(view.currentReleaseVersion!, release.latestVersion);
        view.status = comparison === null ? 'unknown' : comparison < 0 ? 'available' : comparison > 0 ? 'ahead' : 'latest';
        if (comparison === null) view.diagnostic = '版本格式无法可靠比较，请查看官方发布信息。';
      }
    } catch {
      view.status = 'unknown';
      view.diagnostic = controller.signal.aborted ? '检查超时或已取消，请稍后重试。' : view.currentVersion ? '无法读取官方发布版本，请检查网络后重试。' : '无法读取绑定程序版本；请检查原程序路径，不会自动改用其他程序。';
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
    view.checkedAt = this.now();
    const current = this.connections().find(item => item.id === connection.id);
    if (current?.revision !== connection.revision || current.executable !== connection.executable) {
      view.status = 'stale'; view.diagnostic = '程序绑定已变化，请重新检查。';
    }
    return view;
  }
  close(): void { for (const controller of this.controllers) controller.abort(); }
}

/** SemVer ordering, including numeric prerelease identifiers and build metadata. */
export function compareVersions(left: string, right: string): number | null {
  const parse = (value: string) => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value);
    if (!match || match[4]?.split('.').some(part => /^0\d+$/.test(part))) return null;
    return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') };
  };
  const a = parse(left), b = parse(right); if (!a || !b) return null;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i]! < b.core[i]! ? -1 : 1;
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i]; if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
