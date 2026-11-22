import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function runTaskMaterialsJourney({ t, page, runtime, materials, workspaceRoot, workspaceUrl, runBuildr, capture }: any) {
  const simple = 'materials-simple';
  const scenario = async (name: string, action: () => Promise<void>) => {
    await t.test(name, async () => {
      await page.goto('about:blank');
      await action();
    });
  };
  const inputs = path.join(workspaceRoot, '.buildr/local/materials-browser-inputs');
  fs.mkdirSync(inputs, { recursive: true });
  const json = (name: string, value: unknown) => {
    const file = path.join(inputs, `${name}.json`);
    fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
    return file;
  };
  const markdown = (name: string, value: string) => {
    const file = path.join(inputs, `${name}.md`);
    fs.writeFileSync(file, value);
    return file;
  };
  const cli = (args: string[]) => runBuildr([...args, '--target', workspaceRoot, '--json']);
  const local = (id: string, role: string, title: string, file: string) => ({ id, role, title, source: { kind: 'task', path: file } });
  const write = (id: string, file: string, content: string, expected = 'absent') =>
    materials.writeTaskMaterialDocument(workspaceRoot, id, { path: file, content, expectedDocumentDigest: expected });
  const writeBrief = (id: string, content: string) =>
    runtime.updateTask(workspaceRoot, id, { brief: content, expectedRecordDigest: runtime.inspectTask(workspaceRoot, id).recordDigest });
  const body = () => page.locator('#task-node-content:visible');
  const open = async (id: string) => {
    await page.goto(`${workspaceUrl}/tasks/${id}`);
    await page.locator('#task-detail-id').filter({ hasText: id }).waitFor({ state: 'visible' });
  };
  const refresh = async () => {
    await page.locator('#task-detail-refresh:not(.ant-btn-loading)').click();
    await page.locator('#task-detail-refresh:not(.ant-btn-loading)').waitFor({ state: 'visible' });
  };

  const brief = '# 简单修复说明\n\n问题：窄栏标题被挤压。目标：保持标题可读。范围：仅目录头，不改变业务操作。\n';
  cli(['task', 'create', simple, '--title', '独立任务材料简单修复', '--intent', '验证任务独立材料的真实读取。', '--project', 'demo', '--service', 'demo/api', '--brief-file', markdown(`${simple}-initial-brief`, brief)]);
  cli(['task', 'materials', 'write', simple, '--path', 'solution.md', '--content', markdown('cli-solution', '# 短方案\n\n复用目录布局，按实际容器宽度排列操作。\n'), '--expected-document', 'absent']);
  write(simple, 'implementation.md', '# 实施过程\n\n只修改布局并检查窄栏，不改变业务操作。\n');
  write(simple, 'delivery.md', '# 交付材料\n\n浏览器夹具中的可读交付说明。\n');
  const references = [
    local('solution', 'solution', '修复方案', 'solution.md'),
    local('implementation', 'implementation', '实施过程', 'implementation.md'),
    local('delivery', 'delivery', '交付说明', 'delivery.md'),
  ];
  cli(['task', 'materials', 'record', simple, '--materials', json(simple, { schemaVersion: 'buildr.task-materials/v2', documents: references }), '--expected-current', 'absent']);

  await scenario('任务说明正文在需求节点读取、支持 Mermaid 绘图与页面编辑保存', async () => {
    await open(simple);
    await body().locator('.markdown-body').filter({ hasText: '窄栏标题被挤压' }).waitFor({ state: 'visible' });
    assert.equal(await body().locator('.markdown-reader-toolbar').count(), 0);

    writeBrief(simple, `${brief}\n\`\`\`mermaid\nflowchart LR\nA[用户目标] --> B[智能体执行] --> C[交付成果]\n\`\`\`\n`);
    await refresh();
    await body().locator('.markdown-diagram-view svg').waitFor();
    assert.match(await body().locator('.markdown-diagram-view').innerText(), /用户目标/);

    await page.locator('#task-more-actions').click();
    await page.locator('#task-edit-action').click();
    await page.locator('#task-edit-brief').fill(`${brief}\n页面编辑保存新说明。\n`);
    await page.locator('#task-edit-button').click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });

    await refresh();
    await body().locator('.markdown-body').filter({ hasText: '页面编辑保存新说明' }).waitFor({ state: 'visible' });
    await capture(page, 'task-materials-brief.png');
  });

  await scenario('任务材料按方案、实施、交付分组读取，并展示独立审查与验证证据', async () => {
    cli(['task', 'review', 'record', simple, '--type', 'planning', '--subject-identity', 'fixture:planning', '--method', 'self', '--reviewed', '浏览器材料夹具', '--outcome', 'accepted', '--summary', '无规范变更的真实方案审查夹具', '--expected-current', 'absent']);
    const check = { id: 'fixture-check', project: 'demo', testing: 'demo.browser', selection: 'task-related', targets: ['隔离材料夹具'], source: 'agent', outcome: 'passed', summary: '用于验证页面检查状态的显式夹具。' };
    cli(['task', 'verification', 'record', simple, '--report', json('verification-passed', { contentIdentity: 'fixture:passed', contentSummary: '隔离浏览器报告夹具', checks: [check], gaps: [], conclusion: { outcome: 'passed', summary: '实际通过夹具' } }), '--expected-report', 'absent']);

    await open(simple);
    await page.locator('[data-task-node=design]').click();
    await body().getByRole('menuitem').filter({ hasText: '修复方案' }).click();
    await body().locator('.markdown-body').filter({ hasText: '复用目录布局' }).waitFor({ state: 'visible' });
    await body().locator('[data-task-content=review]').click();
    await page.locator('#task-review-result').filter({ hasText: '方案审查夹具' }).waitFor({ state: 'visible' });

    await page.locator('[data-task-node=implementation]').click();
    await body().getByRole('menuitem').filter({ hasText: '实施过程' }).click();
    await body().locator('.markdown-body').filter({ hasText: '只修改布局' }).waitFor({ state: 'visible' });
    await body().locator('[data-task-content=verification]').click();
    await page.locator('#task-verification-result').filter({ hasText: '实际通过夹具' }).waitFor({ state: 'visible' });

    await page.locator('[data-task-node=closeout]').click();
    await body().getByRole('menuitem').filter({ hasText: '交付说明' }).click();
    await body().locator('.markdown-body').filter({ hasText: '可读交付说明' }).waitFor({ state: 'visible' });
    assert.deepEqual(runtime.inspectTask(workspaceRoot, simple).record.changes, []);
  });
}
