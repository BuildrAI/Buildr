import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
export type DshConnection = { id: string; agentId: string; label: string; executable: string; dshHome: string; appPath: string; channel: 'released' | 'development'; version: string; scopeIdentity: string; disconnected: boolean };
export class DshDesktopRepository {
  private file: string;
  constructor(dataRoot: string) { this.file = path.join(dataRoot, 'dsh-desktop', 'connections.json'); }
  private assertDirectory() {
    try { const stat = fs.lstatSync(path.dirname(this.file)); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw this.invalid(); }
  }
  private invalid() { return Object.assign(new Error('DSH 本机关联配置无法读取；原文件保留。'), { code: 'agent_dsh_local_state_invalid', status: 409 }); }
  read(): DshConnection[] {
    this.assertDirectory();
    try {
      const stat = fs.lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw this.invalid();
      const state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const text = (v: unknown, limit = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= limit && !/[\u0000-\u001f\u007f]/.test(v);
      if (state?.schemaVersion !== 'buildr.dsh-desktop-connections/v1' || Object.keys(state).length !== 2 || !Array.isArray(state.connections) || state.connections.length > 64 || new Set(state.connections.map((c: DshConnection) => c?.id)).size !== state.connections.length || !state.connections.every((c: DshConnection) => c && Object.keys(c).length === 10 && /^dsh-[a-f0-9-]{36}$/.test(c.id) && /^agent-[a-f0-9-]{36}$/.test(c.agentId) && text(c.label, 100) && text(c.version, 100) && /^sha256-[a-f0-9]{64}$/.test(c.scopeIdentity) && [c.executable, c.dshHome, c.appPath].every(v => text(v) && path.isAbsolute(v)) && ['released', 'development'].includes(c.channel) && typeof c.disconnected === 'boolean')) throw this.invalid();
      return state.connections;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw this.invalid(); }
  }
  mutate(change: (connections: DshConnection[]) => void) {
    this.assertDirectory(); fs.mkdirSync(path.dirname(this.file), { recursive: true });
    return withExclusiveFileLock(this.file + '.lock', this.file, () => {
      this.assertDirectory(); const connections = this.read(); change(connections);
      atomicWriteJson(this.file, { schemaVersion: 'buildr.dsh-desktop-connections/v1', connections }, { mode: 0o600 });
      return structuredClone(connections);
    }, { timeoutMs: 1000, assertSafe: () => this.assertDirectory() });
  }
}
