import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTaskBriefReference, taskBriefHref } from '../src/lib/taskBriefLinks.ts';
import { resolveTaskDocumentReference } from '../src/lib/taskDocumentLinks.ts';
import { createTaskReadingHistory } from '../src/features/task/task-reading-history.ts';

test('任务说明逻辑引用只识别合法任务身份，归档目录和文件来源不参与解析', () => {
  for (const id of ['one', 'a', 'task-brief-record', 'same.task_1']) {
    assert.equal(resolveTaskBriefReference(`@task/${id}`), id);
    assert.equal(taskBriefHref(id, '/workspaces/current/tasks'), `/workspaces/current/tasks/${id}`);
    assert.equal(taskBriefHref(id, '/workspaces/current/projects/demo'), `/workspaces/current/tasks/${id}`);
  }
  for (const href of ['@task/', '@task/../one', '@task/a/brief', '@task/%2e%2e', '@task/%2fone', '@task/One', '@task/one#body', '@task/one?workspace=other', '@task/https://example.com', '@task/a\\b', '@task/a\0b', '@task/a-', '@task/-a', '@project/tasks/one/brief.md', 'https://example.com/tasks/one']) assert.equal(resolveTaskBriefReference(href), null, href);
  assert.equal(taskBriefHref('one', '/'), '/tasks/one');
});

test('明确项目引用按已登记身份解析attached绝对来源，scope外或越界引用拒绝', () => {
  const projects = [{ code: 'attached', name: '外接项目', source: { path: '/private/tmp/attached-project' } }, { code: 'other', source: { path: 'projects/other' } }];
  const scope = { projects: ['attached'], services: [] };
  const reference = resolveTaskDocumentReference('projects/attached/docs/目标%20资料.md', scope, projects);
  assert.equal(reference.projectCode, 'attached'); assert.equal(reference.documentPath, 'docs/目标 资料.md');
  assert.equal(reference.workspacePath, 'projects/attached/docs/目标 资料.md');
  assert.equal(resolveTaskDocumentReference('projects/attached/docs/a.md', { projects: [], services: [], changes: [{ project: 'attached' }] }, projects).projectCode, 'attached', '沿用记录中的Change项目范围');
  assert.equal(resolveTaskDocumentReference('projects/missing/docs/a.md', { projects: [], services: [], changes: [{ project: 'missing' }] }, projects), null, 'Change不能伪造不存在的登记项目');
  for (const href of ['projects/other/readme.md', 'projects/missing/readme.md', 'projects/attached/../outside.md', 'projects/attached/%2e%2e/outside.md', '/private/tmp/attached-project/readme.md']) assert.equal(resolveTaskDocumentReference(href, scope, projects), null, href);
  assert.equal(resolveTaskDocumentReference('custom/source/docs/a.md', { projects: ['custom'], services: [] }, [{ code: 'custom', source: { path: 'custom/source' } }]).documentPath, 'docs/a.md', '既有工作空间路径仍可解析');
});

test('任务阅读历史有界并按工作空间隔离，读取副本不会改变已记住的位置', () => {
  const history = createTaskReadingHistory(2);
  const snapshot = { selected: 'design', choices: { design: 'change:brief' }, trail: [], positions: { 'design:change:brief:': 640 } };
  history.remember('workspace-A', 'same', snapshot);
  history.remember('workspace-B', 'same', { ...snapshot, positions: { 'design:change:brief:': 200 } });
  const current = history.read('workspace-A', 'same');
  assert.equal(current.positions['design:change:brief:'], 640);
  current.positions['design:change:brief:'] = 10;
  assert.equal(history.read('workspace-A', 'same').positions['design:change:brief:'], 640);
  assert.equal(history.read('workspace-B', 'same').positions['design:change:brief:'], 200);
  history.remember('workspace-C', 'new', snapshot);
  assert.equal(history.read('workspace-A', 'same'), null);
  assert.equal(history.read('workspace-C', 'same'), null);
});

test('同任务历史条目分别保留方案与说明位置，后退不会被正文快照覆盖', () => {
  const history = createTaskReadingHistory();
  const design = { selected: 'design', choices: { design: 'change:brief' }, trail: [], positions: { 'design:change:brief:': 640 } };
  const brief = { selected: 'requirements', choices: {}, trail: [], positions: { 'requirements::': 0 } };
  history.remember('workspace-A', 'same', design, 'before-link');
  history.remember('workspace-A', 'same', brief, 'after-link');
  assert.equal(history.read('workspace-A', 'same', 'before-link').selected, 'design');
  assert.equal(history.read('workspace-A', 'same', 'before-link').positions['design:change:brief:'], 640);
  assert.equal(history.read('workspace-A', 'same', 'after-link').selected, 'requirements');
  assert.equal(history.read('workspace-B', 'same', 'before-link'), null);
});
