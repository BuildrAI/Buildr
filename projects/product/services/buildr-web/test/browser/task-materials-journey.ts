import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// All successful reads come from the production host. Fixtures are explicitly
// created through the public CLI; no real workspace or task history is changed.
export async function runTaskMaterialsJourney({ t, page, runtime, workspaceRoot, workspaceUrl, runBuildr, runGit, capture, expectedBrowserErrors }: any) {
  const simple = 'materials-simple', empty = 'materials-intent-only', history = 'materials-history';
  // Diagnostic selection retains the same production host and fixture boundary.
  const focus = process.env.BUILDR_TASK_MATERIALS_FOCUS || '';
  const scenario = async (name: string, action: () => Promise<void>) => { if (!focus || name.includes(focus)) await t.test(name, action); };
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
  const inspect = (id: string) => cli(['task', 'materials', 'inspect', id]);
  const local = (id: string, role: string, title: string, file: string) => ({ id, role, title, source: { kind: 'task', path: file } });
  const write = (id: string, file: string, content: string, expected = 'absent') => cli(['task', 'materials', 'write', id, '--path', file, '--content', markdown(`${id}-${file.replaceAll('/', '-')}`, content), '--expected-document', expected]);
  const associate = (id: string, documents: unknown[], expected = 'absent') => cli(['task', 'materials', 'record', id, '--materials', json(id, { schemaVersion: 'buildr.task-materials/v2', documents }), '--expected-current', expected]);
  const writeBrief = (id: string, content: string) => cli(['task', 'update', id, '--brief-file', markdown(`${id}-record-brief`, content), '--expected-record', runtime.inspectTask(workspaceRoot, id).recordDigest]);
  const body = () => page.locator('#task-node-content:visible');
  const open = async (id: string) => {
    await page.goto(`${workspaceUrl}/tasks/${id}`);
    await page.locator('#task-detail-id').filter({ hasText: id }).waitFor({ state: 'visible' });
  };
  const refresh = async () => {
    await page.locator('#task-detail-refresh:not(.ant-btn-loading)').click();
    await page.locator('#task-detail-refresh:not(.ant-btn-loading)').waitFor({ state: 'visible' });
  };
  const brief = '# 简单修复说明\n\n问题：窄栏标题被挤压。目标：保持标题可读。范围：仅目录头，不改变业务操作。完成依据：窄栏标题、说明及按钮均可读且不越界。\n';
  for (const [id, title] of [[simple, '独立任务材料简单修复'], [empty, '只有短目标的任务'], [history, '多变更历史材料任务']]) {
    cli(['task', 'create', id, '--title', title, '--intent', id === empty ? '只有短目标，没有说明正文。' : '验证任务独立材料的真实读取。', '--project', 'demo', '--service', 'demo/api', ...(id === simple ? ['--brief-file', markdown(`${id}-initial-brief`, brief)] : []), ...(id === history ? ['--change', 'demo/browser-flow', '--change', 'demo/archived-flow'] : [])]);
  }
  const recordBefore = runtime.inspectTask(workspaceRoot, simple);
  write(simple, 'solution.md', '# 短方案\n\n复用目录布局，按实际容器宽度排列操作。\n');
  write(simple, 'implementation.md', '# 实施过程\n\n只修改布局并检查窄栏，不改变业务操作。\n');
  write(simple, 'delivery.md', '# 交付材料\n\n浏览器夹具中的可读交付说明，不是本框架任务的交付报告。\n');
  const references = [local('solution', 'solution', '修复方案', 'solution.md'), local('implementation', 'implementation', '实施过程', 'implementation.md'), local('delivery', 'delivery', '交付说明', 'delivery.md')];
  associate(simple, references);
  assert.deepEqual(runtime.inspectTask(workspaceRoot, simple).record, recordBefore.record, '材料写入不得重写任务状态、时间或结果历史');
  assert.equal(runtime.inspectTask(workspaceRoot, simple).recordDigest, recordBefore.recordDigest);
  assert.deepEqual(runtime.inspectTask(workspaceRoot, simple).record.changes, []);

  await scenario('任务材料：从列表直接打开无变更修复，说明正文在真实节点且刷新仍可读', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator(`#task-table-body [data-task-id="${simple}"]`).waitFor({ state: 'visible' });
    const listUrl = page.url();
    await page.locator(`#task-table-body [data-task-id="${simple}"]`).click();
    await body().locator('.markdown-body').filter({ hasText: '完成依据：窄栏标题' }).waitFor({ state: 'visible' });
    const originalViewport = page.viewportSize();
    try {
      for (const width of [1920, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 1920) await page.getByRole('button', { name: '展开阅读', exact: true }).click();
        const geometry = await body().locator('[data-task-brief]').evaluate((reader: HTMLElement) => {
          const parent = reader.parentElement!, frame = parent.getBoundingClientRect(), style = getComputedStyle(parent), rect = reader.getBoundingClientRect();
          return { width: rect.width, left: rect.left - frame.left - parseFloat(style.paddingLeft), right: frame.left + parent.clientWidth - parseFloat(style.paddingRight) - rect.right, viewportRight: rect.right, bodyBorder: getComputedStyle(reader.querySelector('.markdown-body')!).borderTopWidth, bodyPadding: getComputedStyle(reader.querySelector('.markdown-body')!).paddingTop, mainWidth: parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
        });
        assert.equal(await body().locator('.markdown-reader-toolbar').count(), 0, 'brief directly displays the body without a source toolbar');
        assert.equal(await body().getByRole('button', { name: '查看原文', exact: true }).count(), 0);
        assert.equal(geometry.bodyBorder, '0px', '任务说明正文不应套额外面板边框');
        assert.equal(geometry.bodyPadding, '0px', '正文沿用阅读排版');
        assert.equal(await body().locator('.task-material-meta, .task-node-directory').count(), 0, 'brief uses the main area without extra metadata or a menu');
        assert.ok(Math.abs(geometry.width - geometry.mainWidth) < 2, `任务说明遵守文档阅读上限：${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.left - geometry.right) < 2, `任务说明居中阅读：${JSON.stringify(geometry)}`);
        if (width === 1920) assert.ok(geometry.width > 1040, '宽屏任务说明使用加宽后的阅读区');
        else assert.ok(geometry.viewportRight <= width + 1, '窄屏任务说明保持可读且不越界');
        await capture(page, `task-record-brief-${width}.png`);
        if (width === 1920) await page.getByRole('button', { name: '恢复分屏', exact: true }).click();
      }
    } finally { if (originalViewport) await page.setViewportSize(originalViewport); }
    assert.equal(page.url(), listUrl, '沿用任务列表副屏，而不是打开顶部普通链接');
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(await body().innerText(), /暂无补充需求或说明|历史变更说明/);
    await refresh();
    await body().locator('.markdown-body').filter({ hasText: '完成依据：窄栏标题' }).waitFor({ state: 'visible' });
    await page.reload();
    // If the shell has not retained selection, reopen from the actual list.
    if (!await page.locator(`#task-detail-main[data-task-id="${simple}"]:visible`).count()) await page.locator(`#task-table-body [data-task-id="${simple}"]`).click();
    await body().locator('.markdown-body').filter({ hasText: '完成依据：窄栏标题' }).waitFor({ state: 'visible' });
    await capture(page, 'task-materials-no-change-direct-node.png');
  });

  await scenario('任务材料：短intent不伪装正文，方案实施交付按真实角色组织', async () => {
    await open(empty);
    await body().locator('.task-node-empty').waitFor({ state: 'visible' });
    assert.equal(await body().locator('.markdown-body').count(), 0);
    assert.doesNotMatch(await body().innerText(), /只有短目标，没有说明正文/);
    await open(simple);
    await body().locator('.markdown-body').filter({ hasText: '完成依据：窄栏标题' }).waitFor({ state: 'visible' });
    assert.equal(await body().locator('.markdown-reader-toolbar').count(), 0);
    assert.equal(await body().getByRole('button', { name: '查看原文', exact: true }).count(), 0);
    assert.equal(await body().locator('[data-task-brief]').getAttribute('data-task-brief-version'), runtime.inspectTask(workspaceRoot, simple).recordDigest);
    await capture(page, 'task-record-brief-no-source.png');
    for (const [node, text] of [['design', '复用目录布局'], ['implementation', '只修改布局'], ['closeout', '可读交付说明']]) {
      await page.locator(`[data-task-node=${node}]`).click();
      const menu = body().getByRole('menuitem').filter({ hasText: node === 'design' ? '修复方案' : node === 'implementation' ? '实施过程' : '交付说明' });
      if (await menu.count()) await menu.click();
      await body().locator('.markdown-body').filter({ hasText: text }).waitFor({ state: 'visible' });
      await body().getByRole('button', { name: '查看原文', exact: true }).click();
      await body().getByLabel('Markdown 原文', { exact: true }).filter({ hasText: text }).waitFor({ state: 'visible' });
      await body().getByRole('button', { name: '阅读模式', exact: true }).click();
      await body().locator('.markdown-body').filter({ hasText: text }).waitFor({ state: 'visible' });
    }
    await open(history);
    await page.locator('[data-task-node=design]').click();
    await body().locator('.markdown-reader-toolbar > span').filter({ hasText: 'proposal.md' }).waitFor({ state: 'visible' });
    await body().getByRole('button', { name: '查看原文', exact: true }).click();
    await body().getByLabel('Markdown 原文', { exact: true }).waitFor({ state: 'visible' });
    assert.ok((await body().getByLabel('Markdown 原文', { exact: true }).innerText()).trim());
    await body().getByRole('button', { name: '阅读模式', exact: true }).click();
    await body().locator('.markdown-body').waitFor({ state: 'visible' });
    await capture(page, 'task-record-solution-source-retained.png');
    const composite = 'materials-direct-composite';
    cli(['task', 'create', composite, '--title', '直接显示组合任务说明', '--intent', '读取组合任务记录中的正文。', '--parent-task', '--brief-file', markdown(`${composite}-brief`, '# 组合任务正文\n\n组合任务直接显示说明，没有原文切换。\n')]);
    await open(composite);
    await body().locator('[data-task-brief] .markdown-body').filter({ hasText: '组合任务直接显示说明' }).waitFor({ state: 'visible' });
    assert.equal(await body().locator('.markdown-reader-toolbar').count(), 0);
    assert.equal(await body().getByRole('button', { name: '查看原文', exact: true }).count(), 0);
    await capture(page, 'task-record-composite-brief-no-source.png');
  });

  await scenario('任务材料：无OpenSpec也可读取独立审查及失败、未覆盖、通过证据', async () => {
    const review = (type: string, summary: string) => cli(['task', 'review', 'record', simple, '--type', type, '--subject-identity', `fixture:${type}`, '--method', 'self', '--reviewed', '浏览器材料夹具', '--outcome', 'accepted', '--summary', summary, '--expected-current', 'absent']);
    review('planning', '无规范变更的真实方案审查夹具');
    review('completion', '无规范变更的实现审查夹具');
    const verification = (expected: string, outcome: string, checks: unknown[], gaps: unknown[], summary: string) => cli(['task', 'verification', 'record', simple, '--report', json(`verification-${outcome}`, { contentIdentity: `fixture:${outcome}`, contentSummary: '隔离浏览器报告夹具', checks, gaps, conclusion: { outcome, summary } }), '--expected-report', expected]);
    const check = (outcome: string) => ({ id: 'fixture-check', project: 'demo', testing: 'demo.browser', selection: 'task-related', targets: ['隔离材料夹具'], source: 'agent', outcome, summary: '用于验证页面检查状态的显式夹具。' });
    verification('absent', 'incomplete', [], [{ testing: 'demo.browser', project: 'demo', reason: '本检查需要，但尚未执行；不是不适用。' }], '必要验证尚未执行');
    await open(simple);
    await page.locator('[data-task-node=design]').click(); await body().locator('[data-task-content=review]').click();
    await page.locator('#task-review-result').filter({ hasText: '方案审查夹具' }).waitFor({ state: 'visible' });
    await page.locator('[data-task-node=implementation]').click(); await body().locator('[data-task-content=review]').click();
    await page.locator('#task-review-result').filter({ hasText: '实现审查夹具' }).waitFor({ state: 'visible' });
    await body().locator('[data-task-content=verification]').click();
    await page.locator('#task-verification-result').filter({ hasText: '必要验证尚未执行' }).waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-verification-result').innerText(), /本检查需要，但尚未执行/);
    assert.doesNotMatch(await page.locator('#task-verification-result .task-report-title').innerText(), /通过|失败/);
    let report = cli(['task', 'verification', 'inspect', simple]);
    verification(report.slot.reportDigest, 'not-passed', [check('failed')], [], '实际执行失败夹具');
    await refresh(); await page.locator('#task-verification-result').filter({ hasText: '实际执行失败夹具' }).waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-verification-result').innerText(), /未通过/);
    report = cli(['task', 'verification', 'inspect', simple]);
    verification(report.slot.reportDigest, 'passed', [check('passed')], [], '实际通过夹具');
    await refresh(); await page.locator('#task-verification-result').filter({ hasText: '实际通过夹具' }).waitFor({ state: 'visible' });
    assert.doesNotMatch(await page.locator('#task-verification-result').innerText(), /执行失败夹具|尚未执行/);
    assert.deepEqual(runtime.inspectTask(workspaceRoot, simple).record.changes, []);
  });

  await scenario('任务说明：记录正文更新显示新版本，清空不回退历史变更说明', async () => {
    await open(simple);
    const previous = runtime.inspectTask(workspaceRoot, simple);
    writeBrief(simple, `${brief}\n修改后的当前说明版本二。\n`);
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '当前说明版本二' }).waitFor({ state: 'visible' });
    assert.notEqual(runtime.inspectTask(workspaceRoot, simple).recordDigest, previous.recordDigest);
    await page.reload(); await body().locator('.markdown-body').filter({ hasText: '当前说明版本二' }).waitFor({ state: 'visible' });
    assert.equal(await body().locator('.markdown-reader-toolbar').count(), 0);
    await open(history);
    await body().getByText('尚未填写任务说明。', { exact: true }).waitFor({ state: 'visible' });
    assert.doesNotMatch(await body().innerText(), /普通用户先从这里了解变更/);
    const content = '# 历史任务当前独立说明\n\n这是本次新保存的记录正文，不伪装过去已有。\n';
    writeBrief(history, content);
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '本次新保存的记录正文' }).waitFor({ state: 'visible' });
    cli(['task', 'update', history, '--clear-brief', '--expected-record', runtime.inspectTask(workspaceRoot, history).recordDigest]);
    await refresh(); await body().getByText('尚未填写任务说明。', { exact: true }).waitFor({ state: 'visible' });
    assert.doesNotMatch(await body().innerText(), /普通用户先从这里了解变更|本次新保存的记录正文/);
    writeBrief(history, content);
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '本次新保存的记录正文' }).waitFor({ state: 'visible' });
  });

  await scenario('任务材料：变更清单独立阅读，方案优先展示提案并区分变更说明', async () => {
    await open(history);
    await body().locator('.markdown-body').filter({ hasText: '本次新保存的记录正文' }).waitFor({ state: 'visible' });
    await page.locator('[data-task-node=design]').click();
    await body().locator('.markdown-reader-toolbar > span').filter({ hasText: 'proposal.md' }).waitFor({ state: 'visible' });
    const auxiliary = body().getByRole('menuitem', { name: 'demo/browser-flow', exact: true });
    await auxiliary.click();
    await body().locator('.markdown-reader-toolbar > span').filter({ hasText: '变更说明' }).waitFor({ state: 'visible' });
    assert.match(await body().innerText(), /关联变更说明/);
    assert.doesNotMatch(await body().locator('.markdown-reader-toolbar > span').innerText(), /^brief\.md$/);
    await page.locator('[data-task-node=implementation]').click();
    assert.equal(await body().locator('[data-task-artifact$="tasks.md"]').count(), 0);
    assert.doesNotMatch(await body().innerText(), /实施清单/);
    await page.locator('#task-checklist-toggle').hover();
    const checklist = page.locator('#task-checklist-panel:visible');
    await checklist.locator('.markdown-body').first().waitFor({ state: 'visible' });
    assert.equal(await checklist.locator('.markdown-body').count(), 2, '两个关联变更的实施清单仍分别可读');
    await capture(page, 'task-materials-checklist-independent.png');
    await page.locator('[data-task-node=requirements]').click();
    await body().locator('.markdown-body').filter({ hasText: '本次新保存的记录正文' }).waitFor({ state: 'visible' });
  });

  await scenario('任务说明：编辑正文保存到记录，冲突保留草稿并重读未编辑字段', async () => {
    await open(simple);
    await page.locator('#task-more-actions').click(); await page.locator('#task-edit-action').click();
    const draft = '# 页面编辑任务说明\n\n这是保留的正文草稿。\n';
    await page.locator('#task-edit-brief').fill(draft);
    const before = runtime.inspectTask(workspaceRoot, simple);
    cli(['task', 'update', simple, '--intent', '另一入口修改的一句话目标', '--brief-file', markdown('external-brief', '# 外部最新说明\n'), '--expected-record', before.recordDigest]);
    expectedBrowserErrors.add(`/tasks/${simple}`);
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-reread').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-edit-brief').inputValue(), draft);
    await page.locator('#task-edit-reread').click();
    await page.getByText('已重读，请核对后保存', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-edit-brief').inputValue(), draft);
    assert.equal(await page.locator('#task-edit-intent').inputValue(), '另一入口修改的一句话目标');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    await body().locator('.markdown-body').filter({ hasText: '保留的正文草稿' }).waitFor({ state: 'visible' });
    assert.equal(runtime.inspectTask(workspaceRoot, simple).record.brief, draft);
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '保留的正文草稿' }).waitFor({ state: 'visible' });
    await page.locator('#task-more-actions').click(); await page.locator('#task-edit-action').click();
    await page.locator('#task-edit-title').fill('正文冲突后保留的标题');
    writeBrief(simple, '# 未编辑字段的最新说明\n\n正文随重新观察更新。\n');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-reread').click();
    await page.getByText('已重读，请核对后保存', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-edit-title').inputValue(), '正文冲突后保留的标题');
    assert.match(await page.locator('#task-edit-brief').inputValue(), /正文随重新观察更新/);
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    await capture(page, 'task-record-brief-edited.png');
  });

  await scenario('任务材料：抽屉和实施清单重核或失败时明确标记上次读取，不冒充新版本', async () => {
    const document = runtime.inspectTask(workspaceRoot, simple).record;
    writeBrief(simple, `${document.brief}\n[阅读实施过程](implementation.md)\n`);
    await open(simple);
    await body().getByRole('link', { name: '阅读实施过程', exact: true }).click();
    const drawer = page.locator('.task-reading-drawer.ant-drawer-open');
    await drawer.locator('.markdown-body').filter({ hasText: '只修改布局' }).waitFor({ state: 'visible' });
    const implementation = inspect(simple).documents.find((item: any) => item.role === 'implementation');
    write(simple, 'implementation.md', `${implementation.content}\n抽屉真实新版本二。\n`, implementation.actualDigest);
    const routePattern = new RegExp(`/tasks/${simple}/materials(?:\\?|$)`);
    let release!: () => void; let observed!: () => void; let forwarded!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { observed = resolve; });
    const handled = new Promise<void>(resolve => { forwarded = resolve; });
    await page.route(routePattern, async (route: any) => {
      const actual = await route.fetch(); observed();
      try { await pending; await route.fulfill({ response: actual }); } finally { forwarded(); }
    });
    try {
      await page.locator('#task-reading-refresh').click(); await started;
      await drawer.getByText(/已读正文正在核对/).waitFor({ state: 'visible' });
      assert.doesNotMatch(await drawer.locator('.markdown-body').innerText(), /抽屉真实新版本二/);
    } finally { release(); await handled; await page.unroute(routePattern); }
    await drawer.locator('.markdown-body').filter({ hasText: '抽屉真实新版本二' }).waitFor({ state: 'visible' });
    const latest = inspect(simple).documents.find((item: any) => item.role === 'implementation');
    write(simple, 'implementation.md', `${latest.content}\n失败期间尚未读到的版本三。\n`, latest.actualDigest);
    const fail = (route: any) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'task_materials_probe_failed', message: '隔离材料读取失败夹具。' } }) });
    expectedBrowserErrors.add(`/tasks/${simple}/materials`);
    await page.route(routePattern, fail);
    try {
      await page.locator('#task-reading-refresh').click();
      await drawer.getByText(/尚未确认新版本/).waitFor({ state: 'visible' });
      assert.doesNotMatch(await drawer.locator('.markdown-body').innerText(), /尚未读到的版本三/);
      await drawer.getByRole('button', { name: '关闭内容阅读', exact: true }).click();
      await page.locator('#task-checklist-toggle').hover();
      const checklist = page.locator('#task-checklist-panel:visible');
      await checklist.getByText(/尚未确认新版本/).waitFor({ state: 'visible' });
      assert.doesNotMatch(await checklist.locator('.markdown-body').innerText(), /尚未读到的版本三/);
    } finally { await page.unroute(routePattern); }
    const currentRead = page.waitForResponse((response: any) => new URL(response.url()).pathname.endsWith(`/tasks/${simple}/materials`) && response.status() === 200);
    await refresh(); await currentRead;
    await page.locator('#task-checklist-toggle').hover();
    await page.locator('#task-checklist-panel:visible .markdown-body').filter({ hasText: '尚未读到的版本三' }).waitFor({ state: 'visible' });
  });

  await scenario('任务材料：清单初次读取、失败及旧空清单重核不误报暂无', async () => {
    const delayed = 'materials-checklist-unread', failed = 'materials-checklist-failed';
    for (const id of [delayed, failed]) {
      cli(['task', 'create', id, '--title', '清单读取状态夹具', '--intent', '核对未读材料的真实状态。', '--project', 'demo']);
      write(id, 'implementation.md', '# 独立实施材料\n\n清单读取成功后的真实正文。\n');
      associate(id, [local('impl', 'implementation', '实施材料', 'implementation.md')]);
    }
    const pattern = (id: string) => new RegExp(`/tasks/${id}/materials(?:\\?|$)`);
    let release!: () => void, observed!: () => void, forwarded!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { observed = resolve; });
    const handled = new Promise<void>(resolve => { forwarded = resolve; });
    await page.route(pattern(delayed), async (route: any) => {
      const response = await route.fetch(); observed();
      try { await pending; await route.fulfill({ response }); } finally { forwarded(); }
    });
    const checklist = page.locator('#task-checklist-panel:visible');
    try {
      await open(delayed); await started;
      await page.locator('#task-checklist-toggle').hover();
      await checklist.getByText('正在读取实施清单…', { exact: true }).waitFor({ state: 'visible' });
      assert.doesNotMatch(await checklist.innerText(), /暂无实施清单/);
    } finally { release(); await handled; await page.unroute(pattern(delayed)); }
    await checklist.locator('[data-task-material=impl]').filter({ hasText: '读取成功后的真实正文' }).waitFor({ state: 'visible' });
    await capture(page, 'task-materials-checklist-loaded.png');
    const fail = (route: any) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'task_materials_probe_failed', message: '清单读取失败夹具。' } }) });
    expectedBrowserErrors.add(`/tasks/${failed}/materials`);
    await page.route(pattern(failed), fail);
    try {
      await open(failed); await page.locator('#task-checklist-toggle').hover();
      await checklist.getByText(/任务材料读取失败/).waitFor({ state: 'visible' });
      assert.doesNotMatch(await checklist.innerText(), /暂无实施清单/);
      await capture(page, 'task-materials-checklist-first-failure.png');
    } finally { await page.unroute(pattern(failed)); }
    await open(empty); await page.locator('#task-checklist-toggle').hover();
    await checklist.getByText('暂无实施清单。', { exact: true }).waitFor({ state: 'visible' });
    write(empty, 'implementation.md', '# 新增实施材料\n\n空清单之后新增的真实正文。\n');
    associate(empty, [local('impl', 'implementation', '新增实施材料', 'implementation.md')]);
    expectedBrowserErrors.add(`/tasks/${empty}/materials`);
    await page.route(pattern(empty), fail);
    try {
      await refresh(); await page.locator('#task-checklist-toggle').hover();
      await checklist.getByText(/任务材料读取失败/).waitFor({ state: 'visible' });
      assert.doesNotMatch(await checklist.innerText(), /暂无实施清单/);
    } finally { await page.unroute(pattern(empty)); }
    await refresh(); await page.locator('#task-checklist-toggle').hover();
    await checklist.locator('[data-task-material=impl]').filter({ hasText: '空清单之后新增的真实正文' }).waitFor({ state: 'visible' });
  });

  await scenario('任务材料：项目路径别名互相引用仍保持正文版本和材料身份', async () => {
    const projectRoot = path.join(workspaceRoot, 'projects/demo');
    const directory = path.join(projectRoot, 'tasks/materials-alias');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'solution.md'), '# 别名方案\n\n[阅读关联实施材料](implementation.md)\n');
    fs.writeFileSync(path.join(directory, 'implementation.md'), '# 关联实施正文\n\n相同文件的不同路径写法保持材料身份。\n');
    for (const [id, aliasBrief] of [['materials-alias-brief', true], ['materials-alias-impl', false]] as const) {
      cli(['task', 'create', id, '--title', '别名材料阅读夹具', '--intent', '核对相同文件的材料身份。', '--project', 'demo']);
      associate(id, [
        { id: 'solution', role: 'solution', title: '别名方案', source: { kind: 'project', project: 'demo', path: `${aliasBrief ? '@project/' : ''}tasks/materials-alias/solution.md` } },
        { id: 'impl', role: 'implementation', title: '关联实施材料', source: { kind: 'project', project: 'demo', path: `${aliasBrief ? '' : '@project/'}tasks/materials-alias/implementation.md` } },
      ]);
      await open(id); await page.locator('[data-task-node=design]').click();
      await body().getByRole('link', { name: '阅读关联实施材料', exact: true }).click();
      const reader = page.locator('.task-reading-drawer.ant-drawer-open [data-task-material=impl]');
      await reader.filter({ hasText: '不同路径写法保持材料身份' }).waitFor({ state: 'visible' });
      const digest = inspect(id).documents.find((item: any) => item.id === 'impl').actualDigest;
      assert.equal(await reader.getAttribute('data-task-material-version'), digest, '关联材料仍保留真实正文版本，简洁阅读不丢失身份');
    }
    await capture(page, 'task-materials-alias-identity.png');
  });

  await scenario('任务说明：材料关联为空或失败仍直接显示记录正文', async () => {
    const routePattern = new RegExp(`/tasks/${simple}/materials(?:\\?|$)`);
    await page.route(routePattern, async (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 'buildr.task-materials-result/v2', taskId: simple, materialsDigest: 'absent', materials: { schemaVersion: 'buildr.task-materials/v2', documents: [] }, documents: [], diagnostics: [] }) }));
    try {
      await open(simple); await body().locator('[data-task-brief] .markdown-body').filter({ hasText: '正文随重新观察更新' }).waitFor({ state: 'visible' });
      assert.equal(await body().locator('.task-node-empty').count(), 0);
    } finally { await page.unroute(routePattern); }
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '正文随重新观察更新' }).waitFor({ state: 'visible' });
  });

  await scenario('任务说明：attached项目正文逻辑引用沿scope读取真实绝对来源', async () => {
    const source = path.join(path.dirname(workspaceRoot), 'attached-brief-project');
    fs.mkdirSync(path.join(source, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'docs/目标 资料.md'), '# 外接项目资料\n\n通过项目身份读取外接代码库的真实文件。\n');
    runGit(source, ['init', '-q', '--initial-branch=dev']);
    runGit(source, ['config', 'user.name', 'Buildr Browser Fixture']); runGit(source, ['config', 'user.email', 'fixture@example.com']);
    runGit(source, ['remote', 'add', 'origin', 'https://example.com/fixture/attached-project.git']);
    runGit(source, ['add', '.']); runGit(source, ['commit', '-qm', 'attached task brief fixture']);
    runBuildr(['project', 'create', 'attached', '--attach', source, '--name', '外接项目', '--target', workspaceRoot]);
    cli(['task', 'create', 'materials-attached-record', '--title', '外接项目说明引用', '--intent', '按项目身份阅读外接文件。', '--project', 'attached', '--brief-file', markdown('attached-record', '# 外接项目任务说明\n\n[查看项目资料](projects/attached/docs/目标%20资料.md)\n')]);
    await open('materials-attached-record');
    await body().getByRole('link', { name: '查看项目资料', exact: true }).click();
    await page.locator('.pane-right:visible .resource-reader .markdown-body').filter({ hasText: '通过项目身份读取外接代码库' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await body().locator('[data-task-brief=materials-attached-record]').filter({ hasText: '外接项目任务说明' }).waitFor({ state: 'visible' });
    await capture(page, 'task-record-attached-project-link.png');
  });

  await scenario('任务说明：只有Change项目引用仍按真实登记读取正文链接', async () => {
    const id = 'materials-change-only-record';
    cli(['task', 'create', id, '--title', '变更项目范围的说明链接', '--intent', '保留已有后端允许的项目阅读范围。', '--change', 'demo/browser-flow', '--brief-file', markdown(id, '# 只有变更项目引用\n\n[查看范围内文档](projects/demo/docs/task-reference.md)\n')]);
    const record = runtime.inspectTask(workspaceRoot, id).record;
    assert.deepEqual(record.scope, { projects: [], services: [] });
    await open(id); await body().getByRole('link', { name: '查看范围内文档', exact: true }).click();
    await page.locator('.pane-right:visible .resource-reader .markdown-body').filter({ hasText: '普通用户可以直接查看这份文档' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await body().locator('[data-task-brief]').filter({ hasText: '只有变更项目引用' }).waitFor({ state: 'visible' });
  });

  await scenario('任务说明：稳定任务引用同任务点击进入正文，后退恢复方案与阅读位置', async () => {
    for (const composite of [false, true]) {
    const id = composite ? 'materials-same-composite' : 'materials-same-task', change = `${id}-link`;
    const changeRoot = path.join(workspaceRoot, 'projects/demo/openspec/changes', change);
    fs.mkdirSync(changeRoot, { recursive: true });
    fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
    fs.writeFileSync(path.join(changeRoot, 'brief.md'), '# 当前任务的关联变更说明\n\n' + Array.from({ length: 35 }, (_, index) => `第 ${index + 1} 段：保留方案阅读位置。\n\n`).join('') + `[读取本任务说明](@task/${id})\n`);
    fs.writeFileSync(path.join(changeRoot, 'proposal.md'), '## Why\n\n同任务稳定链接夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'design.md'), '## Context\n\n同任务稳定链接夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] 验证同任务正文导航与返回。\n');
    cli(['task', 'create', id, '--title', '同任务说明链接', '--intent', '同任务明确阅读正文。', '--brief-file', markdown(`${id}-brief`, '# 本任务记录正文\n\n这是同一任务数据库中的正文。\n'), ...(composite ? ['--parent-task'] : []), '--project', 'demo', '--change', `demo/${change}`]);
    const unchanged = runtime.inspectTask(workspaceRoot, id).recordDigest;
    await open(id);
    await body().locator('[data-task-brief]').filter({ hasText: '这是同一任务数据库中的正文' }).waitFor({ state: 'visible' });
    assert.equal(await body().getByRole('button', { name: '查看原文', exact: true }).count(), 0);
    if (composite) {
      await body().locator('.ant-select').click();
      await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content').filter({ hasText: `demo/${change}` }).click();
    } else {
      await page.locator('[data-task-node=design]').click();
      await body().getByRole('menuitem', { name: `demo/${change}`, exact: true }).click();
    }
    const link = body().getByRole('link', { name: '读取本任务说明', exact: true });
    await link.scrollIntoViewIfNeeded();
    const reader = page.locator(`#task-detail-main:visible ${composite ? '.composite-task-reader' : '.task-node-reading'}`);
    const before = await reader.evaluate((reader: HTMLElement) => reader.scrollTop);
    assert.ok(before > 0);
    await link.click();
    await body().locator(`[data-task-brief="${id}"] .markdown-body`).filter({ hasText: '这是同一任务数据库中的正文' }).waitFor({ state: 'visible' });
    if (!composite) assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-selected'), 'true');
    else assert.equal(await page.getByRole('tab', { name: '概览', exact: true }).getAttribute('aria-selected'), 'true');
    await page.goBack();
    await body().getByRole('link', { name: '读取本任务说明', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(({ selector, top }: { selector: string; top: number }) => {
      const host = [...document.querySelectorAll<HTMLElement>(selector)].find(item => item.getClientRects().length > 0);
      return host && Math.abs(host.scrollTop - top) < 3;
    }, { selector: composite ? '.composite-task-reader' : '.task-node-reading', top: before }, { timeout: 3000 });
    if (!composite) assert.equal(await page.locator('[data-task-node=design]').getAttribute('aria-selected'), 'true');
    await page.goForward();
    await body().locator(`[data-task-brief="${id}"] .markdown-body`).filter({ hasText: '这是同一任务数据库中的正文' }).waitFor({ state: 'visible' });
    assert.equal(runtime.inspectTask(workspaceRoot, id).recordDigest, unchanged, '说明导航不修改任务记录');
    await capture(page, composite ? 'task-record-brief-same-composite-link.png' : 'task-record-brief-same-task-link.png');
    }
  });

  await scenario('任务说明：稳定任务引用在真实归档前后保持身份，明确旧文件仍读原文', async () => {
    const projectRoot = path.join(workspaceRoot, 'projects/demo');
    const taskFile = path.join(projectRoot, 'tasks/materials-linked/brief.md');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, '# 保留的历史说明文件\n\n明确文件引用仍读取原文，不自动改成数据库记录。\n');
    const change = 'materials-archive-link';
    const changeRoot = path.join(projectRoot, 'openspec/changes', change);
    fs.mkdirSync(path.join(changeRoot, 'specs/materials-link-fixture'), { recursive: true });
    fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
    fs.writeFileSync(path.join(changeRoot, 'brief.md'), '# 本次具体变化\n\n[查看历史文件](@project/tasks/materials-linked/brief.md)\n\n[非法任务引用](@task/../other)\n\n' + Array.from({ length: 35 }, (_, index) => `阅读位置段落 ${index + 1}：保留关联阅读上下文。\n\n`).join('') + '[查看唯一任务说明](@task/materials-linked)\n');
    fs.writeFileSync(path.join(changeRoot, 'proposal.md'), '## Why\n\n验证归档引用。\n\n## What Changes\n\n稳定任务说明入口。\n\n## Capabilities\n\n### New Capabilities\n- `materials-link-fixture`: 验证引用。\n\n## Impact\n\n隔离夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'design.md'), '## Context\n\n隔离归档夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] 1.1 保存稳定引用夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'specs/materials-link-fixture/spec.md'), '## Purpose\n\n通过隔离材料证明稳定任务引用不受归档深度改变影响。\n\n## ADDED Requirements\n\n### Requirement: Stable task reference fixture\nThe fixture MUST retain its task reference.\n\n#### Scenario: Archive fixture\n- **WHEN** the fixture is archived\n- **THEN** the task reference MUST remain readable\n');
    cli(['task', 'create', 'materials-linked', '--title', '数据库任务说明', '--intent', '读取数据库中的唯一任务说明。', '--brief-file', markdown('linked-brief', '# 记录中的唯一正文\n\n数据库正文不随变更归档移动。\n'), '--project', 'demo']);
    cli(['task', 'create', 'materials-archive-reader', '--title', '变更引用阅读夹具', '--intent', '验证逻辑变更引用归档后的阅读。', '--project', 'demo', '--change', `demo/${change}`]);
    const linkInChange = async () => {
      await open('materials-archive-reader');
      await body().getByText('尚未填写任务说明。', { exact: true }).waitFor({ state: 'visible' });
      await page.locator('[data-task-node=design]').click();
      await body().getByRole('menuitem', { name: `demo/${change}`, exact: true }).click();
      const link = body().getByRole('link', { name: '查看唯一任务说明', exact: true });
      await link.waitFor({ state: 'visible' });
      assert.equal(await link.getAttribute('href'), `${new URL(workspaceUrl).pathname}/tasks/materials-linked`);
      assert.equal(await body().getByText('非法任务引用', { exact: true }).getAttribute('href'), null);
      return link;
    };
    let link = await linkInChange();
    await body().getByRole('link', { name: '查看历史文件', exact: true }).click();
    await page.locator('.pane-right:visible .resource-reader .markdown-body').filter({ hasText: '明确文件引用仍读取原文' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await body().locator('.task-node-reading').evaluate((reader: HTMLElement) => { reader.scrollTop = 200; });
    await link.scrollIntoViewIfNeeded();
    const before = await body().locator('.task-node-reading').evaluate((reader: HTMLElement) => reader.scrollTop);
    assert.ok(before > 0);
    await link.click(); await body().locator('[data-task-brief="materials-linked"] .markdown-body').filter({ hasText: '数据库正文不随变更归档移动' }).waitFor({ state: 'visible' });
    await page.goBack();
    await body().getByRole('link', { name: '查看唯一任务说明', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction((top: number) => Math.abs((document.querySelector('#task-node-content .task-node-reading')?.scrollTop || 0) - top) < 3, before, { timeout: 3000 }).catch(async () => {
      assert.ok(Math.abs(await body().locator('.task-node-reading').evaluate((reader: HTMLElement) => reader.scrollTop) - before) < 3, '返回关联任务恢复原变更说明与阅读位置');
    });
    await page.getByRole('button', { name: '关闭 普通任务', exact: true }).click();
    await page.locator('#task-table-body [data-task-id=materials-archive-reader]').click();
    await body().getByText('尚未填写任务说明。', { exact: true }).waitFor({ state: 'visible' });
    cli(['openspec', 'converge', change, '--project', 'demo']);
    assert.equal(fs.existsSync(changeRoot), false);
    link = await linkInChange();
    await link.click(); await body().locator('[data-task-brief="materials-linked"] .markdown-body').filter({ hasText: '数据库正文不随变更归档移动' }).waitFor({ state: 'visible' });
    assert.equal(runtime.inspectTask(workspaceRoot, 'materials-linked').record.status, 'active');
    assert.match(fs.readFileSync(taskFile, 'utf8'), /明确文件引用仍读取原文/);
    await capture(page, 'task-record-brief-stable-link-archived.png');
  });
}
