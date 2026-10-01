import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// All successful reads come from the production host. Fixtures are explicitly
// created through the public CLI; no real workspace or task history is changed.
export async function runTaskMaterialsJourney({ t, page, runtime, workspaceRoot, workspaceUrl, runBuildr, capture, expectedBrowserErrors }: any) {
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
  const associate = (id: string, documents: unknown[], expected = 'absent') => cli(['task', 'materials', 'record', id, '--materials', json(id, { schemaVersion: 'buildr.task-materials/v1', documents }), '--expected-current', expected]);
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
    cli(['task', 'create', id, '--title', title, '--intent', id === empty ? '只有短目标，没有说明正文。' : '验证任务独立材料的真实读取。', '--project', 'demo', '--service', 'demo/api', ...(id === history ? ['--change', 'demo/browser-flow', '--change', 'demo/archived-flow'] : [])]);
  }
  const recordBefore = runtime.inspectTask(workspaceRoot, simple);
  write(simple, 'brief.md', brief);
  write(simple, 'solution.md', '# 短方案\n\n复用目录布局，按实际容器宽度排列操作。\n');
  write(simple, 'implementation.md', '# 实施过程\n\n只修改布局并检查窄栏，不改变业务操作。\n');
  write(simple, 'delivery.md', '# 交付材料\n\n浏览器夹具中的可读交付说明，不是本框架任务的交付报告。\n');
  const references = [local('brief', 'brief', '任务说明', 'brief.md'), local('solution', 'solution', '修复方案', 'solution.md'), local('implementation', 'implementation', '实施过程', 'implementation.md'), local('delivery', 'delivery', '交付说明', 'delivery.md')];
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
        const geometry = await body().locator('[data-task-material="brief"]').evaluate((reader: HTMLElement) => {
          const parent = reader.parentElement!, frame = parent.getBoundingClientRect(), style = getComputedStyle(parent), rect = reader.getBoundingClientRect();
          return { width: rect.width, left: rect.left - frame.left - parseFloat(style.paddingLeft), right: frame.left + parent.clientWidth - parseFloat(style.paddingRight) - rect.right, viewportRight: rect.right };
        });
        assert.ok(geometry.width <= 1201, `任务说明遵守文档阅读上限：${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.left - geometry.right) < 2, `任务说明居中阅读：${JSON.stringify(geometry)}`);
        if (width === 1920) assert.ok(geometry.width > 1040, '宽屏任务说明使用加宽后的阅读区');
        else assert.ok(geometry.viewportRight <= width + 1, '窄屏任务说明保持可读且不越界');
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
    for (const [node, text] of [['design', '复用目录布局'], ['implementation', '只修改布局'], ['closeout', '可读交付说明']]) {
      await page.locator(`[data-task-node=${node}]`).click();
      const menu = body().getByRole('menuitem').filter({ hasText: node === 'design' ? '修复方案' : node === 'implementation' ? '实施过程' : '交付说明' });
      if (await menu.count()) await menu.click();
      await body().locator('.markdown-body').filter({ hasText: text }).waitFor({ state: 'visible' });
    }
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

  await scenario('任务材料：正文与引用更新显示新版本，显式说明缺失不回退旧材料', async () => {
    await open(simple);
    const previous = inspect(simple);
    const document = previous.documents.find((item: any) => item.role === 'brief');
    write(simple, 'brief.md', `${brief}\n修改后的当前说明版本二。\n`, document.actualDigest);
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '当前说明版本二' }).waitFor({ state: 'visible' });
    assert.notEqual(inspect(simple).documents.find((item: any) => item.role === 'brief').actualDigest, document.actualDigest);
    await page.reload(); await body().locator('.markdown-body').filter({ hasText: '当前说明版本二' }).waitFor({ state: 'visible' });
    const current = inspect(simple);
    associate(simple, references.map(item => item.id === 'brief' ? { ...item, title: '新引用标题' } : item), current.materialsDigest);
    await refresh(); await body().getByText('新引用标题', { exact: true }).waitFor({ state: 'visible' });
    assert.match(await body().innerText(), /当前说明版本二/);
    await open(history);
    await body().getByText(/历史变更说明/).first().waitFor({ state: 'visible' });
    assert.equal((await body().innerText()).includes('独立任务说明'), true);
    write(history, 'brief.md', '# 历史任务当前独立说明\n\n这是本次新建立的关联，不伪装过去已有。\n');
    associate(history, [local('brief', 'brief', '当前说明', 'brief.md')]);
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '本次新建立的关联' }).waitFor({ state: 'visible' });
    const file = path.join(workspaceRoot, '.buildr/local/task-materials', history, 'brief.md');
    const observed = fs.readFileSync(file);
    // Explicitly remove only this disposable test fixture, preserving its bytes for recovery.
    assert.equal(path.resolve(file), path.join(path.resolve(workspaceRoot), '.buildr/local/task-materials', history, 'brief.md'));
    fs.unlinkSync(file);
    try {
      await refresh(); await body().getByText(/缺失|不存在|不可读/).first().waitFor({ state: 'visible' });
      assert.doesNotMatch(await body().innerText(), /普通用户先从这里了解变更|本次新建立的关联/);
    } finally { fs.writeFileSync(file, observed); }
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '本次新建立的关联' }).waitFor({ state: 'visible' });
  });

  await scenario('任务材料：保存Task事实后重读独立正文，不以同Task编号保留旧缓存', async () => {
    await open(simple);
    const document = inspect(simple).documents.find((item: any) => item.role === 'brief');
    write(simple, 'brief.md', `${document.content}\n保存任务事实后重新观察的正文版本三。\n`, document.actualDigest);
    await page.locator('#task-more-actions').click();
    await page.locator('#task-edit-action').click();
    await page.locator('#task-edit-title').fill('独立任务材料保存后重新观察');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    await body().locator('.markdown-body').filter({ hasText: '重新观察的正文版本三' }).waitFor({ state: 'visible' });
  });

  await scenario('任务材料：抽屉和实施清单重核或失败时明确标记上次读取，不冒充新版本', async () => {
    const document = inspect(simple).documents.find((item: any) => item.role === 'brief');
    write(simple, 'brief.md', `${document.content}\n[阅读实施过程](implementation.md)\n`, document.actualDigest);
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

  await scenario('任务材料：项目路径别名互相引用仍进入带正文版本的材料阅读器', async () => {
    const projectRoot = path.join(workspaceRoot, 'projects/demo');
    const directory = path.join(projectRoot, 'tasks/materials-alias');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'brief.md'), '# 别名说明\n\n[阅读关联实施材料](implementation.md)\n');
    fs.writeFileSync(path.join(directory, 'implementation.md'), '# 关联实施正文\n\n相同文件的不同路径写法保持材料身份。\n');
    for (const [id, aliasBrief] of [['materials-alias-brief', true], ['materials-alias-impl', false]] as const) {
      cli(['task', 'create', id, '--title', '别名材料阅读夹具', '--intent', '核对相同文件的材料身份。', '--project', 'demo']);
      associate(id, [
        { id: 'brief', role: 'brief', title: '别名说明', source: { kind: 'project', project: 'demo', path: `${aliasBrief ? '@project/' : ''}tasks/materials-alias/brief.md` } },
        { id: 'impl', role: 'implementation', title: '关联实施材料', source: { kind: 'project', project: 'demo', path: `${aliasBrief ? '' : '@project/'}tasks/materials-alias/implementation.md` } },
      ]);
      await open(id);
      await body().getByRole('link', { name: '阅读关联实施材料', exact: true }).click();
      const reader = page.locator('.task-reading-drawer.ant-drawer-open [data-task-material=impl]');
      await reader.filter({ hasText: '不同路径写法保持材料身份' }).waitFor({ state: 'visible' });
      await reader.getByText('正文版本', { exact: true }).click();
      const digest = inspect(id).documents.find((item: any) => item.id === 'impl').actualDigest;
      await reader.locator('code').filter({ hasText: digest }).waitFor({ state: 'visible' });
    }
    await capture(page, 'task-materials-alias-identity.png');
  });

  await scenario('任务材料：关联读取断开时旧链接可读不等于节点齐备，恢复后直接显示', async () => {
    const routePattern = new RegExp(`/tasks/${simple}/materials(?:\\?|$)`);
    await page.route(routePattern, async (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 'buildr.task-materials-result/v1', taskId: simple, materialsDigest: 'absent', materials: { schemaVersion: 'buildr.task-materials/v1', documents: [] }, documents: [], diagnostics: [] }) }));
    try {
      await open(simple); await body().locator('.task-node-empty').waitFor({ state: 'visible' });
      assert.equal(await body().locator('.markdown-body').count(), 0, '受控旧断点必须失败于正文断言，而非仅检查文件存在');
    } finally { await page.unroute(routePattern); }
    await refresh(); await body().locator('.markdown-body').filter({ hasText: '当前说明版本二' }).waitFor({ state: 'visible' });
  });

  await scenario('任务材料：项目正文共享与真正归档后Task Brief引用保持可读', async () => {
    const projectRoot = path.join(workspaceRoot, 'projects/demo');
    const taskFile = path.join(projectRoot, 'tasks/materials-linked/brief.md');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, '# 共享唯一任务正文\n\n背景：多个变更参与同一任务。目标：独立说明不随归档移动。范围：仅材料阅读。完成依据：归档前后链接仍读同一文件。\n');
    const change = 'materials-archive-link';
    const changeRoot = path.join(projectRoot, 'openspec/changes', change);
    fs.mkdirSync(path.join(changeRoot, 'specs/materials-link-fixture'), { recursive: true });
    fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
    fs.writeFileSync(path.join(changeRoot, 'brief.md'), '# 本次具体变化\n\n[查看唯一任务说明](@project/tasks/materials-linked/brief.md)\n');
    fs.writeFileSync(path.join(changeRoot, 'proposal.md'), '## Why\n\n验证归档引用。\n\n## What Changes\n\n稳定任务说明入口。\n\n## Capabilities\n\n### New Capabilities\n- `materials-link-fixture`: 验证引用。\n\n## Impact\n\n隔离夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'design.md'), '## Context\n\n隔离归档夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] 1.1 保存稳定引用夹具。\n');
    fs.writeFileSync(path.join(changeRoot, 'specs/materials-link-fixture/spec.md'), '## Purpose\n\n为隔离浏览器场景提供真实规范归档材料，验证任务说明的项目根逻辑引用不受归档深度改变影响，不表达产品任务已完成或生产环境已更新。\n\n## ADDED Requirements\n\n### Requirement: Stable task reference fixture\nThe fixture MUST retain its task reference.\n\n#### Scenario: Archive fixture\n- **WHEN** the fixture is archived\n- **THEN** the task reference MUST remain readable\n');
    for (const id of ['materials-linked', 'materials-linked-peer']) {
      cli(['task', 'create', id, '--title', `共享任务说明 ${id}`, '--intent', '读取同一任务说明文件。', '--project', 'demo', '--change', `demo/${change}`, '--change', 'demo/archived-flow']);
      associate(id, [{ id: 'brief', role: 'brief', title: '共享任务说明', source: { kind: 'project', project: 'demo', path: 'tasks/materials-linked/brief.md' } }]);
    }
    // The separate legacy-reader fixture deliberately has no explicit brief, so
    // its Change Brief remains readable without overriding the other tasks.
    cli(['task', 'create', 'materials-archive-reader', '--title', '历史变更引用阅读夹具', '--intent', '验证逻辑变更引用归档后的阅读。', '--project', 'demo', '--change', `demo/${change}`]);
    const linkInChange = async () => {
      await open('materials-archive-reader');
      const link = body().getByRole('link', { name: '查看唯一任务说明', exact: true });
      await link.waitFor({ state: 'visible' });
      return link;
    };
    let link = await linkInChange();
    await link.click(); await page.locator('.markdown-body:visible').filter({ hasText: '独立说明不随归档移动' }).waitFor({ state: 'visible' });
    cli(['openspec', 'converge', change, '--project', 'demo']);
    assert.equal(fs.existsSync(changeRoot), false, '通过公开收敛归档动作移动真实Change');
    link = await linkInChange();
    await link.click(); await page.locator('.markdown-body:visible').filter({ hasText: '独立说明不随归档移动' }).waitFor({ state: 'visible' });
    for (const id of ['materials-linked', 'materials-linked-peer']) {
      await open(id); await body().locator('.markdown-body').filter({ hasText: '独立说明不随归档移动' }).waitFor({ state: 'visible' });
      assert.equal(runtime.inspectTask(workspaceRoot, id).record.status, 'active');
      assert.equal(runtime.inspectTask(workspaceRoot, id).record.changes.length, 2);
    }
  });
}
