import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { agentRuntimePackageTree } from '../../../buildr-agent/tools/package-runtime.ts';
import { withExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

const buildrRoot = path.resolve(import.meta.dirname, '../..');

/** Building source and copying it into the host package share one ownership boundary. */
export function withDevelopmentAgentPreparationLock<T>(serviceRoot: string, action: () => T): T {
  const destination = path.join(serviceRoot, 'node_modules/@buildr-ai/buildr-agent');
  return withExclusiveFileLock(path.join(serviceRoot, 'node_modules/.buildr-agent-preparation.lock'), destination,
    action, { timeoutMs: 30_000 });
}

/** Staging garbage is not the published package; cleanup must not revoke a valid adoption. */
function cleanupPreparationTree(directory: string): void {
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    process.stderr.write(`${JSON.stringify({ code: 'agent_preparation_cleanup_retained', directory,
      ...(typeof code === 'string' && /^[A-Z_]+$/.test(code) ? { internalCode: code } : {}) })}\n`);
  }
}

/** Materialize the same public package consumed by an installed Buildr. */
export function prepareDevelopmentAgent({
  serviceRoot = buildrRoot,
  agentRoot = path.resolve(serviceRoot, '../buildr-agent'),
  build = true,
}: { serviceRoot?: string; agentRoot?: string; build?: boolean } = {}): string {
  return withDevelopmentAgentPreparationLock(serviceRoot, () => materializeDevelopmentAgent({ serviceRoot, agentRoot, build }));
}

function materializeDevelopmentAgent({ serviceRoot, agentRoot, build }: { serviceRoot: string; agentRoot: string; build: boolean }): string {
  if (build) {
    const result = spawnSync(process.execPath, [path.join(agentRoot, 'tools/build.ts')], { cwd: agentRoot, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`agent_preparation_build_failed: ${result.error?.message ?? result.status}`);
  }
  const finalDestination = path.join(serviceRoot, 'node_modules/@buildr-ai/buildr-agent');
  fs.mkdirSync(path.dirname(finalDestination), { recursive: true });
  const tree=agentRuntimePackageTree(agentRoot);
  if(tree.matches(finalDestination))return finalDestination;
  const destination = fs.mkdtempSync(path.join(path.dirname(finalDestination), '.buildr-agent-stage-'));
  try {
    tree.materialize(destination);
    const previous = `${destination}-previous`;
    if (fs.existsSync(finalDestination)) fs.renameSync(finalDestination, previous);
    try { fs.renameSync(destination, finalDestination); }
    catch (error) { if (fs.existsSync(previous)) fs.renameSync(previous, finalDestination); throw error; }
    cleanupPreparationTree(previous);
    return finalDestination;
  } finally { cleanupPreparationTree(destination); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.stdout.write(`${JSON.stringify({ status: 'passed', root: prepareDevelopmentAgent({ build: !process.argv.includes('--no-build') }) })}\n`);
}
