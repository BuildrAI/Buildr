import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExplicitAnyType, validateTaskRecordSkillCommands, validateTaskVerificationSkillCommands } from '../../src/agent-assets/application/package-maintenance/static-validation.ts';

const content: any = `说明文字不构成命令契约。
buildr task create <id>
buildr task inspect <id>
buildr task update <id> --expected-record <recordDigest>
buildr task activate <id> --expected-record <recordDigest>
buildr task complete <id> --expected-record <recordDigest>
buildr task abandon <id> --expected-record <recordDigest>
`;

test('任务包契约接受不改变命令的文案和占位符变化', () => {
  assert.deepEqual(validateTaskRecordSkillCommands(content), []);
  const rewritten: any = content.replaceAll('<id>', '<task-id>').replaceAll('buildr task ', 'buildr  task  ').replaceAll('任务记录', '任务业务记录');
  assert.deepEqual(validateTaskRecordSkillCommands(rewritten), []);
});

test('任务包契约仍拒绝缺失公开操作或版本核对参数', () => {
  for (const action of ['create', 'inspect', 'update', 'activate', 'complete', 'abandon']) {
    const missing: any = content.replaceAll(`buildr task ${action}`, `buildr task removed-${action}`);
    assert.ok(validateTaskRecordSkillCommands(missing).some((problem: any) => problem.includes(`buildr task ${action}`)));
  }
  assert.ok(validateTaskRecordSkillCommands(content.replaceAll('--expected-record', '--removed-record')).some((problem: any) => problem.includes('--expected-record')));
});

test('验证命令检查接受合法写入入口与占位符变化，仍保护命令和版本参数', () => {
  for (const executable of ['buildr', '<selected-writer-buildr>']) {
    const commands = `${executable} task verification inspect <id> --target <workspace>
${executable} task verification record <id> --report <file> --expected-report <digest>`;
    assert.deepEqual(validateTaskVerificationSkillCommands(commands), []);
    assert.deepEqual(validateTaskVerificationSkillCommands(commands.replaceAll(' task ', '  task  ')), []);
    for (const action of ['inspect', 'record']) {
      assert.ok(validateTaskVerificationSkillCommands(commands.replaceAll(`verification ${action}`, `verification removed-${action}`)).length);
    }
    assert.ok(validateTaskVerificationSkillCommands(commands.replace('--expected-report', '--removed-report')).length);
  }
  assert.ok(validateTaskVerificationSkillCommands('文字提到 task verification inspect 和 task verification record，但没有命令。').length);
});

test('显式不安全类型检查不误报英文文案、字符串、属性名与注释', () => {
  for (const source of [
    'const message = "any Requirement";',
    '// any is an English word\nconst value: unknown = 1;',
    'const message = `中文 any Requirement`;',
    'const object = { any: 1 }; object.any;',
    'type Message = "any";',
    'type NamedProperty = { any: string; };',
    'type NamedMethod = { any(): string; };',
    'type Message = `any`;',
  ]) assert.equal(hasExplicitAnyType(source), false, source);
  for (const source of [
    'const value: any = 1;',
    'const value = 1 as any;',
    'type Values = Array<any>;',
    'type Values = Record<string, any>;',
    'type Value = any;',
    'function value<T extends any>() {}',
    'const message = "any"; const value: any = 1;',
    'const message = `value ${1 as any}`;',
  ]) assert.equal(hasExplicitAnyType(source), true, source);
});
