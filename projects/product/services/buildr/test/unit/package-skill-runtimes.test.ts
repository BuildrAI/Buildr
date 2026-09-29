import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAgentAssetsPackageAssets, type PackageAssetsDependencies } from '../../src/modules/agent-assets/application/package-maintenance/package-assets.ts';
import { validatePackageSkillRuntimes } from '../../tools/verification/package-check/static-validation.ts';

const { builtinSkillEntry } = registerAgentAssetsPackageAssets({} as PackageAssetsDependencies);
const builtin = { id: 'demo', target: 'skills/buildr/demo', description: '测试技能', required: false };
const legacyRuntimes = ['claude-code', 'codex', 'cursor', 'qoder', 'trae', 'trae-work', 'workbuddy'];

function previous(overrides: Record<string, unknown> = {}) {
  return { ...builtinSkillEntry(builtin), runtimes: [...legacyRuntimes], ...overrides };
}

test('通用包技能保持省略 runtimes，显式限制不扩展为当前品牌列表', () => {
  assert.equal(Object.hasOwn(builtinSkillEntry(builtin), 'runtimes'), false);
  assert.deepEqual(builtinSkillEntry({ ...builtin, runtimes: ['new-host'] }).runtimes, ['new-host']);
});

test('仅升级匹配产品身份的历史完整七品牌列表，顺序不影响识别', () => {
  assert.equal(Object.hasOwn(builtinSkillEntry(builtin, previous()), 'runtimes'), false);
  assert.equal(Object.hasOwn(builtinSkillEntry(builtin, previous({ runtimes: [...legacyRuntimes].reverse() })), 'runtimes'), false);
  assert.equal(Object.hasOwn(builtinSkillEntry(builtin, previous({ assetIdentity: undefined, sourceIdentity: undefined })), 'runtimes'), false);
  const openspec = { ...builtin, target: 'skills/openspec/demo' };
  assert.equal(Object.hasOwn(builtinSkillEntry(openspec, { ...builtinSkillEntry(openspec), runtimes: legacyRuntimes }), 'runtimes'), false);
});

test('用户缩小、扩展或空的明确范围及非产品身份均不被抹除', () => {
  for (const runtimes of [['codex'], [], [...legacyRuntimes, 'new-host'], ['claude-code', 'codex', 'cursor', 'qoder', 'trae', 'trae-work', 'codex']]) {
    assert.deepEqual(builtinSkillEntry(builtin, previous({ runtimes })).runtimes, runtimes);
  }
  for (const overrides of [{ source: 'local' }, { path: 'local/demo' }, { assetIdentity: 'local:demo' }, { sourceIdentity: 'workspace:demo' }]) {
    assert.deepEqual(builtinSkillEntry(builtin, previous(overrides)).runtimes, legacyRuntimes);
  }
});

test('内置技能身份替换同样保留旧用户子集并升级可识别的产品默认值', () => {
  const replacement = { ...builtin, id: 'next', target: 'skills/buildr/next', replaces: { id: 'demo', target: builtin.target } };
  assert.equal(Object.hasOwn(builtinSkillEntry(replacement, previous()), 'runtimes'), false);
  assert.deepEqual(builtinSkillEntry(replacement, previous({ runtimes: ['dsh'] })).runtimes, ['dsh']);
});

test('包校验允许省略和未知有效品牌，拒绝格式错误的显式限制', () => {
  for (const runtimes of [undefined, ['codex'], ['dsh', 'new-host'], ['constructor', '__proto__']]) {
    assert.deepEqual(validatePackageSkillRuntimes(runtimes, 'demo'), []);
  }
  for (const runtimes of [null, [], 'codex', [1], ['Cursor Agent'], ['../codex'], ['codex', 'codex']]) {
    assert.ok(validatePackageSkillRuntimes(runtimes, 'demo').length > 0, JSON.stringify(runtimes));
  }
});
