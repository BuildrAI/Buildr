import { projectApi } from '../api/project-api';
import { useState, type FormEvent } from 'react';
import { Button, Input, Select } from 'antd';

import { ACTION_LABELS, useAgentActionFeedback } from '../../../components/AgentActionFeedback';

type Props = { onBack: () => void; context?: Record<string, unknown> };

export function ProjectAgentAction({ onBack }: Props) {
  const { generatePrompt, updateInput, formHeader, promptResult } = useAgentActionFeedback(onBack);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [sourceType, setSourceType] = useState('workspace');
  const [gitUrl, setGitUrl] = useState('');
  const [remote, setRemote] = useState('');
  const [integrationBranch, setIntegrationBranch] = useState('');
  const submitProject = async (event: FormEvent) => {
    event.preventDefault();
    await generatePrompt(async () => (await projectApi.projectCreatePrompt({
          name,
          description,
          code,
          sourceType,
          gitUrl,
          remote,
          integrationBranch,
        })).prompt, ACTION_LABELS.project);
  };


    return (
      <>
        {formHeader('项目')}
        <form id="agent-action-form" className="prompt-grid" onSubmit={(event) => void submitProject(event)}>
          <label>
            名称
            <Input id="action-name" autoComplete="off" required value={name} onChange={(event) => updateInput(() => setName(event.target.value))} />
          </label>
          <label className="full">
            用途或长期目标
            <Input.TextArea
              id="action-description"
              rows={4}
              required
              placeholder="例如：管理支付产品的需求、设计和服务关系"
              value={description}
              onChange={(event) => updateInput(() => setDescription(event.target.value))}
            />
          </label>
          <details className="full">
            <summary>补充已有目录或 Git 声明（可选）</summary>
            <div className="prompt-grid advanced-fields">
              <label>
                代码（可选）
                <Input id="action-code" autoComplete="off" placeholder="不确定时由 Agent 提议" value={code} onChange={(event) => updateInput(() => setCode(event.target.value))} />
              </label>
              <label>
                来源
                <Select
                  id="action-source"
                  style={{ width: '100%' }}
                  value={sourceType}
                  onChange={(value) => updateInput(() => setSourceType(value))}
                  options={[
                    { value: 'workspace', label: '当前工作空间' },
                    { value: 'git', label: '独立 Git 仓库' },
                  ]}
                />
              </label>
              <label>
                Git 地址（可选）
                <Input id="action-git-url" autoComplete="off" value={gitUrl} onChange={(event) => updateInput(() => setGitUrl(event.target.value))} />
              </label>
              <label>
                远端名称（可选）
                <Input id="action-remote" autoComplete="off" placeholder="origin" value={remote} onChange={(event) => updateInput(() => setRemote(event.target.value))} />
              </label>
              <label>
                集成分支（可选）
                <Input id="action-branch" autoComplete="off" value={integrationBranch} onChange={(event) => updateInput(() => setIntegrationBranch(event.target.value))} />
              </label>
            </div>
          </details>
          <div className="actions full">
            <Button type="primary" htmlType="submit">生成项目指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS.project)}
      </>
    );
}
