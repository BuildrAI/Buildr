import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { prepareAgentRuntime, validateAgentRuntime } from '@buildr-ai/buildr-agent';
import type { AgentRuntimeUnit } from '@buildr-ai/buildr-agent';

export const PREPARED_AGENT_RUNTIME_ENV: any = 'BUILDR_AGENT_PREPARED_RUNTIME_SEED';
const descriptorName: any = 'seed.json';

/** One real runtime preparation per Browser dispatch. Cases copy the immutable
 * unit into their own private data root; this never shares a writable identity. */
export function prepareSharedAgentRuntime({ productRoot, root }: { productRoot: string; root: string }): string {
  const profileRoot: any = path.join(root, 'profile');
  fs.mkdirSync(profileRoot, { recursive: true, mode: 0o700 });
  const runtime: any = prepareAgentRuntime({
    dataRoot: profileRoot,
    packageRoot: path.join(productRoot, 'node_modules', '@buildr-ai', 'buildr-agent'),
  });
  const descriptor: any = path.join(root, descriptorName);
  fs.writeFileSync(descriptor, JSON.stringify({ schemaVersion: 1, runtime }), { mode: 0o600 });
  return descriptor;
}

/** Copy-on-write materialization into the current verification data root.
 * The copied manifest keeps the original content digest; only owned paths move. */
export function acquirePreparedAgentRuntime(dataRoot: string | undefined, env: NodeJS.ProcessEnv = process.env): AgentRuntimeUnit | undefined {
  const descriptor: any = env[PREPARED_AGENT_RUNTIME_ENV];
  if (!descriptor || env.BUILDR_AGENT_PREPARED_RUNTIME_REUSE === '0' || !dataRoot) return undefined;
  const descriptorPath: any = path.resolve(descriptor);
  if (fs.lstatSync(descriptorPath).isSymbolicLink()) throw new Error('prepared_agent_runtime_descriptor_symlink');
  const seed: any = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  if (seed.schemaVersion !== 1 || !seed.runtime || !/^[a-f0-9]{64}$/.test(seed.runtime.digest ?? '')) {
    throw new Error('prepared_agent_runtime_descriptor_invalid');
  }
  const source: any = path.resolve(seed.runtime.directory);
  if (fs.lstatSync(source).isSymbolicLink() || !fs.statSync(source).isDirectory()) {
    throw new Error('prepared_agent_runtime_seed_invalid');
  }
  const directory: any = path.join(path.resolve(dataRoot), 'agent-service', 'process', 'runtimes', seed.runtime.digest);
  if (fs.existsSync(directory)) {
    const existing: any = { ...seed.runtime, directory, entry: path.join(directory, path.relative(source, seed.runtime.entry)), node: path.join(directory, path.basename(seed.runtime.node)) };
    validateAgentRuntime(dataRoot, existing);
    return existing;
  }
  fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  try {
    fs.cpSync(source, directory, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
    const runtime: any = {
      ...seed.runtime,
      directory,
      entry: path.join(directory, path.relative(source, seed.runtime.entry)),
      node: path.join(directory, path.basename(seed.runtime.node)),
    };
    const manifest: any = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json'), 'utf8'));
    fs.writeFileSync(path.join(directory, 'runtime.json'), JSON.stringify({ ...manifest, ...runtime }), { mode: 0o600 });
    validateAgentRuntime(dataRoot, runtime);
    return runtime;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
