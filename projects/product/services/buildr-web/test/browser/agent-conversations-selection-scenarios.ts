import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** selection 场景使用独立准备的对话现场。 */
export async function runSelectionScenarios(fixture:AgentConversationFixture){
  const {assertModelSummary,chooseAgent,chooseModel,chooseOption,closeModelSettings,expectedBrowserErrors,input,modelSettings,page,panel,preparedInputs,sentInputs,setHighEffort,step,workspaceId}=fixture;
await step('选择Qoder与GPT后提前准备，发送采用同一身份且后台刷新不续期',async()=>{
  const previous=fixture.sharedModels,beforeSends=fixture.sends,beforeCreates=fixture.creations;
  const received:Array<{url:string;body:any}>=[];
  const matcher='**/agent-conversations/**/warmup';
  const route=async(r:any)=>{received.push({url:r.request().url(),body:r.request().postDataJSON()});await r.fulfill({json:{prepared:true}});};
  const storage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('buildr.agent-conversation'))));
  try{
    fixture.sharedModels=[{id:'warm-gpt',modelId:'fixture-gpt',label:'Warm GPT',accountId:'warm-codex',accountIdentity:'warm-account',accountRevision:'r1',accountLabel:'ChatGPT',provider:'codex',available:true,enabled:true,images:false,tools:true}];
    await page.route(matcher,route);await page.reload();await input().waitFor();
    await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await input().fill('');
    await chooseAgent('Qoder');
    const response=page.waitForResponse((r:any)=>r.url().endsWith('/warmup')&&r.request().postDataJSON()?.connectionId==='qoder'&&r.request().postDataJSON()?.model==='fixture-gpt');
    await chooseModel('Warm GPT');await closeModelSettings();await response;
    assert.equal(fixture.sends,beforeSends);assert.equal(fixture.creations,beforeCreates);
    const prepared=received.findLast(x=>x.body.connectionId==='qoder'&&x.body.model==='fixture-gpt')!;
    assert.equal(prepared.body.text,undefined);assert.equal(prepared.body.modelAccountIdentity,'warm-account');
    const count=received.length,refresh=page.waitForResponse((r:any)=>r.url().endsWith('/model-catalog'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refresh;await page.waitForTimeout(500);
    assert.equal(received.length,count,'ordinary refresh does not renew preparation');
    await input().fill('first explicit work');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();
    assert.equal(sentInputs.at(-1).clientRequestId,prepared.body.clientRequestId);assert.equal(sentInputs.at(-1).connectionId,'qoder');
    await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    const nextReady=page.waitForResponse((r:any)=>r.url().includes('/drafts/')&&r.url().endsWith('/warmup')&&r.request().postDataJSON()?.connectionId==='qoder');
    await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await nextReady;
    const next=received.findLast(x=>x.url.includes('/drafts/'))!;assert.notEqual(next.body.clientRequestId,prepared.body.clientRequestId,'new conversation gets a new submission identity');
    await input().fill('second explicit conversation');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();
    assert.equal(sentInputs.at(-1).clientRequestId,next.body.clientRequestId);assert.equal(fixture.creations,beforeCreates+2);
    await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
  }finally{
    await page.unroute(matcher,route);fixture.sharedModels=previous;
    await page.evaluate((saved:Record<string,string>)=>{for(const key of Object.keys(localStorage))if(key.startsWith('buildr.agent-conversation'))localStorage.removeItem(key);for(const [key,value] of Object.entries(saved))localStorage.setItem(key,value);},storage);
  }
});

await step('新对话跨工作空间恢复软件级选择，无关账号变化不造成假冲突且不改写执行模型记忆',async()=>{
      const storage=await page.evaluate(()=>{const profile=document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local',suffix=encodeURIComponent(profile);const moduleKey='buildr.agent-conversation.preference:'+suffix,modelKey='buildr.agent-conversation.model-preference:'+suffix;return{moduleKey,modelKey,module:localStorage.getItem(moduleKey),model:localStorage.getItem(modelKey),execution:localStorage.getItem('buildr.execution-model'),workspaceName:document.querySelector('.workspace-switcher strong')?.textContent||''};});
      const previousModels=fixture.sharedModels;
      const qoderSource={id:'qoder-shared-offering',modelId:'qoder-shared-model',label:'Qoder 共享模型',accountId:'qoder-subscription',accountIdentity:'qoder-identity',accountRevision:'qoder-r1',accountLabel:'Qoder 套餐',provider:'qoder',available:true,enabled:true,images:false,tools:true,contextWindow:128000,defaultServiceTier:'standard',reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium',serviceTiers:[{id:'standard',label:'标准',contextWindow:128000,reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium'},{id:'fast',label:'快速',contextWindow:64000,reasoningEfforts:[{id:'low',label:'低'},{id:'high',label:'高'}],defaultReasoningEffort:'low'}]};
      const unrelatedSource={id:'devin-shared-offering',modelId:'swe-2',label:'SWE-2',accountId:'devin-subscription',accountIdentity:'devin-identity',accountRevision:'devin-r1',accountLabel:'Devin 套餐',provider:'devin',available:true,enabled:true,images:true,tools:true,contextWindow:256000};
      try{
        fixture.sharedModels=[qoderSource,unrelatedSource];
        await page.evaluate(({moduleKey,modelKey}:{moduleKey:string;modelKey:string})=>{localStorage.removeItem(moduleKey);localStorage.removeItem(modelKey);localStorage.setItem('buildr.execution-model',JSON.stringify(['commit-account','commit-model']));},{moduleKey:storage.moduleKey,modelKey:storage.modelKey});
        await page.reload();await input().waitFor();await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await input().fill('');
        await chooseOption('新对话工作空间',storage.workspaceName);await chooseAgent('Qoder');await chooseOption('执行权限','默认权限');await chooseOption('执行权限','完全访问');await chooseModel('Qoder 共享模型');
        const tierButton=()=>modelSettings().getByRole('button',{name:'切换服务档位',exact:true});await tierButton().click();await setHighEffort();await closeModelSettings();
        assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问');
        await assertModelSummary('Qoder / Qoder 共享模型','高');assert.equal(await panel().locator('.ac-model-trigger .ac-tier-mark').count(),1);
        const written=await page.evaluate(({moduleKey,modelKey}:{moduleKey:string;modelKey:string})=>({module:JSON.parse(localStorage.getItem(moduleKey)||'null'),model:JSON.parse(localStorage.getItem(modelKey)||'null'),execution:localStorage.getItem('buildr.execution-model')}),{moduleKey:storage.moduleKey,modelKey:storage.modelKey});
        assert.equal(written.module.agent.connectionId,'qoder');assert.equal(written.module.permission.mode,'full-access');assert.equal(written.module.permission.workspaceId,workspaceId);assert.deepEqual([written.model.connectionId,written.model.modelAccountId,written.model.model,written.model.serviceTier,written.model.reasoningEffort],['qoder','qoder-subscription','qoder-shared-model','fast','high']);assert.equal(written.execution,JSON.stringify(['commit-account','commit-model']),'对话模型选择不写提交说明执行模型偏好');
        await page.reload();await input().waitFor();assert.equal(await panel().locator('.ac-provider-select .ant-select-selection-item').innerText(),'Qoder');assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问');await assertModelSummary('Qoder / Qoder 共享模型','高');assert.equal(await panel().locator('.ac-model-trigger .ac-tier-mark').count(),1,'新对话恢复服务档位与思考深度');
        await chooseOption('新对话工作空间','other-workspace');
        assert.equal(await panel().locator('.ac-location-name').innerText(),'other-workspace');assert.equal(await panel().locator('.ac-provider-select .ant-select-selection-item').innerText(),'Qoder','智能体记忆跨工作空间保留');assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','未设置空间采用初始策略');await chooseOption('执行权限','默认权限');await assertModelSummary('Qoder / Qoder 共享模型','高');
        await chooseOption('新对话工作空间',storage.workspaceName);assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','同工作空间新对话恢复完全访问');
        const beforeFailure=fixture.creations;await input().fill('冲突原因不应被统一状态文案覆盖');fixture.prepareError={code:'agent_conversation_busy',message:'请先处理当前执行或未知状态；新内容仍可保留为草稿。'};const conflictResponse=page.waitForResponse((response:any)=>response.url().includes('/drafts/')&&response.url().endsWith('/send'));await panel().getByRole('button',{name:'发送对话',exact:true}).click();await conflictResponse;await panel().getByText('请先处理当前执行或未知状态；新内容仍可保留为草稿。',{exact:true}).waitFor();assert.equal(fixture.creations,beforeFailure);assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await input().inputValue(),'冲突原因不应被统一状态文案覆盖');assert.equal(await panel().locator('[data-pending-send-state]').count(),0,'a rejected first input remains the shared draft, not a queued empty conversation');
        await input().fill('无关账号变化后继续发送');unrelatedSource.accountRevision='devin-r2';unrelatedSource.accountLabel='Devin 套餐 · 已刷新';const catalogRefresh=page.waitForResponse((response:any)=>response.url().endsWith('/model-catalog'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await catalogRefresh;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
        assert.equal(await panel().locator('.ac-provider-select .ant-select-selection-item').innerText(),'Qoder');await assertModelSummary('Qoder / Qoder 共享模型','高');assert.equal(await panel().getByText('对话或套餐状态已变化，已重新读取；套餐登录来源变化时请重新选择模型。草稿保留。',{exact:true}).count(),0);
        const sendsBefore=fixture.sends;await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,sendsBefore+1);assert.equal(sentInputs.at(-1).modelAccountId,'qoder-subscription');assert.equal(sentInputs.at(-1).modelAccountRevision,'qoder-r1','无关 Devin 账号修订不改变 Qoder 对话来源');await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
        await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','同工作空间再次新建仍恢复完全访问');assert.equal(await page.evaluate(()=>localStorage.getItem('buildr.execution-model')),JSON.stringify(['commit-account','commit-model']),'全部对话选择不改变执行模型偏好');
      }finally{fixture.sharedModels=previousModels;fixture.prepareError=undefined;await page.evaluate(({moduleKey,modelKey,module,model,execution}:{moduleKey:string;modelKey:string;module:string|null;model:string|null;execution:string|null})=>{for(const [key,value] of [[moduleKey,module],[modelKey,model],['buildr.execution-model',execution]] as const){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},storage);}
    });

await step('不同来源的模型强度独立恢复，能力失效后首次发送不携带无效强度',async()=>{
      const previousModels=fixture.sharedModels;
      const first={id:'reasoning-a',modelId:'fixture-model',label:'记忆来源 A',accountId:'reasoning-a',accountIdentity:'identity-a',accountRevision:'r1',accountLabel:'来源 A',provider:'fixture',available:true,enabled:true,images:true,tools:true,reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium'};
      const second={...first,id:'reasoning-b',label:'记忆来源 B',accountId:'reasoning-b',accountIdentity:'identity-b',accountLabel:'来源 B',reasoningEfforts:[{id:'low',label:'低'},{id:'medium',label:'中'}],defaultReasoningEffort:'medium'};
      try{
        fixture.sharedModels=[first,second];await page.reload();await input().waitFor();await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await chooseAgent('Codex');
        const before=fixture.creations;await input().fill('推理强度失效后发送');
        await chooseModel('记忆来源 A');await setHighEffort();
        await chooseModel('记忆来源 B');const slider=modelSettings().getByRole('slider',{name:'思考深度',exact:true});await slider.press('Home');assert.equal(await slider.getAttribute('aria-valuetext'),'低');
        await chooseModel('记忆来源 A');assert.equal(await slider.getAttribute('aria-valuetext'),'高');
        await chooseModel('记忆来源 B');assert.equal(await slider.getAttribute('aria-valuetext'),'低');
        await chooseModel('记忆来源 A');await closeModelSettings();await page.reload();await input().waitFor();await assertModelSummary('fixture / 记忆来源 A','高');
        assert.equal(fixture.creations,before,'切换及刷新仍是统一草稿');
        fixture.sharedModels=[{...first,reasoningEfforts:undefined,defaultReasoningEffort:undefined},second];
        const catalogRefresh=page.waitForResponse((response:any)=>response.url().endsWith('/model-catalog'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await catalogRefresh;
        await modelSettings().waitFor({state:'hidden'});await fixture.openModelSettings();await modelSettings().getByText('此模型未提供可调节的推理强度',{exact:true}).waitFor();await closeModelSettings();
        await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();
        assert.equal(fixture.creations,before+1);assert.equal(sentInputs.at(-1).modelAccountId,'reasoning-a');assert.equal(sentInputs.at(-1).reasoningEffort,undefined,'同名原生模型不能使共享来源发送失效强度');
        await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
      }finally{fixture.sharedModels=previousModels;}
    });

await step('唯一新草稿跨空间、旧对话与刷新恢复，默认空间不进入选项',async()=>{
      const existingId=fixture.conversation.id;
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();
      const name=await page.locator('.workspace-switcher strong').innerText();await chooseOption('新对话工作空间',name);
      await input().fill('唯一草稿跨空间保留');await chooseOption('新对话工作空间','other-workspace');assert.equal(await input().inputValue(),'唯一草稿跨空间保留');
      await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await chooseOption('对话列表工作空间','全部工作空间');
      await panel().locator('.ac-history-list [data-conversation-id="'+existingId+'"]').click();await input().waitFor();
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'唯一草稿跨空间保留');
      assert.equal(await panel().locator('.ac-location-settings .ant-select-selection-item').innerText(),'other-workspace');
      await page.reload();await input().waitFor();assert.equal(await input().inputValue(),'唯一草稿跨空间保留');
      const select=panel().locator('.ac-location-settings .ant-select');await select.hover();await select.locator('.ant-select-clear').click();
      const combo=panel().getByRole('combobox',{name:'新对话工作空间',exact:true});await combo.focus();await combo.press('ArrowDown');
      assert.equal(await page.locator('.ant-select-dropdown:visible').getByText('默认工作空间',{exact:true}).count(),0);await combo.press('Escape');
      assert.equal(await input().inputValue(),'唯一草稿跨空间保留');await page.reload();await input().waitFor();
      assert.equal(await panel().locator('.ac-location-settings .ant-select-selection-placeholder').innerText(),'默认工作空间');
      await input().fill('');
    });

await step('lost first-send reply recovers the accepted conversation after refresh without replay',async()=>{
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await chooseAgent('Codex');await input().fill('recover the accepted first input');
      const beforeSends=fixture.sends,beforeCreations=fixture.creations;fixture.loseFirstResponse=true;
      await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().getByRole('button',{name:'核对并重试原提交',exact:true}).waitFor();
      assert.equal(fixture.sends,beforeSends+1);assert.equal(fixture.creations,beforeCreations+1);const acceptedId=fixture.conversation.id;
      await page.reload();await page.locator('#agent-conversation-panel[data-conversation-id="'+acceptedId+'"]').waitFor();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,beforeSends+1);assert.equal(fixture.creations,beforeCreations+1);
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });

await step('后台升级明确拒绝首轮后保留提示，刷新和重试沿用原文字与附件',async()=>{
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await chooseAgent('Codex');
      await input().fill('upgrade preserved original');
      await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles({name:'upgrade.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});await panel().getByRole('button',{name:'移除图片 upgrade.png',exact:true}).waitFor();
      const beforeSends=fixture.sends,beforeCreations=fixture.creations,attempts:any[]=[];
      let updating=true;
      const match=/\/agent-(?:service\/conversations|conversations)\/drafts\/[^/]+\/send$/;
      const rejectWhileUpdating=async(route:any)=>{attempts.push(route.request().postDataJSON());if(!updating)return route.fallback();expectedBrowserErrors?.add(route.request().url());return route.fulfill({status:503,json:{error:{code:'agent_process_switching',message:'switching'}}});};
      await page.route(match,rejectWhileUpdating);
      try{
        await panel().getByRole('button',{name:'发送对话',exact:true}).click();
        const retry=()=>panel().getByRole('button',{name:'检查升级并重试原提交',exact:true});await retry().waitFor();
        assert.match(await panel().locator('.ant-alert-info').innerText(),/上次发送尚未受理.*执行后台正在升级.*新后台尚未就绪/s);
        assert.equal(fixture.sends,beforeSends);assert.equal(fixture.creations,beforeCreations);assert.equal(await panel().getAttribute('data-conversation-id'),null);
        await page.reload();await retry().waitFor();assert.equal(attempts.length,1,'刷新只核对，不自动重发');
        await fixture.capture(page,'agent-conversation-backend-upgrade-notice.png');
        await input().fill('later edited draft');updating=false;await retry().click();await panel().locator('[data-run-status="running"]').waitFor();
        assert.equal(fixture.sends,beforeSends+1);assert.equal(fixture.creations,beforeCreations+1);assert.equal(attempts.length,2);
        assert.equal(attempts[1].clientRequestId,attempts[0].clientRequestId);assert.equal(sentInputs.at(-1).text,'upgrade preserved original');assert.deepEqual(sentInputs.at(-1).attachmentIds,attempts[0].attachmentIds);assert.equal(attempts[0].attachmentIds.length,1);
        assert.equal(await retry().count(),0);
        await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
        await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'later edited draft','后来编辑的文字仍保留在共享新草稿中');
      }finally{await page.unroute(match,rejectWhileUpdating);}
    });

await step('默认工作空间走应用会话路由，空草稿不列出且首轮模式一致',async()=>{
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await chooseOption('新对话工作空间',await page.locator('.workspace-switcher strong').innerText());const workspaceSelect=panel().locator('.ac-location-settings .ant-select');await workspaceSelect.hover();await workspaceSelect.locator('.ant-select-clear').click();await chooseAgent('Codex');
      await chooseModel('Fixture model');await closeModelSettings();await chooseOption('执行权限','完全访问');
      await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles({name:'default.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});await panel().getByRole('button',{name:'移除图片 default.png',exact:true}).waitFor();assert.equal(await panel().getAttribute('data-conversation-id'),null);
      const creationsBefore=fixture.creations;await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await chooseOption('对话列表工作空间','全部工作空间');await panel().locator('.ac-history-list').first().waitFor({state:'attached'});await panel().locator('.ac-history-body>.ant-spin').waitFor({state:'hidden'});assert.equal(fixture.creations,creationsBefore,'adding an image does not create a conversation');
      await panel().getByRole('button',{name:'返回当前对话',exact:true}).click();await input().fill('默认空间首轮');const sent=page.waitForRequest((r:any)=>r.method()==='POST'&&r.url().includes('/api/v1/app/agent-service/conversations/drafts/')&&r.url().endsWith('/send'));await panel().getByRole('button',{name:'发送对话',exact:true}).click();await sent;await panel().locator('[data-run-status="running"]').waitFor();assert.equal(sentInputs.at(-1).permissionMode,'full-access');assert.equal(fixture.conversation.workspaceId,'@default');assert.equal(fixture.creations,creationsBefore+1);
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });
}
