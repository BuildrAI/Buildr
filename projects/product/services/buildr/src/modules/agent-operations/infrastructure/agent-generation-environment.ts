import fs from 'node:fs';
import path from 'node:path';
import { insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { agentFailure, type AgentGenerationEnvironment } from '../domain/agent-operations.ts';

type FilesystemIdentity = { path: string; device: bigint; inode: bigint; directory: boolean };
const identities = new WeakMap<AgentGenerationEnvironment, { cwd: FilesystemIdentity; roots: FilesystemIdentity[] }>();
function identity(location: string): FilesystemIdentity {
  const stat = fs.statSync(location, { bigint: true });
  return { path: location, device: stat.dev, inode: stat.ino, directory: stat.isDirectory() };
}
function sameIdentity(left: FilesystemIdentity, right: FilesystemIdentity): boolean {
  return left.path === right.path && left.device === right.device && left.inode === right.inode && left.directory === right.directory;
}

/** Business supplies authorized locations; this port validates and captures them, without discovering more. */
export function resolveAgentGenerationEnvironment(cwd: string, environment?: AgentGenerationEnvironment): AgentGenerationEnvironment | undefined {
  if (environment === undefined) return undefined;
  if (!environment || environment.kind !== 'workspace-read-only' || !Array.isArray(environment.readableRoots) || !environment.readableRoots.length || environment.readableRoots.length > 128) throw agentFailure('agent_environment_invalid', '本次读取范围无效或超过上限。');
  let bytes = 0;
  const roots = environment.readableRoots.map(root => {
    if (typeof root !== 'string' || !path.isAbsolute(root) || /[\0\r\n]/.test(root) || root.length > 32_768 || (bytes += Buffer.byteLength(root)) > 128 * 1024) throw agentFailure('agent_environment_invalid', '本次读取范围必须是明确、有界的本机位置。');
    try {
      const real = fs.realpathSync(root), stat = fs.statSync(real);
      if ((!stat.isDirectory() && !stat.isFile()) || real === path.parse(real).root) throw new Error('unsupported root');
      return real;
    } catch { throw agentFailure('agent_environment_unavailable', '本次读取范围当前不可用。', 409); }
  });
  const readableRoots = [...new Set(roots)].sort();
  const actualCwd = fs.realpathSync(cwd);
  if (!readableRoots.some(root => fs.statSync(root).isDirectory() && insideFilesystemPath(root, actualCwd))) throw agentFailure('agent_environment_invalid', '本次工作位置不在明确的只读范围内。');
  const captured: AgentGenerationEnvironment = { kind: 'workspace-read-only', readableRoots };
  identities.set(captured, { cwd: identity(actualCwd), roots: readableRoots.map(identity) });
  return captured;
}

export function assertAgentGenerationEnvironmentCurrent(cwd: string, environment?: AgentGenerationEnvironment): void {
  if (!environment) return;
  const captured = identities.get(environment);
  try {
    const current = resolveAgentGenerationEnvironment(cwd, environment)!;
    const observed = identities.get(current)!;
    if (!captured || JSON.stringify(current) !== JSON.stringify(environment) || !sameIdentity(captured.cwd, observed.cwd) || captured.roots.length !== observed.roots.length || captured.roots.some((root, index) => !sameIdentity(root, observed.roots[index]))) throw new Error('changed identity');
  } catch { throw agentFailure('agent_environment_changed', '本次读取位置已变化，请重新生成。', 409); }
}
