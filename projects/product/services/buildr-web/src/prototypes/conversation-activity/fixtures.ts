export type DemoConversation = {
  id: string; agent: string; model: string; workspace: 'Buildr' | '业务平台'; title: string; short: string;
  status: 'running' | 'completed' | 'waiting'; unseen: boolean;
  time: number; hidden?: boolean; titleState?: 'pending' | 'failed' | 'generated'; user: string; answer: string;
};
export const isRunning = (row: DemoConversation) => row.status === 'running';
export const isActive = (row: DemoConversation) => row.status !== 'completed' || row.unseen;
export const compareConversations = (a: DemoConversation, b: DemoConversation) => Number(isActive(b)) - Number(isActive(a)) || b.time - a.time || a.id.localeCompare(b.id);
export function conversations(): DemoConversation[] {
  return [
    {id:'568656d4-bcdf-42db-8833-fbd15ca500a0',agent:'Codex',model:'GPT-6.1-Sol',workspace:'Buildr',title:'区分对话执行与未查看提醒',short:'标题提醒',status:'running',unseen:true,time:20,user:'把执行中的对话和未查看的新消息分开提醒。',answer:'我正在核对列表和右侧入口。执行状态与查看状态会分别记录，打开对话不会让正在执行的工作停止。'},
    {id:'c6265695-0007-42d4-b510-1491fe0c04e5',agent:'DSH',model:'SWE-2',workspace:'Buildr',title:'界面保存与模型选择优化',short:'界面保存',status:'running',unseen:false,time:16,user:'继续优化界面保存和模型选择体验。',answer:'已检查保存入口，正在验证切换模型后草稿是否完整保留。'},
    {id:'b6310451-5f08-43da-90e6-0e94c1264949',agent:'Codex',model:'SWE-2',workspace:'业务平台',title:'订单支付异常排查',short:'支付排查',status:'waiting',unseen:true,time:19,user:'排查已经支付但订单仍显示未支付的问题。',answer:'已定位到回调处理分支。继续核对前，需要确认这次排查使用哪个环境。'},
    {id:'2f88f3b9-d186-4dbe-981b-8bf152de3da3',agent:'Codex',model:'SWE-2',workspace:'Buildr',title:'SWE-2 有界接入验证',short:'接入验证',status:'completed',unseen:true,time:15,user:'验证独立模型接入的配置边界。',answer:'接入边界检查已完成，配置互不覆盖。真实账号的计费验证尚未执行，检查记录已保留。'},
    {id:'b27f59b4-57e0-4250-9f2a-60f822d92def',agent:'Codex',model:'SWE-2',workspace:'Buildr',title:'新对话',short:'新对话',status:'completed',unseen:false,time:14,titleState:'failed',user:'检查新对话自动标题为什么没有填入。',answer:'标题在首轮成功完成后生成。工作回复已保存，但独立标题生成超时；可以重新生成标题，不需要重新执行工作。'},
    {id:'5067dd94-04cf-41eb-ae1c-30e7df11fe72',agent:'Codex',model:'SWE-2',workspace:'Buildr',title:'服务列表筛选优化',short:'列表筛选',status:'completed',unseen:false,time:12,user:'把服务列表的筛选条件和按钮交互简化。',answer:'筛选条件已合并，清除筛选可恢复全部结果。'},
    {id:'e9f77b5d-5d23-4773-98f7-c60c75b6bb13',agent:'Codex',model:'SWE-2',workspace:'业务平台',title:'账户导出字段核对',short:'字段核对',status:'completed',unseen:false,time:11,user:'核对导出的账户字段。',answer:'已对照字段说明完成核对，未修改真实账户数据。'},
    {id:'0d731a58-2c6d-4f58-8d0c-4b5d5722f105',agent:'Codex',model:'SWE-2',workspace:'Buildr',title:'旧版发布检查',short:'发布检查',status:'completed',unseen:false,time:10,hidden:true,user:'查看上次发布检查记录。',answer:'上次的检查记录已保留。'},
    {id:'stats-service',agent:'Codex',model:'GPT-6.1-Sol',workspace:'Buildr',title:'服务启动体验优化',short:'服务启动',status:'running',unseen:false,time:9,user:'继续核对当前工作。',answer:'正在核对现有资料与相关实现，结果会保留在本对话中。'},
    {id:'stats-docs',agent:'DSH',model:'GPT-6.1-Sol',workspace:'Buildr',title:'整理连接使用说明',short:'连接说明',status:'running',unseen:false,time:8,user:'继续核对当前工作。',answer:'正在核对现有资料与相关实现，结果会保留在本对话中。'},
    {id:'stats-errors',agent:'Qoder',model:'SWE-2',workspace:'Buildr',title:'完善连接错误提示',short:'连接提示',status:'running',unseen:false,time:7,user:'继续核对当前工作。',answer:'正在核对现有资料与相关实现，结果会保留在本对话中。'},
    {id:'stats-supplier',agent:'Codex',model:'GPT-6.1-Sol',workspace:'业务平台',title:'供应商开户流程检查',short:'开户检查',status:'running',unseen:false,time:6,user:'继续核对当前工作。',answer:'正在核对现有资料与相关实现，结果会保留在本对话中。'}
  ];
}
