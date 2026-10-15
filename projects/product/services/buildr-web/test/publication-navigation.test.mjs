import assert from 'node:assert/strict';
import test from 'node:test';
import { articleEditorRemains, shouldBlockArticleNavigation } from '../src/features/publication/publication-navigation.ts';

test('普通工作空间页面、查询和锚点跳转保留原文章编辑现场', () => {
  for (const path of [
    '/workspaces/w', '/workspaces/w/', '/workspaces/w/overview',
    '/workspaces/w/projects/product', '/workspaces/w/services/product/buildr/edit',
    '/workspaces/w/tasks/task/changes/product/change', '/workspaces/w/articles/product/article/edit',
    '/workspaces/w/code/source-control?repository=r#changes', '/workspaces/w/unknown-page',
  ]) {
    assert.equal(articleEditorRemains('w', path), true, path);
    assert.equal(shouldBlockArticleNavigation('w', path, { dirty: true, busy: false }), false, path);
    assert.equal(shouldBlockArticleNavigation('w', path, { dirty: false, busy: true }), false, path);
  }
});

test('目录、不同工作空间和独立原型释放编辑现场，有输入或保存中时阻止离开', () => {
  for (const path of [
    '/', '/?catalog=1', '/unknown', '/workspaces/other/overview', '/workspaces/w-other/articles',
    '/workspaces/w/tasks/task/prototypes', '/workspaces/w/tasks/task/prototypes/',
    '/workspaces/w/tasks/task/prototypes?path=index.html',
  ]) {
    assert.equal(articleEditorRemains('w', path), false, path);
    for (const state of [{ dirty: true, busy: false }, { dirty: false, busy: true }, { dirty: true, busy: true }]) {
      assert.equal(shouldBlockArticleNavigation('w', path, state), true, path);
    }
    assert.equal(shouldBlockArticleNavigation('w', path, { dirty: false, busy: false }), false, path);
  }
});

test('路径使用路由器的编码及匹配语义，身份与原型边界不能由简单前缀判断', () => {
  assert.equal(articleEditorRemains('空间 一', '/workspaces/%E7%A9%BA%E9%97%B4%20%E4%B8%80/articles'), true);
  assert.equal(articleEditorRemains('w', '/WORKSPACES/w/ARTICLES'), true);
  assert.equal(articleEditorRemains('w', '/workspaces/W/articles'), false);
  assert.equal(articleEditorRemains('w', '/workspaces/w/tasks/task/PROTOTYPES'), false);
  // App's unmatched workspace paths redirect within its existing layout.
  assert.equal(articleEditorRemains('w', '/workspaces/w/tasks/task/prototypes/unknown'), true);
  assert.equal(articleEditorRemains('w', '/workspaces/w/tasks/prototypes'), true);
});
