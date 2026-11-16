import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createIsolatedWorkspaceState } from '../../tools/development/isolated-workspace-state.ts';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const runner = path.join(serviceRoot, 'tools/development/run-development-cli');

test('Windows Node 选择器按完整稳定版本比较下限且不设主版本上限', () => {
  const source = fs.readFileSync(path.join(serviceRoot, 'tools/development/resolve-development-node.cmd'), 'utf8');
  const program = source.match(/"%CANDIDATE%" -e "([^"]+)" "%REQUIRED_VERSION%"/)?.[1];
  assert.ok(program, 'the Windows entry checks the selected executable with a bounded Node version predicate');
  const status = (version: string) => {
    let code: number | null = null;
    const stopped = {};
    try { vm.runInNewContext(program, { process: { versions: { node: version }, argv: ['node', '24.15.0'], exit(value: number) { code = value; throw stopped; } } }); }
    catch (error) { if (error !== stopped) throw error; }
    return code;
  };
  for (const version of ['24.15.0', '24.21.0', '25.0.0', '26.0.0']) assert.equal(status(version), 0, version);
  for (const version of ['23.99.99', '24.14.99', '24.15', '26..0', '026.0.0', '26.00.0', '26.0.00', '26.0.0.1', '26.0.0-nightly', '9007199254740992.0.0']) assert.equal(status(version), 1, version);
  assert.match(source, /if errorlevel 1 exit \/b 1/);
  assert.doesNotMatch(source, /NEXT_MAJOR|same major line/);
});

test('开发启动器读取声明版本且 package engines 保留发布兼容范围', () => {
  const packageJson: any = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  const source: any = fs.readFileSync(runner, 'utf8');
  const declared: any = fs.readFileSync(path.resolve(serviceRoot, '../..', '.node-version'), 'utf8').trim();
  assert.equal(packageJson.engines.node, `>=${declared}`);
  assert.match(source, /resolve-development-node/u);
  assert.doesNotMatch(source, /workspace\.yml|Workspace Node runtime|BUILDR_NODE_RUNTIME_DATA_DIR/u);
});


test('version identity stays available without full runtime bootstrap and preserves exact argument matching', t => {
  const state = createIsolatedWorkspaceState();
  t.after(() => state.cleanup());
  const version = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8')).version;
  const invoke = (args: string[]) => spawnSync(process.execPath, [path.join(serviceRoot, 'bin/buildr.mjs'), ...args], {
    cwd: serviceRoot, env: { ...state.env, BUILDR_TEST_FAIL_FULL_BOOTSTRAP: '1', NODE_TEST_CONTEXT: undefined }, encoding: 'utf8', timeout: 15_000,
  });
  for (const args of [['version'], ['--version'], ['-V'], ['version', '--json']]) {
    const result = invoke(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(args.includes('--json') ? JSON.parse(result.stdout).version : result.stdout.trim(), version);
  }
  const invalid = invoke(['--version', '--unexpected']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Injected full runtime bootstrap failure/);
});

test('Agent preparation keeps build progress off the machine-readable stdout channel', t => {
  const state = createIsolatedWorkspaceState();
  t.after(() => state.cleanup());
  const root = path.join(fs.realpathSync(state.root), 'preparation-output');
  const write = (file: string, text: string) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write('package.json', '{"type":"module"}');
  const entry = 'services/buildr/tools/development/prepare-development-agent.ts';
  write(entry, fs.readFileSync(path.join(serviceRoot, 'tools/development/prepare-development-agent.ts'), 'utf8'));
  // Isolate package copying and locking; exercise the real preparation entry and
  // real child-process stdout/stderr routing, not a second build implementation.
  write('services/buildr-harness/tools/package-runtime.ts', 'export const agentRuntimePackageTree=()=>({matches:()=>true});');
  write('services/buildr/src/infrastructure/filesystem/exclusive-file-lock.ts', 'export const withExclusiveFileLock=(_lock,_target,action)=>action();');
  write('services/buildr-harness-web/tools/build.ts', 'console.log("Harness fixture build output");console.error("Harness fixture diagnostic");');
  write('services/buildr-harness/tools/build.ts', 'console.log("Core fixture build output");');
  const invoke = () => spawnSync(process.execPath, [path.join(root, entry)], {
    cwd: root, env: { ...state.env, NODE_TEST_CONTEXT: undefined }, encoding: 'utf8', timeout: 15_000,
  });
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'passed');
  assert.match(result.stderr, /Harness fixture build output/);
  assert.match(result.stderr, /Harness fixture diagnostic/);
  assert.match(result.stderr, /Core fixture build output/);
  write('services/buildr-harness-web/tools/build.ts', 'console.log("Failed fixture build output");process.exitCode=7;');
  const failed = invoke();
  assert.notEqual(failed.status, 0);
  assert.equal(failed.stdout, '', 'a failed build must not impersonate a JSON receipt');
  assert.match(failed.stderr, /Failed fixture build output/);
  assert.match(failed.stderr, /harness_web_build_failed/);
});
