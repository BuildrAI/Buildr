import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveSourceRoot } from './workspace-source-filesystem.ts';

export type RepositoryCloneState = 'cloning' | 'failed';
export type RepositoryCloneStatus = { state: RepositoryCloneState | null; diagnostic: string | null; startedAt: string | null };
export type RepositoryCloneRequest = { status: 'started' | 'already-running' | 'ready' | 'unavailable'; diagnostic: string | null };

type Entry = { state: 'cloning' | 'failed'; diagnostic: string | null; startedAt: string };

function cloneEnvironment(inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(Object.entries(inherited).filter(([name]) => !name.toUpperCase().startsWith('GIT_')).map(([name, value]) => [name.toUpperCase().startsWith('GIT_') ? name.toUpperCase() : name, value]));
  return { ...environment, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: '0' };
}

function directoryHasContent(location: string): boolean {
  try { return fs.statSync(location).isDirectory() && fs.readdirSync(location).length > 0; } catch { return false; }
}

function tailLines(text: string, count = 4): string {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.slice(-count).join(' ');
}

const activeSupervisors = new Set<{ hasCloning(): boolean }>();

/** Resolve when every supervisor in this process has settled; lets test teardown wait out in-flight clones. */
export function repositoryClonesIdle(): Promise<void> {
  return new Promise(resolve => {
    const check = () => {
      if (![...activeSupervisors].some(supervisor => supervisor.hasCloning())) return resolve();
      setTimeout(check, 20);
    };
    check();
  });
}

/** Owns in-flight git clones keyed by repository id. State is process-local: a missing directory after restart is observable truth, never a lost job. */
export function createRepositoryCloneSupervisor() {
  const states = new Map<string, Entry>();
  const self = { hasCloning: () => [...states.values()].some(entry => entry.state === 'cloning') };
  activeSupervisors.add(self);

  function status(root: string, repositoryId: string): RepositoryCloneStatus {
    const entry = states.get(repositoryId);
    if (!entry) return { state: null, diagnostic: null, startedAt: null };
    return { state: entry.state, diagnostic: entry.diagnostic, startedAt: entry.startedAt };
  }

  function ensure(root: string, repository: { id: string; source: any }): RepositoryCloneRequest {
    if (!repository || repository.source?.type !== 'git' || !repository.source.git?.url) return { status: 'unavailable', diagnostic: null };
    const location = resolveSourceRoot(root, repository.source);
    if (directoryHasContent(location)) { states.delete(repository.id); return { status: 'ready', diagnostic: null }; }
    const current = states.get(repository.id);
    if (current?.state === 'cloning') return { status: 'already-running', diagnostic: null };
    fs.mkdirSync(path.dirname(location), { recursive: true });
    // Stage outside the workspace: an in-flight clone must never be picked up by
    // concurrent git add or presented as an existing directory.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-clone-'));
    const args = ['clone'];
    const branch = repository.source.git.integrationBranch || null;
    if (branch) args.push('--branch', branch, '--single-branch');
    args.push('--', repository.source.git.url, staging);
    const stderrChunks: Buffer[] = [];
    const child = spawn('git', args, { env: cloneEnvironment(), stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', chunk => { stderrChunks.push(Buffer.from(chunk)); });
    states.set(repository.id, { state: 'cloning', diagnostic: null, startedAt: new Date().toISOString() });
    const finish = (diagnostic: string | null) => {
      if (diagnostic !== null) states.set(repository.id, { state: 'failed', diagnostic, startedAt: states.get(repository.id)?.startedAt || new Date().toISOString() });
      else states.delete(repository.id);
    };
    child.on('error', error => { try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ } finish(error.message); });
    child.on('close', code => {
      if (code !== 0) {
        try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
        finish(tailLines(Buffer.concat(stderrChunks).toString('utf8')) || `git clone 退出码 ${code}`);
        return;
      }
      try {
        if (directoryHasContent(location)) { fs.rmSync(staging, { recursive: true, force: true }); states.delete(repository.id); return; }
        try { fs.renameSync(staging, location); }
        catch { fs.cpSync(staging, location, { recursive: true }); fs.rmSync(staging, { recursive: true, force: true }); }
      } catch (error) {
        try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
        finish(error instanceof Error ? error.message : '克隆目录发布失败。');
        return;
      }
      states.delete(repository.id);
    });
    return { status: 'started', diagnostic: null };
  }

  function request(root: string, repository: { id: string; source: any } | undefined): RepositoryCloneRequest {
    if (!repository) return { status: 'unavailable', diagnostic: '代码库不存在。' };
    return ensure(root, repository);
  }

  /** Resolve once no clone is in flight; used by lifecycle shutdown and deterministic tests. */
  function idle(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (![...states.values()].some(entry => entry.state === 'cloning')) return resolve();
        setTimeout(check, 20);
      };
      check();
    });
  }

  function close() {
    states.clear();
  }

  return Object.freeze({ ensure, status, request, idle, close });
}
