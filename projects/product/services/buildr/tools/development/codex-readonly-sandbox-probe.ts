import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { CodexAppServer } from '../../src/modules/agent-operations/infrastructure/codex-app-server.ts';
import { CODEX_SHELL_ENVIRONMENT, createCodexReadOnlyProfile } from '../../src/modules/agent-operations/infrastructure/codex-readonly-profile.ts';
import { resolveAgentGenerationEnvironment } from '../../src/modules/agent-operations/infrastructure/agent-generation-environment.ts';
import { CODEX_GIT_READ_ENVIRONMENT } from '../../src/modules/agent-operations/infrastructure/codex-git-read-support.ts';
import type { AgentGenerationEnvironment } from '../../src/modules/agent-operations/domain/agent-operations.ts';

// This opt-in probe uses command/exec (the native sandbox), never turn/start,
// thread/shellCommand or process/spawn. It registers no Buildr Agent and writes
// neither the user's configuration nor credentials. Only owned fixtures change.
const executable = process.argv[2];
if (process.env.BUILDR_NATIVE_READONLY_PROBE !== '1' || !executable || !path.isAbsolute(executable)) throw new Error('Set BUILDR_NATIVE_READONLY_PROBE=1 and supply the absolute Codex executable. No model is called.');
if (process.platform !== 'darwin') throw new Error('This native sandbox probe currently covers macOS only; other platforms require their own live evidence.');
const codexHome = fs.realpathSync(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const version = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-native-readonly-')));
const main = path.join(base, 'main'), worktree = path.join(base, 'worktree'), second = path.join(base, 'second'), external = path.join(base, 'external');
const fixtureEnv = { ...process.env };
for (const key of Object.keys(fixtureEnv)) if (key.startsWith('GIT_')) delete fixtureEnv[key];
Object.assign(fixtureEnv, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['--no-optional-locks', '-C', cwd, ...args], { encoding: 'utf8', timeout: 10_000, env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fixtureState() {
  const entries: string[] = [];
  function visit(directory: string) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = fs.lstatSync(file), relative = path.relative(base, file);
      if (stat.isSymbolicLink()) entries.push(relative + ':link:' + fs.readlinkSync(file));
      else if (stat.isDirectory()) { entries.push(relative + ':directory'); visit(file); }
      else entries.push(relative + ':file:' + hash(fs.readFileSync(file)));
    }
  }
  visit(base);
  return { head: git(worktree, 'rev-parse', 'HEAD'), index: hash(fs.readFileSync(git(worktree, 'rev-parse', '--path-format=absolute', '--git-path', 'index'))), entries };
}
// Only controlled values from the local fixture/profile are serialized as TOML.
function inlineToml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return '[' + value.map(inlineToml).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).map(([key, entry]) => JSON.stringify(key) + '=' + inlineToml(entry)).join(',') + '}';
  throw new Error('Unsupported controlled TOML value.');
}
type ProbeProtocol = {
  request(method: string, params: unknown, timeoutMs?: number): Promise<any>;
  prepareThread(input: { cwd: string; environment: AgentGenerationEnvironment; prompt: string; outputSchema: unknown; signal: AbortSignal; onConfigured(): void; onRunning(): void }): Promise<{ threadId: string; permissions: string | null }>;
};
let client: CodexAppServer | undefined;
let loopback: net.Server | undefined;
let acceptedConnections = 0, spawned = 0, modelTurns = 0;
const loadedInstructionCounts: number[] = [];
const checks: Record<string, boolean> = {};
try {
  for (const directory of [main, second, external]) fs.mkdirSync(directory);
  git(main, 'init', '--initial-branch=main');
  git(main, 'config', 'user.name', 'Buildr readonly probe'); git(main, 'config', 'user.email', 'probe@example.invalid'); git(main, 'config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(main, 'tracked.txt'), 'Original tracked contents.\n');
  git(main, 'add', '--', 'tracked.txt'); git(main, 'commit', '-m', 'initial fixture');
  git(main, 'worktree', 'add', '-b', 'probe-worktree', worktree);
  fs.writeFileSync(path.join(worktree, 'tracked.txt'), 'Changed tracked contents.\n');
  fs.writeFileSync(path.join(worktree, 'AGENTS.md'), 'HOST_INSTRUCTION_SHOULD_NOT_BE_AUTOMATICALLY_INJECTED\n');
  fs.writeFileSync(path.join(second, 'AGENTS.md'), 'SECOND_HOST_INSTRUCTION_SHOULD_NOT_BE_AUTOMATICALLY_INJECTED\n');
  fs.writeFileSync(path.join(external, 'AGENTS.md'), 'Individually authorized rule entry.\n');
  fs.writeFileSync(path.join(external, 'private.txt'), 'Outside scope sentinel.\n');
  fs.symlinkSync(path.join(external, 'private.txt'), path.join(worktree, 'outside-link'));
  const common = fs.realpathSync(git(worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  const environment = resolveAgentGenerationEnvironment(worktree, { kind: 'workspace-read-only', readableRoots: [worktree, common, path.join(external, 'AGENTS.md')] })!;
  const secondEnvironment = resolveAgentGenerationEnvironment(second, { kind: 'workspace-read-only', readableRoots: [second] })!;
  const processProfile = createCodexReadOnlyProfile(environment, worktree);
  loopback = net.createServer(socket => { acceptedConnections++; socket.end(); });
  await new Promise<void>((resolve, reject) => { loopback!.once('error', reject); loopback!.listen(0, '127.0.0.1', resolve); });
  const port = (loopback.address() as net.AddressInfo).port;
  const before = fixtureState();
  const authNames = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_APP_TOOLS_PIPE_PATH', 'BUILDR_READONLY_ENV_SENTINEL'];
  client = new CodexAppServer({ id: 'native-readonly-probe', kind: 'codex', label: 'Owned no-model probe', executable, codexHome, version }, {
    requestTimeoutMs: 10_000, closeTimeoutMs: 1000,
    spawnProcess: ((entry: string, args: string[], options: Parameters<typeof spawn>[2]) => {
      spawned++;
      return spawn(entry, [...args, '-c', 'permissions.' + processProfile.id + '=' + inlineToml(processProfile.profile), '-c', 'default_permissions=' + inlineToml(processProfile.id), '-c', 'shell_environment_policy=' + inlineToml(CODEX_SHELL_ENVIRONMENT)], { ...options, env: { ...options?.env, BUILDR_READONLY_ENV_SENTINEL: 'must-not-reach-tools' } });
    }) as typeof spawn,
  });
  const protocol = client as unknown as ProbeProtocol;
  const originalRequest = protocol.request.bind(client);
  protocol.request = async (method, params, timeoutMs) => {
    if (method === 'turn/start') { modelTurns++; throw new Error('This probe must never invoke a model.'); }
    const response = await originalRequest(method, params, timeoutMs);
    if (method === 'thread/start') { assert.ok(Array.isArray(response.instructionSources)); assert.equal(response.instructionSources.length, 0, 'fixture AGENTS must be inspected on demand rather than injected by the host'); loadedInstructionCounts.push(response.instructionSources.length); }
    return response;
  };
  await client.start();
  // command/exec has its own explicit environment merge; mirror the safe thread
  // shell policy here while testing the same native filesystem/network sandbox.
  const command = (argv: string[]) => protocol.request('command/exec', { command: argv, cwd: worktree, env: CODEX_GIT_READ_ENVIRONMENT, permissionProfile: processProfile.id, timeoutMs: 5000, outputBytesCap: 8192 }, 8000);
  async function allowed(name: string, argv: string[], expected?: RegExp) {
    const result = await command(argv);
    if (result.exitCode !== 0) console.error(JSON.stringify({ failedFixtureCheck: name, exitCode: result.exitCode, diagnostic: String(result.stderr).slice(0, 512).replaceAll(base, '<owned-fixture>') }));
    assert.equal(result.exitCode, 0, name + ' must be allowed');
    if (expected) assert.match(result.stdout, expected, name + ' must read the expected fixture');
    checks[name] = true;
  }
  async function denied(name: string, argv: string[]) {
    const result = await command(argv);
    assert.notEqual(result.exitCode, 0, name + ' must be denied');
    checks[name] = true;
  }
  await allowed('linkedGitStatus', ['/usr/bin/git', '--no-optional-locks', 'status', '--porcelain'], /tracked\.txt/);
  await allowed('linkedGitDiff', ['/usr/bin/git', '--no-optional-locks', 'diff', '--no-ext-diff', '--', 'tracked.txt'], /Changed tracked contents/);
  await allowed('linkedGitHistory', ['/usr/bin/git', '--no-optional-locks', 'log', '-1', '--format=%s'], /initial fixture/);
  await allowed('authorizedFileRead', ['/bin/cat', path.join(worktree, 'tracked.txt')], /Changed tracked contents/);
  await allowed('authorizedSingleRuleFile', ['/bin/cat', path.join(external, 'AGENTS.md')], /Individually authorized/);
  await denied('outsideReadDenied', ['/bin/cat', path.join(external, 'private.txt')]);
  await denied('symlinkEscapeDenied', ['/bin/cat', path.join(worktree, 'outside-link')]);
  await denied('fileWriteDenied', ['/bin/sh', '-c', 'printf forbidden > tracked.txt']);
  await denied('gitIndexWriteDenied', ['/usr/bin/git', 'add', '--', 'tracked.txt']);
  await denied('gitCommitDenied', ['/usr/bin/git', '-c', 'commit.gpgSign=false', 'commit', '-am', 'forbidden sandbox commit']);
  await allowed('networkClientAvailable', ['/usr/bin/curl', '--version'], /curl/);
  await denied('networkDenied', ['/usr/bin/curl', '--noproxy', '*', '--connect-timeout', '2', '--max-time', '3', 'http://127.0.0.1:' + port + '/']);
  assert.equal(acceptedConnections, 0, 'the sandbox must not reach the owned loopback listener');
  const shellEnvironment = await command(['/usr/bin/env']);
  assert.equal(shellEnvironment.exitCode, 0);
  const environmentNames = new Set(String(shellEnvironment.stdout).split('\n').map(line => line.slice(0, line.indexOf('='))));
  for (const name of authNames) assert.equal(environmentNames.has(name), false, name + ' must not be inherited by native tools');
  checks.shellCredentialsAbsent = true;
  const threadIds: string[] = [], permissionIds: string[] = [];
  for (const [cwd, scope] of [[worktree, environment], [second, secondEnvironment]] as const) {
    // Calls the same preparation path as business generation, without sending a turn.
    const prepared = await protocol.prepareThread({ cwd, environment: scope, prompt: '', outputSchema: {}, signal: new AbortController().signal, onConfigured() {}, onRunning() {} });
    assert.ok(prepared.permissions); threadIds.push(prepared.threadId); permissionIds.push(prepared.permissions);
    const thread = await protocol.request('thread/read', { threadId: prepared.threadId, includeTurns: false });
    assert.equal(thread.thread?.ephemeral, true);
    await protocol.request('thread/unsubscribe', { threadId: prepared.threadId });
  }
  assert.notEqual(threadIds[0], threadIds[1]); assert.notEqual(permissionIds[0], permissionIds[1]);
  checks.distinctThreadProfilesOneInstance = spawned === 1;
  checks.hostInstructionSourcesEmpty = loadedInstructionCounts.length === 2 && loadedInstructionCounts.every(count => count === 0);
  assert.deepEqual(fixtureState(), before, 'reads and rejected writes must preserve fixture files, Git metadata, HEAD and index');
  checks.filesHeadIndexUnchanged = true;
  assert.equal(modelTurns, 0); assert.equal(spawned, 1);
  await client.close();
  assert.equal(client.alive, false);
  console.log(JSON.stringify({ status: 'passed', codexVersion: version, platform: process.platform, modelTurns, ownedInstances: spawned, closed: true, commandExecProfile: true, threadProfileConfirmation: true, checks }));
} finally {
  try { await client?.close(); }
  finally {
    try { if (loopback?.listening) await new Promise<void>((resolve, reject) => loopback!.close(error => error ? reject(error) : resolve())); }
    finally { fs.rmSync(base, { recursive: true, force: true }); }
  }
}
