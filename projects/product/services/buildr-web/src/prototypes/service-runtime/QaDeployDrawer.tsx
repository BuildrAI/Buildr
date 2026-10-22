import { useEffect, useState } from 'react';
import { Alert, Button, Select, Space, Tag, Typography } from 'antd';
import { CloudUploadOutlined, WarningOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../components/DrawerShell';
import type { Service } from './model';
import { integrationBranchOf, qaPlanFor } from './model';

type Props = {
  service: Service | null;
  open: boolean;
  onClose(): void;
  onConfirm(serviceId: string, branch: string, commit: string): void;
};

export function QaDeployDrawer({ service, open, onClose, onConfirm }: Props) {
  const [branch, setBranch] = useState('');
  useEffect(() => {
    if (open && service) setBranch(integrationBranchOf(service));
  }, [open, service]);

  const plan = service ? qaPlanFor(service, branch || undefined) : null;
  const footer = <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
    <Button onClick={onClose}>取消</Button>
    <Button type="primary" icon={<CloudUploadOutlined />} disabled={!service || !plan} onClick={() => service && plan && onConfirm(service.id, plan.branch, plan.remoteCommit)}>确认部署到 QA</Button>
  </Space>;

  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="远程环境 · 先准备再确认"
    title="部署到 QA"
    sub={service ? `${service.name} · ${service.code}` : ''}
    width={540}
    footer={footer}
  >
    {plan && service && <div className="qa-drawer" data-prototype-position="qa-plan">
      <Alert
        type="info"
        showIcon
        message="这是一个只读准备结果"
        description="确认后才会向云雀提交部署。计划绑定当前连接、目标、分支和提交；过期后需要重新准备。"
      />

      <div className="config-field qa-branch-field">
        <label>部署分支</label>
        <Select
          value={plan.branch}
          style={{ width: '100%' }}
          options={service.remoteBranches.map(item => ({ value: item.branch, label: `${item.branch} · ${item.commit}` }))}
          onChange={value => setBranch(value)}
        />
        <small>默认登记集成分支；部署使用所选分支的远端提交，Buildr 不提交也不推送本地改动。</small>
      </div>

      <dl className="runtime-facts">
        <div><dt>服务目标</dt><dd>{plan.target}<code>{plan.targetRef}</code></dd></div>
        <div><dt>提供者</dt><dd>{plan.connection}<Tag color="green">已授权</Tag></dd></div>
        <div><dt>分支 / 提交</dt><dd><code>{plan.branch}</code> · <code>{plan.remoteCommit}</code>{plan.integration && <Tag color="green">登记集成分支</Tag>}<span className="runtime-id">远端计划版本</span></dd></div>
        <div><dt>本地 HEAD</dt><dd><code>{plan.localHead}</code>{plan.dirty && <Tag color="gold">有未提交改动</Tag>}</dd></div>
        <div><dt>计划有效期</dt><dd>{plan.expiresAt}<span className="runtime-id">过期后重新准备</span></dd></div>
      </dl>

      {plan.dirty && <div data-prototype-position="qa-warning">
        <Alert
          className="qa-dirty"
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="本地未提交改动不会进入这次部署"
          description="部署使用远端分支当前提交。Buildr 不会替你提交或推送。"
        />
      </div>}

      <div className="qa-boundary">
        请求受理不等于部署成功。提交后，构建、部署、当前运行版本和日志在云雀查看；Buildr 只记录最近一次提交结果。换用其他 CI/CD 时，只需新连接技能实现同一部署适配器契约，本页不重写。
      </div>

      <Typography.Text type="secondary" className="config-save-note">
        此原型不会提交真实部署，也不会读取云雀认证。
      </Typography.Text>
    </div>}
  </DrawerShell>;
}
