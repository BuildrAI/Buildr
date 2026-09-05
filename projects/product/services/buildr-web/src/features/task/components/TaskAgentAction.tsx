import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Select } from 'antd';
import { workspaceApi, taskProfessionalApi } from '../../../api';
import { ACTION_LABELS, useAgentActionFeedback } from '../../../components/AgentActionFeedback';

type Props = { action: string; context: Record<string, unknown>; onBack: () => void };

/** Task范围内的开始、Change交接、审查和验证表单。 */
export function TaskAgentAction({ action, context, onBack }: Props) {
  const { setError, showResult, formHeader, promptResult } = useAgentActionFeedback(onBack);
  const [projects, setProjects] = useState<Array<{ code: string; name: string }>>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [services, setServices] = useState<Array<{ code: string; name: string }>>([]);
  const [projectCode, setProjectCode] = useState(String(context.projectCode || ''));
  const [serviceCode, setServiceCode] = useState('');
  const [goal, setGoal] = useState(String(context.goal || ''));
  useEffect(() => {
    if (action !== 'start' && action !== 'change') return;
    let cancelled = false;
    setProjectsLoaded(false);
    void (async () => {
      try {
        const data = await workspaceApi.listProjects();
        if (cancelled) return;
        const availableProjects = data.projects || [];
        setProjects(availableProjects);
        setProjectsLoaded(true);
        setProjectCode((current) => (
          current && availableProjects.some((item) => item.code === current)
            ? current
            : (availableProjects[0]?.code || '')
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
        const data = await workspaceApi.services(projectCode);
        if (!cancelled) setServices(data.services || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '读取服务失败。');
      }
    })();
    return () => { cancelled = true; };
  }, [action, projectCode]);


  const submitStart = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await taskProfessionalApi.startWorkPrompt({ projectCode, serviceCode, goal });
      showResult(result.prompt, ACTION_LABELS.start, '任务尚未在 Buildr Web 中开始或完成。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitChange = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (context.ref && context.action) {
        const result = await taskProfessionalApi.changeActionPrompt({ projectCode: context.projectCode, ref: context.ref, action: context.action });
        showResult(result.prompt, ACTION_LABELS.change, '变更文件未被修改。');
        return;
      }
      const result = await taskProfessionalApi.changeCreatePrompt({ projectCode, goal });
      showResult(result.prompt, ACTION_LABELS.change);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成指令失败。');
    }
  };

  const submitTaskReview = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const reviewType = context.reviewType === 'completion' ? 'completion' : 'planning';
    const change = context.projectCode && context.change ? String(context.change) : '';
    const typeLabel = reviewType === 'planning' ? '方案审查（Planning Review）' : '完成审查（Completion Review）';
    const taskId = String(context.taskId || '');
    showResult([
      `请对正式任务 ${taskId} 执行${typeLabel}。`,
      '',
      '读取并遵循 task-review Skill；重新读取当前 Task、真实审查对象和已有 Review Result。',
      ...(change ? [`限定的 Task-scoped Change：${String(context.projectCode)}/${change}。`] : []),
      '根据当前目标和风险选择审阅范围，完整结束后才通过 Task Review Interface 保存结果。',
      'Review 不决定 Task 是否继续、完成或交付。',
    ].join('\n'), ACTION_LABELS['task-review'], '审查结果尚未记录。');
  };

  const submitTaskVerification = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const taskId = String(context.taskId || '');
    showResult([
      `请完成正式任务 ${taskId} 的任务验证（Task Verification）。`,
      '',
      '读取并遵循 task-verification Skill；读取当前Task、真实改动和相关Project测试地图。',
      '由你选择并直接调用项目已有测试工具；Buildr不生成验证计划或代跑测试。',
      '全部验证完成后，只保存包含实际检查、未覆盖项和明确结论的有意义报告。',
    ].join('\n'), ACTION_LABELS['task-verification'], '验证报告未被修改。');
  };


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
        <form id="agent-action-form" onSubmit={submitTaskReview}>
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
        <form id="agent-action-form" onSubmit={submitTaskVerification}>
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
        {promptResult(ACTION_LABELS['task-verification'], '验证报告未被修改。')}
      </>
    );
  }


  return null;
}
