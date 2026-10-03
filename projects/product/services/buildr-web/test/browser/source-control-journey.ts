import assert from 'node:assert/strict';

/** The host owns isolated Git data; every successful read below comes from production HTTP. */
export async function runSourceControlJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors}: any) {
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  let mainWorktreeId = '';
  const catalog = async (taskId?: string) => {
    const response = await page.request.get(api + '/code/source-control' + (taskId ? '?taskId=' + encodeURIComponent(taskId) : ''));
    assert.equal(response.status(), 200); return response.json();
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '源代码管理不能产生页面横向溢出');
  const assertHoverInViewport = async (card: any) => {
    const bounds = await card.evaluate((element: HTMLElement) => {
      const layer = element.closest('.ant-popover') || element, box = layer.getBoundingClientRect();
      return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight};
    });
    assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1, '悬浮信息完整停留在当前视口：' + JSON.stringify(bounds));
    await noOverflow();
  };
  const assertHoverBesideList = async (card: any) => {
    await assertHoverInViewport(card);
    const right = await root().locator('.source-control-sidebar').evaluate((element: HTMLElement) => element.getBoundingClientRect().right);
    const left = await card.evaluate((element: HTMLElement) => (element.closest('.ant-popover') || element).getBoundingClientRect().left);
    assert.ok(left >= right - 1, '目录与历史悬浮信息位于列表右侧，不占用上下选行路径：' + JSON.stringify({left, right}));
  };
  const hoverThenVerticalClick = async (from: any, target: any, card: any, screenshot: string) => {
    const start = await from.boundingBox(), end = await target.boundingBox(); assert.ok(start && end);
    const left = Math.max(start.x, end.x), right = Math.min(start.x + start.width, end.x + end.width);
    assert.ok(right > left + 2, '两行有共同的鼠标文字列');
    const x = left + Math.min(20, (right - left) / 2), fromY = start.y + start.height / 2, toY = end.y + end.height / 2;
    // Enter the row anew after any previous click; the tested open-card movement remains strictly vertical.
    await page.mouse.move(start.x - 3, fromY, {steps: 2});
    await page.mouse.move(x, fromY, {steps: 8}); await card.waitFor(); await page.waitForTimeout(200);
    await assertHoverBesideList(card); await capture(page, screenshot);
    await page.mouse.move(x, toY, {steps: 8});
    const hit = await target.evaluate((element: HTMLElement, point: {x: number; y: number}) => {
      const actual = document.elementFromPoint(point.x, point.y);
      return {inside: Boolean(actual && element.contains(actual)), hovered: element.matches(':hover'), actual: actual?.tagName};
    }, {x, y: toY});
    assert.ok(hit.inside && hit.hovered, '卡已打开后同列垂直移动仍命中目标行：' + JSON.stringify(hit));
    await target.click({position: {x: x - end.x, y: end.height / 2}});
  };
  const dismissHoverCards = async () => {
    await page.mouse.move(5, 5);
    await page.mouse.click(5, 5);
    await page.locator('.selectable-hover-card:visible').waitFor({state: 'hidden'});
  };
  const closeHover = async (card: any) => {
    await dismissHoverCards();
    await card.waitFor({state: 'hidden'});
  };
  const selectHoverText = async (text: any) => {
    const box = await text.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + Math.min(160, box.width - 4), box.y + box.height / 2, {steps: 8}); await page.mouse.up();
    assert.ok(await page.evaluate(() => (window.getSelection()?.toString().length || 0) > 0), '移入悬浮层后可以真实选择文字');
  };
  const assertSelectionContrast = async (control: any, label: string) => {
    assert.equal(await control.getByRole('radio', {name: label, exact: true}).isChecked(), true);
    const appearance = (element: HTMLElement) => { const style = getComputedStyle(element); return [style.color, style.backgroundColor, style.fontWeight]; };
    const activeStyle = await control.locator('.ant-segmented-item:has(input:checked)').evaluate(appearance);
    const inactiveStyle = await control.locator('.ant-segmented-item:has(input:not(:checked))').first().evaluate(appearance);
    assert.notDeepEqual(activeStyle, inactiveStyle, '选中项的文字和背景应依据实际选中状态保持可区别');
  };
  const open = async () => {
    await page.goto(workspaceUrl + '/code/source-control');
    await root().locator('.source-control-repository-copy').first().waitFor();
    const observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === fixture.location));
    assert.ok(repository); mainWorktreeId = repository.worktrees.find((item: any) => item.location === fixture.location).worktreeId;
    await root().getByRole('button', {name: '查看主工作树 · ' + repository.name, exact: true}).click();
  };
  const areaValue: Record<string,string> = {'未暂存': 'unstaged', '已暂存': 'staged', '未跟踪': 'untracked'};
  const checkoutGroup = (id: string) => root().locator('[data-change-worktree="' + id + '"]');
  const fileRow = (id: string, area: string, filePath = fixture.path) => checkoutGroup(id).locator('[data-change-area="' + area + '"]')
    .locator('.task-changed-row').filter({has: page.locator('.task-changed-path[title="' + filePath + '"]')});
  const row = (area: string) => fileRow(mainWorktreeId, areaValue[area]);
  const diff = () => root().getByRole('region', {name: '差异内容', exact: true});
  const assertTaskIdentity = async () => {
    const task = page.locator('#task-detail-main:visible'); await task.waitFor();
    assert.equal(await task.getAttribute('data-task-id'), 'browser-task');
    const pathname = new URL(page.url()).pathname, owner = new URL(workspaceUrl).pathname + '/tasks';
    assert.ok(pathname === owner || pathname === owner + '/browser-task', '同一任务仍在任务领域内查看');
  };
  const fullText = async () => root().locator('.repository-source-code code').evaluateAll((elements: HTMLElement[]) => elements.map(element => element.textContent).join('\n'));
  const waitFull = async (text: string) => {
    await root().locator('.repository-source-code').waitFor();
    await page.waitForFunction((expected: string) => Array.from(document.querySelectorAll('.code-source-control-page:not([hidden]) .repository-source-code code')).map(element => element.textContent).join('\n') === expected, text);
    assert.equal(await fullText(), text);
  };
  const commitRow = (hash: string) => root().locator('.source-control-graph > li').filter({hasText: hash.slice(0, 8)});
  const openCommitFile = async (hash: string, filePath: string) => {
    const commit = commitRow(hash); await commit.waitFor();
    const toggle = commit.locator('.source-control-commit-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    const file = commit.locator('.source-control-commit-children .task-changed-row').filter({has: page.locator('.task-changed-path[title="' + filePath + '"]')});
    await file.waitFor(); await file.click();
    return commit;
  };
  const openHistory = async () => {
    await open();
    const observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.worktreeId === mainWorktreeId));
    assert.ok(repository, '两层改动必须属于实际登记实例');
    await root().locator('.source-control-repository-copy').filter({has: page.getByText(repository.name, {exact: true})}).click();
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    await openCommitFile(fixture.commitHash, fixture.path);
    await diff().getByText('export const explorerAnswer = 1;', {exact: false}).waitFor();
    return repository;
  };
  const drag = async (locator: any, dx: number, dy: number) => {
    const box = await locator.boundingBox(); assert.ok(box);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, {steps: 12}); await page.mouse.up();
  };

  await t.test('源代码管理真实清单、同文件两层差异与实际暂存全文', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 900}); await open();
    const observed = await catalog();
    assert.ok(observed.repositories.length >= 2, '覆盖工作空间与独立登记的第二个代码库');
    assert.ok(!observed.diagnostics.some((item: any) => item.code === 'code_task_location_unavailable'), '普通源代码管理不继承其他任务的退役关联诊断，当前 Git 工作树事实独立读取');
    assert.equal(await root().getByRole('alert').filter({hasText: fixture.unrelatedRetiredTaskId}).count(), 0);
    assert.equal(new Set(observed.repositories.map((item: any) => item.id)).size, observed.repositories.length);
    assert.deepEqual(observed.repositories.flatMap((repository: any) => repository.worktrees.map((worktree: any) => worktree.location)).sort(), fixture.baselineWorktrees.flatMap((repository: any) => repository.locations).sort(), '源代码管理保留主线实际 Git 工作树清单中的全部来源');
    assert.equal(await root().locator('.source-control-repository').count(), observed.repositories.length);
    for (const repository of observed.repositories) {
      const rendered = root().locator('[data-source-repository="' + repository.id + '"]');
      assert.equal(await rendered.count(), 1);
      const main = repository.worktrees.find((item: any) => item.isMain);
      const primary = rendered.locator(':scope > .source-control-repository');
      if (main?.upstream === null && main.status !== 'unavailable') assert.equal(await primary.locator('.source-control-remote-status').getAttribute('aria-label'), '未跟踪远程分支');
      if (main?.fileCount > 0) assert.equal(await primary.locator('.source-control-file-status').getAttribute('aria-label'), main.fileCount + ' 个未提交文件');
    }
    assert.equal(await row('已暂存').count(), 1); assert.equal(await row('未暂存').count(), 1);
    await row('已暂存').click(); await diff().getByText('export const sourceControlIndex = 21;', {exact: false}).waitFor();
    assert.ok(!(await diff().innerText()).includes('sourceControlWorking'));
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.indexText);
    assert.match(await root().locator('.code-location-summary').innerText(), /已暂存/);
    const locationButton = root().locator('.code-location-summary'), positionInfo = root().getByRole('region', {name: '位置信息', exact: true});
    await locationButton.hover(); await page.waitForTimeout(450);
    assert.equal(await locationButton.getAttribute('aria-expanded'), 'false');
    assert.equal(await positionInfo.count(), 0, '来源摘要只在点击后披露，不因悬停展开');
    await locationButton.click(); await positionInfo.waitFor();
    assert.equal(await locationButton.getAttribute('aria-controls'), await positionInfo.getAttribute('id'));
    assert.equal(await positionInfo.locator('dd code').first().innerText(), fixture.location);
    assert.deepEqual(await positionInfo.locator('dt').allTextContents(), ['目录', '分支'], '位置信息只展示必要的目录和分支');
    assert.ok(!(await positionInfo.innerText()).includes('观察版本'));
    await positionInfo.getByRole('button', {name: '复制路径', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.location);
    await positionInfo.getByRole('button', {name: '复制分支', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.worktreeId === mainWorktreeId)).worktrees.find((worktree: any) => worktree.worktreeId === mainWorktreeId).branch);
    await capture(page, 'source-control-fixture-position-inline.png');
    await positionInfo.getByRole('button', {name: '复制路径', exact: true}).press('Escape');
    await positionInfo.waitFor({state: 'hidden'}); assert.equal(await locationButton.getAttribute('aria-expanded'), 'false');
    await locationButton.click(); await positionInfo.getByRole('button', {name: '收起位置信息', exact: true}).click(); await positionInfo.waitFor({state: 'hidden'});
    await capture(page, 'source-control-fixture-staged-full.png');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    await row('未暂存').click(); await diff().getByText('export const sourceControlWorking = 34;', {exact: false}).waitFor();
    assert.ok((await diff().innerText()).includes('sourceControlIndex = 21'));
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.workingText);
    assert.ok(!(await fullText()).includes('sourceControlIndex'));
    await noOverflow(); await capture(page, 'source-control-fixture-working-full.png');
    const peer = observed.repositories.find((repository: any) => repository.location === fixture.unavailableRepositoryLocation); assert.ok(peer);
    const refreshCatalog = async () => {
      const response = page.waitForResponse((returned: any) => new URL(returned.url()).pathname.endsWith('/code/source-control'));
      await root().getByRole('button', {name: '刷新源代码管理', exact: true}).click();
      const returned = await response; assert.equal(returned.status(), 200); const body = await returned.json();
      await root().locator('.source-control-title .anticon-spin').waitFor({state: 'hidden'}); return body;
    };
    await fixture.withUnavailableRepository(async () => {
      const unavailable = (await refreshCatalog()).repositories.find((repository: any) => repository.id === peer.id);
      assert.ok(unavailable); assert.equal(unavailable.worktreeCount, null); assert.equal(unavailable.fileCount, null); assert.ok(unavailable.diagnostics.length);
      const upper = root().locator('[data-source-repository="' + peer.id + '"]');
      assert.equal(await upper.locator('.source-control-file-status').getAttribute('aria-label'), '未提交文件数量不可读取');
      assert.equal(await root().locator('[data-change-repository="' + peer.id + '"]').count(), 0, '无关不可读代码库不进入当前工作树变更列表');
      assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
      await waitFull(fixture.workingText); await capture(page, 'source-control-fixture-unavailable-repository.png');
    });
    const restored = (await refreshCatalog()).repositories.find((repository: any) => repository.id === peer.id);
    assert.ok(restored.available); assert.equal(restored.worktreeCount, fixture.baselineWorktrees.find((repository: any) => repository.location === fixture.unavailableRepositoryLocation).locations.length); await waitFull(fixture.workingText);
    await fixture.withImages(async (images: any) => {
      await open(); const imageCatalog = await catalog();
      const identify = (checkout: any) => {
        const repository = imageCatalog.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === checkout.location)); assert.ok(repository);
        return {...checkout,repositoryId:repository.id,repositoryName:repository.name,worktreeId:repository.worktrees.find((worktree: any) => worktree.location === checkout.location).worktreeId};
      };
      const primary = identify(images.primary), peerImage = identify(images.peer), versions = images.versions;
      const preview = () => root().getByRole('region', {name: '图片差异', exact: true});
      const selectCheckout = async (checkout: any) => {
        const repository = root().locator('[data-source-repository="' + checkout.repositoryId + '"]'), fold = repository.locator('.source-control-repository-fold');
        if (await fold.getAttribute('aria-expanded') !== 'true') await fold.click();
        await repository.locator('[data-source-worktree="' + checkout.worktreeId + '"] .source-control-repository-copy').click();
      };
      const decodeImage = async (image: any, version: any) => {
        await image.waitFor();
        await page.waitForFunction(({content,width,height}: any) => [...document.querySelectorAll('.code-source-control-page:not([hidden]) img')].some(element => {
          const image = element as HTMLImageElement;
          return image.src === content && image.complete && image.naturalWidth === width && image.naturalHeight === height;
        }), {content:version.content,width:version.width,height:version.height});
        assert.equal(await image.getAttribute('src'), version.content);
        const loaded = await image.evaluate((element: HTMLImageElement) => ({complete:element.complete,width:element.naturalWidth,height:element.naturalHeight}));
        assert.deepEqual(loaded, {complete:true,width:version.width,height:version.height}, '真实PNG字节必须由浏览器完整解码');
      };
      const assertSide = async (side: string, version: any) => {
        const figure = preview().locator('figure[data-side="' + side + '"]');
        if (!version) {
          await figure.waitFor({state:'hidden'});
          assert.equal(await figure.count(), 0, '缺失版本不占用图片卡位置');
          assert.equal(await preview().getByText(side === 'before' ? '此版本中没有图片' : '图片已删除', {exact:true}).count(), 0);
        } else await decodeImage(figure.getByRole('img'), version);
      };
      const assertImageLayout = async (mode: 'added'|'deleted'|'paired-wide'|'paired-narrow') => {
        const layout = await preview().locator('.source-control-image-pair').evaluate((element: HTMLElement) => {
          const rect = (item: Element) => {const box=item.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};};
          return {content:rect(element),cards:[...element.querySelectorAll(':scope > figure')].map(card=>({...rect(card),side:card.getAttribute('data-side'),title:card.querySelector('strong')!.textContent}))};
        });
        if (mode === 'added' || mode === 'deleted') {
          assert.equal(layout.cards.length, 1, '新增或删除只显示一个有效图片版本');
          const card=layout.cards[0];assert.equal(card.side,mode==='added'?'after':'before');assert.equal(card.title,mode==='added'?'新增图片':'删除前图片');
          assert.ok(Math.abs(card.left-layout.content.left)<=1 && Math.abs(card.right-layout.content.right)<=1, '单图使用完整内容宽度：'+JSON.stringify(layout));
        } else {
          assert.equal(layout.cards.length, 2, '两个实际版本仍保留对照');
          const [before,after]=layout.cards;
          if (mode==='paired-wide') assert.ok(Math.abs(before.top-after.top)<=1 && before.right<after.left, '宽阅读区前后图片并排：'+JSON.stringify(layout));
          else assert.ok(Math.abs(before.left-after.left)<=1 && Math.abs(before.right-after.right)<=1 && before.bottom<after.top, '窄阅读区前后图片上下排列：'+JSON.stringify(layout));
        }
        await noOverflow();
      };
      const assertPayload = (body: any, checkout: any, area: string, before: any, after: any, relative: string, commitHash?: string) => {
        assert.equal(body.source.repositoryId, checkout.repositoryId); assert.equal(body.source.worktreeId, checkout.worktreeId); assert.equal(body.source.location, checkout.location);
        assert.equal(body.source.commitHash, commitHash || null); assert.equal(body.area, area); assert.equal(body.file.path, relative);
        assert.equal(body.patch, null); assert.equal(body.binary, true); assert.ok(body.imagePreview);
        for (const [side,version] of [['before',before],['after',after]] as any) {
          const file = body.imagePreview[side];
          if (!version) assert.equal(file, null);
          else {
            assert.equal(file.kind, 'image'); assert.equal(file.content, version.content); assert.equal(file.digest, version.digest);
            assert.equal(file.sizeBytes, version.bytes.length); assert.equal(file.mediaType, 'image/png'); assert.equal(file.truncated, false);
            assert.equal(file.source.repositoryId, checkout.repositoryId); assert.equal(file.source.worktreeId, checkout.worktreeId); assert.equal(file.source.location, checkout.location);
          }
        }
      };
      const readDiff = async (checkout: any, area: string, relative: string, commitHash?: string) => {
        const query = new URLSearchParams({repositoryId:checkout.repositoryId,worktreeId:checkout.worktreeId,filePath:relative,area,...(commitHash ? {commitHash} : {})});
        const response = await page.request.get(api + '/code/diff?' + query); assert.equal(response.status(), 200, await response.text()); return response.json();
      };
      const selectImage = async (checkout: any, area: string, relative: string, before: any, after: any) => {
        await selectCheckout(checkout);
        const group = checkoutGroup(checkout.worktreeId); await group.waitFor();
        const areaHeading = group.locator('[data-change-area="' + area + '"] [data-area-toggle]');
        if (await areaHeading.getAttribute('aria-expanded') !== 'true') await areaHeading.click();
        await fileRow(checkout.worktreeId, area, relative).click();
        const body = await readDiff(checkout, area, relative); assertPayload(body, checkout, area, before, after, relative);
        await assertSide('before', before); await assertSide('after', after);
        assert.equal(await root().locator('.task-diff-mode:visible').count(), 0, '图片保留前后版本而不显示文字对比方式');
        assert.equal(await root().getByText('非文本内容，不提供文本差异。', {exact:true}).count(), 0);
        await noOverflow(); return body;
      };
      const openCompleteImage = async (checkout: any, area: string, relative: string, version: any, before: any, after: any, commitHash?: string) => {
        const requests: string[] = [], collect = (request: any) => {if (new URL(request.url()).pathname.endsWith('/code/source-file')) requests.push(request.url());};
        page.on('request', collect);
        try {
          const response = after ? page.waitForResponse((returned: any) => {
            const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-file') && url.searchParams.get('worktreeId') === checkout.worktreeId && url.searchParams.get('filePath') === relative && url.searchParams.get('area') === area;
          }) : null;
          await root().getByRole('button', {name:'查看完整文件',exact:true}).click();
          await decodeImage(root().locator('.source-control-full-file .repository-image-preview img'), version);
          if (response) {
            const returned = await response; assert.equal(returned.status(), 200); const file = await returned.json();
            assert.equal(file.content, version.content); assert.equal(file.digest, version.digest); assert.equal(file.source.worktreeId, checkout.worktreeId);
            assert.equal(file.source.commitHash, commitHash || null);
          } else {
            assert.deepEqual(requests, [], '删除前完整图片复用已校验旧图，不向缺失当前文件发请求');
            assert.equal(await root().locator('.source-control-full-file > header strong').innerText(), '删除前图片');
            if (commitHash) assert.ok((await root().locator('.code-location-summary').innerText()).includes(commitHash.slice(0,8)), '删除前完整图来源指向真实父提交');
          }
          await noOverflow(); await root().getByRole('button', {name:'返回差异',exact:true}).click(); await assertSide('before', before); await assertSide('after', after);
        } finally {page.off('request', collect);}
      };
      const separator = root().getByRole('separator', {name:'调整源代码管理与阅读区宽度',exact:true});
      const narrowImages = async () => {
        await separator.press('End');
        await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
      };
      const normalImages = async () => {
        await separator.dblclick();
        await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || 0) > 700);
      };
      await selectImage(primary, 'untracked', images.addedPath, null, versions.added);
      await assertImageLayout('added');
      await capture(page, 'source-control-image-untracked.png');
      await narrowImages(); await assertImageLayout('added'); await capture(page, 'source-control-image-untracked-300px.png');
      await openCompleteImage(primary, 'untracked', images.addedPath, versions.added, null, versions.added);
      await assertImageLayout('added'); await normalImages();
      const staged = await selectImage(primary, 'staged', images.imagePath, versions.history, versions.index);
      assert.equal(staged.imagePreview.before.source.commitHash, primary.commitHash);
      assert.equal(staged.imagePreview.after.revision, 'index:' + primary.indexBlob + ':100644');
      await openCompleteImage(primary, 'staged', images.imagePath, versions.index, versions.history, versions.index);
      const working = await selectImage(primary, 'unstaged', images.imagePath, versions.index, versions.working);
      assert.equal(working.imagePreview.before.revision, 'index:' + primary.indexBlob + ':100644'); assert.ok(working.imagePreview.after.revision.startsWith('current:'));
      await assertImageLayout('paired-wide');
      await capture(page, 'source-control-image-index-current.png');
      await openCompleteImage(primary, 'unstaged', images.imagePath, versions.working, versions.index, versions.working);
      await selectImage(peerImage, 'untracked', images.imagePath, null, versions.peer);
      await selectImage(primary, 'unstaged', images.imagePath, versions.index, versions.working);
      await narrowImages();
      await assertSide('before', versions.index); await assertSide('after', versions.working); await noOverflow();
      await assertImageLayout('paired-narrow');
      const bounds = await preview().getByRole('img').evaluateAll((elements: HTMLImageElement[]) => elements.map(element => {
        const box = element.getBoundingClientRect(), reader = element.closest('.source-control-reader')!.getBoundingClientRect(); return {left:box.left,right:box.right,readerLeft:reader.left,readerRight:reader.right};
      }));
      assert.ok(bounds.every((box: any) => box.left >= box.readerLeft && box.right <= box.readerRight), '300px阅读区图片实际边界不越栏');
      await capture(page, 'source-control-image-300px.png'); await normalImages();
      await selectImage(primary, 'staged', images.stagedDeletedPath, versions.deleted, null);
      await assertImageLayout('deleted');
      await openCompleteImage(primary, 'staged', images.stagedDeletedPath, versions.deleted, versions.deleted, null, primary.commitHash);
      await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact:true}).click();
      await openCommitFile(primary.commitHash, images.imagePath);
      const historical = await readDiff(primary, 'commit', images.imagePath, primary.commitHash); assertPayload(historical, primary, 'commit', versions.before, versions.history, images.imagePath, primary.commitHash);
      assert.equal(historical.baseHash, primary.baseHash); assert.equal(historical.imagePreview.before.source.commitHash, primary.baseHash); assert.equal(historical.imagePreview.after.source.commitHash, primary.commitHash);
      await assertSide('before', versions.before); await assertSide('after', versions.history);
      await assertImageLayout('paired-wide');
      await capture(page, 'source-control-image-fixed-history.png');
      await openCompleteImage(primary, 'commit', images.imagePath, versions.history, versions.before, versions.history, primary.commitHash);
      await openCommitFile(primary.commitHash, images.deletedPath);
      const deleted = await readDiff(primary, 'commit', images.deletedPath, primary.commitHash); assertPayload(deleted, primary, 'commit', versions.deleted, null, images.deletedPath, primary.commitHash);
      assert.equal(deleted.imagePreview.before.source.commitHash, primary.baseHash); await assertSide('before', versions.deleted); await assertSide('after', null);
      await assertImageLayout('deleted');
      await capture(page, 'source-control-image-deleted.png');
      await narrowImages(); await assertImageLayout('deleted'); await capture(page, 'source-control-image-deleted-300px.png');
      await openCompleteImage(primary, 'commit', images.deletedPath, versions.deleted, versions.deleted, null, primary.baseHash);
      await assertImageLayout('deleted'); await normalImages();
      assert.ok((await root().locator('.code-location-summary').innerText()).includes(primary.commitHash.slice(0,8)), '返回删除差异恢复所选提交来源');
      await root().locator('.source-control-browse-tabs').getByText('未提交变更', {exact:true}).click();
      await selectCheckout(primary); await fileRow(primary.worktreeId, 'untracked', images.binaryPath).click();
      const binary = await readDiff(primary, 'untracked', images.binaryPath); assert.equal(binary.binary, true); assert.equal(binary.imagePreview, undefined);
      await root().getByText('非文本内容，不提供文本差异。', {exact:true}).waitFor(); assert.equal(await preview().count(), 0);
      await noOverflow();
    });
  });

  await t.test('固定历史全文、悬浮信息选择复制与准确任务往返', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 900}); await openHistory();
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.historyText);
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(fixture.commitHash.slice(0, 8)));
    const info = root().locator('.source-control-reader').getByRole('button', {name: '查看完整提交信息', exact: true});
    await info.hover(); const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor();
    await popup.hover(); assert.ok((await popup.innerText()).includes(fixture.commitHash));
    await assertHoverInViewport(popup);
    assert.equal(await popup.locator('pre').count(), 0, '悬浮摘要不重复完整正文');
    await selectHoverText(popup.locator('code').filter({hasText: fixture.commitHash}));
    await capture(page, 'source-control-fixture-history-text-selection.png');
    await popup.getByRole('button', {name: /复制提交标识$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.commitHash);
    await popup.getByRole('button', {name: /复制完整信息$/}).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes(fixture.commitHash) && copied.includes('Buildr-Task: browser-task'));
    await capture(page, 'source-control-fixture-history-hover.png');
    await popup.getByRole('button', {name: '打开任务 浏览器任务', exact: true}).click();
    await assertTaskIdentity();
    await popup.waitFor({state: 'hidden'});
    await page.goBack(); await waitFull(fixture.historyText);
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(fixture.commitHash.slice(0, 8)));
    await drag(root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}), 55, 0);
    await assertSelectionContrast(root().locator('.source-control-browse-tabs'), '提交历史');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    const orientation = root().locator('.task-diff-mode');
    await orientation.getByText('上下对比', {exact: true}).click();
    await assertSelectionContrast(orientation, '上下对比');
    await drag(root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}), -55, 0);
    await assertSelectionContrast(root().locator('.source-control-browse-tabs'), '提交历史');
    await assertSelectionContrast(orientation, '上下对比');
    await capture(page, 'source-control-fixture-history-return-resize-selection.png');
    await noOverflow();
  });

  await t.test('鼠标调整两轴、展开恢复、刷新与窄分屏保留手动比例', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await open();
    await row('未暂存').click(); await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    const horizontal = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    const vertical = root().getByRole('separator', {name: '调整代码库与浏览区高度', exact: true});
    const before = [Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))];
    await drag(horizontal, 70, 0); await drag(vertical, 0, 50);
    const after = [Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))];
    assert.ok(after[0] > before[0] + 1 && after[1] > before[1] + 1, '两个实际分隔线分别改变宽度与高度');
    await root().getByRole('button', {name: '展开阅读', exact: true}).click();
    await root().getByRole('button', {name: '恢复分屏', exact: true}).click();
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
    assert.ok((await diff().innerText()).includes('sourceControlWorking = 34'));
    const workspaceId = new URL(workspaceUrl).pathname.split('/')[2];
    const keys = ['buildr:source-control:' + workspaceId + ':columns', 'buildr:source-control:' + workspaceId + ':stack'];
    const saved = await page.evaluate((values: string[]) => values.map(key => localStorage.getItem(key)), keys);
    assert.ok(saved.every((value: any) => value !== null));
    await page.reload(); await root().locator('.source-control-repository-copy').first().waitFor();
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
    await page.setViewportSize({width: 1024, height: 768}); await row('未暂存').click();
    await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click({trial: true}); await noOverflow();
    await capture(page, 'source-control-fixture-split-1024.png');
    assert.deepEqual(await page.evaluate((values: string[]) => values.map(key => localStorage.getItem(key)), keys), saved, '临时窗口缩窄不覆盖手动比例');
    await page.setViewportSize({width: 1440, height: 900});
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
  });

  await t.test('迟到的差异不能覆盖当前层，清单刷新失败保留已读取现场', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await open();
    await row('未暂存').click(); await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('area') === 'staged' && url.searchParams.get('filePath') === fixture.path) await gate;
      try { await route.continue(); } catch { /* Switching layers can cancel the old transport. */ }
    };
    await page.route('**/code/diff?**', delayed);
    try {
      const started = page.waitForRequest((request: any) => { const url = new URL(request.url()); return url.pathname.endsWith('/code/diff') && url.searchParams.get('area') === 'staged'; });
      await row('已暂存').click(); await started; await row('未暂存').click(); release();
      await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
      await page.waitForTimeout(450);
      assert.match(await root().locator('.source-control-history-version').innerText(), /未暂存/);
      assert.ok((await diff().innerText()).includes('sourceControlWorking = 34'), '迟到暂存响应不能覆盖当前未暂存差异');
    } finally { release(); await page.unroute('**/code/diff?**', delayed); }
    const failed = async (route: any) => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: {code: 'scm_fixture_unavailable', message: '隔离测试清单暂不可读取'}})});
    const catalogRoute = /\/code\/source-control(?:\?|$)/;
    expectedBrowserErrors.add('/code/source-control');
    await page.route(catalogRoute, failed);
    try {
      await root().getByRole('button', {name: '刷新源代码管理', exact: true}).click();
      await root().getByRole('alert').filter({hasText: '隔离测试清单暂不可读取'}).waitFor();
      assert.ok(await root().locator('.source-control-repository').count() >= 2);
      assert.equal(await row('未暂存').count(), 1);
      await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    } finally { await page.unroute(catalogRoute, failed); }
    await root().getByRole('button', {name: '刷新源代码管理', exact: true}).click();
    await root().getByRole('alert').filter({hasText: '隔离测试清单暂不可读取'}).waitFor({state: 'hidden'});
    await noOverflow();
  });

  await t.test('离开保留的源代码管理页面时悬浮信息层关闭', async () => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(workspaceUrl + '/code/explorer'); await page.locator('.code-explorer-stage').waitFor();
    await page.getByRole('navigation', {name: '代码导航', exact: true}).getByRole('link', {name: '源代码管理', exact: true}).click();
    await root().locator('.source-control-repository-copy').first().waitFor();
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    await root().locator('.source-control-graph li').first().waitFor();
    await root().locator('.source-control-graph > li').first().locator('.source-control-commit-toggle').hover();
    const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor(); await popup.hover();
    await page.goBack(); await page.locator('.code-explorer-stage:visible').waitFor();
    await popup.waitFor({state: 'hidden'});
    assert.equal(await page.locator('.code-source-control-page').count(), 1, '源页面仍挂载，浮层由活动现场控制关闭');
    await noOverflow();
  });

  await t.test('任务改动与提交保留原列表、提交详情、完整文件与返回现场', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await page.goto(workspaceUrl + '/tasks/browser-task');
    const task = page.locator('#task-detail-main:visible');
    await task.locator('[data-task-content=changes]').click();
    const reader = task.getByRole('region', {name: '改动与提交工作台', exact: true}); await reader.waitFor();
    await assertTaskIdentity();
    const current = reader.locator('.task-changed-row').filter({has: page.locator('.task-changed-path[title="' + fixture.path + '"]')}).first();
    await current.click(); await reader.getByRole('region', {name: '差异内容', exact: true}).getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    const commit = reader.locator('.task-rail-commit').filter({hasText: fixture.commitHash.slice(0, 8)}); await commit.waitFor(); await commit.click();
    await reader.locator('.task-commit-details').getByText('Buildr-Task: browser-task', {exact: false}).waitFor();
    await reader.locator('.task-rail-commit-files .task-changed-row').filter({has: page.locator('.task-changed-path[title="' + fixture.path + '"]')}).click();
    await reader.getByRole('region', {name: '差异内容', exact: true}).getByText('explorerAnswer = 1', {exact: false}).waitFor();
    await reader.getByRole('button', {name: '查看完整文件', exact: true}).click();
    await page.locator('.repository-source-code').waitFor();
    assert.equal(await page.locator('.repository-source-code code').evaluateAll((elements: HTMLElement[]) => elements.map(element => element.textContent).join('\n')), fixture.historyText);
    await page.getByRole('button', {name: '返回任务', exact: true}).click(); await reader.waitFor();
    await assertTaskIdentity();
    assert.ok((await reader.getByRole('region', {name: '差异内容', exact: true}).innerText()).includes('explorerAnswer = 1'));
    await noOverflow(); await capture(page, 'source-control-fixture-original-task-reader.png');
  });

  const linked = fixture.prepareWorktrees();
  const remoteStatuses = fixture.prepareRemoteStatuses(linked);
  const expectedLocations = [...fixture.baselineWorktrees.flatMap((repository: any) => repository.locations), ...linked.map((worktree: any) => worktree.location)];
  const worktrees = async () => {
    const observed = await catalog();
    return linked.map((item: any) => {
      const repository = observed.repositories.find((repo: any) => repo.worktrees.some((worktree: any) => worktree.location === item.location));
      assert.ok(repository, '真实 linked 工作树应被所属登记库发现');
      const worktree = repository.worktrees.find((value: any) => value.location === item.location);
      return {...item, repositoryId: repository.id, repositoryName: repository.name, worktreeId: worktree.worktreeId, observed: worktree};
    });
  };
  const expanded = async (button: any) => { if (await button.getAttribute('aria-expanded') === 'false') await button.click(); };
  const selectWorktree = async (worktree: any) => {
    const restore = root().getByRole('button', {name: '展开代码库列表', exact: true});
    if (await restore.count()) await restore.click();
    const repository = root().locator('[data-source-repository="' + worktree.repositoryId + '"]');
    if (worktree.worktreeId === mainWorktreeId) await repository.getByRole('button', {name: '查看主工作树 · ' + worktree.repositoryName, exact: true}).click();
    else {
      await expanded(repository.locator('.source-control-repository-fold'));
      await repository.locator('[data-source-worktree="' + worktree.worktreeId + '"] .source-control-repository-copy').click();
    }
  };
  const selectFile = async (worktree: any, area: string) => {
    await selectWorktree(worktree);
    const group = checkoutGroup(worktree.worktreeId); await group.waitFor();
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1, '下方只显示当前选中工作树');
    await expanded(group.locator('[data-change-area="' + area + '"] [data-area-toggle]'));
    await fileRow(worktree.worktreeId, area, worktree.path).click();
    const text = area === 'staged' ? worktree.indexText : worktree.workingText;
    await diff().getByText(text.trim(), {exact: false}).waitFor();
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(worktree.branch));
  };
  const assertFullVersion = async (worktree: any, area: string, content: string, hash?: string) => {
    const returned = page.waitForResponse((response: any) => { const url = new URL(response.url()); return url.pathname.endsWith('/code/source-file') && url.searchParams.get('worktreeId') === worktree.worktreeId && url.searchParams.get('filePath') === worktree.path && url.searchParams.get('area') === area; });
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click();
    const response = await returned; assert.equal(response.status(), 200);
    const body = await response.json(); assert.equal(body.source.worktreeId, worktree.worktreeId); assert.equal(body.source.location, worktree.location);
    assert.equal(body.source.commitHash, hash || null); assert.equal(body.content, content);
    await waitFull(content); await root().getByRole('button', {name: '返回差异', exact: true}).click();
  };
  await t.test('同库全部真实工作树分组，同路径两层及全文保持各自版本', async () => {
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.id === values[0].repositoryId);
    const primaryCount = fixture.baselineWorktrees.find((item: any) => item.location === fixture.location).locations.length + 2;
    assert.equal(repository.worktreeCount, primaryCount); assert.equal(repository.worktrees.length, primaryCount);
    assert.deepEqual(observed.repositories.flatMap((item: any) => item.worktrees.map((worktree: any) => worktree.location)).sort(), expectedLocations.toSorted(), '主线来源与本轮新增工作树全部保留，真实 Git 清单不因来源未登记为当前任务而遗漏');
    assert.equal(repository.fileCount, repository.worktrees.reduce((total: number, worktree: any) => total + worktree.fileCount, 0), '同一路径在不同工作树独立计数');
    const rendered = root().locator('[data-source-repository="' + repository.id + '"]');
    for (const value of repository.worktrees) assert.equal(await rendered.locator('[data-source-worktree="' + value.worktreeId + '"]').count(), 1);
    for (const statusClass of ['source-control-remote-status', 'source-control-file-status', 'source-control-task-slot']) {
      const columns = await rendered.locator('.' + statusClass).evaluateAll((elements: HTMLElement[]) => elements.map(element => element.getBoundingClientRect().x));
      assert.ok(columns.length === repository.worktrees.length && columns.every((x: number) => Math.abs(x - columns[0]) <= 2), '主工作树和各工作树的远程、文件及任务状态保持列对齐：' + statusClass);
    }
    for (const selector of ['.source-control-repository-copy strong', '.source-control-repository-branch', '.source-control-remote-status', '.source-control-file-status', '.source-control-task-slot']) {
      const boundaries = await root().locator('.source-control-repository-tree-scroll').locator(selector).evaluateAll((elements: HTMLElement[]) => elements.map(element => ({left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right})));
      assert.ok(boundaries.every((box: any) => Math.abs(box.left - boundaries[0].left) <= 2 && Math.abs(box.right - boundaries[0].right) <= 2), '各代码库主工作树与子工作树的名称、分支和状态上下对齐：' + selector);
    }
    for (const expected of remoteStatuses) {
      const owner = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === expected.location));
      const worktree = owner.worktrees.find((item: any) => item.location === expected.location);
      assert.deepEqual([worktree.ahead, worktree.behind], [expected.ahead, expected.behind], '真实本机裸远程推送/抓取后的生产接口数量');
      assert.ok(worktree.upstream?.startsWith('status-fixture/'));
      const status = root().locator('[data-source-repository="' + owner.id + '"] [data-source-worktree="' + worktree.worktreeId + '"] .source-control-remote-status');
      if (expected.ahead === 0 && expected.behind === 0) {
        assert.equal(await status.getAttribute('aria-label'), '本地与远程没有提交差异');
        assert.equal(await status.locator('.anticon-cloud-sync').count(), 1); assert.equal((await status.innerText()).trim(), '');
      } else {
        assert.equal(await status.getAttribute('aria-label'), `未推送 ${expected.ahead} 个提交，远程未同步 ${expected.behind} 个提交`);
        assert.deepEqual((await status.locator(':scope > span:not(.anticon)').allTextContents()).map((text: string) => text.trim()), [String(expected.ahead), String(expected.behind)]);
        assert.equal(await status.locator('.anticon-arrow-up').count(), 1); assert.equal(await status.locator('.anticon-arrow-down').count(), 1);
      }
    }
    const cleanOwner = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === fixture.cleanLocation));
    const clean = cleanOwner.worktrees.find((item: any) => item.location === fixture.cleanLocation); assert.equal(clean.fileCount, 0);
    const cleanStatus = root().locator('[data-source-repository="' + cleanOwner.id + '"] [data-source-worktree="' + clean.worktreeId + '"] .source-control-file-status');
    assert.equal(await cleanStatus.getAttribute('aria-label'), '没有未提交文件'); assert.equal(await cleanStatus.locator('.anticon-file').count(), 1);
    const changedStatus = rendered.locator('[data-source-worktree="' + values[0].worktreeId + '"] .source-control-file-status');
    assert.equal(await changedStatus.locator('.anticon-file-text').count(), 1); assert.ok((await changedStatus.getAttribute('class')).includes('is-changed'));
    await fixture.withStatusDigits(linked, async (expected: any) => {
      await open(); const digitCatalog = await catalog();
      const observedLocation = (location: string) => digitCatalog.repositories.flatMap((owner: any) => owner.worktrees).find((worktree: any) => worktree.location === location);
      for (const remote of expected.remote) {
        const worktree = observedLocation(remote.location); assert.ok(worktree);
        assert.deepEqual([worktree.ahead, worktree.behind], [remote.ahead, remote.behind], '一位／两位远程计数来自真实Git分叉');
      }
      for (const files of expected.files) assert.equal(observedLocation(files.location)?.fileCount, files.count, '0／1／12／123文件计数来自实际独立路径');
      const separator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
      await separator.dblclick();
      for (const width of ['normal', '300px']) {
        if (width === '300px') {
          await separator.press('End');
          await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
        }
        const geometry = await root().locator('.source-control-repository-tree-scroll [data-source-worktree]').evaluateAll((elements: HTMLElement[]) => {
          const bounds = (element: Element) => { const box = element.getBoundingClientRect(); return {left: box.left, right: box.right}; };
          const textBounds = (element: Element | null) => {
            if (!element) return null;
            const range = document.createRange(); range.selectNodeContents(element); const box = range.getBoundingClientRect();
            return {text: element.textContent, left: box.left, right: box.right, lines: range.getClientRects().length};
          };
          return elements.map(row => {
            const file = row.querySelector('.source-control-file-status')!, remote = row.querySelector('.source-control-remote-status')!;
            return {
              name: row.querySelector('strong')!.textContent,
              file: {icon: bounds(file.querySelector('.anticon > svg')!), count: textBounds(file.querySelector('.source-control-file-count')), column: bounds(file)},
              remote: {
                column: bounds(remote),
                single: remote.querySelector(':scope > .anticon > svg') ? bounds(remote.querySelector(':scope > .anticon > svg')!) : null,
                label: remote.getAttribute('aria-label'),
                directions: [...remote.querySelectorAll('.source-control-remote-direction')].map(direction => ({icon: bounds(direction.querySelector('.anticon > svg')!), count: textBounds(direction.querySelector('.source-control-remote-count'))!})),
              },
            };
          });
        });
        const aligned = (coordinates: number[]) => coordinates.length > 1 && coordinates.every(value => Math.abs(value - coordinates[0]) <= 1);
        assert.ok(aligned(geometry.map((row: any) => row.file.icon.left)), '0及一／二／三位文件数的实际SVG起点上下对齐：' + JSON.stringify(geometry));
        const fileCounts = geometry.map((row: any) => row.file.count).filter(Boolean);
        assert.ok(aligned(fileCounts.map((count: any) => count.right)), '文件数字实际字尾对齐，不能只校验外层span：' + JSON.stringify(fileCounts));
        assert.ok(fileCounts.every((count: any) => count.lines === 1), '文件数字保持单行');
        const directions = geometry.map((row: any) => row.remote.directions).filter((entries: any[]) => entries.length === 2);
        assert.ok(directions.length >= 3, '包括两向混合和单向有差异来源');
        for (const index of [0, 1]) {
          assert.ok(aligned(directions.map((entries: any[]) => entries[index].icon.left)), '每个方向箭头SVG起点固定：' + index);
          assert.ok(aligned(directions.map((entries: any[]) => entries[index].count.right)), '每个方向一／二位数字实际字尾固定：' + index);
          assert.ok(directions.every((entries: any[]) => entries[index].count.lines === 1 && entries[index].icon.right < entries[index].count.left), '箭头与单行数值之间保留边界：' + index);
        }
        const remoteAnchor = directions[0][0].icon.left, singleIcons = geometry.filter((row: any) => row.remote.single);
        assert.ok(singleIcons.some((row: any) => row.remote.label === '本地与远程没有提交差异') && singleIcons.some((row: any) => row.remote.label === '未跟踪远程分支'));
        assert.ok(singleIcons.every((row: any) => Math.abs(row.remote.single.left - remoteAnchor) <= 1), '同步和未跟踪单图标固定在第一远程图标格');
        assert.ok(geometry.every((row: any) => row.file.icon.right <= row.file.column.right && (!row.file.count || row.file.count.left > row.file.icon.right && row.file.count.right <= row.file.column.right + 1) && row.remote.directions.every((direction: any) => direction.count.right <= row.remote.column.right + 1)), '内部图标与文字不越状态列');
        process.stderr.write('[source-control-numeric-alignment] ' + JSON.stringify({width,rows:geometry}) + '\n');
        await noOverflow(); await capture(page, 'source-control-fixture-numeric-alignment-' + width + '.png');
      }
      await separator.dblclick();
    });
    await open();
    const main = {...fixture, repositoryId: repository.id, repositoryName: repository.name, worktreeId: mainWorktreeId, branch: repository.worktrees.find((item: any) => item.worktreeId === mainWorktreeId).branch};
    for (const value of [main, ...values]) {
      await selectFile(value, 'staged'); await assertFullVersion(value, 'staged', value.indexText);
      await selectFile(value, 'unstaged'); await assertFullVersion(value, 'unstaged', value.workingText);
    }
    await noOverflow(); await capture(page, 'source-control-fixture-all-worktrees.png');
  });

  await t.test('代码库列表和比较层折叠保留选择，同名跨库工作树保持单一准确来源', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha'), beta = values.find((item: any) => item.name === 'beta'), peer = values.find((item: any) => item.name === 'peer');
    const movingRepository = root().locator('[data-source-repository="' + alpha.repositoryId + '"]');
    const alphaName = movingRepository.locator('[data-source-worktree="' + alpha.worktreeId + '"] .source-control-repository-copy');
    const betaName = movingRepository.locator('[data-source-worktree="' + beta.worktreeId + '"] .source-control-repository-copy');
    const mainName = movingRepository.getByRole('button', {name: '查看主工作树 · ' + alpha.repositoryName, exact: true});
    const locationCard = (location: string) => page.getByRole('article', {name: '工作树来源信息', exact: true}).filter({has: page.getByText(location, {exact: true})});
    const movementSeparator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await root().locator('.code-location-summary').click();
    await root().getByRole('region', {name: '位置信息', exact: true}).waitFor();
    for (const width of ['normal', '300px']) {
      if (width === 'normal') await movementSeparator.dblclick();
      else await movementSeparator.press('End');
      await hoverThenVerticalClick(alphaName, betaName, locationCard(alpha.location), 'source-control-worktree-hover-up-' + width + '.png');
      assert.equal(await betaName.getAttribute('aria-pressed'), 'true');
      assert.equal(await root().getByRole('region', {name: '位置信息', exact: true}).count(), 0, '切换真实工作树自动收起上一来源的信息');
      await hoverThenVerticalClick(mainName, alphaName, locationCard(fixture.location), 'source-control-worktree-hover-down-' + width + '.png');
      assert.equal(await alphaName.getAttribute('aria-pressed'), 'true');
    }
    await selectFile(alpha, 'unstaged');
    const area = checkoutGroup(alpha.worktreeId).locator('[data-change-area="unstaged"]'), areaButton = area.locator('[data-area-toggle]');
    await areaButton.click(); assert.equal(await areaButton.getAttribute('aria-expanded'), 'false');
    assert.ok((await diff().innerText()).includes(alpha.workingText.trim()), '折叠比较层不改变阅读现场');
    await areaButton.click(); assert.equal(await areaButton.getAttribute('aria-expanded'), 'true');
    const catalogRepository = root().locator('[data-source-repository="' + alpha.repositoryId + '"]');
    const catalogWorktree = catalogRepository.locator('[data-source-worktree="' + alpha.worktreeId + '"]');
    assert.equal(await catalogWorktree.locator('.source-control-fold').count(), 0, '叶工作树无需用折叠箭头展开路径');
    const sourceName = catalogWorktree.locator('.source-control-repository-copy');
    const narrowSeparator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await narrowSeparator.press('End');
    await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
    const nameBox = await sourceName.locator('strong').boundingBox(), branchBox = await sourceName.locator('.source-control-repository-branch').boundingBox();
    assert.ok(nameBox && branchBox && Math.abs(nameBox.y + nameBox.height / 2 - branchBox.y - branchBox.height / 2) < 2, '工作树名称和分支处于同一行');
    assert.ok(!(await catalogWorktree.innerText()).includes(alpha.location), '完整路径平时不占用目录行');
    await sourceName.hover();
    const locationInfo = page.getByRole('article', {name: '工作树来源信息', exact: true}); await locationInfo.waitFor(); await locationInfo.hover();
    await assertHoverBesideList(locationInfo);
    assert.equal(await locationInfo.locator('.source-control-worktree-info-task').innerText(), '任务：浏览器任务');
    assert.equal(await locationInfo.locator('.source-control-worktree-info-location').innerText(), alpha.repositoryName + ' · 工作树 · ' + alpha.observed.name);
    const path = locationInfo.locator('dd code').filter({hasText: alpha.location});
    assert.equal(await path.innerText(), alpha.location); await selectHoverText(path);
    await capture(page, 'source-control-fixture-worktree-text-selection.png');
    await locationInfo.getByRole('button', {name: /复制路径$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.location);
    await locationInfo.getByRole('button', {name: /复制分支$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.branch);
    await assertHoverBesideList(locationInfo);
    await capture(page, 'source-control-fixture-worktree-path-hover.png');
    await closeHover(locationInfo);
    const taskIcon = catalogWorktree.getByRole('button', {name: '打开任务 浏览器任务', exact: true});
    await taskIcon.focus(); await taskIcon.press('Shift+Tab');
    const focusState = () => sourceName.evaluate((element: HTMLElement) => ({active: document.activeElement === element, focusVisible: element.matches(':focus-visible'), activeLabel: document.activeElement?.getAttribute('aria-label')}));
    const initialFocus = await focusState();
    assert.ok(initialFocus.active && initialFocus.focusVisible, '键盘Tab能回到工作树名称并呈现键盘焦点：' + JSON.stringify(initialFocus));
    await locationInfo.waitFor(); await locationInfo.hover();
    await page.mouse.move(5, 5); await page.waitForTimeout(450);
    await capture(page, 'source-control-fixture-worktree-keyboard-away.png');
    assert.equal(await locationInfo.isVisible(), true, '鼠标移开超过关闭延时后，键盘焦点继续保留来源信息：' + JSON.stringify(await focusState()));
    await locationInfo.hover(); await assertHoverBesideList(locationInfo);
    await locationInfo.getByRole('button', {name: /复制路径$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.location, '键盘打开的来源卡仍可移入并复制');
    await capture(page, 'source-control-fixture-worktree-keyboard-hover.png');
    await closeHover(locationInfo); await narrowSeparator.dblclick();
    assert.equal(await taskIcon.locator('.anticon-project').count(), 1);
    assert.equal(await catalogWorktree.locator('.source-control-remote-status .anticon-arrow-up,.source-control-remote-status .anticon-arrow-down').count(), 2, '真实分叉的远程状态使用上下箭头，与任务项目图标区分');
    await taskIcon.hover(); await page.getByRole('tooltip', {name: '任务：浏览器任务', exact: true}).waitFor();
    assert.equal(await root().locator('.source-control-context').count(), 0, '浏览区不重复代码库和分支');
    for (const button of [catalogRepository.locator('.source-control-repository-fold')]) {
      const initial = await button.getAttribute('aria-expanded');
      await button.click(); assert.equal(await button.getAttribute('aria-expanded'), initial === 'true' ? 'false' : 'true');
      assert.ok((await diff().innerText()).includes(alpha.workingText.trim()));
      await button.click(); assert.equal(await button.getAttribute('aria-expanded'), initial);
    }
    const collapse = root().getByRole('button', {name: '折叠代码库列表', exact: true}); await collapse.click();
    assert.equal(await root().locator('.source-control-repository-tree-scroll').isVisible(), false);
    assert.equal(await checkoutGroup(alpha.worktreeId).isVisible(), true);
    assert.ok((await diff().innerText()).includes(alpha.workingText.trim()));
    await root().getByRole('button', {name: '展开代码库列表', exact: true}).click();
    await selectFile(peer, 'unstaged');
    assert.equal(await checkoutGroup(alpha.worktreeId).count(), 0, '同名工作树只按选中身份查看');
    assert.equal(await checkoutGroup(peer.worktreeId).isVisible(), true);
    const peerRow = root().locator('[data-source-repository="' + peer.repositoryId + '"] [data-source-worktree="' + peer.worktreeId + '"]');
    assert.equal(await peerRow.getByRole('button', {name: /^(打开|进入)任务 /}).count(), 0, '同名不推导任务');
    await selectFile(alpha, 'unstaged');
    const modes = root().locator('.source-control-browse-tabs');
    await assertSelectionContrast(modes, '未提交变更');
    await capture(page, 'source-control-fixture-single-worktree-selection.png'); await noOverflow();
  });

  await t.test('当前分支历史没有重复筛选，提交展开文件后点击差异，搜索从两个字符开始', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha'), beta = values.find((item: any) => item.name === 'beta');
    await selectWorktree(alpha);
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    const commit = commitRow(alpha.commitHash); await commit.waitFor();
    assert.equal(await commitRow(beta.commitHash).count(), 0, '当前分支历史不混入同库其他任务独有提交');
    assert.equal(await root().locator('.source-control-history-filter .ant-select').count(), 0);
    const toggle = commit.locator('.source-control-commit-toggle');
    const historyRows = root().locator('.source-control-graph > li'); assert.ok(await historyRows.count() >= 3);
    const middle = commitRow(fixture.commitHash), last = historyRows.nth(2), lastHash = await last.getAttribute('data-source-commit'); assert.ok(lastHash);
    const middleToggle = middle.locator('.source-control-commit-toggle'), lastToggle = last.locator('.source-control-commit-toggle');
    const middleCard = page.getByRole('article', {name: '提交摘要', exact: true}).filter({has: page.getByText(fixture.commitHash, {exact: true})});
    const movementSeparator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    for (const width of ['normal', '300px']) {
      for (const historyRow of [commit, middle, last]) {
        const fold = historyRow.locator('.source-control-history-fold');
        if (await fold.getAttribute('aria-expanded') === 'true') await fold.click();
      }
      if (width === 'normal') await movementSeparator.dblclick();
      else await movementSeparator.press('End');
      await hoverThenVerticalClick(middleToggle, toggle, middleCard, 'source-control-history-hover-up-' + width + '.png');
      assert.equal(await root().getByRole('article', {name: '完整提交信息', exact: true}).locator('dd code').first().innerText(), alpha.commitHash);
      await hoverThenVerticalClick(middleToggle, lastToggle, middleCard, 'source-control-history-hover-down-' + width + '.png');
      assert.equal(await root().getByRole('article', {name: '完整提交信息', exact: true}).locator('dd code').first().innerText(), lastHash);
    }
    for (const historyRow of [commit, middle, last]) {
      const fold = historyRow.locator('.source-control-history-fold');
      if (await fold.getAttribute('aria-expanded') === 'true') await fold.click();
    }
    const observedDiffRequests: string[] = [];
    const observeDiff = (request: any) => { if (new URL(request.url()).pathname.endsWith('/code/diff')) observedDiffRequests.push(request.url()); };
    page.on('request', observeDiff);
    try {
      await toggle.click();
      await commit.locator('.source-control-commit-children .task-changed-row').first().waitFor();
      assert.equal(observedDiffRequests.length, 0, '展开提交只读取变更文件，点击文件才读取差异');
    } finally { page.off('request', observeDiff); }
    const selectedCard = page.getByRole('article', {name: '提交摘要', exact: true}).filter({has: page.getByText(alpha.commitHash, {exact: true})});
    const expandedFile = commit.locator('.source-control-commit-children .task-changed-row').filter({has: page.locator('.task-changed-path[title="' + alpha.path + '"]')});
    await hoverThenVerticalClick(toggle, expandedFile, selectedCard, 'source-control-history-hover-expanded-file.png');
    await diff().getByText(alpha.historyText.trim(), {exact: false}).waitFor();
    await root().locator('.source-control-reader').getByRole('button', {name: '查看完整提交信息', exact: true}).click();
    const details = root().getByRole('article', {name: '完整提交信息', exact: true}); await details.waitFor();
    assert.ok((await details.innerText()).includes(alpha.commitHash));
    const subject = await toggle.locator('strong').innerText();
    assert.equal(await details.getByRole('heading', {name: subject, exact: true}).count(), 1, '详细阅读区只显示一次提交标题');
    const description = details.locator('.source-control-commit-message');
    if (await description.count()) assert.ok(!(await description.innerText()).startsWith(subject), '正文去除重复标题并保留描述');
    assert.ok(!(await details.innerText()).includes('Buildr-Task: browser-task'), '已识别的机器尾注由结构化任务入口展示，不重复进正文');
    await details.getByRole('button', {name: /复制完整信息$/}).click();
    const completeCommit = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(completeCommit.includes(subject) && completeCommit.includes(alpha.commitHash) && completeCommit.includes('Buildr-Task: browser-task'), '复制完整信息保留原提交消息和任务尾注');
    const checkoutBox = await root().locator('.source-control-checkout').boundingBox(), headingBox = await details.getByRole('heading', {name: subject, exact: true}).boundingBox();
    assert.ok(checkoutBox && headingBox && headingBox.y >= checkoutBox.y + checkoutBox.height && headingBox.y - checkoutBox.y - checkoutBox.height < 32, '详细提交信息紧接来源栏展示，不保留大块空白');
    assert.equal(await commit.locator('.source-control-graph-refs,.source-control-history-task').count(), 0, '简洁历史行不常驻引用标签与任务文字块');
    const commitTask = commit.getByRole('button', {name: '打开提交任务 浏览器任务', exact: true});
    assert.equal(await commitTask.locator('.anticon-project').count(), 1);
    assert.ok((await commitTask.getAttribute('class')).includes('source-control-task-link'), '历史任务入口与工作树任务入口使用相同标识');
    assert.equal(await details.getByRole('button', {name: '打开任务 浏览器任务', exact: true}).count(), 1);
    await commitTask.hover(); await page.getByRole('tooltip', {name: '任务：浏览器任务', exact: true}).waitFor();
    await capture(page, 'source-control-fixture-compact-history-detail.png');
    const separator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await separator.press('End');
    await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
    const narrowHeader = root().locator('.source-control-checkout'), summary = narrowHeader.locator('.code-location-summary-content');
    const summaryBounds = await summary.boundingBox(); assert.ok(summaryBounds && summaryBounds.width > 0);
    const parts = await summary.locator('strong, :scope > span, code').evaluateAll((elements: HTMLElement[]) => elements.map(element => ({left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width})));
    assert.ok(parts.every((part: any) => part.left >= summaryBounds.x - 1 && part.right <= summaryBounds.x + summaryBounds.width + 1), '300px阅读区的长代码库、工作树及提交标识均限制在来源摘要边界内');
    assert.ok(await summary.locator('code').evaluate((element: HTMLElement) => element.getBoundingClientRect().width > 0), '窄阅读区保留提交标识可见空间');
    const headerActions = [narrowHeader.getByRole('button', {name: '查看完整提交信息', exact: true}), narrowHeader.getByRole('button', {name: '打开工作树任务 浏览器任务', exact: true}), root().getByRole('button', {name: '展开阅读', exact: true})];
    const actionBounds = [];
    for (const action of headerActions) { await action.click({trial: true}); const box = await action.boundingBox(); assert.ok(box); actionBounds.push(box); }
    assert.ok(actionBounds.every((box: any) => box.x >= summaryBounds.x + summaryBounds.width - 1), '窄来源摘要不覆盖提交信息、任务和阅读操作');
    assert.ok(actionBounds.every((box: any, index: number) => actionBounds.slice(index + 1).every((next: any) => box.x + box.width <= next.x + 1 || next.x + next.width <= box.x + 1)), '提交信息、任务和阅读按钮彼此不重叠');
    await toggle.hover();
    const narrowPopup = page.getByRole('article', {name: '提交摘要', exact: true}); await narrowPopup.waitFor(); await narrowPopup.hover();
    await assertHoverBesideList(narrowPopup);
    await capture(page, 'source-control-fixture-header-300px.png');
    await root().getByRole('button', {name: '展开阅读', exact: true}).click();
    await narrowPopup.waitFor({state: 'hidden'});
    assert.equal(await root().locator('.source-control-sidebar').isVisible(), false, '展开阅读不残留来自隐藏列表的悬浮信息');
    await root().getByRole('button', {name: '恢复分屏', exact: true}).click();
    await headerActions[0].hover(); await narrowPopup.waitFor(); await narrowPopup.hover();
    await assertHoverInViewport(narrowPopup);
    await capture(page, 'source-control-fixture-header-summary-300px.png');
    await closeHover(narrowPopup);
    await details.waitFor(); assert.ok((await details.innerText()).includes(alpha.commitHash));
    for (const width of ['300px', 'normal']) {
      if (width === 'normal') await separator.dblclick();
      await dismissHoverCards();
      const positionButton = root().locator('.code-location-summary'); await positionButton.click();
      const positionInfo = root().getByRole('region', {name: '位置信息', exact: true}); await positionInfo.waitFor();
      assert.deepEqual(await positionInfo.locator('dt').allTextContents(), ['目录', '固定提交']);
      assert.equal(await positionInfo.locator('dd code').last().innerText(), alpha.commitHash);
      const positionLayout = await positionInfo.evaluate((element: HTMLElement) => {
        const labels = [...element.querySelectorAll('dt')].map(label => {
          const range = document.createRange(); range.selectNodeContents(label);
          return {lines: range.getClientRects().length, right: label.getBoundingClientRect().right, valueLeft: label.nextElementSibling!.getBoundingClientRect().left};
        });
        const box = element.getBoundingClientRect();
        return {labels, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, right: box.right, viewportWidth: innerWidth};
      });
      assert.ok(positionLayout.labels.every((label: any) => label.lines === 1 && label.right < label.valueLeft), '目录与固定提交标签保持单行，且不侵入内容列：' + JSON.stringify(positionLayout));
      assert.ok(positionLayout.scrollWidth <= positionLayout.clientWidth + 1 && positionLayout.right <= positionLayout.viewportWidth + 1, '300px和正常阅读区的位置信息都没有横向溢出：' + JSON.stringify(positionLayout));
      await positionInfo.getByRole('button', {name: '复制路径', exact: true}).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.location);
      await positionInfo.getByRole('button', {name: '复制提交标识', exact: true}).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.commitHash);
      await capture(page, width === 'normal' ? 'source-control-fixture-position-fixed-commit.png' : 'source-control-fixture-position-fixed-commit-300px.png');
      await positionInfo.getByRole('button', {name: '收起位置信息', exact: true}).click();
    }
    await capture(page, 'source-control-fixture-history-detail-stable.png');
    await openCommitFile(alpha.commitHash, alpha.path); await diff().getByText(alpha.historyText.trim(), {exact: false}).waitFor();
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.ok((await diff().innerText()).includes(alpha.historyText.trim()), '折叠提交保留已选差异');
    const fold = commit.locator('.source-control-history-fold'); await fold.click();
    assert.equal(await fold.getAttribute('aria-expanded'), 'true');
    assert.ok((await diff().innerText()).includes(alpha.historyText.trim()), '独立展开按钮保持当前文件差异');
    await fold.click(); assert.equal(await fold.getAttribute('aria-expanded'), 'false');
    assert.ok((await diff().innerText()).includes(alpha.historyText.trim()), '独立折叠按钮保持当前文件差异');
    const search = root().getByRole('textbox', {name: '搜索提交历史', exact: true});
    const queries: string[] = [];
    const observeHistory = (request: any) => { const url = new URL(request.url()); if (url.pathname.endsWith('/code/history') && url.searchParams.has('query')) queries.push(url.searchParams.get('query')!); };
    page.on('request', observeHistory);
    try {
      await search.fill('l'); await page.waitForTimeout(400); assert.deepEqual(queries, [], '一个字符不提交搜索请求');
      const response = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/history') && url.searchParams.get('query') === 'li'; });
      await search.fill('li'); const returned = await response; assert.equal(returned.status(), 200);
      const url = new URL(returned.url()); assert.equal(url.searchParams.get('worktreeId'), alpha.worktreeId); assert.equal(url.searchParams.get('branch'), null, '历史从所选工作树当前 HEAD 读取');
      assert.deepEqual(queries, ['li']); await commitRow(alpha.commitHash).waitFor();
    } finally { page.off('request', observeHistory); }
    await search.fill(''); await commitRow(alpha.commitHash).waitFor();
    await noOverflow(); await capture(page, 'source-control-fixture-branch-history-search.png');
  });

  await t.test('跨工作树迟到读取隔离，固定历史与同名无尾注提交保持精确来源', async () => {
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha'), beta = values.find((item: any) => item.name === 'beta'), peer = values.find((item: any) => item.name === 'peer');
    await selectFile(beta, 'unstaged');
    let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = async (route: any) => { if (new URL(route.request().url()).searchParams.get('worktreeId') === alpha.worktreeId) await gate; try { await route.continue(); } catch { /* A new worktree may cancel the former transport. */ } };
    await page.route('**/code/diff?**', delayed);
    try {
      const started = page.waitForRequest((request: any) => { const url = new URL(request.url()); return url.pathname.endsWith('/code/diff') && url.searchParams.get('worktreeId') === alpha.worktreeId; });
      await selectWorktree(alpha); await fileRow(alpha.worktreeId, 'unstaged', alpha.path).click(); await started; await selectFile(beta, 'unstaged'); release();
      await page.waitForTimeout(450); assert.ok((await diff().innerText()).includes(beta.workingText.trim()));
      assert.ok(!(await diff().innerText()).includes(alpha.workingText.trim()));
    } finally { release(); await page.unroute('**/code/diff?**', delayed); }
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    const modes = root().locator('.source-control-browse-tabs'); assert.equal(await modes.getByRole('radio', {name: '提交历史', exact: true}).isChecked(), true);
    for (const value of [alpha, peer]) {
      await selectWorktree(value);
      await openCommitFile(value.commitHash, value.path); await diff().getByText(value.historyText.trim(), {exact: false}).waitFor();
      await assertFullVersion(value, 'commit', value.historyText, value.commitHash);
      if (value.name === 'alpha') {
        await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(value.historyText);
        const returned = page.waitForResponse((response: any) => { const url = new URL(response.url()); return url.pathname.endsWith('/code/file') && url.searchParams.get('checkoutId') === value.worktreeId && url.searchParams.get('filePath') === value.path; });
        await root().getByRole('button', {name: '查看当前文件', exact: true}).click();
        const response = await returned; assert.equal(response.status(), 200);
        const current = await response.json(); assert.equal(current.source.checkoutId, value.worktreeId); assert.equal(current.source.location, value.location); assert.equal(current.source.commitHash, null); assert.equal(current.content, value.workingText);
        const explorer = page.locator('.code-explorer-stage:visible'); await explorer.locator('.repository-source-code').getByText(value.workingText.trim(), {exact: true}).waitFor();
        await explorer.getByRole('button', {name: '返回源代码管理', exact: true}).click(); await waitFull(value.historyText);
        await root().getByRole('button', {name: '返回差异', exact: true}).click();
      }
      if (value.name === 'peer') {
        await root().getByRole('button', {name: '查看完整提交信息', exact: true}).first().hover();
        const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor(); assert.match(await popup.innerText(), /未关联任务/);
        assert.equal(await popup.getByRole('button', {name: '打开任务 浏览器任务', exact: true}).count(), 0, '同名工作树不推导任务关联');
      }
    }
    await capture(page, 'source-control-fixture-worktree-history-source.png'); await noOverflow();
  });

  await t.test('任务原改动阅读与源代码管理双向关联，真实工作树预选和返回保留现场', async () => {
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha');
    await page.setViewportSize({width: 1440, height: 1000}); await page.goto(workspaceUrl + '/tasks/browser-task');
    const task = page.locator('#task-detail-main:visible'); await task.locator('[data-task-content=changes]').click();
    const reader = task.getByRole('region', {name: '改动与提交工作台', exact: true}); await reader.waitFor(); await assertTaskIdentity();
    const current = reader.locator('.task-rail-body > section > .task-changed-list .task-changed-row').filter({has: page.locator('.task-changed-path[title="' + fixture.path + '"]')}).first();
    await current.click(); await reader.getByRole('region', {name: '差异内容', exact: true}).getByText(alpha.workingText.trim(), {exact: false}).waitFor();
    const selected = await reader.locator('.task-changed-list > .is-selected .task-changed-path').first().getAttribute('title');
    const response = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-control') && url.searchParams.get('taskId') === 'browser-task'; });
    await task.locator('[data-task-source-control="browser-task"]').click(); const observed = await (await response).json();
    assert.ok(observed.selectedWorktrees.some((item: any) => item.repositoryId === alpha.repositoryId && item.worktreeId === alpha.worktreeId));
    await checkoutGroup(alpha.worktreeId).waitFor(); assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1, '精确任务范围来自已核对evidence');
    await selectFile(alpha, 'unstaged');
    const repository = (await catalog()).repositories.find((item: any) => item.id === alpha.repositoryId);
    await root().getByRole('button', {name: '查看主工作树 · ' + repository.name, exact: true}).click();
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
    assert.equal(await checkoutGroup(mainWorktreeId).isVisible(), true);
    const refreshed = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-control') && url.searchParams.get('taskId') === 'browser-task'; });
    const refreshButton = root().getByRole('button', {name: '刷新源代码管理', exact: true}); await refreshButton.click(); await refreshed;
    await refreshButton.locator('.anticon-spin').waitFor({state: 'hidden'});
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
    assert.equal(await checkoutGroup(mainWorktreeId).isVisible(), true, '刷新保留用户选中的主工作树，不重放任务预选');
    await selectWorktree(alpha);
    const taskLink = root().locator('[data-source-repository="' + alpha.repositoryId + '"] [data-source-worktree="' + alpha.worktreeId + '"]').getByRole('button', {name: /^(打开|进入)任务 浏览器任务$/});
    await taskLink.click(); await reader.waitFor(); await assertTaskIdentity();
    assert.equal(await task.locator('[data-task-content=changes]').getAttribute('aria-selected'), 'true');
    assert.equal(await reader.locator('.task-changed-list > .is-selected .task-changed-path').first().getAttribute('title'), selected);
    assert.ok((await reader.getByRole('region', {name: '差异内容', exact: true}).innerText()).includes(alpha.workingText.trim()));
    await noOverflow(); await capture(page, 'source-control-fixture-task-worktree-return.png');
  });
}
