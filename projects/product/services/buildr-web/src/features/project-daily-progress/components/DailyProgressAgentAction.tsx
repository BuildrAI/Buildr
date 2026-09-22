import { Button, Input } from 'antd';
import { useAgentActionFeedback } from '../../../components/AgentActionFeedback';
import { dailyProgressActionContext } from '../dailyProgressNavigation';
export function DailyProgressAgentAction({ context, onBack: backToChooser }: { context: Record<string, unknown>; onBack: () => void }) {
  const { copyState, copyProvidedPrompt } = useAgentActionFeedback(backToChooser);
    const selectedProject = String(context.projectCode || '');
    const selectedDate = dailyProgressActionContext(selectedProject, String(context.date || '')).date;
    const generated = [
      `请为项目 ${selectedProject || '<project-code>'} 生成 ${selectedDate} 的项目每日演进。`,
      '',
      '执行要求：',
      '1. 读取并遵循 project-daily-progress 技能（Skill），确认已登记项目、目标日期、时区及相关仓库。',
      '2. 默认按当前本地引用收集当日 Git 提交与更改文件，固定完整提交标识和观察时点；日报不以代码更新、资产同步、工作目录干净或全局诊断通过为前提。不要为生成日报检出、变基或清理工作目录。',
      '3. 用本机 git config user.email 对比作者。自己的提交可关联 0..N 个已有任务（Task）；他人提交必须写入且不得关联任务（Task）。总结四问：新增了什么、更新了什么、删除了什么、有什么弊端。不要根据任务列表自动填充。',
      '4. 在 daySummary.drawbacks 中注明仓库、引用、完整提交标识、截至时间与时区、远端是否已确认及未覆盖范围。只有用户明确要求且已有授权时获取远端引用。重跑前核对已有日报范围，不静默丢失已包含内容；无法满足必需范围时保留旧日报。',
      `5. 把输入数据（payload）的 JSON 文件放到操作系统临时目录，调用 \`buildr project daily-progress record --project ${selectedProject || '<project-code>'} --date ${selectedDate} --input <payload.json> --json\`。成功后删除临时文件。`,
      '6. 不要手写 YAML，不要写入任务（Task）的 SQLite 数据库，不要实现 Buildr 产品定时器。',
    ].join('\n');
    return (
      <>
        <div className="form-header">
          <Button type="link" style={{ paddingInline: 0 }} onClick={backToChooser}>← 返回</Button>
          <span>生成每日演进</span>
        </div>
        <p className="drawer-copy">把所选日期的生成或重跑交给智能体（Agent），根据明确的提交范围生成摘要，并说明未覆盖的内容。</p>
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
