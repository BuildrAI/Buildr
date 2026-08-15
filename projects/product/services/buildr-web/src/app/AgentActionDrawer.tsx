import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Input, Select } from 'antd';
import { api } from '../api';

const ACTION_LABELS: Record<string, string> = {
  workspace: '工作空间',
  project: '项目',
  service: '服务',
  start: '任务',
  change: '变更',
  'task-review': '任务审查',
  'task-verification': '任务验证',
  'release-update': 'Buildr 版本更新',
};

type Props = {
  initialAction?: string;
  initialContext?: Record<string, unknown>;
};

type Project = { code: string; name: string };
type Service = { code: string; name: string };

export function AgentActionDrawer({ initialAction, initialContext = {} }: Props) {
  const [action, setAction] = useState<string | undefined>(initialAction);
  const [context, setContext] = useState(initialContext);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copyState, setCopyState] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [projectCode, setProjectCode] = useState(String(initialContext.projectCode || ''));
  const [serviceCode, setServiceCode] = useState('');
  const [goal, setGoal] = useState(String(initialContext.goal || ''));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [code, setCode] = useState('');
  const [sourceType, setSourceType] = useState('workspace');
  const [gitUrl, setGitUrl] = useState('');
  const [remote, setRemote] = useState('');
  const [integrationBranch, setIntegrationBranch] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [localPath, setLocalPath] = useState('');

  useEffect(() => {
    setAction(initialAction);
    setContext(initialContext);
    setError(null);
    setPrompt(null);
    setProjects([]);
    setProjectsLoaded(false);
    setServices([]);
    setProjectCode(String(initialContext.projectCode || ''));
    setGoal(String(initialContext.goal || ''));
    setSourceType(initialAction === 'service' ? 'local' : 'workspace');
  }, [initialAction, initialContext]);

  useEffect(() => {
    if (action !== 'start' && action !== 'service' && action !== 'change') return;
    let cancelled = false;
    setProjectsLoaded(false);
    void (async () => {
      try {
        const data = await api('/api/v1/projects') as { projects: Project[] };
        if (cancelled) return;
        setProjects(data.projects);
        setProjectsLoaded(true);
        setProjectCode((current) => (
          current && data.projects.some((item) => item.code === current)
            ? current
            : (data.projects[0]?.code || '')
        ));
      } catch (err) {
        if (!cancelled) {
          setProjects([]);
          setProjectsLoaded(true);
          setError(err instanceof Error ? err.message : '读取项目失败。');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [action]);

  useEffect(() => {
    if (action !== 'start' || !projectCode) {
      setServices([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`) as { services: Service[] };
        if (!cancelled) setServices(data.services);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '读取服务失败。');
      }
    })();
    return () => { cancelled = true; };
  }, [action, projectCode]);

  const backToChooser = () => {
    setAction(undefined);
    setContext({});
    setError(null);
    setPrompt(null);
    setProjects([]);
    setProjectsLoaded(false);
    setServices([]);
  };

  const copyPrompt = async (noun: string, unchangedState: string) => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState(`指令已复制。${unchangedState || `${noun}尚未创建。`}`);
    } catch {
      setCopyState(`已选中指令，请手动复制。${unchangedState || `${noun}尚未创建。`}`);
    }
  };

  const showResult = (nextPrompt: string, noun: string, unchangedState = '') => {
    setPrompt(nextPrompt);
    setCopyState(unchangedState || `${noun}尚未创建。`);
  };

  const copyProvidedPrompt = async (value: string, unchangedState: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`指令已复制。${unchangedState}`);
    } catch {
      setCopyState(`已选中指令，请手动复制。${unchangedState}`);
    }
  };

  const submitStart = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await api('/api/v1/prompts/start-work', {
        method: 'POST',
        body: JSON.stringify({ projectCode, serviceCode, goal }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.start, '任务尚未在 Buildr Web 中开始或完成。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await api('/api/v1/prompts/workspace-create', {
        method: 'POST',
        body: JSON.stringify({ name, description, targetPath }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitProject = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await api('/api/v1/prompts/project-create', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          code,
          sourceType,
          gitUrl,
          remote,
          integrationBranch,
        }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitService = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await api('/api/v1/prompts/service-create', {
        method: 'POST',
        body: JSON.stringify({
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
        }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.service);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitChange = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (context.ref && context.action) {
        const result = await api('/api/v1/prompts/change-action', {
          method: 'POST',
          body: JSON.stringify({
            projectCode: context.projectCode,
            ref: context.ref,
            action: context.action,
          }),
        }) as { prompt: string };
        showResult(result.prompt, ACTION_LABELS.change, '变更文件未被修改。');
        return;
      }
      const result = await api('/api/v1/prompts/change-create', {
        method: 'POST',
        body: JSON.stringify({ projectCode, goal }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS.change);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitTaskReview = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const reviewType = context.reviewType === 'completion' ? 'completion' : 'planning';
    const change = context.projectCode && context.change ? String(context.change) : '';
    try {
      const result = await api('/api/v1/prompts/task-review', {
        method: 'POST',
        body: JSON.stringify({
          taskId: context.taskId,
          reviewType,
          ...(change ? { projectCode: context.projectCode, change } : {}),
        }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS['task-review'], '审查结果尚未记录。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitTaskVerification = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await api('/api/v1/prompts/task-verification', {
        method: 'POST',
        body: JSON.stringify({
          taskId: context.taskId,
          ...(context.targetIdentity ? { targetIdentity: context.targetIdentity } : {}),
        }),
      }) as { prompt: string };
      showResult(result.prompt, ACTION_LABELS['task-verification'], '验证结果未被修改。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

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
          <Button className="action-choice" type="default" block onClick={() => { setSourceType('local'); setAction('service'); }}>
            <span className="action-symbol">◫</span>
            <span><strong>接入服务</strong><small>按需接入代码仓、应用、模块或可执行资产</small></span>
            <span>→</span>
          </Button>
          <Button className="action-choice secondary-choice" type="default" block onClick={() => setAction('change')}>
            <span className="action-symbol">△</span>
            <span><strong>创建变更</strong><small>建立 OpenSpec 变更契约</small></span>
            <span>→</span>
          </Button>
        </div>
      </>
    );
  }

  const formHeader = (noun: string, verb = '创建') => (
    <>
      <div className="form-header">
        <Button type="link" style={{ paddingInline: 0 }} onClick={backToChooser}>← 返回</Button>
        <span>{verb}{noun}</span>
      </div>
      <p className="drawer-copy">
        {verb === '创建'
          ? `先描述你的意图，再生成交给 Agent 的指令。复制指令不代表${noun}已经创建。`
          : `选择已登记范围并描述目标。Buildr 只完成交接，不会在页面内${verb}任务。`}
      </p>
      <div id="agent-action-error" className={error ? '' : 'hidden'} role="alert" style={{ marginBottom: 12 }}>
        {error ? <Alert type="error" showIcon message={error} /> : null}
      </div>
    </>
  );

  const promptResult = (noun: string, unchangedState = '') => (
    prompt ? (
      <div id="agent-action-result" className="prompt-result">
        <label>
          可复制指令
          <Input.TextArea id="action-prompt-output" rows={13} readOnly value={prompt} />
        </label>
        <div className="copy-row">
          <Button
            id="copy-action-prompt"
            onClick={() => void copyPrompt(noun, unchangedState)}
          >
            复制指令
          </Button>
          <span id="action-copy-state">{copyState}</span>
        </div>
      </div>
    ) : null
  );

  if (action === 'start') {
    return (
      <>
        {formHeader('第一项工作', '开始')}
        <form id="agent-action-form" className="prompt-grid" onSubmit={(event) => void submitStart(event)}>
          <label>
            项目
            <Select
              id="action-project"
              style={{ width: '100%' }}
              disabled={!projectsLoaded}
              loading={!projectsLoaded}
              placeholder={projectsLoaded && projects.length === 0 ? '请先创建项目' : '正在读取范围…'}
              value={projectCode || undefined}
              onChange={(value) => setProjectCode(value || '')}
              options={projects.map((project) => ({
                value: project.code,
                label: `${project.name}（${project.code}）`,
              }))}
            />
          </label>
          <label>
            服务（可选）
            <Select
              id="action-service"
              style={{ width: '100%' }}
              allowClear
              placeholder="本次不限定服务"
              value={serviceCode || undefined}
              onChange={(value) => setServiceCode(value || '')}
              options={services.map((service) => ({
                value: service.code,
                label: `${service.name}（${service.code}）`,
              }))}
            />
          </label>
          <label className="full">
            你想推进什么？
            <Input.TextArea
              id="action-goal"
              rows={5}
              required
              placeholder="例如：梳理支付项目当前状态，并提出下一步实现方案"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
          <div className="actions full">
            <Button type="primary" htmlType="submit">生成开始工作指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS.start, '任务尚未在 Buildr Web 中开始或完成。')}
      </>
    );
  }

  if (action === 'workspace') {
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

  if (action === 'project') {
    return (
      <>
        {formHeader('项目')}
        <form id="agent-action-form" className="prompt-grid" onSubmit={(event) => void submitProject(event)}>
          <label>
            名称
            <Input id="action-name" autoComplete="off" required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="full">
            用途或长期目标
            <Input.TextArea
              id="action-description"
              rows={4}
              required
              placeholder="例如：管理支付产品的需求、设计和服务关系"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <details className="full">
            <summary>补充已有目录或 Git 声明（可选）</summary>
            <div className="prompt-grid advanced-fields">
              <label>
                代码（可选）
                <Input id="action-code" autoComplete="off" placeholder="不确定时由 Agent 提议" value={code} onChange={(event) => setCode(event.target.value)} />
              </label>
              <label>
                来源
                <Select
                  id="action-source"
                  style={{ width: '100%' }}
                  value={sourceType}
                  onChange={setSourceType}
                  options={[
                    { value: 'workspace', label: '当前工作空间' },
                    { value: 'git', label: '独立 Git 仓库' },
                  ]}
                />
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
            <Button type="primary" htmlType="submit">生成项目指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS.project)}
      </>
    );
  }

  if (action === 'service') {
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

  if (action === 'change') {
    if (context.ref && context.action) {
      const actionLabel = context.action === 'review' ? '审查' : '继续推进';
      return (
        <>
          {formHeader('变更', actionLabel)}
          <form id="agent-action-form" onSubmit={(event) => void submitChange(event)}>
            <div className="context-help">
              {actionLabel}
              项目
              {' '}
              <strong>{String(context.projectCode || '')}</strong>
              {' '}
              中的变更。Buildr 只生成指令，不直接修改变更文件。
            </div>
            <div className="actions">
              <Button type="primary" htmlType="submit">{`生成${actionLabel}指令`}</Button>
            </div>
          </form>
          {promptResult(ACTION_LABELS.change, '变更文件未被修改。')}
        </>
      );
    }
    return (
      <>
        {formHeader('变更')}
        <form id="agent-action-form" onSubmit={(event) => void submitChange(event)}>
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
            变更目标
            <Input.TextArea id="action-goal" rows={6} required placeholder="描述要解决的问题、期望结果与重要边界" value={goal} onChange={(event) => setGoal(event.target.value)} />
          </label>
          <div className="actions">
            <Button type="primary" htmlType="submit">生成变更指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS.change)}
      </>
    );
  }

  if (action === 'task-review') {
    const reviewType = context.reviewType === 'completion' ? 'completion' : 'planning';
    const typeLabel = reviewType === 'planning' ? '方案审查（Planning Review）' : '完成审查（Completion Review）';
    const change = context.projectCode && context.change ? `${context.projectCode}/${context.change}` : '';
    return (
      <>
        {formHeader('任务审查', '准备')}
        <form id="agent-action-form" onSubmit={(event) => void submitTaskReview(event)}>
          <div className="context-help">
            为正式任务
            {' '}
            <strong>{String(context.taskId || '')}</strong>
            {' '}
            准备
            {' '}
            {typeLabel}
            {change ? (
              <>
                ，限定任务范围内的变更
                {' '}
                <strong>{change}</strong>
              </>
            ) : null}
            。Buildr 只生成受约束指令，不在页面内执行审查或写入结果。
          </div>
          <div className="actions">
            <Button type="primary" htmlType="submit">生成审查指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS['task-review'], '审查结果尚未记录。')}
      </>
    );
  }

  if (action === 'task-verification') {
    return (
      <>
        {formHeader('任务验证', '准备')}
        <form id="agent-action-form" onSubmit={(event) => void submitTaskVerification(event)}>
          <div className="context-help">
            为正式任务
            {' '}
            <strong>{String(context.taskId || '')}</strong>
            {' '}
            准备任务验证（Task Verification）。Buildr 只生成受约束指令，不在页面内执行测试、生成目标身份或写入结果。
          </div>
          <div className="actions">
            <Button type="primary" htmlType="submit">生成验证指令</Button>
          </div>
        </form>
        {promptResult(ACTION_LABELS['task-verification'], '验证结果未被修改。')}
      </>
    );
  }

  return (
    <p className="drawer-copy">该 Agent Action 尚未迁移。</p>
  );
}
