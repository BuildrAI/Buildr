import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { registerDomainsCommands } from '../../src/agent-assets/application/commands.ts';

function runtime() {
  return {
    normalizeRelativePathForBuildr(value) {
      if (value.includes('..')) throw new Error('outside commands');
      return value.replaceAll('\\', '/').replace(/^\.\//, '');
    },
    isValidAssetId: (value) => typeof value === 'string' && /^[A-Za-z0-9._-]+$/.test(value),
    toPosixRelative: (root, value) => path.relative(root, value).replaceAll(path.sep, '/'),
  };
}

test('Commands domain collection normalization 保持在 commands 子树', () => {
  const commands = registerDomainsCommands(runtime());
  assert.equal(commands.normalizeCommandCollection('commands/team/manifest.yml'), 'team');
  assert.equal(commands.normalizeCommandCollection('team'), 'team');
  assert.equal(commands.normalizeCommandCollection(null), null);
  assert.throws(() => commands.normalizeCommandCollection('manifest.yml'), /must name a nested collection/);
  assert.throws(() => commands.normalizeCommandCollection('../outside'), /outside commands/);
  assert.equal(commands.commandsManifestPath('/workspace', 'team'), path.join('/workspace', 'commands', 'team', 'manifest.yml'));
});

test('Commands manifest validator 直接覆盖 schema、重复 id 和 executable 错误', () => {
  const commands = registerDomainsCommands(runtime());
  assert.deepEqual(commands.validateCommandsManifest({ schemaVersion: 'buildr.commands/v1', commands: [] }), []);
  const errors = commands.validateCommandsManifest({
    schemaVersion: 'buildr.commands/v0',
    commands: [
      { id: 'tool', executable: 'tool', purpose: 'first' },
      { id: 'tool', executable: '../tool', purpose: '', extra: true },
    ],
  });
  assert.ok(errors.some((error) => error.includes('schemaVersion')));
  assert.ok(errors.some((error) => error.includes('Duplicate command id')));
  assert.ok(errors.some((error) => error.includes('executable')));
  assert.ok(errors.some((error) => error.includes('purpose')));
  assert.ok(errors.some((error) => error.includes('extra')));
});

test('Commands version parser 和 constraint comparator 处理边界', () => {
  const commands = registerDomainsCommands(runtime());
  assert.deepEqual(commands.parseVersion('tool version 2.3.4'), [2, 3, 4]);
  assert.deepEqual(commands.parseVersionConstraint('>=2.1.0'), { operator: '>=', version: [2, 1, 0], rawVersion: '2.1.0' });
  assert.equal(commands.versionSatisfies([2, 3, 4], commands.parseVersionConstraint('>=2.1.0')), true);
  assert.equal(commands.versionSatisfies([1, 9, 9], commands.parseVersionConstraint('>=2.1.0')), false);
  assert.equal(commands.parseVersionConstraint('not-a-version'), null);
});

test('Command version probe 为 Windows shim 选择受限平台启动策略', () => {
  const commands = registerDomainsCommands(runtime());
  const args = ['--version'];
  const windowsShim = commands.buildCommandProbeInvocation('C:\\npm\\openspec.cmd', args, { platform: 'win32' });
  assert.deepEqual(windowsShim, { executable: 'C:\\npm\\openspec.cmd', args: ['--version'], shell: true });
  args.push('--extra');
  assert.deepEqual(windowsShim.args, ['--version'], 'probe invocation must own its token array');
  const nativeWindows = commands.buildCommandProbeInvocation('C:\\tools\\openspec.exe', ['--version'], { platform: 'win32' });
  assert.equal(nativeWindows.shell, false);
  const posix = commands.buildCommandProbeInvocation('/usr/local/bin/openspec', ['--version'], { platform: 'linux' });
  assert.equal(posix.shell, false);
});

test('Command version probe 区分启动失败与输出不可解析', () => {
  const commands = registerDomainsCommands(runtime());
  const failed = commands.probeCommandVersion('C:\\npm\\openspec.cmd', ['--version'], {
    platform: 'win32',
    spawn: () => ({ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) }),
  });
  assert.equal(failed.status, 'spawn-failed');
  assert.equal(failed.error.code, 'ENOENT');
  assert.equal(failed.invocation.shell, true);
  const unknown = commands.probeCommandVersion('/usr/local/bin/openspec', ['--version'], {
    platform: 'linux',
    spawn: () => ({ status: 0, stdout: 'OpenSpec development build', stderr: '' }),
  });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.invocation.shell, false);
  const parsed = commands.probeCommandVersion('/usr/local/bin/openspec', ['--version'], {
    platform: 'linux',
    spawn: () => ({ status: 0, stdout: 'openspec 1.6.0', stderr: '' }),
  });
  assert.deepEqual(parsed.currentVersion, [1, 6, 0]);
});

test('Project Commands schema 只接受 requirement references', () => {
  const commands = registerDomainsCommands(runtime());
  assert.ok(commands.validateProjectCommandsDocument({ schemaVersion: 'buildr.project-commands/v1' })
    .some((error) => error.includes('requirements as an array')));
  assert.deepEqual(commands.validateProjectCommandsDocument({
    schemaVersion: 'buildr.project-commands/v1',
    requirements: [{ id: 'node', required: true, version: '>=20.0.0', purpose: '构建前端' }],
  }), []);
  const errors = commands.validateProjectCommandsDocument({
    schemaVersion: 'buildr.project-commands/v0',
    requirements: [{ id: 'node', executable: 'node', installHint: 'brew install node' }],
  });
  assert.ok(errors.some((error) => error.includes('schemaVersion')));
  assert.ok(errors.some((error) => error.includes('executable')));
  assert.ok(errors.some((error) => error.includes('installHint')));
});

test('Project Command constraints 确定性求交并在无交集时 fail closed', () => {
  const commands = registerDomainsCommands(runtime());
  assert.deepEqual(commands.intersectVersionConstraints(['>=20.0.0', '<22.0.0']), {
    compatible: true,
    constraint: '>=20.0.0 <22.0.0',
    constraints: ['>=20.0.0', '<22.0.0'],
  });
  assert.equal(commands.intersectVersionConstraints(['=20.0.0', '>=20.0.0']).compatible, true);
  assert.equal(commands.intersectVersionConstraints(['>=22.0.0', '<22.0.0']).compatible, false);
  assert.equal(commands.intersectVersionConstraints(['=20.0.0', '=21.0.0']).compatible, false);
});

test('Command definition identity 不包含 requirement constraint', () => {
  const commands = registerDomainsCommands(runtime());
  const base = { id: 'node', executable: 'node', purpose: 'Node', version: { args: ['--version'], constraint: '>=20.0.0' } };
  const other = { ...base, required: false, version: { args: ['--version'], constraint: '<22.0.0' } };
  assert.equal(commands.normalizedCommandSignature(base), commands.normalizedCommandSignature(other));
  assert.notEqual(commands.normalizedCommandSignature(base), commands.normalizedCommandSignature({ ...base, executable: 'nodejs' }));
});
