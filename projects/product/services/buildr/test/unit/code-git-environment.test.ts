import assert from 'node:assert/strict';
import test from 'node:test';
import { codeGitEnvironment } from '../../src/modules/code/infrastructure/code-git-environment.ts';

test('effective configuration choices remain while repository redirection and arbitrary Git injection are removed', () => {
  const environment = codeGitEnvironment({ PATH: '/fixture/bin', GIT_CONFIG_SYSTEM: '/fixture/system', GIT_CONFIG_GLOBAL: '/fixture/global', GIT_CONFIG_NOSYSTEM: '1', GIT_DIR: '/wrong/repository', GIT_WORK_TREE: '/wrong/tree', GIT_INDEX_FILE: '/wrong/index', GIT_OBJECT_DIRECTORY: '/wrong/objects', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'remote.origin.url', GIT_CONFIG_VALUE_0: '/wrong/remote', GIT_TERMINAL_PROMPT: '1', GIT_NO_LAZY_FETCH: '0', GCM_INTERACTIVE: '1' });
  assert.deepEqual(environment, { PATH: '/fixture/bin', GIT_CONFIG_SYSTEM: '/fixture/system', GIT_CONFIG_GLOBAL: '/fixture/global', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: '0', GIT_NO_LAZY_FETCH: '1' });
  assert.equal(codeGitEnvironment({}).GIT_CONFIG_NOSYSTEM, undefined, 'Buildr must not disable the platform default system configuration');
});

test('case-insensitive Git environment names cannot bypass Windows repository isolation', () => {
  const environment = codeGitEnvironment({ git_config_system: '/fixture/system', Git_Work_Tree: '/wrong/tree', git_config_count: '1', git_config_key_0: 'core.bare', git_config_value_0: 'true' });
  assert.equal(environment.GIT_CONFIG_SYSTEM, '/fixture/system');
  assert.deepEqual(Object.keys(environment).sort(), ['GCM_INTERACTIVE', 'GIT_CONFIG_SYSTEM', 'GIT_NO_LAZY_FETCH', 'GIT_TERMINAL_PROMPT']);
});
