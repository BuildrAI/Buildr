import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Integration: every case crosses a real launcher process and temporary filesystem boundary.

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runner: any = path.join(serviceRoot, 'tools/development/run-development-cli');
const npmRunner: any = path.join(serviceRoot, 'tools/development/run-development-npm');
const projectBridge: any = path.resolve(serviceRoot, '../../buildr');
const programs: string = path.join(serviceRoot, 'tools/development/programs');

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

function fakeNode(target: any, version: any, marker: any): any  {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `#!/bin/sh
if [ "\${1:-}" = -p ]; then
  echo "${version}"
  exit 0
fi
echo "${marker}|$*"
`, { mode: 0o755 });
}

function run(entry: any, args: any, env: any): any  {
  const cwd: any = env.BUILDR_TEST_CWD || os.tmpdir();
  const executionEnv: any = { ...env };
  const inheritedEnv: any = { ...process.env };
  delete executionEnv.BUILDR_TEST_CWD;
  delete inheritedEnv.BUILDR_NODE;
  delete inheritedEnv.NVM_DIR;
  return spawnSync(entry, args, {
    encoding: 'utf8',
    cwd,
    env: {
      ...inheritedEnv,
      ...executionEnv,
    },
  });
}

test('Project bridge 在 PATH 中选择声明版本且跳过范围外候选', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-path-'));
  const oldBin: any = path.join(fixture, 'old');
  const currentBin: any = path.join(fixture, 'current');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');
  fakeNode(path.join(currentBin, 'node'), '24.15.0', 'current');

  const result: any = run(projectBridge, ['doctor', '--json'], { PATH: `${oldBin}:${currentBin}` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^current\|.*bin\/buildr\.mjs doctor --json\n$/u);
});

test('PATH 上的声明版本之后更新 minor 被接受', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-range-'));
  const olderBin: any = path.join(fixture, 'older');
  const newerBin: any = path.join(fixture, 'newer');
  fakeNode(path.join(olderBin, 'node'), '24.14.9', 'below-floor');
  fakeNode(path.join(newerBin, 'node'), '24.21.0', 'in-range-newer');

  const selected: any = run(runner, ['--help'], { PATH: `${olderBin}:${newerBin}:/usr/bin:/bin` });
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /^in-range-newer\|.*bin\/buildr\.mjs --help\n$/u);

  const belowFloorOnly: any = run(runner, ['--help'], { PATH: `${olderBin}:/usr/bin:/bin` });
  assert.equal(belowFloorOnly.status, 1);
  assert.equal(belowFloorOnly.stdout, '');
  assert.match(belowFloorOnly.stderr, /requires Node\.js >=24\.15\.0/u);
});

test('开发入口按 PATH 顺序接受后续主版本并跳过无效及预发布版本', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-future-path-'));
  try {
    const invalidBin = path.join(fixture, 'invalid'), prereleaseBin = path.join(fixture, 'prerelease');
    const firstBin = path.join(fixture, 'first'), secondBin = path.join(fixture, 'second');
    fakeNode(path.join(invalidBin, 'node'), '26..0', 'invalid');
    fakeNode(path.join(prereleaseBin, 'node'), '26.0.0-nightly', 'prerelease');
    fakeNode(path.join(firstBin, 'node'), '25.0.0', 'first-new-major');
    fakeNode(path.join(secondBin, 'node'), '26.0.0', 'second-new-major');
    const result = run(runner, ['--help'], { PATH: `${invalidBin}:${prereleaseBin}:${firstBin}:${secondBin}:/usr/bin:/bin` });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^first-new-major\|.*bin\/buildr\.mjs --help\n$/u);
    assert.equal(result.stderr, '');
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('开发入口拒绝前导零及超出安全整数的无效版本', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-invalid-version-'));
  try {
    const candidate = path.join(fixture, 'node');
    for (const version of ['024.15.0', '24.015.0', '26.0.00', '9007199254740992.0.0']) {
      fakeNode(candidate, version, 'invalid');
      const result = run(runner, ['--help'], { BUILDR_NODE: candidate, PATH: '/usr/bin:/bin' });
      assert.equal(result.status, 1, version);
      assert.equal(result.stdout, '', version);
      assert.match(result.stderr, /requires Node\.js >=24\.15\.0; BUILDR_NODE/u);
    }
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('hostile PATH 下优先使用显式 NVM_DIR 中的声明版本', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-nvm-'));
  const hostileBin: any = path.join(fixture, 'hostile');
  const nvmRoot: any = path.join(fixture, 'nvm');
  fakeNode(path.join(hostileBin, 'node'), '24.19.0', 'hostile');
  fakeNode(path.join(nvmRoot, 'versions/node/v24.15.0/bin/node'), '24.15.0', 'nvm-exact');

  const result: any = run(projectBridge, ['doctor', '--json'], { NVM_DIR: nvmRoot, PATH: hostileBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^nvm-exact\|.*bin\/buildr\.mjs doctor --json\n$/u);
  assert.doesNotMatch(result.stdout, /hostile/u);
});

test('不匹配的显式 NVM_DIR 候选不会覆盖 PATH 中的声明版本', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-nvm-mismatch-'));
  const exactBin: any = path.join(fixture, 'exact');
  const nvmRoot: any = path.join(fixture, 'nvm');
  fakeNode(path.join(exactBin, 'node'), '24.15.0', 'path-exact');
  fakeNode(path.join(nvmRoot, 'versions/node/v24.15.0/bin/node'), '24.19.0', 'nvm-wrong');

  const result: any = run(projectBridge, ['doctor'], { NVM_DIR: nvmRoot, PATH: exactBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^path-exact\|.*bin\/buildr\.mjs doctor\n$/u);
});

test('Workspace legacy runtime.node 不影响 development main process 的 Product Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-workspace-'));
  const workspace: any = path.join(fixture, 'workspace');
  const pathNode: any = path.join(fixture, 'path/node');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr/workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: Demo\ndescription: Demo\nruntime:\n  node:\n    version: 24.15.0\n');
  fakeNode(pathNode, '24.15.0', 'development-host');
  const result: any = run(runner, ['--help'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: path.join(fixture, 'app-data'), PATH: `${path.dirname(pathNode)}:/usr/bin:/bin` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^development-host\|.*bin\/buildr\.mjs --help\n$/u);
});

test('runner-only identity inspection返回launcher、CLI entry和实际Node', { skip: process.platform === 'win32' }, () => {
  const exactNode: any = process.env.BUILDR_NODE || process.execPath;
  const result: any = run(runner, [], {
    PATH: path.dirname(exactNode),
    BUILDR_NODE: exactNode,
    BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1',
  });
  assert.equal(result.status, 0, result.stderr);
  const identity: any = JSON.parse(result.stdout);
  assert.equal(identity.schemaVersion, 'buildr.development-cli-identity/v1');
  assert.equal(identity.launcher, runner);
  assert.equal(identity.cliEntry, path.join(serviceRoot, 'bin', 'buildr.mjs'));
  assert.equal(fs.realpathSync(identity.nodeExecutable), fs.realpathSync(exactNode));
});

test('Project bridge为continuity提供仅进程局部的辅助PATH，保留默认npm buildr身份', { skip: process.platform === 'win32' }, t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-program-path-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const runtime = path.join(fixture, 'runtime'), defaultBin = path.join(fixture, 'npm-bin'), selectedNode = path.join(runtime, 'node'), probe = path.join(fixture, 'probe.mjs');
  fs.mkdirSync(runtime); fs.mkdirSync(defaultBin);
  const defaultBuildr = path.join(defaultBin, 'buildr'); fs.writeFileSync(defaultBuildr, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const programModule = new URL('../../src/modules/connection-skills/infrastructure/program.ts', import.meta.url).href;
  fs.writeFileSync(probe, `import {spawnSync} from 'node:child_process';\nimport { locateExecutable } from ${JSON.stringify(programModule)};\nconst args=process.argv.slice(2);\nif(args[0].endsWith('/bin/buildr-mysql.mjs')) console.log(JSON.stringify({args}));\nelse {const mysql=locateExecutable('buildr-mysql');const helper=spawnSync(mysql,['two words','literal$(should-not-run)','asterisk*'],{env:process.env,encoding:'utf8'});console.log(JSON.stringify({path:process.env.PATH,args,mysql,buildr:locateExecutable('buildr'),helper:{status:helper.status,value:JSON.parse(helper.stdout)}}));}\n`);
  fs.writeFileSync(selectedNode, `#!/bin/sh\nif [ "\${1:-}" = -p ]; then exec '${process.execPath}' "$@"; fi\nexec '${process.execPath}' '${probe}' "$@"\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  const result = run(projectBridge, ['web', '--port', '4458', '--no-open'], { PATH: defaultBin, BUILDR_NODE: selectedNode });
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.deepEqual(observed.path.split(path.delimiter), [programs, runtime, defaultBin]);
  assert.equal(observed.mysql, fs.realpathSync(path.join(programs, 'buildr-mysql')));
  assert.equal(observed.buildr, fs.realpathSync(defaultBuildr));
  assert.deepEqual(observed.args, [path.join(serviceRoot, 'bin/buildr.mjs'), 'web', '--port', '4458', '--no-open']);
  assert.deepEqual(observed.helper, { status: 0, value: { args: [path.join(serviceRoot, 'bin/buildr-mysql.mjs'), 'two words', 'literal$(should-not-run)', 'asterisk*'] } });
  assert.equal(process.env.PATH, originalPath);
  assert.deepEqual(fs.readdirSync(programs), ['buildr-mysql'], 'the private PATH must never project the default buildr command');
});

test('开发MySQL薄入口保持离线帮助、版本、所选Node和私有IPC，缺少通用PATH仍不猜替代程序', { skip: process.platform === 'win32' }, async () => {
  const helper = path.join(programs, 'buildr-mysql'), env = { ...process.env, BUILDR_NODE: process.execPath, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` };
  for (const args of [['--help'], ['--version']]) {
    const result = spawnSync(helper, args, { env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    if (args[0] === '--version') assert.equal(result.stdout.trim(), 'buildr-mysql 1.0.0');
    else assert.ok(JSON.parse(result.stdout).help.length > 0);
  }
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(helper, ['test', '--json'], { env, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }); let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('development helper IPC timed out')); }, 10_000);
    child.stdout!.on('data', chunk => stdout += chunk.toString()); child.stderr!.on('data', chunk => stderr += chunk.toString());
    child.on('spawn', () => { child.send!({ type: 'buildr.connection-context', context: { protocolVersion: 'buildr.connection-context/v1', callId: 'offline-ipc', definition: { definitionId: 'offline-invalid-target' } } }); child.stdin!.end('business input remains separate'); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.stdout).error.code, 'mysql_context_invalid', 'exec must retain the private IPC descriptor rather than produce mysql_context_required');
  assert.equal(result.stderr, '');
  const programModule = new URL('../../src/modules/connection-skills/infrastructure/program.ts', import.meta.url).href;
  const missing = spawnSync(process.execPath, ['--input-type=module', '-e', `import { locateExecutable } from ${JSON.stringify(programModule)}; console.log(JSON.stringify(locateExecutable('buildr-mysql')));`], { env: { ...env, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
  assert.equal(missing.status, 0, missing.stderr); assert.equal(JSON.parse(missing.stdout), null);
});

test('Workspace 未声明 runtime.node 不会阻断 development main process', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-recovery-'));
  const workspace: any = path.join(fixture, 'workspace');
  const bootstrap: any = path.join(fixture, 'path/node');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr/workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: Demo\ndescription: Demo\n');
  fakeNode(bootstrap, '24.15.0', 'bootstrap');
  const main: any = run(runner, ['project', 'create', 'demo'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: path.join(fixture, 'app-data'), PATH: `${path.dirname(bootstrap)}:/usr/bin:/bin` });
  assert.equal(main.status, 0, main.stderr);
  assert.match(main.stdout, /^bootstrap\|.*bin\/buildr\.mjs project create demo\n$/u);
});

test('BUILDR_NODE 优先于 PATH 且范围外 override 会 fail fast', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-override-'));
  const pathNode: any = path.join(fixture, 'path', 'node');
  const explicitNode: any = path.join(fixture, 'explicit', 'node');
  fakeNode(pathNode, '24.15.0', 'path');
  fakeNode(explicitNode, '24.15.0', 'explicit');

  const selected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: explicitNode });
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /^explicit\|.*bin\/buildr\.mjs --help\n$/u);

  const newerExplicitNode: any = path.join(fixture, 'newer-explicit', 'node');
  fakeNode(newerExplicitNode, '24.21.0', 'newer-explicit');
  const newerSelected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: newerExplicitNode });
  assert.equal(newerSelected.status, 0, newerSelected.stderr);
  assert.match(newerSelected.stdout, /^newer-explicit\|.*bin\/buildr\.mjs --help\n$/u);

  const incompatibleNode: any = path.join(fixture, 'incompatible', 'node');
  fakeNode(incompatibleNode, '18', 'incompatible');
  const rejected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: incompatibleNode });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /requires Node\.js >=24\.15\.0; BUILDR_NODE/u);
  assert.equal(rejected.stdout, '');

  const futureNode: any = path.join(fixture, 'future', 'node');
  for (const version of ['25.0.0', '26.0.0']) {
    fakeNode(futureNode, version, 'future');
    const futureSelected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: futureNode });
    assert.equal(futureSelected.status, 0, futureSelected.stderr);
    assert.match(futureSelected.stdout, /^future\|.*bin\/buildr\.mjs --help\n$/u);
  }
});

test('开发入口可发现 Agent runtime PATH 相邻的 bundled Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-bundled-'));
  const overrideBin: any = path.join(fixture, 'dependencies/bin/override');
  fs.mkdirSync(overrideBin, { recursive: true });
  fakeNode(path.join(fixture, 'dependencies/node/bin/node'), '24.15.0', 'bundled');

  const result: any = run(runner, ['status'], { PATH: overrideBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^bundled\|.*bin\/buildr\.mjs status\n$/u);
});

test('没有范围内 Product Node 时返回所需范围和恢复动作', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-missing-'));
  const oldBin: any = path.join(fixture, 'old');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');

  const result: any = run(runner, ['doctor'], { PATH: oldBin });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires Node\.js >=24\.15\.0/u);
  assert.match(result.stderr, /Set BUILDR_NODE.*activate the Product \.node-version/u);
  assert.doesNotMatch(result.stderr, /SyntaxError/u);
});

test('开发启动器读取声明版本且 package engines 保留发布兼容范围', () => {
  const packageJson: any = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  const source: any = fs.readFileSync(runner, 'utf8');
  const declared: any = fs.readFileSync(path.resolve(serviceRoot, '../..', '.node-version'), 'utf8').trim();
  assert.equal(declared, '24.15.0');
  assert.equal(packageJson.engines.node, `>=${declared}`);
  assert.match(source, /resolve-development-node/u);
  assert.doesNotMatch(source, /workspace\.yml|Workspace Node runtime|BUILDR_NODE_RUNTIME_DATA_DIR/u);
});

function npmProbe(root: string): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, scripts: { probe: 'node probe.mjs' } }));
  fs.writeFileSync(path.join(root, 'probe.mjs'), "console.log(JSON.stringify({ executable: process.execPath, args: process.argv.slice(2) }));\n");
}

test('npm 开发入口接受显式 Node 链接，并让子进程使用实际 Node 和原始参数', { skip: process.platform === 'win32' }, (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-node-link-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const linkedNode = path.join(fixture, 'linked runtime', 'bin', 'node');
  fs.mkdirSync(path.dirname(linkedNode), { recursive: true });
  fs.symlinkSync(process.execPath, linkedNode);
  const hostileBin = path.join(fixture, 'hostile');
  fakeNode(path.join(hostileBin, 'node'), '18.0.0', 'wrong-child-runtime');
  npmProbe(fixture);
  const args = ['two words', 'literal$(should-not-run)', 'asterisk*'];

  const result = run(npmRunner, ['--silent', 'run', 'probe', '--', ...args], {
    BUILDR_NODE: path.relative(fixture, linkedNode),
    BUILDR_TEST_CWD: fixture,
    PATH: `${hostileBin}:/usr/bin:/bin`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { executable: fs.realpathSync(process.execPath), args });
});

test('npm 开发入口接受 PATH 中的 Node 链接', { skip: process.platform === 'win32' }, (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-path-link-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const linkedBin = path.join(fixture, 'linked bin');
  fs.mkdirSync(linkedBin);
  fs.symlinkSync(process.execPath, path.join(linkedBin, 'node'));
  npmProbe(fixture);

  const result = run(npmRunner, ['--silent', 'run', 'probe'], {
    BUILDR_TEST_CWD: fixture,
    PATH: `${linkedBin}:/usr/bin:/bin`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { executable: fs.realpathSync(process.execPath), args: [] });
});

test('npm 开发入口可从带空格的检出目录执行', { skip: process.platform === 'win32' }, (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-checkout-space-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const product = path.join(fixture, 'checkout with spaces', 'projects', 'product');
  const tools = path.join(product, 'services', 'buildr', 'tools', 'development');
  fs.mkdirSync(tools, { recursive: true });
  for (const file of ['run-development-npm', 'run-development-npm.ts', 'resolve-development-node']) {
    fs.copyFileSync(path.join(serviceRoot, 'tools', 'development', file), path.join(tools, file));
  }
  fs.copyFileSync(path.resolve(serviceRoot, '../../.node-version'), path.join(product, '.node-version'));
  npmProbe(fixture);

  const result = run(path.join(tools, 'run-development-npm'), ['--silent', 'run', 'probe'], {
    BUILDR_NODE: process.execPath,
    BUILDR_TEST_CWD: fixture,
    PATH: '/usr/bin:/bin',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { executable: fs.realpathSync(process.execPath), args: [] });
});
