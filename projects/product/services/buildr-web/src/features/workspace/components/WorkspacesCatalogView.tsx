import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Space, Tag, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { WorkspaceRegistry } from '../api/workspace-client';
import { workspaceHomePath } from '../../../lib/labels';

export type WorkspaceEntry = WorkspaceRegistry['workspaces'][number];

export type WorkspacesCatalogViewProps = {
  entries: WorkspaceEntry[] | null;
  toolbar: ReactNode;
  description?: ReactNode;
  message?: ReactNode;
  error?: ReactNode;
  adding?: boolean;
  removing?: string | null;
  refreshing?: boolean;
  onRemove(entry: WorkspaceEntry): void;
  onSettings(workspaceId: string): void;
  onOpen?(entry: WorkspaceEntry): void;
  onRetry?(): void;
  emptyActions?: ReactNode;
  emptyDescription?: ReactNode;
  emptyEyebrow?: ReactNode;
  renderStatus?(entry: WorkspaceEntry): ReactNode;
  renderExtra?(entry: WorkspaceEntry): ReactNode;
};

function healthLabel(status: string): string {
  if (status === 'ready') return '可用';
  if (status === 'unavailable') return '路径不可用';
  if (status === 'identity_conflict') return '身份冲突';
  return '需要处理';
}

/** Catalog presentation shared by the live page and isolated demonstrations. */
export function WorkspacesCatalogView({
  entries,
  toolbar,
  description = '从这里建立工作范围。工作空间是你和 Agent 共同工作的顶层目录；项目表示长期工作单元，服务按需登记代码仓、应用或模块。',
  message,
  error,
  adding = false,
  removing = null,
  refreshing = false,
  onRemove,
  onSettings,
  onOpen,
  onRetry,
  emptyActions,
  emptyDescription = '添加已有工作空间只保存本机入口：不会移动目录、修改源资产或自动扫描磁盘。进入后，Buildr 会再引导你建立项目，并按需接入服务。',
  emptyEyebrow = '工作空间 → 项目 → 服务',
  renderStatus,
  renderExtra,
}: WorkspacesCatalogViewProps) {
  const empty = entries !== null && entries.length === 0;

  return <>
    <section className="resource-toolbar">
      <div>
        <Typography.Title level={2} style={{ margin: 0 }}>工作空间</Typography.Title>
        <p className="page-copy">{description}</p>
      </div>
      <div className="toolbar-actions">{toolbar}</div>
    </section>
    <div id="workspace-global-message" className={message ? '' : 'hidden'} role="status">
      {message ? <Alert type="info" showIcon message={message} style={{ marginBottom: 16 }} /> : null}
    </div>
    {error && <Alert id="workspace-operation-error" type="error" showIcon message={error}
      action={onRetry ? <Button size="small" loading={refreshing} disabled={adding || Boolean(removing)} onClick={onRetry}>重新读取登记</Button> : undefined} />}
    {removing && <p role="status">正在移除工作空间登记…</p>}
    <section id="workspace-grid" className="workspace-grid" aria-label="已登记工作空间">
      {(entries || []).map((entry) => {
        const ready = entry.status === 'ready';
        const main = <>
          <div className="workspace-card-heading">
            {renderStatus ? renderStatus(entry) : <Tag color={ready ? 'success' : 'warning'}>{healthLabel(entry.status)}</Tag>}
            <span className="workspace-health">
              {entry.updatedAt ? `最近登记 ${new Date(entry.updatedAt).toLocaleDateString('zh-CN')}` : '本机登记'}
            </span>
          </div>
          <h2>{entry.workspace?.name || '不可用的工作空间'}</h2>
          <p className="workspace-description">{entry.workspace?.description || entry.error?.message || '无法读取工作空间信息。'}</p>
          <p className="mono workspace-root">{entry.rootPath}</p>
          <span className="workspace-open-label">进入工作空间{' '}<span aria-hidden="true">→</span></span>
        </>;
        return <article className={`workspace-card${ready && entry.workspace?.id ? ' has-settings' : ''}`} key={entry.rootPath} data-workspace-id={entry.workspace?.id}>
          {ready && entry.workspace?.id ? <Link className="workspace-card-main" to={workspaceHomePath(entry.workspace.id)} onClick={onOpen ? event => { event.preventDefault(); onOpen(entry); } : undefined}>
            {main}
          </Link> : <div className="workspace-card-main" aria-disabled="true">{main}</div>}
          {ready && entry.workspace?.id ? <Button className="workspace-card-settings" type="text" icon={<SettingOutlined />}
            aria-label={`设置工作空间：${entry.workspace.name}`} title="工作空间设置" onClick={() => onSettings(entry.workspace!.id)} /> : null}
          {renderExtra?.(entry)}
          <Button className="workspace-remove" size="small" type="text" danger loading={removing === entry.rootPath}
            disabled={adding || refreshing || Boolean(removing && removing !== entry.rootPath)} onClick={() => onRemove(entry)}>移除</Button>
        </article>;
      })}
    </section>
    <section id="workspace-empty" className={`empty-state${empty ? '' : ' hidden'}`}>
      {empty ? <Empty description={<Space direction="vertical" size={8}>
        {emptyEyebrow && <p className="eyebrow">{emptyEyebrow}</p>}
        <Typography.Title level={4} style={{ margin: 0 }}>先选择一个共同工作的目录</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{emptyDescription}</Typography.Paragraph>
      </Space>}>{emptyActions}</Empty> : null}
    </section>
  </>;
}
