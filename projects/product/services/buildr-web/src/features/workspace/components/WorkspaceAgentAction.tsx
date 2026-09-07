import { useState, type FormEvent } from 'react';
import { Button, Input } from 'antd';
import { workspaceApi } from '../../../api';
import { ACTION_LABELS, useAgentActionFeedback } from '../../../components/AgentActionFeedback';

type Props = { onBack: () => void; context?: Record<string, unknown> };

export function WorkspaceAgentAction({ onBack }: Props) {
  const { setError, showResult, formHeader, promptResult } = useAgentActionFeedback(onBack);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const submitWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await workspaceApi.workspaceCreatePrompt({ name, description, targetPath }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };


    return (
      <>
        {formHeader('工作空间')}
        <form id="agent-action-form" onSubmit={(event) => void submitWorkspace(event)}>
          <label>
            名称
            <Input id="action-name" autoComplete="off" required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            目标位置（可选）
            <Input id="action-target" autoComplete="off" placeholder="不确定时留空，由 Agent 询问" value={targetPath} onChange={(event) => setTargetPath(event.target.value)} />
          </label>
          <label>
            说明
            <Input.TextArea id="action-description" rows={5} required value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="actions">
            <Button type="primary" htmlType="submit">生成工作空间指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS.workspace)}
      </>
    );
}
