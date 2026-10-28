import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** recovery 场景使用独立准备的对话现场。 */
export async function runRecoveryScenarios(fixture:AgentConversationFixture){
  const {page,panel,run,step,update}=fixture;
await step('状态未知时自动核对原执行，不重新发送工作',async()=>{
      const beforeSends=fixture.sends,beforeObserves=fixture.observes;fixture.recoverNextObserve=true;update({run:run('unknown')});await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();assert.ok(fixture.observes>beforeObserves);assert.equal(fixture.sends,beforeSends,'自动恢复观察不创建新的执行');update({run:run('stopped')});await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();
    });

await step('事件流中断先静默重连，不立刻打断执行状态；连续中断才提示核对',async()=>{
      const streamsBefore=fixture.eventStreams;fixture.dropEventStreams=2;await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();await page.waitForTimeout(1000);
      assert.equal(await panel().getByText('对话连接已中断',{exact:true}).count(),0,'首次断线不立刻显示执行告警');
      await panel().getByText('对话连接已中断',{exact:true}).waitFor({timeout:20000});
      assert.ok(fixture.eventStreams-streamsBefore>=3,'连续两次断线后仍自动重连，未要求用户手动核对');
      assert.equal(await panel().locator('[data-run-status="stopped"]').count(),1,'重连不改写已观察的执行状态');
      const notice=panel().locator('.ac-stream-disconnect');await notice.getByRole('button',{name:'重新连接并核对',exact:true}).waitFor();
      assert.equal(await notice.getByText('原执行状态尚未确认。',{exact:true}).count(),1,'去除重复标题后仍保留未确认状态');
      assert.equal(await notice.getByText('对话连接已中断',{exact:true}).count(),1);
      await page.setViewportSize({width:375,height:800});await notice.scrollIntoViewIfNeeded();
      const geometry=await notice.evaluate((node:HTMLElement)=>{const action=node.querySelector<HTMLElement>('.ant-alert-action')!.getBoundingClientRect(),box=node.getBoundingClientRect();return {left:action.left-box.left,right:box.right-action.right};});
      assert.ok(geometry.left>=0&&geometry.right>=0,'窄屏下核对操作仍在提醒范围内');await page.setViewportSize({width:1600,height:1000});
    });
}
