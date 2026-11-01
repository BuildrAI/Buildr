import assert from 'node:assert/strict';

/** Actual shared UI and authenticated client. Upstream/install transport is simulated, never user programs. */
export async function runAgentProgramUpdatesJourney({page,capture,expectedBrowserErrors}:any) {
  const endpoint='**/api/v1/app/agent-service/program-updates{,/check}',upgradeEndpoint='**/api/v1/app/agent-service/connections/*/program-upgrades';
  const codex:any={connectionId:'codex',provider:'codex',label:'Codex',revision:'fixture',executable:'/fixture/Desktop.app/codex',managed:false,status:'available',versionKind:'program',packageName:'@openai/codex',updateUrl:'https://developers.openai.com/codex/cli',currentVersion:'0.163.0',currentReleaseVersion:'0.163.0',latestVersion:'0.164.0',checkedAt:'2026-10-30T00:00:00Z',releaseSource:'https://registry.npmjs.org/%40openai%2Fcodex/latest'};
  const qoder:any={...codex,connectionId:'qoder',provider:'qoder',label:'Qoder',managed:true,executable:'/fixture/managed/qoder',versionKind:'package',packageName:'@qoder-ai/qoder-agent-sdk',currentVersion:'1.1.75',currentReleaseVersion:'1.0.55',latestVersion:'1.0.56'};
  let calls=0,fail=false,upgrades=0;
  const handler=async(route:any)=>{
    if(route.request().method()==='POST'){calls++;assert.ok(!('install' in route.request().postDataJSON()));}
    return route.fulfill({json:{programs:[fail?{...codex,status:'unknown',diagnostic:'无法读取官方发布版本，请检查网络后重试。'}:codex,qoder]}});
  };
  const upgradeHandler=async(route:any)=>{
    upgrades++;const input=route.request().postDataJSON(),program=route.request().url().includes('/codex/')?codex:qoder;
    assert.deepEqual(input,{expectedRevision:program.revision,expectedVersion:program.latestVersion});
    program.upgrade={id:'job-'+upgrades,connectionId:program.connectionId,expectedVersion:program.latestVersion,executable:program.executable,state:'downloading',message:'正在下载独立程序。',updatedAt:new Date().toISOString()};
    return route.fulfill({status:202,json:program.upgrade});
  };
  const releaseHandler=async(route:any)=>{expectedBrowserErrors?.add(route.request().url());return route.fulfill({status:503,json:{error:{code:'release_unavailable',message:'Buildr 发布来源暂不可用'}}});};
  await page.route(endpoint,handler);await page.route(upgradeEndpoint,upgradeHandler);await page.route('**/api/v1/release-awareness',releaseHandler);
  const state=async(root:any,id:string,value:string)=>root.locator(`[data-program="${id}"][data-upgrade-state="${value}"]`).waitFor();
  try {
    await page.locator('#more-actions').hover();await page.locator('#check-buildr-update').click();
    const global=page.locator('#agent-program-updates-global');await global.locator('[data-program="codex"][data-update-status="available"]').waitFor();
    assert.match(await global.innerText(),/0\.163\.0.*0\.164\.0/s);assert.ok(calls>=1);
    assert.equal(await global.locator('details[open]').count(),0);assert.doesNotMatch(await global.innerText(),/\/fixture|registry\.npmjs|检查于|配套包/,'technical details are collapsed');
    await page.locator('#update-details-modal[data-update-status="unavailable"]').waitFor();
    await page.locator('.buildr-update-modal').evaluate((element:any)=>Promise.all(element.getAnimations({subtree:true}).filter((animation:any)=>animation.effect?.getComputedTiming().iterations!==Infinity).map((animation:any)=>animation.finished.catch(()=>{}))));
    await global.getByRole('button',{name:'更新 Codex',exact:true}).hover();
    await global.scrollIntoViewIfNeeded();
    await capture(page,'agent-program-updates-global.png');
    await global.getByRole('button',{name:'更新 Codex',exact:true}).click();await page.getByRole('button',{name:/^取\s*消$/}).click();assert.equal(upgrades,0,'cancel never starts migration');
    await global.getByRole('button',{name:'更新 Codex',exact:true}).click();await page.getByRole('button',{name:'更新并切换',exact:true}).click();await state(global,'codex','downloading');assert.equal(upgrades,1);
    codex.upgrade.state='waiting';codex.upgrade.message='下载完成，等待当前工作结束后重启。';await state(global,'codex','waiting');assert.equal(await global.locator('[data-program="codex"] .ac-program-update-row > button').isDisabled(),true);
    await page.getByRole('dialog').filter({has:page.locator('#update-details-modal')}).getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'账号与配置',exact:true}).click();const settings=page.locator('.agent-conversation-settings');await settings.getByRole('tab',{name:'智能体',exact:true}).click();
    const standalone=page.locator('#agent-program-updates-settings');await state(standalone,'codex','waiting');assert.equal(await settings.locator('.ams-executor').count(),0,'only one program list');
    codex.upgrade.state='restarting';codex.upgrade.message='正在切换并重启智能体。';await state(standalone,'codex','restarting');
    codex.upgrade.state='completed';codex.upgrade.message='更新完成，下一次执行将使用新版。';codex.upgrade.currentVersion='0.164.0';codex.upgrade.installedExecutable='/fixture/managed/codex';codex.executable=codex.upgrade.installedExecutable;codex.currentVersion='0.164.0';codex.status='latest';codex.managed=true;codex.revision='after-upgrade';
    await state(standalone,'codex','completed');await standalone.getByText('更新完成',{exact:true}).waitFor();assert.equal(await standalone.getByRole('button',{name:'更新 Codex',exact:true}).count(),0);
    codex.latestVersion='0.165.0';codex.status='available';await standalone.locator('[data-program="codex"] summary').click();await standalone.getByRole('button',{name:'检查 Codex 更新',exact:true}).click();await standalone.locator('[data-program="codex"] .ac-program-update-version').filter({hasText:'0.165.0'}).waitFor();assert.match(await standalone.locator('[data-program="codex"]').innerText(),/0\.164\.0.*0\.165\.0/s,'old completed job does not conceal a later release');
    await standalone.getByRole('button',{name:'更新 Qoder',exact:true}).click();await state(standalone,'qoder','downloading');assert.equal(upgrades,2,'managed program needs no migration confirmation');
    qoder.upgrade.state='failed';qoder.upgrade.message='下载失败，当前程序保留。';await standalone.locator('button').filter({hasText:'重试更新'}).waitFor();
    await standalone.locator('button').filter({hasText:'重试更新'}).click();await state(standalone,'qoder','downloading');assert.equal(upgrades,3);
    qoder.upgrade.state='interrupted';qoder.upgrade.message='后台已重启，请重新检查后重试。';await state(standalone,'qoder','interrupted');
    await standalone.locator('[data-program="qoder"] summary').click();assert.match(await standalone.innerText(),/1\.0\.55.*1\.0\.56/s);
    fail=true;await standalone.locator('[data-program="codex"] summary').click();await standalone.getByRole('button',{name:'检查 Codex 更新',exact:true}).click();await standalone.locator('[data-program="codex"][data-update-status="unknown"]').waitFor();
    await page.setViewportSize({width:390,height:844});assert.equal(await standalone.evaluate((element:any)=>element.scrollWidth>element.clientWidth+1),false);
    await standalone.scrollIntoViewIfNeeded();await capture(page,'agent-program-updates-settings-narrow.png');
    await page.getByRole('button',{name:'关闭智能体账号与配置',exact:true}).click();
  } finally {
    await page.unroute(endpoint,handler);await page.unroute(upgradeEndpoint,upgradeHandler);await page.unroute('**/api/v1/release-awareness',releaseHandler);await page.setViewportSize({width:1600,height:1000});
  }
}
