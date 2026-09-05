import { useEffect, useState } from 'react';
import { Button, Input } from 'antd';
import { useAgentActionFeedback } from '../components/AgentActionFeedback';
import { WorkspaceAgentAction } from '../features/workspace/components/WorkspaceAgentAction';
import { ProjectAgentAction } from '../features/project/components/ProjectAgentAction';
import { ServiceAgentAction } from '../features/service/components/ServiceAgentAction';
import { TaskAgentAction } from '../features/task/components/TaskAgentAction';
import { DailyProgressAgentAction } from '../features/project-daily-progress/components/DailyProgressAgentAction';

type Props = { initialAction?: string; initialContext?: Record<string, unknown> };
const EMPTY_CONTEXT: Record<string, unknown> = {};

/** 抽屉宿主：动作选择、上下文与领域表单装配。 */
export function AgentActionDrawer({ initialAction, initialContext = EMPTY_CONTEXT }: Props) {
  const [action, setAction] = useState(initialAction);
  const [context, setContext] = useState(initialContext);
  const [generation, setGeneration] = useState(0);
  const { copyState, setCopyState, copyProvidedPrompt } = useAgentActionFeedback(() => setAction(undefined));
  useEffect(() => {
    setAction(initialAction);
    setContext(initialContext);
    setCopyState('');
    setGeneration((current) => current + 1);
  }, [initialAction, initialContext, setCopyState]);
  const backToChooser = () => { setAction(undefined); setContext({}); setCopyState(''); };
  const props = { context, onBack: backToChooser };
  if (action === 'workspace') return <WorkspaceAgentAction key={generation} {...props} />;
  if (action === 'project') return <ProjectAgentAction key={generation} {...props} />;
  if (action === 'service') return <ServiceAgentAction key={generation} {...props} />;
  if (action === 'daily-progress') return <DailyProgressAgentAction key={generation} {...props} />;
  if (action && ['start', 'change', 'task-review', 'task-verification'].includes(action)) return <TaskAgentAction key={`${generation}:${action}`} action={action} {...props} />;
  if (action === 'workspace-recovery' && typeof context.prompt === 'string') {
    return (
      <>
        <div className="form-header">
          <Button type="link" style={{ paddingInline: 0 }} onClick={backToChooser}>← 返回</Button>
          <span>处理工作空间</span>
        </div>
        <div id="agent-action-result" className="prompt-result">
          <label>
            可复制指令
            <Input.TextArea id="action-prompt-output" rows={13} readOnly value={context.prompt} />
          </label>
          <div className="copy-row">
            <Button
              id="copy-action-prompt"
              onClick={() => void copyProvidedPrompt(context.prompt as string, '目录尚未被初始化、迁移或登记。')}
            >
              复制指令
            </Button>
            <span id="action-copy-state">{copyState || '目录尚未被初始化、迁移或登记。'}</span>
          </div>
        </div>
      </>
    );
  }

  if (action === 'release-update' && typeof context.prompt === 'string') {
    return (
      <>
        <div className="form-header">
          <Button type="link" style={{ paddingInline: 0 }} onClick={backToChooser}>← 返回</Button>
          <span>更新 Buildr</span>
        </div>
        <p className="drawer-copy">
          已选择
          {' '}
          <strong>{context.track === 'stable' ? 'GA 正式版' : 'RC 候选版'}</strong>
          {' '}
          {String(context.version || '')}。网页不会直接执行 npm 更新。
        </p>
        <div id="agent-action-result" className="prompt-result">
          <label>
            可复制指令
            <Input.TextArea id="action-prompt-output" rows={10} readOnly value={context.prompt} />
          </label>
          <div className="copy-row">
            <Button
              id="copy-action-prompt"
              type="primary"
              onClick={() => void copyProvidedPrompt(context.prompt as string, '本机 Buildr 尚未更新。')}
            >
              复制给 Agent
            </Button>
            <span id="action-copy-state">{copyState || '本机 Buildr 尚未更新。'}</span>
          </div>
        </div>
      </>
    );
  }

  if (!action) {
    return (
      <>
        <p className="drawer-copy">Buildr 帮你确认工作范围并生成受约束指令；真正的创建、迁移和专业执行仍由 Agent 完成。</p>
        <div className="action-choice-grid">
          <Button className="action-choice" type="default" block onClick={() => setAction('start')}>
            <span className="action-symbol">→</span>
            <span><strong>用 Agent 开始</strong><small>选择项目、可选服务，并描述第一项工作</small></span>
            <span>→</span>
          </Button>
          <Button className="action-choice" type="default" block onClick={() => setAction('workspace')}>
            <span className="action-symbol">⌂</span>
            <span><strong>创建工作空间</strong><small>建立一个共同工作的顶层目录</small></span>
            <span>→</span>
          </Button>
          <Button className="action-choice" type="default" block onClick={() => setAction('project')}>
            <span className="action-symbol">◇</span>
            <span><strong>创建项目</strong><small>登记业务、产品、系统或长期工作</small></span>
            <span>→</span>
          </Button>
          <Button className="action-choice" type="default" block onClick={() => { setAction('service'); }}>
            <span className="action-symbol">◫</span>
            <span><strong>接入服务</strong><small>按需接入代码仓、应用、模块或可执行资产</small></span>
            <span>→</span>
          </Button>
          <Button className="action-choice secondary-choice" type="default" block onClick={() => setAction('change')}>
            <span className="action-symbol">△</span>
            <span><strong>创建变更</strong><small>建立 OpenSpec 变更契约</small></span>
            <span>→</span>
          </Button>
          <Button className="action-choice secondary-choice" type="default" block onClick={() => setAction('daily-progress')}>
            <span className="action-symbol">◉</span>
            <span><strong>生成每日演进</strong><small>先同步最新代码，再记录当天推进项</small></span>
            <span>→</span>
          </Button>
        </div>
      </>
    );
  }


  return <p className="drawer-copy">该 Agent Action 尚未迁移。</p>;
}
