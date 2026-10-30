import assert from 'node:assert/strict';

/** Exercise the actual shared UI; only upstream transport facts are fixtures. */
export async function runAgentProgramUpdatesJourney({page,capture,expectedBrowserErrors}:any) {
  const endpoint='**/api/v1/app/agent-service/program-updates{,/check}';
  const row={connectionId:'codex',provider:'codex',label:'Codex',revision:'fixture',executable:'/fixture/codex',status:'available',versionKind:'program',packageName:'@openai/codex',updateUrl:'https://learn.chatgpt.com/docs/cli',currentVersion:'0.163.0',currentReleaseVersion:'0.163.0',latestVersion:'0.164.0',checkedAt:'2026-10-30T00:00:00Z',releaseSource:'https://registry.npmjs.org/%40openai%2Fcodex/latest'};
  let calls=0, fail=false;
  const handler=async(route:any)=>{
    if(route.request().method()==='POST') {calls++; const input=route.request().postDataJSON(); assert.ok(!('install' in input));}
    return route.fulfill({json:{programs:[fail?{...row,status:'unknown',diagnostic:'无法读取官方发布版本，请检查网络后重试。'}:row,{...row,connectionId:'qoder',provider:'qoder',label:'Qoder',versionKind:'package',packageName:'@qoder-ai/qoder-agent-sdk',currentVersion:'1.1.75',currentReleaseVersion:'1.0.55',latestVersion:'1.0.56'}]}});
  };
  const releaseHandler=async(route:any)=>{expectedBrowserErrors?.add(route.request().url());return route.fulfill({status:503,json:{error:{code:'release_unavailable',message:'Buildr 发布来源暂不可用'}}});};
  await page.route(endpoint,handler);await page.route('**/api/v1/release-awareness',releaseHandler);
  try {
    await page.locator('#more-actions').hover();await page.locator('#check-buildr-update').click();
    const global=page.locator('#agent-program-updates-global');
    await global.locator('[data-program="codex"][data-update-status="available"]').waitFor();
    assert.match(await global.innerText(),/0\.163\.0.*0\.164\.0/s);assert.ok(calls>=1);
    await page.locator('#update-details-modal[data-update-status="unavailable"]').waitFor();
    await page.locator('.buildr-update-modal').evaluate((element:any)=>Promise.all(element.getAnimations({subtree:true}).filter((animation:any)=>animation.effect?.getComputedTiming().iterations!==Infinity).map((animation:any)=>animation.finished.catch(()=>{}))));
    await capture(page,'agent-program-updates-global.png');
    fail=true;await global.getByRole('button',{name:'检查 Codex 更新',exact:true}).click();
    await global.locator('[data-program="codex"][data-update-status="unknown"]').waitFor();
    await global.locator('[data-program="qoder"][data-update-status="available"]').waitFor();
    await page.getByRole('dialog').filter({has:page.locator('#update-details-modal')}).getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'账号与配置',exact:true}).click();
    const settings=page.locator('.agent-conversation-settings');await settings.getByRole('tab',{name:'智能体',exact:true}).click();
    const standalone=page.locator('#agent-program-updates-settings');await standalone.locator('[data-program="codex"][data-update-status="unknown"]').waitFor();
    fail=false;await standalone.getByRole('button',{name:'检查 Codex 更新',exact:true}).click();
    await standalone.locator('[data-program="codex"][data-update-status="available"]').waitFor();
    assert.match(await standalone.innerText(),/1\.1\.75/);assert.match(await standalone.innerText(),/1\.0\.55.*1\.0\.56/s);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await standalone.evaluate((element:any)=>element.scrollWidth>element.clientWidth+1),false);
    await standalone.scrollIntoViewIfNeeded();
    await capture(page,'agent-program-updates-settings-narrow.png');
    await page.getByRole('button',{name:'关闭智能体账号与配置',exact:true}).click();
  } finally {
    await page.unroute(endpoint,handler);await page.unroute('**/api/v1/release-awareness',releaseHandler);
    await page.setViewportSize({width:1600,height:1000});
  }
}
