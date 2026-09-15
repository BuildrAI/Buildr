import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { normalizedCommandSignature } from '../../src/modules/agent-assets/application/commands.ts';
import { createCommandManifestRepository } from '../../src/modules/agent-assets/persistence/command-manifest-repository.ts';
import * as versions from '../../src/modules/agent-assets/domain/command-version.ts';
import * as probe from '../../src/modules/agent-assets/infrastructure/command-version-probe.ts';

function repositoryDependencies(): any  {
  return {
    normalizeRelativePathForBuildr(value: any): any  {
      if (value.includes('..')) throw new Error('outside commands');
      return value.replaceAll('\\', '/').replace(/^\.\//, '');
    },
    isValidAssetId: (value: any) => typeof value === 'string' && /^[A-Za-z0-9._-]+$/.test(value),
    toPosixRelative: (root: any, value: any) => path.relative(root, value).replaceAll(path.sep, '/'),
  };
}

test('Commands domain collection normalization 保持在 commands 子树', () => {
  const commands: any = createCommandManifestRepository(repositoryDependencies());
  assert.equal(commands.normalizeCommandCollection('commands/team/manifest.yml'), 'team');
  assert.equal(commands.normalizeCommandCollection('team'), 'team');
  assert.equal(commands.normalizeCommandCollection(null), null);
  assert.throws(() => commands.normalizeCommandCollection('manifest.yml'), /must name a nested collection/);
  assert.throws(() => commands.normalizeCommandCollection('../outside'), /outside commands/);
  assert.equal(commands.commandsManifestPath('/workspace', 'team'), path.join('/workspace', 'commands', 'team', 'manifest.yml'));
});

test('Commands manifest validator 直接覆盖 schema、重复 id 和 executable 错误', () => {
  const commands: any = createCommandManifestRepository(repositoryDependencies());
  assert.deepEqual(commands.validateCommandsManifest({ schemaVersion: 'buildr.commands/v1', commands: [] }), []);
  const errors: any = commands.validateCommandsManifest({
    schemaVersion: 'buildr.commands/v0',
    commands: [
      { id: 'tool', executable: 'tool', purpose: 'first' },
      { id: 'tool', executable: '../tool', purpose: '', extra: true },
    ],
  });
  assert.ok(errors.some((error: any) => error.includes('schemaVersion')));
  assert.ok(errors.some((error: any) => error.includes('Duplicate command id')));
  assert.ok(errors.some((error: any) => error.includes('executable')));
  assert.ok(errors.some((error: any) => error.includes('purpose')));
  assert.ok(errors.some((error: any) => error.includes('extra')));
});

test('Commands version parser 和 constraint comparator 处理边界', () => {
  assert.deepEqual(versions.parseVersion('tool version 2.3.4'), [2, 3, 4]);
  assert.deepEqual(versions.parseVersionConstraint('>=2.1.0'), { operator: '>=', version: [2, 1, 0], rawVersion: '2.1.0' });
  assert.equal(versions.versionSatisfies([2, 3, 4], versions.parseVersionConstraint('>=2.1.0')), true);
  assert.equal(versions.versionSatisfies([1, 9, 9], versions.parseVersionConstraint('>=2.1.0')), false);
  assert.equal(versions.parseVersionConstraint('not-a-version'), null);
});

test('Command version probe 为 Windows shim 选择受限平台启动策略', () => {
  const args: any[] = ['--version'];
  const windowsShim: any = probe.buildCommandProbeInvocation('C:\\npm\\openspec.cmd', args, { platform: 'win32' });
  assert.deepEqual(windowsShim, { executable: 'C:\\npm\\openspec.cmd', args: ['--version'], shell: true });
  args.push('--extra');
  assert.deepEqual(windowsShim.args, ['--version'], 'probe invocation must own its token array');
  const nativeWindows: any = probe.buildCommandProbeInvocation('C:\\tools\\openspec.exe', ['--version'], { platform: 'win32' });
  assert.equal(nativeWindows.shell, false);
  const posix: any = probe.buildCommandProbeInvocation('/usr/local/bin/openspec', ['--version'], { platform: 'linux' });
  assert.equal(posix.shell, false);
});

test('Command version probe 区分启动失败与输出不可解析', () => {
  const failed: any = probe.probeCommandVersion('C:\\npm\\openspec.cmd', ['--version'], {
    platform: 'win32',
    spawn: () => ({ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) }),
  });
  assert.equal(failed.status, 'spawn-failed');
  assert.equal(failed.error.code, 'ENOENT');
  assert.equal(failed.invocation.shell, true);
  const unknown: any = probe.probeCommandVersion('/usr/local/bin/openspec', ['--version'], {
    platform: 'linux',
    spawn: () => ({ status: 0, stdout: 'OpenSpec development build', stderr: '' }),
  });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.invocation.shell, false);
  const parsed: any = probe.probeCommandVersion('/usr/local/bin/openspec', ['--version'], {
    platform: 'linux',
    spawn: () => ({ status: 0, stdout: 'openspec 1.6.0', stderr: '' }),
  });
  assert.deepEqual(parsed.currentVersion, [1, 6, 0]);
});

test('Project Commands schema 只接受 requirement references', () => {
  const commands: any = createCommandManifestRepository(repositoryDependencies());
  assert.ok(commands.validateProjectCommandsDocument({ schemaVersion: 'buildr.project-commands/v1' })
    .some((error: any) => error.includes('requirements as an array')));
  assert.deepEqual(commands.validateProjectCommandsDocument({
    schemaVersion: 'buildr.project-commands/v1',
    requirements: [{ id: 'node', required: true, version: '>=20.0.0', purpose: '构建前端' }],
  }), []);
  const errors: any = commands.validateProjectCommandsDocument({
    schemaVersion: 'buildr.project-commands/v0',
    requirements: [{ id: 'node', executable: 'node', installHint: 'brew install node' }],
  });
  assert.ok(errors.some((error: any) => error.includes('schemaVersion')));
  assert.ok(errors.some((error: any) => error.includes('executable')));
  assert.ok(errors.some((error: any) => error.includes('installHint')));
});

test('Project Command constraints 确定性求交并在无交集时 fail closed', () => {
  assert.deepEqual(versions.intersectVersionConstraints(['>=20.0.0', '<22.0.0']), {
    compatible: true,
    constraint: '>=20.0.0 <22.0.0',
    constraints: ['>=20.0.0', '<22.0.0'],
  });
  assert.equal(versions.intersectVersionConstraints(['=20.0.0', '>=20.0.0']).compatible, true);
  assert.equal(versions.intersectVersionConstraints(['>=22.0.0', '<22.0.0']).compatible, false);
  assert.equal(versions.intersectVersionConstraints(['=20.0.0', '=21.0.0']).compatible, false);
});

test('Command definition identity 不包含 requirement constraint', () => {
  const base: any = { id: 'node', executable: 'node', purpose: 'Node', version: { args: ['--version'], constraint: '>=20.0.0' } };
  const other: any = { ...base, required: false, version: { args: ['--version'], constraint: '<22.0.0' } };
  assert.equal(normalizedCommandSignature(base), normalizedCommandSignature(other));
  assert.notEqual(normalizedCommandSignature(base), normalizedCommandSignature({ ...base, executable: 'nodejs' }));
});
