import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** models 场景使用独立准备的对话现场。 */
export async function runModelsScenarios(fixture:AgentConversationFixture){
  const {assertModelSummary,capture,chooseAgent,chooseModel,chooseOption,closeConversation,closeModelSettings,input,modelSettings,modelTrigger,openModelSettings,page,panel,reopen,run,sentInputs,setHighEffort,step,update,workspaceId}=fixture;
await step('模型名称选择器仅在悬停时显示外形',async()=>{
      await openModelSettings();const picker=modelSettings().locator('.ac-model-picker.ant-select');await picker.waitFor();await modelSettings().getByRole('slider',{name:'思考深度',exact:true}).focus();await page.mouse.move(4,4);await page.waitForTimeout(250);
      assert.equal(await modelSettings().getByRole('button',{name:'配置模型',exact:true}).count(),0,'公共模型弹层不提供配置入口');
      assert.equal(await picker.locator('.ant-select-arrow').count(),0,'内部模型名称不带下拉箭头');
      const geometry=await modelSettings().evaluate((node:HTMLElement)=>{const popup=node.closest('.ant-popover')!.getBoundingClientRect(),trigger=document.querySelector('.ac-model-trigger[aria-expanded="true"]')!.getBoundingClientRect(),row=node.querySelector('.ac-model-top-row')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node.querySelector('.ant-select-selection-item')!);const text=range.getBoundingClientRect();return{bottom:popup.bottom,triggerTop:trigger.top,center:Math.abs(text.left+text.right-row.left-row.right)/2};});
      assert.ok(geometry.bottom<=geometry.triggerTop+1,'对话模型弹层仍向上展开：'+JSON.stringify(geometry));
      assert.ok(geometry.center<=2,'内部模型名相对整行居中：'+JSON.stringify(geometry));
      await capture(page,'agent-model-settings-layout.png');
      const read=()=>picker.evaluate((node:HTMLElement)=>{const style=getComputedStyle(node);return{background:style.backgroundColor,border:style.borderTopColor,width:style.borderTopWidth,text:node.textContent?.trim()??''};});
      const idle=await read();assert.equal(idle.width,'1px');assert.equal(idle.background,'rgba(0, 0, 0, 0)');assert.equal(idle.border,'rgba(0, 0, 0, 0)');assert.ok(idle.text.length>0,'模型名称在未悬停时仍可读');
      const box=await picker.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('.ac-model-popover .ac-model-picker.ant-select');if(!node)return false;const style=getComputedStyle(node);return style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.borderTopColor!=='rgba(0, 0, 0, 0)';});
      await picker.evaluate((node:HTMLElement)=>Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
      const hovered=await read();assert.notEqual(hovered.background,'rgba(0, 0, 0, 0)');assert.notEqual(hovered.border,'rgba(0, 0, 0, 0)');
      const hoveredCenter=await modelSettings().evaluate((node:HTMLElement)=>{const row=node.querySelector('.ac-model-top-row')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node.querySelector('.ant-select-selection-item')!);const text=range.getBoundingClientRect();return Math.abs(text.left+text.right-row.left-row.right)/2;});assert.ok(hoveredCenter<=2,'悬停不改变模型名居中：'+hoveredCenter);
      await page.mouse.move(4,4);
      await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('.ac-model-popover .ac-model-picker.ant-select');if(!node)return false;const style=getComputedStyle(node);return style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.borderTopColor==='rgba(0, 0, 0, 0)';});
      const combo=modelSettings().getByRole('combobox',{name:'执行模型',exact:true});await combo.focus();await combo.press('ArrowDown');
      const modelList=page.locator('.ac-model-list-popup:visible');await modelList.waitFor();
      await page.waitForFunction(()=>{const node=document.querySelector('.ac-model-list-popup');return Boolean(node&&getComputedStyle(node).opacity==='1'&&!/(?:enter|appear)-active/.test(node.className));});
      await picker.evaluate((node:HTMLElement)=>Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
      const opened=await read();assert.deepEqual({background:opened.background,border:opened.border},{background:hovered.background,border:hovered.border},'展开候选与悬停使用同一模型框样式');
      assert.equal(await picker.evaluate((node:HTMLElement)=>getComputedStyle(node).outlineStyle),'none','展开候选不叠加第二层描边');
      await capture(page,'agent-model-search.png');
      const listBox=await modelList.boundingBox(),effortBox=await modelSettings().locator('.ac-effort-controls').boundingBox();
      assert.ok(listBox&&effortBox&&Math.abs(listBox.width-effortBox.width)<=2,'模型下拉与推理强度区域同宽：'+JSON.stringify({list:listBox,effort:effortBox}));
      assert.ok(listBox.width>=300,'模型下拉为长名称保留足够宽度：'+listBox.width);
      const clipped=await modelList.locator('.ant-select-item-option-content').evaluateAll((nodes:HTMLElement[])=>nodes.filter((node:HTMLElement)=>node.scrollWidth>node.clientWidth+1).map(node=>node.textContent));
      assert.deepEqual(clipped,[],'模型名称不被截断：'+JSON.stringify(clipped));
      assert.equal(await picker.locator('input:not([readonly])').count(),0,'模型行不包含可编辑输入框与闪烁光标');
      assert.equal(await picker.locator('input').evaluate((node:HTMLInputElement)=>node.style.opacity),'0','只读的隐藏输入不显示光标');
      const modelSearch=modelList.getByRole('textbox',{name:'搜索模型',exact:true});await modelSearch.waitFor();
      await modelSearch.fill('Fast');await modelList.getByText('Fast model',{exact:true}).waitFor();
      assert.equal(await modelList.getByText('Fixture model',{exact:true}).count(),0,'搜索按模型名称过滤');
      await modelSearch.press('Escape');await modelList.waitFor({state:'hidden'});
      await combo.focus();await combo.press('ArrowDown');await modelList.waitFor();
      await page.mouse.click(4,4);await modelSettings().waitFor({state:'hidden'});await modelList.waitFor({state:'hidden'});
      assert.equal(await modelTrigger().getAttribute('aria-expanded'),'false','点击外部关闭模型设置时候选列表同步关闭');
      await openModelSettings();await modelList.waitFor({state:'hidden'});
      await closeModelSettings();
    });

await step('模型名与推理强度保持2px间隙，长名称在390px下仍可读且不溢出',async()=>{
      const readTrigger=()=>modelTrigger().evaluate((node:HTMLElement)=>{const label=document.createRange(),effort=document.createRange();label.selectNodeContents(node.querySelector('.ac-model-label')!);effort.selectNodeContents(node.querySelector('.ac-model-effort')!);const fragments=Array.from(label.getClientRects()),last=fragments.at(-1)!,depth=effort.getBoundingClientRect(),button=node.getBoundingClientRect();return{gap:depth.left-last.right,sameLine:Math.abs(depth.bottom-last.bottom)<8,effort:node.querySelector('.ac-model-effort')!.textContent,readable:depth.width>0&&depth.height>0&&depth.left>=button.left-1&&depth.right<=button.right+1&&depth.top>=button.top-1&&depth.bottom<=button.bottom+1,overflow:node.scrollWidth>node.clientWidth+1,button:button.toJSON()};});
      const regular=await readTrigger();assert.ok(regular.sameLine&&Math.abs(regular.gap-2)<=0.5,'普通模型名与强度实际间隙为2px：'+JSON.stringify(regular));
      if(process.env.BUILDR_SCREENSHOT_DIR)await modelTrigger().screenshot({path:process.env.BUILDR_SCREENSHOT_DIR+'/model-label-effort-gap.png'});
      const previousModels=fixture.sharedModels,longLabel='Long model name for readable reasoning depth';
      try{
        fixture.sharedModels=[...previousModels,{id:'gap-long-model',accountId:'gap-fixture',accountIdentity:'gap-identity',accountRevision:'gap-r1',accountLabel:'Gap fixture',provider:'fixture',modelId:'gap-long-model',label:longLabel,available:true,enabled:true,reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'high'}];
        await page.reload();await input().waitFor();await chooseModel(longLabel);await closeModelSettings();
        await page.setViewportSize({width:390,height:844});await modelTrigger().waitFor();
        const long=await readTrigger();assert.equal(long.effort,'高');assert.ok(long.readable&&!long.overflow&&long.button.left>=-1&&long.button.right<=390+1,'窄屏长模型名仍显示完整强度且按钮不溢出：'+JSON.stringify(long));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'长模型名不产生页面横向溢出');
        if(process.env.BUILDR_SCREENSHOT_DIR)await modelTrigger().screenshot({path:process.env.BUILDR_SCREENSHOT_DIR+'/model-label-effort-gap-long-mobile.png'});
        process.stderr.write('[model-label-effort-gap] '+JSON.stringify({regular,long})+'\n');
      }finally{fixture.sharedModels=previousModels;await page.setViewportSize({width:1600,height:1000});await page.reload();await input().waitFor();await chooseModel('Fixture model');await setHighEffort();await closeModelSettings();}
    });

await step('单项停止只对原生明确可停止的命令开放，旧记录与不支持者不误给按钮',async()=>{
      const rawCommand='node /isolated/very-long-command.mjs\n'+Array.from({length:80},(_,i)=>'步骤 '+i+'：'+('long-argument-without-spaces-'.repeat(12))).join('\n');
      const tools=[{id:'native-exact',label:rawCommand,status:'running',canStop:true},{id:'native-unsupported',label:'厂家不支持单独停止',status:'running',canStop:false},{id:'native-legacy',label:'旧命令未声明能力',status:'unknown'},{id:'native-done',label:'已经完成的命令',status:'completed',canStop:true}];
      const before=fixture.sends,stopBodies:any[]=[];
      const matcher='**/agent-conversations/*/stop',intercept=async(route:any)=>{stopBodies.push(route.request().postDataJSON());await route.fallback();};
      await page.route(matcher,intercept);
      try{
        update({run:run('tools-active','codex',{tools}),requests:[],pendingSend:{id:'compact-pending',revision:'pending-v1',state:'waiting',draft:{connectionId:'codex',text:'上一轮结束后再继续',permissionMode:'full-access'},reason:'等待原命令退出后再发送。'}});
        await reopen();
        const notice=panel().locator('.ac-active-tools'),pending=panel().locator('.ac-pending-send');
        await notice.getByText('仍有 3 项命令待核对，可继续对话',{exact:true}).waitFor();
        assert.equal(await notice.locator('pre').count(),0,'长命令默认不铺开');
        assert.equal(await panel().locator('.ac-execution-statusbar,.ac-recovery-action').count(),0,'没有重复状态和恢复入口');
        assert.equal(await pending.locator('.ant-alert').count(),0,'待发送不再嵌套大提示框');
        assert.equal(await panel().getByRole('button',{name:'停止剩余执行',exact:true}).count(),1);
        await capture(page,'agent-active-tools-compact-desktop.png');
        for(const width of [1600,390]){
          await page.setViewportSize({width,height:width===390?844:1000});
          const box=await notice.boundingBox();assert.ok(box&&box.height<110,'默认状态保持紧凑');
          assert.equal(await notice.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1),true);
          assert.equal(await pending.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1),true);
        }
        await capture(page,'agent-active-tools-compact-mobile.png');
        await notice.getByRole('button',{name:'查看命令',exact:true}).click();
        await notice.getByText('厂家不支持单独停止',{exact:true}).waitFor();
        assert.equal(await notice.getByRole('button',{name:'停止此命令',exact:true}).count(),1);
        assert.equal(await notice.getByText('不支持单独停止',{exact:true}).count(),2);
        await notice.getByText('状态待确认',{exact:true}).waitFor();
        assert.equal(await notice.locator('pre').first().innerText(),rawCommand,'完整命令保留在有界详情');
        assert.equal(await notice.getByText('已经完成的命令',{exact:true}).count(),0);
        const list=notice.locator('.ac-active-tools-list');assert.ok((await list.boundingBox())!.height<=241);
        assert.equal(await list.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1),true);
        await capture(page,'agent-active-tools-expanded-mobile.png');
        await notice.getByRole('button',{name:'停止此命令',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
        assert.equal(stopBodies.at(-1).toolId,'native-exact');
        update({run:run('tools-active','codex',{tools}),pendingSend:undefined});await reopen();
        await panel().getByRole('button',{name:'停止剩余执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
        assert.equal(stopBodies.at(-1).toolId,undefined);assert.equal(fixture.sends,before,'样式、展开和停止均不发送下一轮');
      }finally{await page.unroute(matcher,intercept);await page.setViewportSize({width:1600,height:1000});}
    });

await step('后台命令未核对及停止未确认时仍可发送新要求，读取结果直接可见',async()=>{
      await chooseAgent('Codex');await chooseModel('Fixture model');await setHighEffort();await closeModelSettings();
      for(const status of ['tools-active','unknown','stopping']){
        update({run:run(status,'codex',{canContinue:false,stopRequested:status!=='tools-active',tools:[{id:'old-command',label:'需要保留的原命令',status:'unknown'}]}),requests:[],pendingSend:undefined});
        await reopen();
        if(status==='tools-active'){
          const notice=panel().locator('.ac-active-tools');
          await notice.getByText('仍有 1 项命令待核对，可继续对话',{exact:true}).waitFor();
          await notice.getByRole('button',{name:'查看命令',exact:true}).click();await notice.getByText('需要保留的原命令',{exact:true}).waitFor();
          await notice.getByRole('button',{name:'重新读取',exact:true}).click();
          await notice.locator('small[role="status"]').filter({hasText:'读取完成：尚未取得部分命令的结束记录'}).waitFor();
          await capture(page,'agent-controls-read-feedback.png');
        }
        const before=fixture.sends;await input().fill('新的要求 '+status);
        await panel().getByRole('button',{name:'发送对话',exact:true}).click();
        await panel().locator('[data-run-status="running"]').waitFor();
        assert.equal(fixture.sends,before+1,'每条新要求准确发送一次');
        assert.equal(sentInputs.at(-1)?.text,'新的要求 '+status);assert.equal(await input().inputValue(),'');
      }
    });

await step('取消旧交接保留草稿，下一次只发送当前的新指令',async()=>{
      await chooseAgent('Codex');await chooseModel('Fixture model');await setHighEffort();await closeModelSettings();
      update({run:run('unknown','codex',{resourcesReleased:true,stopRequested:true,tools:[{id:'old',label:'原命令',status:'unknown'}]}),requests:[],pendingSend:undefined});await reopen();
      const before=fixture.sends;fixture.prepareError={code:'agent_session_confirmation_required',message:'旧后台要求确认内部会话。'};
      await input().fill('旧指令，暂不发送');await panel().getByRole('button',{name:'发送对话',exact:true}).click();
      const drawer=panel().locator('.ac-handoff-drawer');await drawer.getByRole('button',{name:'关闭交接内容',exact:true}).waitFor();
      assert.equal(fixture.sends,before);await drawer.getByRole('button',{name:'关闭交接内容',exact:true}).click();await drawer.waitFor({state:'hidden'});
      assert.equal(await input().inputValue(),'旧指令，暂不发送','关闭预览不清除草稿');
      await input().fill('已经有人部署了，可以不部署了');await panel().getByRole('button',{name:'发送对话',exact:true}).click();
      await panel().locator('[data-run-status="running"]').waitFor();
      assert.equal(fixture.sends,before+1);assert.equal(sentInputs.at(-1)?.text,'已经有人部署了，可以不部署了');
      assert.equal(sentInputs.slice(before).some((item:any)=>item.text==='旧指令，暂不发送'),false,'已取消的预览不能再次发送旧指令');
      assert.equal(await panel().locator('.ac-handoff-drawer:visible').count(),0);
    });

await step('仅后台作业不占执行中模型且历史保留后台状态',async()=>{
      const at=new Date().toISOString();
      update({run:run('tools-active','codex',{canContinue:true,executionState:'active',tools:[{id:'background-server',label:'bash',status:'running',canStop:true}]}),pendingSend:undefined,requests:[],activity:{version:1,seenThrough:1,active:false,updatedAt:at},entries:[{id:'bg-input',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'启动服务',createdAt:at},{id:'bg-answer',sequence:2,runId:'run-fixture',kind:'message',role:'assistant',text:'服务已启动',createdAt:at}]});
      await reopen();
      await panel().getByRole('region',{name:'尚未结束的命令'}).getByRole('status').filter({hasText:'仍有 1 项命令运行，可继续对话'}).waitFor();
      await fixture.openHistoryList();
      await page.locator('.ac-history-meta').filter({hasText:'后台作业运行中'}).first().waitFor();
      assert.match(await page.locator('.ac-execution-summary strong').innerText(),/执行中模型\s*0/);
      assert.equal(await page.locator('.ac-history-list .ac-activity-status.is-running').count(),0);
      await capture(page,'agent-background-only-history.png');
      await page.locator('.ac-history-list button').first().click();await input().waitFor();
    });

await step('390px下对话输入、停止、历史与关闭可达且无页面横向溢出',async()=>{
      const divider=page.getByRole('separator',{name:'调整对话宽度',exact:true});await divider.press('Home');
      await chooseAgent('Codex');await chooseModel('Fixture model');await setHighEffort();await closeModelSettings();
      const toolbar=await panel().locator('.ac-compose-toolbar').evaluate((node:HTMLElement)=>({width:node.clientWidth,scroll:node.scrollWidth,controls:[...node.querySelectorAll<HTMLElement>('.ac-compose-access,.ac-compose-execution,.ac-choice')].map(item=>({text:item.innerText,width:item.clientWidth,scroll:item.scrollWidth,left:item.getBoundingClientRect().left,right:item.getBoundingClientRect().right}))}));
      assert.ok(toolbar.scroll<=toolbar.width+1,JSON.stringify(toolbar));for(const item of toolbar.controls)assert.ok(item.scroll<=item.width+1,JSON.stringify(item));
      await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#global-conversations-entry').isVisible(),true,'手机保留顶部对话入口');await input().waitFor();assert.ok(await input().isVisible());await fixture.openHistoryList();await page.getByRole('textbox',{name:'搜索对话',exact:true}).waitFor();await page.locator('.ac-history-list button').first().waitFor();const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(node=>node.getClientRects().length&&node.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(node=>({tag:node.tagName,class:node.className,right:node.getBoundingClientRect().right}))}));assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));const geometry=await page.evaluate(()=>({header:document.querySelector('.topbar')!.getBoundingClientRect().bottom,panel:document.querySelector('#agent-conversation-panel')!.getBoundingClientRect().top}));assert.ok(geometry.panel>=geometry.header-1,'移动端对话标题栏不能被换行顶栏遮挡');await capture(page,'agent-conversation-mobile.png');await closeConversation();await panel().waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('.global-conversations-control'))),true,'手机收起后焦点回到可见的全局入口');const mobileEntry=page.locator('#global-conversations-entry'),priorConversation=await panel().getAttribute('data-conversation-id');await mobileEntry.click();await input().waitFor();assert.equal(await panel().getAttribute('data-conversation-id'),priorConversation,'手机主入口保留当前会话');await closeConversation();fixture.additionalPending=[{id:'mobile-attention',workspaceId:workspaceId,cwd:'/isolated/mobile-attention',title:'手机待回应对话',revision:'mobile-attention-r1',hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[],requests:[],run:run('waiting-question'),activity:{version:1,seenThrough:0,active:true,updatedAt:new Date().toISOString()}}];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));const mobileActivity=page.locator('.global-conversations-control').getByRole('button',{name:/^所有对话，/});await mobileActivity.waitFor();await page.locator('.global-conversations-control').getByLabel('1 个待处理对话',{exact:true}).waitFor();await mobileEntry.click();await input().waitFor();assert.equal(await panel().getAttribute('data-conversation-id'),priorConversation,'有活动时手机主入口仍不劫持当前会话');assert.equal(await panel().locator('.ac-activity-count').count(),0,'手机不在标题重复活动徽标');await closeConversation();await mobileActivity.hover();const mobileMenu=page.locator('.ac-activity-menu:visible');await mobileMenu.locator('button[data-activity-id="mobile-attention"]').waitFor();await mobileMenu.locator('button[data-activity-id="mobile-attention"]').click();await page.locator('#agent-conversation-panel[data-conversation-id="mobile-attention"]').waitFor();await page.waitForFunction(()=>Boolean(document.activeElement?.closest('#agent-conversation-panel')&&document.activeElement.getClientRects().length));fixture.additionalPending=[];
    });

await step('统一套餐模型跨执行者保留准确来源，档位保留强度且发送与刷新保留实际选择',async()=>{
      fixture.sharedModels=[{id:'shared-offering',modelId:'shared-model',label:'共享模型',accountId:'fixture-account',accountIdentity:'source-one',accountRevision:'account-r1',accountLabel:'套餐验证',provider:'fixture',available:true,enabled:true,images:true,tools:true,contextWindow:128000,defaultServiceTier:'fast',serviceTiers:[
        {id:'fast',label:'快速',contextWindow:128000,reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium'},
        {id:'standard',label:'标准',contextWindow:256000,reasoningEfforts:[{id:'low',label:'低'},{id:'high',label:'高'}],defaultReasoningEffort:'low'}]}];
      await page.setViewportSize({width:1600,height:1000});await page.reload();await input().waitFor();await fixture.startNewConversation();await input().waitFor();await chooseAgent('Codex');await input().fill('统一模型来源与服务档位验证');const sendsBefore=fixture.sends,preparesBeforeShared=fixture.prepares;
      await chooseModel('共享模型');const tierButton=()=>modelSettings().getByRole('button',{name:'切换服务档位',exact:true});await tierButton().click();assert.equal(await page.getByRole('menu').count(),0,'闪电直接切换，不弹出档位菜单');assert.equal(await modelSettings().getByRole('slider',{name:'思考深度',exact:true}).getAttribute('aria-valuetext'),'低');assert.equal(await panel().locator('.ac-model-trigger .ac-tier-mark').count(),1,'非默认档位在供应商前显示闪电');await setHighEffort();
      await tierButton().click();assert.equal(await modelSettings().getByRole('slider',{name:'思考深度',exact:true}).getAttribute('aria-valuetext'),'高','切换档位保留已选推理强度');assert.equal(await modelSettings().getByRole('button',{name:'恢复默认推理强度',exact:true}).count(),0,'当前界面由切换模型或档位继承默认');await closeModelSettings();assert.equal(await panel().locator('.ac-model-trigger .ac-tier-mark').count(),0,'默认快速档位不在供应商前重复标记');
      await chooseAgent('DSH');await assertModelSummary('Fast model');await chooseModel('共享模型');await assertModelSummary('fixture / 共享模型','中');await setHighEffort();await closeModelSettings();assert.equal(fixture.sends,sendsBefore,'配置和执行者切换不发送');assert.equal(await input().inputValue(),'统一模型来源与服务档位验证');
      await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,sendsBefore+1);
      assert.equal(fixture.prepares,preparesBeforeShared,'atomic first send needs no persisted preview conversation');for(const request of [sentInputs.at(-1)])assert.deepEqual([request.modelAccountId,request.modelAccountIdentity,request.modelAccountRevision,request.model,request.serviceTier,request.reasoningEffort,request.connectionId],['fixture-account','source-one','account-r1','shared-model','fast','high','dsh'],'预览及发送绑定同一准确来源、已观察版本、档位与强度');
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();assert.equal(await panel().locator('.ac-run-status').count(),0,'正常停止不显示额外状态文案');assert.ok((await panel().innerText()).includes('fixture / 共享模型'),'停止后保留模型身份');await assertModelSummary('fixture / 共享模型','高');await openModelSettings();assert.equal(await modelSettings().getByRole('slider',{name:'思考深度',exact:true}).getAttribute('aria-valuetext'),'高');await closeModelSettings();assert.equal(fixture.sends,sendsBefore+1,'刷新恢复配置不自动执行');
    });

await step('Devin SWE-2默认及完全访问可选，模式切换保留草稿与准确发送权限',async()=>{
      const previousModels=fixture.sharedModels,previousConversation=structuredClone(fixture.conversation),previousDraft=await input().inputValue(),previousPermission=await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),sendsBefore=fixture.sends,preparesBefore=fixture.prepares;
      const devin={id:'devin-offering',modelId:'swe-2',label:'SWE-2',accountId:'devin-fixture',accountIdentity:'devin-identity',accountRevision:'devin-r1',accountLabel:'已登录账号',provider:'devin',available:true,enabled:true,images:true,tools:true,contextWindow:128000};
      fixture.sharedModels=[...previousModels,devin,{...devin,id:'devin-gpt61',modelId:'gpt-6-1-sol',label:'GPT-6.1 Sol'}];await chooseAgent('Codex');await chooseOption('执行权限','默认权限');await input().fill('兼容选择草稿');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      const openModelList=async()=>{await openModelSettings();const combo=modelSettings().getByRole('combobox',{name:'执行模型',exact:true});await combo.focus();await combo.press('ArrowDown');return page.locator('.ac-model-list-popup:visible');};
      const closeModelList=async()=>{await modelTrigger().click();await modelSettings().waitFor({state:'hidden'});};
      const isBlocked=async(option:any)=>(await option.getAttribute('class')).includes('ant-select-item-option-disabled');
      try{
        for(const label of ['Codex','Qoder','DSH']){
          await chooseAgent(label);const dropdown=await openModelList(),option=dropdown.locator('.ant-select-item-option').filter({hasText:'SWE-2'});await option.waitFor();assert.equal(await isBlocked(option),false);await option.click();
          await closeModelList();
        }
        assert.equal(fixture.sends,sendsBefore);assert.equal(fixture.prepares,preparesBefore);
        update({run:run('completed','codex',{modelAccountId:devin.accountId,modelAccountIdentity:devin.accountIdentity,modelAccountRevision:devin.accountRevision,model:devin.modelId}),participants:[{id:'participant-codex',connectionId:'codex',provider:'codex'}]});
        await page.reload();await input().waitFor();assert.equal(await input().inputValue(),'兼容选择草稿');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);
        assert.equal(fixture.sends,sendsBefore);assert.equal(fixture.prepares,preparesBefore);await assertModelSummary('Devin / SWE-2');await capture(page,'agent-model-compatibility-codex.png');
        await chooseOption('执行权限','完全访问');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);const dropdown=await openModelList();const swe=dropdown.locator('.ant-select-item-option').filter({hasText:'SWE-2'}),gpt=dropdown.locator('.ant-select-item-option').filter({hasText:'GPT-6.1 Sol'});await swe.waitFor();assert.equal(await isBlocked(swe),false);assert.equal(await isBlocked(gpt),false);await swe.click();await closeModelList();await capture(page,'agent-model-compatibility-full-access.png');
        assert.equal(await input().inputValue(),'兼容选择草稿');assert.equal(fixture.sends,sendsBefore);assert.equal(fixture.prepares,preparesBefore);await chooseOption('执行权限','默认权限');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);await page.reload();await input().waitFor();assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);assert.equal(await input().inputValue(),'兼容选择草稿');
        for(const [label,modelId] of [['SWE-2','swe-2'],['GPT-6.1 Sol','gpt-6-1-sol']]){await chooseModel(label);await closeModelSettings();for(const permission of ['默认权限','完全访问']){await chooseOption('执行权限',permission);await input().fill('Devin模型发送验证');const mode=permission==='默认权限'?'default':'full-access';await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();for(const request of [sentInputs.at(-1)])assert.deepEqual([request.connectionId,request.modelAccountId,request.model,request.permissionMode],['codex',devin.accountId,modelId,mode]);await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();}}await chooseOption('执行权限','默认权限');assert.equal(fixture.sends,sendsBefore+4);assert.equal(fixture.prepares,preparesBefore);await input().fill('兼容选择草稿');
        await chooseModel('共享模型');await closeModelSettings();assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);assert.equal(await input().inputValue(),'兼容选择草稿');assert.equal(fixture.sends,sendsBefore+4);assert.equal(fixture.prepares,preparesBefore);
      }finally{fixture.sharedModels=previousModels;update(previousConversation);await page.reload();await input().waitFor();await input().fill(previousDraft);await chooseOption('执行权限',previousPermission);}
    });

await step('旧对话原生模型绑定来源和切换档位后仍恢复上次强度',async()=>{
      const previousModels=fixture.sharedModels,previousConversation=structuredClone(fixture.conversation);
      const native={id:'native-reasoning',modelId:'fixture-model',label:'原生模型记忆',accountId:'native-codex',accountIdentity:'native-identity',accountRevision:'native-r1',accountLabel:'原生账号',provider:'codex',available:true,enabled:true,images:true,tools:true,defaultServiceTier:'standard',serviceTiers:[
        {id:'standard',label:'标准',reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium'},
        {id:'fast',label:'快速',reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium'}]};
      const other={...native,id:'other-reasoning',modelId:'other-model',label:'其他模型',accountId:'other-source',accountIdentity:'other-identity',provider:'fixture'};
      try{
        fixture.sharedModels=[native,other];update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex'}],run:run('stopped','codex',{model:'fixture-model',reasoningEffort:'medium'})});
        await page.reload();await input().waitFor();await setHighEffort();
        await modelSettings().getByRole('button',{name:'切换服务档位',exact:true}).click();
        await chooseModel('其他模型');await chooseModel('原生模型记忆');
        assert.equal(await modelSettings().getByRole('slider',{name:'思考深度',exact:true}).getAttribute('aria-valuetext'),'高');
        assert.equal(fixture.conversation.run.reasoningEffort,'medium','主动选择不改写旧运行记录');
        await closeModelSettings();await fixture.startNewConversation();await input().waitFor();await assertModelSummary('ChatGPT / 原生模型记忆','高');
      }finally{fixture.sharedModels=previousModels;update(previousConversation);}
    });
}
