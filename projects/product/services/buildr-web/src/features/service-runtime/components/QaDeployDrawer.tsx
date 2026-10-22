import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Select, Space, Tag, Typography } from 'antd';
import { CloudUploadOutlined, LinkOutlined, WarningOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { DEPLOYMENT_STATE_COLOR, DEPLOYMENT_STATE_LABEL, shortCommit } from '../model';
import type { ApiError } from '../../../api/client';
import { serviceRuntimeApi, type DeploymentPlan, type DeploymentRecord } from '../api/service-runtime-api';

type Props = {
  open: boolean;
  serviceCode: string | null;
  serviceName?: string;
  worktreeId?: string | null;
  onClose(): void;
  onSubmitted?(record: DeploymentRecord): void;
};

/** 只读准备结果：确认后才向外部系统提交；受理不等于部署成功。 */
export function QaDeployDrawer({ open, serviceCode, serviceName, worktreeId, onClose, onSubmitted }: Props) {
  const [plan, setPlan] = useState<DeploymentPlan | null>(null);
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingUnknown, setPendingUnknown] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (target: string, selected: string) => {
    setLoading(true);
    setError('');
    try {
      const next = await serviceRuntimeApi.plan(target, { ...(selected ? { branch: selected } : {}), ...(worktreeId ? { worktreeId } : {}) });
      setPlan(next);
      setBranch(next.branch);
    } catch (cause) {
      setPlan(null);
      setError(cause instanceof Error ? cause.message : '部署计划暂时不可用');
    } finally {
      setLoading(false);
    }
  }, [worktreeId]);

  useEffect(() => {
    if (!open || !serviceCode) { setPlan(null); setBranch(''); setError(''); setPendingUnknown(''); return; }
    void load(serviceCode, '');
  }, [open, serviceCode, load]);

  const submit = async (acknowledgeUnknown: boolean) => {
    if (!serviceCode || !plan?.remoteCommit) return;
    setSubmitting(true);
    setError('');
    setPendingUnknown('');
    try {
      const record = await serviceRuntimeApi.deploy(serviceCode, { branch: plan.branch, commit: plan.remoteCommit, ...(acknowledgeUnknown ? { acknowledgeUnknown: true } : {}) });
      onSubmitted?.(record);
      onClose();
    } catch (cause) {
      const failure = cause as ApiError;
      if (failure?.code === 'service_deployment_unknown_pending') setPendingUnknown(failure.message || '上一次提交结果未知。');
      else setError(failure?.message || '提交部署失败');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
    <Button onClick={onClose}>取消</Button>
    <Button type="primary" icon={<CloudUploadOutlined />} loading={submitting} disabled={!plan?.available || !plan.remoteCommit} onClick={() => void submit(false)}>确认部署到 QA</Button>
  </Space>;

  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="远程环境 · 先准备再确认"
    title="部署到 QA"
    sub={serviceName && serviceCode ? `${serviceName} · ${serviceCode}` : ''}
    width={560}
    id="service-runtime-qa-drawer"
    footer={footer}
  >
    <div className="qa-drawer">
      <Alert type="info" showIcon message="这是一个只读准备结果" description="确认后才会向外部系统提交部署。计划绑定当前连接、目标、分支和远端提交；过期后需要重新准备。" />
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => serviceCode && void load(serviceCode, branch)}>重试</Button>} /> : null}
      {pendingUnknown ? <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        message="上一次提交结果未知"
        description={<>
          <p>{pendingUnknown}</p>
          <Button size="small" loading={submitting} onClick={() => void submit(true)}>我已核对，仍要提交同一计划</Button>
        </>}
      /> : null}
      {loading && !plan ? <p className="start-worktree-note">正在准备部署计划…</p> : null}
      {plan ? <>
        <div className="config-field qa-branch-field">
          <label>部署分支</label>
          <Select
            aria-label="部署分支"
            value={plan.branch}
            loading={loading}
            style={{ width: '100%' }}
            options={plan.branches.map(item => ({ value: item.branch, label: `${item.branch} · ${shortCommit(item.commit)}${item.integration ? '（登记集成分支）' : ''}` }))}
            onChange={value => serviceCode && void load(serviceCode, value)}
          />
          <small>默认登记集成分支（Integration Branch）；部署使用所选分支的远端提交，Buildr 不提交也不推送本地改动。</small>
        </div>

        <dl className="runtime-facts">
          <div><dt>服务目标</dt><dd>{plan.target}<code>{plan.targetRef}</code></dd></div>
          <div><dt>提供者</dt><dd>{plan.provider ? <>{plan.provider.name}<Tag color="green">程序 {plan.provider.program}</Tag></> : '连接实例不可用'}</dd></div>
          <div><dt>分支 / 提交</dt><dd><code>{plan.branch}</code> · <code>{plan.remoteCommit ?? '未读取'}</code>{plan.integration ? <Tag color="green">登记集成分支</Tag> : null}<span className="runtime-id">远端计划版本</span></dd></div>
          <div><dt>本地检出</dt><dd>{plan.local ? <>{plan.local.label} · <code>{plan.local.branch ?? '—'}</code> · <code>{shortCommit(plan.local.head)}</code>{plan.local.dirty ? <Tag color="gold">有未提交改动</Tag> : null}</> : '没有可用检出目录'}</dd></div>
          <div><dt>计划有效期</dt><dd>{formatShortDateTime(plan.expiresAt)}<span className="runtime-id">过期后重新准备</span></dd></div>
          {plan.latest ? <div><dt>最近结果</dt><dd><Tag color={DEPLOYMENT_STATE_COLOR[plan.latest.state]}>{DEPLOYMENT_STATE_LABEL[plan.latest.state]}</Tag>{plan.latest.version ?? `${plan.latest.branch}@${shortCommit(plan.latest.commit)}`} · {formatShortDateTime(plan.latest.at ?? plan.latest.submittedAt)}</dd></div> : null}
        </dl>

        {plan.local?.dirty ? <Alert
          className="qa-dirty"
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="本地未提交改动不会进入这次部署"
          description="部署使用远端分支当前提交。Buildr 不会替你提交或推送。"
        /> : null}

        {plan.diagnostics.length ? <Alert type="warning" showIcon message="部署准备诊断" description={<ul className="runtime-diagnostic-list">{plan.diagnostics.map(item => <li key={item}>{item}</li>)}</ul>} /> : null}

        <div className="qa-boundary">
          请求受理不等于部署成功。提交后，构建、部署、当前运行版本和日志在外部系统查看；Buildr 只记录最近一次提交结果与外链。换用其他 CI/CD 时，只需新连接技能实现同一部署适配器契约，本页不重写。
        </div>
        {plan.latest?.externalUrl ? <Typography.Text type="secondary">最近一次提交：<a href={plan.latest.externalUrl} target="_blank" rel="noreferrer"><LinkOutlined /> 打开外部系统</a></Typography.Text> : null}
      </> : null}
    </div>
  </DrawerShell>;
}
