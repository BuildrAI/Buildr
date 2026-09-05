import { Button, Input } from 'antd';
import { useAgentActionFeedback } from '../../../components/AgentActionFeedback';
export function DailyProgressAgentAction({ context, onBack: backToChooser }: { context: Record<string, unknown>; onBack: () => void }) {
  const { copyState, copyProvidedPrompt } = useAgentActionFeedback(backToChooser);
    const selectedProject = String(context.projectCode || '');
    const selectedDate = String(context.date || '');
    const generated = [
      `请为项目 ${selectedProject || '<project-code>'} 生成${selectedDate ? ` ${selectedDate}` : '今天'}的项目每日演进。`,
      '',
      '执行要求：',
      '1. 读取并遵循 project-daily-progress Skill。',
      '2. 先按「更新 workspace」同步最新代码：Git 管理时把安全 update 交给 buildr.git-operations/v1，成功后再运行 buildr sync <agent>。dirty、冲突、upstream 不明或 Doctor 未 ready 时停止，不要调用 record。',
      '3. 同步成功后收集当日 Git 提交与更改文件，用本机 git config user.email 对比作者。自己的提交可挂 0..N 个已有 Task；他人提交必须写入且不得挂 Task。总结四问：新增了什么、更新了什么、删除了什么、有什么弊端。不要根据任务列表自动填充。',
      `4. 把 payload JSON 放到操作系统临时目录，调用 \`buildr project daily-progress record --project ${selectedProject || '<project-code>'}${selectedDate ? ` --date ${selectedDate}` : ''} --input <payload.json> --json\`。成功后删除临时文件。`,
      '5. 不要手写 YAML，不要写入 Task SQLite，不要实现 Buildr 产品 cron。',
    ].join('\n');
    return (
      <>
        <div className="form-header">
          <Button type="link" style={{ paddingInline: 0 }} onClick={backToChooser}>← 返回</Button>
          <span>生成每日演进</span>
        </div>
        <p className="drawer-copy">页面不直接写每日演进。把生成或重跑交给 Agent，由 Agent 先同步最新代码再提交当天文件。</p>
        <div id="agent-action-result" className="prompt-result">
          <label>
            可复制指令
            <Input.TextArea id="action-prompt-output" rows={13} readOnly value={generated} />
          </label>
          <div className="copy-row">
            <Button
              id="copy-action-prompt"
              onClick={() => void copyProvidedPrompt(generated, '每日演进文件尚未写入。')}
            >
              复制指令
            </Button>
            <span id="action-copy-state">{copyState || '每日演进文件尚未写入。'}</span>
          </div>
        </div>
      </>
    );
}
