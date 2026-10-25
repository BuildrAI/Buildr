import assert from 'node:assert/strict';
/** Retains the original real-page assertions; shared preparation remains with the host. */
export async function runSourceControlReadingJourney({api, assertHoverInViewport, assertLocationCopyRows, assertSelectionContrast, assertStatusDetails, assertTaskIdentity, capture, catalog, checkoutGroup, codeRepositoryLabel, diff, drag, fileRow, fixture, fullText, getMainRepositoryId, getMainWorktreeId, noOverflow, open, openCommitFile, openHistory, page, root, row, scenario, selectHoverText, selectSourceControlView, showPrimaryNavigation, waitFull, workspaceUrl}: any) {
  await scenario('源代码管理真实清单、同文件两层差异与实际暂存全文', async () => {
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
      const status = primary.locator('.source-control-status-button');
      if (main?.upstream === null && main.status !== 'unavailable') {
        assert.equal(await status.getAttribute('data-remote-state'), 'untracked');
        assert.ok((await status.getAttribute('aria-label')).includes('未跟踪远程分支'));
        assert.equal(await status.locator('.anticon-cloud.is-untracked').count(), 1);
        assert.equal(await status.locator('.anticon-check').count(), 0, '没有远程跟踪时不冒充综合清洁');
      }
      if (main?.fileCount > 0) assert.ok((await status.getAttribute('aria-label')).includes(main.fileCount + ' 个未提交文件'));
    }
    assert.equal(await row().count(), 1, '同一路径的暂存与继续编辑在统一更改列表只保留一行');
    await row().click(); await diff().getByText('export const sourceControlWorking = 34;', {exact: false}).waitFor();
    // 统一更改差异直接比较最近提交与当前文件，暂存内容不冒充基线。
    assert.ok((await diff().innerText()).includes('explorerAnswer = 1'), '更改差异以最近提交为旧侧');
    assert.ok(!(await diff().innerText()).includes('sourceControlIndex = 21'), '暂存内容不进入统一更改比较');
    // 显式已暂存、未暂存比较继续由接口保持真实基线与实际全文。
    const layerRead = async (area: string) => {
      const response = await page.request.get(api + '/code/diff?' + new URLSearchParams({repositoryId: getMainRepositoryId(), worktreeId: getMainWorktreeId(), filePath: fixture.path, area}));
      assert.equal(response.status(), 200); return response.json();
    };
    const stagedDiff = await layerRead('staged'); assert.equal(stagedDiff.area, 'staged');
    assert.match(stagedDiff.patch || '', /\+export const sourceControlIndex = 21;/, '已暂存接口仍比较提交与索引');
    const unstagedDiff = await layerRead('unstaged'); assert.equal(unstagedDiff.area, 'unstaged');
    assert.match(unstagedDiff.patch || '', /\+export const sourceControlWorking = 34;/, '未暂存接口仍比较索引与当前文件');
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.workingText);
    const summary = await root().locator('.code-location-summary').innerText();
    assert.match(summary, /api|主工作树/, '位置摘要指向真实代码库与工作树'); assert.ok(!summary.includes('已暂存'), '统一更改完整文件不再标注已暂存版本');
    const locationButton = root().locator('.code-location-summary'), positionInfo = root().getByRole('region', {name: '位置信息', exact: true});
    await locationButton.hover(); await page.waitForTimeout(450);
    assert.equal(await locationButton.getAttribute('aria-expanded'), 'false');
    assert.equal(await positionInfo.count(), 0, '来源摘要只在点击后披露，不因悬停展开');
    await locationButton.click(); await positionInfo.waitFor();
    assert.equal(await locationButton.getAttribute('aria-controls'), await positionInfo.getAttribute('id'));
    assert.equal(await positionInfo.locator('dd code').first().innerText(), fixture.location);
    assert.deepEqual(await positionInfo.locator('dt').allTextContents(), ['目录', '分支'], '位置信息只展示必要的目录和分支');
    await assertLocationCopyRows(positionInfo);
    assert.ok(!(await positionInfo.innerText()).includes('观察版本'));
    await positionInfo.getByRole('button', {name: '复制路径', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.location);
    await positionInfo.getByRole('button', {name: '复制分支', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.worktreeId === getMainWorktreeId())).worktrees.find((worktree: any) => worktree.worktreeId === getMainWorktreeId()).branch);
    await capture(page, 'source-control-fixture-position-inline.png');
    await positionInfo.getByRole('button', {name: '复制路径', exact: true}).press('Escape');
    await positionInfo.waitFor({state: 'hidden'}); assert.equal(await locationButton.getAttribute('aria-expanded'), 'false');
    await locationButton.click(); await positionInfo.getByRole('button', {name: '收起位置信息', exact: true}).click(); await positionInfo.waitFor({state: 'hidden'});
    await capture(page, 'source-control-fixture-staged-full.png');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    await row().click(); await diff().getByText('export const sourceControlWorking = 34;', {exact: false}).waitFor();
    const absoluteMain = fixture.location + '/' + fixture.path;
    assert.equal(await root().getByLabel('完整绝对路径', {exact: true}).innerText(), absoluteMain);
    assert.equal(await diff().locator('.file-diff-original .cm-line').first().innerText(), fixture.historyText.split('\n')[0], '左右对比直接从最近提交的真实代码开始，没有机器补丁头');
    assert.equal(await diff().locator('.file-diff-current .cm-line').first().innerText(), fixture.workingText.trim());
    await root().locator('.task-diff-actions').getByText('上下对比', {exact:true}).click();
    await diff().locator('.file-diff-editor[data-diff-mode="unified"]').waitFor();
    assert.equal(await diff().locator('.line-meta,.line-hunk').count(), 0, '单区块上下对比不展示机器头或首个区块标记');
    assert.equal(await diff().locator('.cm-deletedChunk .cm-deletedLine').first().innerText(), fixture.historyText.split('\n')[0]);
    assert.equal(await diff().locator('.file-diff-current .cm-line').first().innerText(), fixture.workingText.trim());
    await root().locator('.task-diff-actions').getByText('左右对比', {exact:true}).click();
    await diff().locator('.file-diff-editor[data-diff-mode="split"]').waitFor();
    await root().locator('.task-diff-toolbar').getByRole('button', {name: '复制路径', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), absoluteMain);
    const mainFileRow = row();
    const pathHoverStart = Date.now(); await mainFileRow.hover();
    const pathHint = page.getByRole('tooltip', {name: absoluteMain, exact: true}); await pathHint.waitFor({timeout: 600});
    assert.ok(Date.now() - pathHoverStart < 600, '路径提示快速显示完整真实绝对路径');
    assert.equal(await pathHint.evaluate((element: HTMLElement) => getComputedStyle(element).pointerEvents), 'none', '路径提示不拦截相邻行选择');
    assert.equal(await mainFileRow.locator('.task-changed-path').innerText(), '', '普通文件不常驻相对目录');
    assert.equal(await mainFileRow.locator('.task-changed-path').isVisible(), false, '无目录提示时不占文件名空间');
    assert.equal(await mainFileRow.locator('.task-changed-path').getAttribute('title'), null, '不保留迟到的原生相对路径提示');
    await row().click(); await diff().getByText('export const sourceControlWorking = 34;', {exact:false}).waitFor();
    assert.equal(await root().locator('.task-diff-scope,.source-control-history-version').count(),0, '差异头没有重复来源说明或独立比较带');
    await capture(page, 'source-control-file-name-priority.png');
    assert.ok((await diff().innerText()).includes('explorerAnswer = 1'), '更改差异旧侧来自最近提交');
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.workingText);
    assert.ok(!(await fullText()).includes('sourceControlIndex'));
    await noOverflow(); await capture(page, 'source-control-fixture-working-full.png');
    const peer = observed.repositories.find((repository: any) => repository.location === fixture.unavailableRepositoryLocation); assert.ok(peer);
    const refreshCatalog = async () => {
      const observations: Promise<any>[] = [];
      const observe = (returned: any) => {const url = new URL(returned.url()); if (url.pathname.endsWith('/code/source-control') && url.searchParams.has('repositoryId')) observations.push(returned.json());};
      page.on('response', observe);
      try {
        const inventory = page.waitForResponse((returned: any) => new URL(returned.url()).pathname.endsWith('/code/source-control-inventory'));
        await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click(); assert.equal((await inventory).status(), 200);
        await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
        return {repositories:(await Promise.all(observations)).flatMap(value => value.repositories)};
      } finally {page.off('response', observe);}
    };
    await fixture.withUnavailableRepository(async () => {
      const unavailable = (await refreshCatalog()).repositories.find((repository: any) => repository.id === peer.id);
      assert.ok(unavailable); assert.equal(unavailable.worktreeCount, null); assert.equal(unavailable.fileCount, null); assert.ok(unavailable.diagnostics.length);
      const upper = root().locator('[data-source-repository="' + peer.id + '"]');
      const status = upper.locator(':scope > .source-control-repository .source-control-status-button');
      assert.equal(await status.getAttribute('data-remote-state'), 'unavailable');
      assert.equal(await status.getAttribute('data-file-state'), 'unavailable');
      assert.equal(await status.locator('.anticon-question-circle').count(), 1);
      await assertStatusDetails(status, '远程状态不可读取', '未提交文件数量不可读取');
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
        return {...checkout,repositoryId:repository.id,repositoryName:repository.name,repositoryLabel:codeRepositoryLabel(repository),worktreeId:repository.worktrees.find((worktree: any) => worktree.location === checkout.location).worktreeId};
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
      // 界面统一从“更改”分组选择：暂存、未暂存与未跟踪同行按路径去重；
      // expectedArea 是服务端核对出的真实比较层（working / untracked / commit）。
      const selectImage = async (checkout: any, relative: string, before: any, after: any, expectedArea: string = 'working') => {
        await selectCheckout(checkout);
        const group = checkoutGroup(checkout.worktreeId); await group.waitFor();
        const areaHeading = group.locator('[data-change-area="working"] [data-area-toggle]');
        if (await areaHeading.getAttribute('aria-expanded') !== 'true') await areaHeading.click();
        await fileRow(checkout.worktreeId, relative).click();
        const body = await readDiff(checkout, expectedArea, relative); assertPayload(body, checkout, expectedArea, before, after, relative);
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
      await selectImage(primary, images.addedPath, null, versions.added, 'untracked');
      await assertImageLayout('added');
      await capture(page, 'source-control-image-untracked.png');
      await narrowImages(); await assertImageLayout('added'); await capture(page, 'source-control-image-untracked-300px.png');
      await openCompleteImage(primary, 'working', images.addedPath, versions.added, null, versions.added);
      await assertImageLayout('added'); await normalImages();
      // 显式已暂存、未暂存图片比较继续由接口保持真实侧别，统一列表不复制分层入口。
      const staged = await readDiff(primary, 'staged', images.imagePath);
      assertPayload(staged, primary, 'staged', versions.history, versions.index, images.imagePath);
      assert.equal(staged.imagePreview.before.source.commitHash, primary.commitHash);
      assert.equal(staged.imagePreview.after.revision, 'index:' + primary.indexBlob + ':100644');
      const unstaged = await readDiff(primary, 'unstaged', images.imagePath);
      assertPayload(unstaged, primary, 'unstaged', versions.index, versions.working, images.imagePath);
      assert.equal(unstaged.imagePreview.before.revision, 'index:' + primary.indexBlob + ':100644');
      const working = await selectImage(primary, images.imagePath, versions.history, versions.working);
      assert.equal(working.imagePreview.before.source.commitHash, primary.commitHash); assert.ok(working.imagePreview.after.revision.startsWith('current:'));
      await assertImageLayout('paired-wide');
      await capture(page, 'source-control-image-index-current.png');
      await openCompleteImage(primary, 'working', images.imagePath, versions.working, versions.history, versions.working);
      await selectImage(peerImage, images.imagePath, null, versions.peer, 'untracked');
      await selectImage(primary, images.imagePath, versions.history, versions.working);
      await narrowImages();
      await assertSide('before', versions.history); await assertSide('after', versions.working); await noOverflow();
      await assertImageLayout('paired-narrow');
      const bounds = await preview().getByRole('img').evaluateAll((elements: HTMLImageElement[]) => elements.map(element => {
        const box = element.getBoundingClientRect(), reader = element.closest('.source-control-reader')!.getBoundingClientRect(); return {left:box.left,right:box.right,readerLeft:reader.left,readerRight:reader.right};
      }));
      assert.ok(bounds.every((box: any) => box.left >= box.readerLeft && box.right <= box.readerRight), '300px阅读区图片实际边界不越栏');
      await capture(page, 'source-control-image-300px.png'); await normalImages();
      const stagedDeleted = await selectImage(primary, images.stagedDeletedPath, versions.deleted, null);
      await assertImageLayout('deleted');
      await openCompleteImage(primary, 'working', images.stagedDeletedPath, versions.deleted, versions.deleted, null, primary.commitHash);
      await selectSourceControlView(root(), 'history');
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
      await selectSourceControlView(root(), 'changes');
      await selectCheckout(primary); await fileRow(primary.worktreeId, images.binaryPath).click();
      const binary = await readDiff(primary, 'untracked', images.binaryPath); assert.equal(binary.binary, true); assert.equal(binary.imagePreview, undefined);
      await root().getByText('非文本内容，不提供文本差异。', {exact:true}).waitFor(); assert.equal(await preview().count(), 0);
      await noOverflow();
    });
  });

  await scenario('固定历史全文、悬浮信息选择复制与准确任务往返', async () => {
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
    await assertSelectionContrast(root().locator('.source-control-view-tabs'), '提交历史');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    const orientation = root().locator('.task-diff-mode');
    await orientation.getByText('上下对比', {exact: true}).click();
    await assertSelectionContrast(orientation, '上下对比');
    await drag(root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}), -55, 0);
    await assertSelectionContrast(root().locator('.source-control-view-tabs'), '提交历史');
    await assertSelectionContrast(orientation, '上下对比');
    await capture(page, 'source-control-fixture-history-return-resize-selection.png');
    await noOverflow();
  });

  await scenario('鼠标调整两轴、展开恢复、刷新与窄分屏保留手动比例', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await open();
    await row().click(); await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
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
    await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
    await root().locator('[data-source-repository="' + getMainRepositoryId() + '"] > .source-control-repository .source-control-repository-copy').click();
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
    await page.setViewportSize({width: 1024, height: 768}); await row().click();
    await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click({trial: true}); await noOverflow();
    await capture(page, 'source-control-fixture-split-1024.png');
    assert.deepEqual(await page.evaluate((values: string[]) => values.map(key => localStorage.getItem(key)), keys), saved, '临时窗口缩窄不覆盖手动比例');
    await page.setViewportSize({width: 1440, height: 900});
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
  });

  await scenario('离开保留的源代码管理页面时悬浮信息层关闭', async () => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(workspaceUrl + '/code/explorer'); await page.locator('.code-explorer-stage').waitFor();
    await showPrimaryNavigation(page, 'code');await page.getByRole('navigation', {name: '代码导航', exact: true}).getByRole('link', {name: '源代码管理', exact: true}).click();
    await root().locator('.source-control-repository-copy').first().waitFor();
    await selectSourceControlView(root(), 'history');
    await root().locator('.source-control-graph li').first().waitFor();
    await root().locator('.source-control-graph > li').first().locator('.source-control-commit-toggle').hover();
    const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor(); await popup.hover();
    await page.goBack(); await page.locator('.code-explorer-stage:visible').waitFor();
    await popup.waitFor({state: 'hidden'});
    assert.equal(await page.locator('.code-source-control-page').count(), 1, '源页面仍挂载，浮层由活动现场控制关闭');
    await noOverflow();
  });


}
