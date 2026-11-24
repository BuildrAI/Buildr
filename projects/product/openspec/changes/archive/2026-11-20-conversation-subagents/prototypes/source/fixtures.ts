import type { CatalogModel, ConnectionView, ConversationEntry, ConversationRun, ConversationView } from '@h/features/agent-conversations/types';

export type Vendor = 'claude' | 'codex';
export type Phase = '' | 'returned' | 'background' | 'partial' | 'settled';
export type Scene = { page: Vendor; state: Phase };
export type ChildId = 'review' | 'edge' | 'verify';
export type Child = {
  id: ChildId; parent?: ChildId; title: string; brief: string; assignedAt: string;
  status: 'running' | 'done' | 'unknown'; relation: string;
  steps: { text: string; time: string; tool?: { name: string; input: string; output: string } }[];
  result?: string; deliveredTo?: string; deliveredAt?: string;
};
export const workspace = { id: 'demo-buildr', name: 'Buildr', rootPath: '/example/Buildr' };
export const mainTitle = '刷新页面后文件无法打开 · 修复与交付';
export const vendors = {
  claude: { name: 'Claude Code', provider: 'claude-code', model: 'DeepSeek-Flash', source: 'Qoder', modelProvider: 'qoder', detail: '子智能体记录' },
  codex: { name: 'Codex', provider: 'codex', model: 'GPT-6.2', source: 'OpenAI', modelProvider: 'openai', detail: '子线程记录' },
} as const;
export function childrenFor(phase: Phase): Child[] {
  const returned = phase === 'returned' || phase === 'background' || phase === 'settled';
  return [
    { id: 'review', title: '独立审查', brief: '核对旧工作树身份失效时的恢复逻辑和测试覆盖。', assignedAt: '10:30',
      status: returned ? 'done' : phase === 'partial' ? 'unknown' : 'running',
      relation: returned ? '已回传主对话' : phase === 'partial' ? '等待关系未确认' : '主流程正在等',
      steps: phase === 'partial' ? [] : [
        { time: '10:30', text: '已接收审查任务，先对照文件恢复入口和当前实现。' },
        { time: '10:31', text: '核对旧标识不存在时的分支。', tool: { name: 'Read', input: 'src/workspace/restore-file.ts', output: '旧工作树无法解析时，当前分支仍继续恢复页签。' } },
        { time: '10:32', text: '请「边界用例核对」验证同名路径和刷新两种情况。' },
        { time: '10:34', text: returned ? '已汇总两处缺口，并把结论返回主智能体。' : '已收到边界用例，正在汇总审查结论。' },
      ],
      ...(returned ? { result: '发现两处缺口：旧身份找不到时应停止自动恢复；存在多个同名路径时，须让用户确认打开哪个版本。建议补上对应回归用例。', deliveredTo: '主智能体', deliveredAt: '10:35' } : {}),
    },
    { id: 'edge', parent: 'review', title: '边界用例核对', brief: '确认刷新后找不到旧身份、以及多个工作树存在同名路径时的行为。', assignedAt: '10:32',
      status: phase === 'partial' ? 'unknown' : 'done', relation: phase === 'partial' ? '回传待确认' : '已回传独立审查',
      steps: phase === 'partial' ? [] : [
        { time: '10:32', text: '收到独立审查派发，核对工作目录身份是否随重建变化。' },
        { time: '10:33', text: '对照候选目录与历史记录。', tool: { name: 'Read', input: 'test/workspace/restore-file.test.ts', output: '缺少工作树已重建、同名文件有冲突两个用例。' } },
      ],
      ...(phase === 'partial' ? {} : { result: '已确认两项边界用例缺失；同名路径不能当成同一个文件来源。', deliveredTo: '独立审查', deliveredAt: '10:33' }),
    },
    { id: 'verify', title: '回归验证', brief: '额外核对已保留的浏览器验证记录。这项复核不影响当前交付。', assignedAt: '10:30',
      status: phase==='settled'?'done':'running', ...(phase==='settled'?{result:'已复核浏览器记录，刷新后可选择正确的工作树。',deliveredTo:'主智能体'}:{}), relation: phase === 'background' ? '独立后台 · 不阻塞' : '并行 · 不阻塞',
      steps: [
        { time: '10:30', text: '已接收回归复核任务，单独核对浏览器验证记录。' },
        { time: '10:34', text: '已核实记录对应同一候选，正在补充对照。', tool: { name: 'Read', input: 'verification/browser-result.md', output: '演示记录：刷新后用当前工作树打开文件。' } },
      ],
    },
  ];
}
export function connectionFor(page: Vendor): ConnectionView {
  const vendor = vendors[page];
  return { id: page, provider: vendor.provider, label: vendor.name, revision: 'demo', status: 'ready', enabled: true,
    models: [{ id: vendor.model, label: vendor.model, isDefault: true }],
    capabilities: { text: true, images: false, approval: false, questions: false, stop: false, resume: false, maxInputBytes: 262144, maxImageBytes: 0, permissionModes: ['default'] } };
}
export function modelFor(page: Vendor): CatalogModel {
  const vendor = vendors[page];
  return { id: `${page}:demo`, accountId: `demo-${page}`, accountIdentity: `demo-${page}`, accountRevision: 'demo', accountLabel: vendor.source, provider: vendor.modelProvider, modelId: vendor.model, label: vendor.model, available: true, images: false, tools: true, contextWindow: 256000 };
}
export function conversationFor(scene: Scene, observedAt: number): ConversationView {
  const vendor = vendors[scene.page], at = (millis: number) => new Date(observedAt + millis).toISOString();
  const runId = `demo-run-${scene.page}`, participantId = `demo-${scene.page}`;
  let sequence = 0;
  const item = (id: string, text: string, patch: Partial<ConversationEntry> = {}): ConversationEntry => ({
    id, text, sequence: ++sequence, kind: 'message', role: 'assistant', provider: vendor.provider,
    participantId, runId, createdAt: at(-125000 + 15000 * sequence), status: 'completed', ...patch,
  });
  const mainDone = scene.state === 'background' || scene.state === 'settled';
  const run: ConversationRun = { id: runId, participantId, provider: vendor.provider, generation: 'demo', status: scene.state==='settled'?'completed':mainDone ? 'tools-active' : scene.state === 'partial' ? 'unknown' : 'running', accepted: true, tools: [], canContinue:mainDone, waitingSubagents:scene.state===''?['demo-review']:[], model: vendor.model, modelSourceLabel: vendor.source, modelAccountId: participantId, modelAccountIdentity: participantId, modelAccountRevision: 'demo', executionState:scene.state==='settled'?'ended':scene.state==='partial'?'unknown':'active', permissionMode: 'default', startedAt: at(-110000), updatedAt: at(0) };
  const previousRun=runId+'-previous';
  const entries = [
    ...(scene.state==='settled'?[
      item('earlier-prompt','先核对页签恢复的触发条件。',{role:'user',status:'accepted',runId:previousRun,createdAt:at(-360000)}),
      item('earlier-agent','已定位到工作树重建后，旧页签仍引用旧身份。',{kind:'notice',role:'system',runId:previousRun,createdAt:at(-350000),subagent:{key:'demo-previous',label:'故障排查',prompt:'读取历史页签来源，复现刷新后的路径错误。',status:'completed',returned:true}}),
      item('earlier-reply','已定位到旧工作树身份失效。',{runId:previousRun,createdAt:at(-330000)}),
    ]:[]),
    item('prompt-'+scene.page, '修复刷新后文件打不开的问题，审查通过后再交付。', { role: 'user', status: 'accepted' }),
    item('setup-'+scene.page, '已修复旧工作树身份失效时的打开逻辑，并补上恢复入口。现在请独立审查核对边界行为。'),
    item('check-'+scene.page, 'npm run test:restore-file\n示例：恢复逻辑的单元检查通过。', { kind: 'tool', role: 'system', name: 'command', input: 'npm run test:restore-file' }),
  ];
  const children=childrenFor(scene.state);
  const add = (child:Child) => {
    const key='demo-'+child.id;
    entries.push(item(key,child.result??'',{kind:'notice',role:'system',parentToolId:child.parent?'demo-'+child.parent:undefined,
      subagent:{key,label:child.title,prompt:child.brief,status:child.status==='done'?'completed':child.status,returned:Boolean(child.deliveredTo)||undefined}}));
    child.steps.forEach((step,index)=>{
      entries.push(item(`${key}-step-${index}`,step.text,{parentToolId:key}));
      if(step.tool)entries.push(item(`${key}-tool-${index}`,step.tool.output,{kind:'tool',role:'system',name:step.tool.name,input:JSON.stringify({file_path:step.tool.input}),parentToolId:key}));
      if(child.id==='review'&&index===2)children.filter(row=>row.parent===child.id).forEach(add);
    });
    if(child.steps.length<3)children.filter(row=>row.parent===child.id).forEach(add);
  };
  children.filter(child=>!child.parent).forEach(add);
  if (scene.state === 'returned') entries.push(item('resumed-'+scene.page, '收到独立审查的两个缺口。我继续补测旧身份失效和同名路径冲突，再进入交付。'));
  if (mainDone) entries.push(item('reply-'+scene.page, '已按审查建议补齐边界测试。旧工作树失效时会明确提示，同名路径需要先选定来源。'));
  return { id: 'demo-conversation-'+scene.page, workspaceId: workspace.id, cwd: workspace.rootPath, title: mainTitle, titleState: {status:'manual'}, revision: `demo-${scene.page}-${scene.state || 'waiting'}`, hidden: false, updatedAt: at(0),
    participants: [{ id: participantId, connectionId: scene.page, provider: vendor.provider, label: vendor.name, role:'agent', createdAt: at(-110000) } as ConversationView['participants'][number]],
    entries, requests: [], ...(scene.state==='settled'?{retainedRuns:[{...run,id:previousRun,startedAt:at(-360000),updatedAt:at(-330000)}]}:{}), activity: { version: 1, seenThrough: 1, updatedAt: at(0), active: !mainDone }, run };
}
