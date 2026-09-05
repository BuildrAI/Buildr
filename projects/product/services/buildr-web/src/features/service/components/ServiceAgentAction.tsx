import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Select } from 'antd';
import { workspaceApi } from '../../../api';
import { ACTION_LABELS, useAgentActionFeedback } from '../../../components/AgentActionFeedback';

type Props = { onBack: () => void; context?: Record<string, unknown> };

export function ServiceAgentAction({ onBack, context = {} }: Props) {
  const { setError, showResult, formHeader, promptResult } = useAgentActionFeedback(onBack);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [sourceType, setSourceType] = useState('local');
  const [gitUrl, setGitUrl] = useState('');
  const [remote, setRemote] = useState('');
  const [integrationBranch, setIntegrationBranch] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [projects, setProjects] = useState<Array<{ code: string; name: string }>>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectCode, setProjectCode] = useState(String(context.projectCode || ''));
  useEffect(() => {
    let cancelled = false;
    void workspaceApi.listProjects().then((data) => {
      if (cancelled) return;
      const projects = data.projects || [];
      setProjects(projects);
      setProjectCode((current) => projects.some((item) => item.code === current) ? current : (projects[0]?.code || ''));
      setProjectsLoaded(true);
    }).catch((error: Error) => { if (!cancelled) { setProjectsLoaded(true); setError(error.message); } });
    return () => { cancelled = true; };
  }, [setError]);
  const submitService = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await workspaceApi.serviceCreatePrompt({
          projectCode,
          name,
          description,
          code,
          type: serviceType,
          sourceType,
          localPath,
          gitUrl,
          remote,
          integrationBranch,
        }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.service);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };


    return (
      <>
        {formHeader('服务')}
        <form id="agent-action-form" className="prompt-grid" onSubmit={(event) => void submitService(event)}>
          <label>
            所属项目
            <Select
              id="action-project"
              style={{ width: '100%' }}
              disabled={!projectsLoaded}
              loading={!projectsLoaded}
              placeholder={projectsLoaded && projects.length === 0 ? '请先创建项目' : '正在读取已登记项目…'}
              value={projectCode || undefined}
              onChange={(value) => setProjectCode(value || '')}
              options={projects.map((project) => ({
                value: project.code,
                label: `${project.name}（${project.code}）`,
              }))}
            />
          </label>
          <label>
            名称
            <Input id="action-name" autoComplete="off" required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="full">
            用途
            <Input.TextArea
              id="action-description"
              rows={4}
              required
              placeholder="例如：支付 API、管理后台或可执行任务"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <details className="full">
            <summary>补充代码仓或技术声明（可选）</summary>
            <div className="prompt-grid advanced-fields">
              <label>
                代码（可选）
                <Input id="action-code" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
              </label>
              <label>
                类型（可选）
                <Input id="action-type" autoComplete="off" value={serviceType} onChange={(event) => setServiceType(event.target.value)} />
              </label>
              <label>
                来源
                <Select
                  id="action-source"
                  style={{ width: '100%' }}
                  value={sourceType}
                  onChange={setSourceType}
                  options={[
                    { value: 'local', label: '本地目录' },
                    { value: 'git', label: 'Git 仓库' },
                  ]}
                />
              </label>
              <label>
                本地目录（可选）
                <Input id="action-local-path" autoComplete="off" value={localPath} onChange={(event) => setLocalPath(event.target.value)} />
              </label>
              <label>
                Git 地址（可选）
                <Input id="action-git-url" autoComplete="off" value={gitUrl} onChange={(event) => setGitUrl(event.target.value)} />
              </label>
              <label>
                远端名称（可选）
                <Input id="action-remote" autoComplete="off" placeholder="origin" value={remote} onChange={(event) => setRemote(event.target.value)} />
              </label>
              <label>
                集成分支（可选）
                <Input id="action-branch" autoComplete="off" value={integrationBranch} onChange={(event) => setIntegrationBranch(event.target.value)} />
              </label>
            </div>
          </details>
          <div className="actions full">
            <Button type="primary" htmlType="submit">生成服务指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS.service)}
      </>
    );
}
