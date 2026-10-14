import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type test from 'node:test';

const shellArgument = (value: string) => "'" + value.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'";

/** Select owned configuration files without changing host Git settings or credential stores. */
export function codeGitConfigurationFixture(t: test.TestContext, base: string) {
  const system = path.join(base, 'system.gitconfig'), global = path.join(base, 'global.gitconfig');
  fs.writeFileSync(system, ''); fs.writeFileSync(global, '');
  const variables = ['GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];
  const previous = new Map(variables.map(name => [name, process.env[name]]));
  process.env.GIT_CONFIG_SYSTEM = system; process.env.GIT_CONFIG_GLOBAL = global; delete process.env.GIT_CONFIG_NOSYSTEM;
  t.after(() => { for (const [name, value] of previous) if (value === undefined) delete process.env[name]; else process.env[name] = value; });
  const fixtureEnvironment = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: '0' };
  const set = (file: string, key: string, value: string) => execFileSync('git', ['config', '--file', file, key, value], { env: fixtureEnvironment, stdio: ['ignore', 'pipe', 'pipe'] });
  const command = (file: string) => shellArgument(process.execPath) + ' ' + shellArgument(file);
  return { system, global, command, setSystem: (key: string, value: string) => set(system, key, value), setGlobal: (key: string, value: string) => set(global, key, value) };
}
