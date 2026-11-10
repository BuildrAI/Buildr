import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareAgentRuntime, validateAgentRuntime, type AgentRuntimeUnit } from '../../src/index.ts';
import { controlRoot } from '../../src/process/ownership.ts';
import { phase } from './process-timing.ts';
import { shareFixtureNode } from './immutable-process-inputs.ts';

const seedKey = 'BUILDR_AGENT_TEST_FIXTURE_ROOT';
const packageSource = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent');

function prepare(dataRoot: string, packageRoot: string, env: NodeJS.ProcessEnv): AgentRuntimeUnit {
  fs.cpSync(packageSource, packageRoot, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
  fs.copyFileSync(path.join(import.meta.dirname, '../integration/fixtures/agent-process-entry.mjs'), path.join(packageRoot, 'build/process-fixture.mjs'));
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), JSON.stringify({ version: 'fixture' }));
  return shareFixtureNode(prepareAgentRuntime({ dataRoot, packageRoot, entry: 'build/process-fixture.mjs' }), env);
}

/** One real preparation per run; cases only consume independent private views.
 * Nothing is persisted between runs or adopted from an unbound cache. */
export function withPreparedProcessFixture(run: (env: NodeJS.ProcessEnv) => number, env: NodeJS.ProcessEnv = process.env, producer?: (dataRoot: string) => AgentRuntimeUnit): number {
  if (process.platform === 'win32' || env.BUILDR_AGENT_TEST_FIXTURE_REUSE === '0' || env[seedKey]) return run(env);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-prepared-fixture-'));
  try {
    const runtime = phase('prepare-shared-fixture', () => producer
      ? producer(path.join(root, 'profile')) : prepare(path.join(root, 'profile'), path.join(root, 'package'), env));
    fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(runtime), { mode: 0o600 });
    return run({ ...env, [seedKey]: root });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** Use only where preparation is a precondition, never the behavior under test. */
export function acquirePreparedProcessFixture(dataRoot: string, env: NodeJS.ProcessEnv = process.env): AgentRuntimeUnit {
  const root = env[seedKey];
  if (!root) return phase('prepare-runtime', () => prepare(dataRoot, path.join(path.dirname(dataRoot), 'package'), env));
  return phase('acquire-prepared-fixture', () => {
    if (!path.isAbsolute(root) || fs.lstatSync(root).isSymbolicLink()) throw new Error('Unsafe prepared fixture root');
    const seed: AgentRuntimeUnit = JSON.parse(fs.readFileSync(path.join(root, 'fixture.json'), 'utf8'));
    validateAgentRuntime(path.join(root, 'profile'), seed);
    const directory = path.join(controlRoot(dataRoot), 'runtimes', seed.digest);
    if (fs.existsSync(directory)) throw new Error('Prepared fixture destination already exists');
    const runtime = { ...seed, directory, node: path.join(directory, path.basename(seed.node)), entry: path.join(directory, path.relative(seed.directory, seed.entry)) };
    fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
    try {
      // Copy-on-write files have distinct inodes: even a test that changes mode
      // and corrupts its own runtime cannot alter the seed or another case.
      fs.cpSync(seed.directory, directory, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json'), 'utf8'));
      fs.writeFileSync(path.join(directory, 'runtime.json'), JSON.stringify({ ...manifest, ...runtime }), { mode: 0o600 });
      validateAgentRuntime(dataRoot, runtime);
      return runtime;
    } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
  });
}
