import { ApiOutlined, DownOutlined, MoreOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Dropdown, Switch, Tag, Typography } from 'antd';
import { CopyButton } from '../../components/CopyButton';
import { programmaticConnectionInfo } from './programmatic-connection-info';
import type { AccessCredential, ProgrammaticAccessView } from './api/programmatic-access-api';

const labels = { read: '读取', execute: '执行', answer: '答复', approve: '审批' };
export function ProgrammaticCredentialCard({ item, view, busy, expanded, onToggle, onRegenerate, onRevoke, onToggleFullAccess }: {
  item: AccessCredential; view: ProgrammaticAccessView; busy: boolean; expanded: boolean;
  onToggle(): void; onRegenerate(): void; onRevoke(): void; onToggleFullAccess(value: boolean): void;
}) {
  const info = programmaticConnectionInfo(view, item);
  const workspaces = item.workspaceIds.map(id => view.workspaces.find(w => w.id === id)?.name ?? id).join('、');
  const detailsId = `programmatic-credential-${item.id}`;
  return <article className={`pas-credential${item.revokedAt ? ' is-revoked' : ''}${expanded ? ' is-expanded' : ''}`} data-credential-id={item.id}>
    <header className="pas-credential-header">
      <span className="pas-program-icon"><ApiOutlined aria-hidden /></span>
      <div className="pas-credential-summary">
        <div className="pas-credential-title"><h4>{item.name}</h4><span className={`pas-status${item.revokedAt ? ' is-revoked' : ''}`}><i />{item.revokedAt ? '已撤销' : '有效'}</span></div>
        <p><span>{workspaces}</span><span className="pas-summary-divider">·</span><span>{item.scopes.map(scope => labels[scope]).join(' / ')}</span></p>
      </div>
      <div className="pas-credential-actions">
        {info && <CopyButton text={info} ariaLabel={`复制${item.name}接入信息`} size="small">复制接入信息</CopyButton>}
        <Button type="text" size="small" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId}
          aria-label={`${expanded ? '收起' : '查看'}${item.name}接入详情`}>详情<DownOutlined aria-hidden className={expanded ? 'pas-chevron is-open' : 'pas-chevron'} /></Button>
        {!item.revokedAt && <Dropdown trigger={['click']} menu={{ items: [
          { key: 'regenerate', label: '重新生成并保存', icon: <ReloadOutlined aria-hidden />, onClick: onRegenerate },
          { type: 'divider' },
          { key: 'revoke', label: '撤销接入', icon: <StopOutlined aria-hidden />, danger: true, onClick: onRevoke },
        ] }}>
          <Button type="text" size="small" icon={<MoreOutlined aria-hidden />} disabled={busy} aria-label={`管理${item.name}接入`} />
        </Dropdown>}
      </div>
    </header>
    {expanded && <div id={detailsId} className="pas-credential-details">
      {!item.revokedAt && !info && <div className="pas-legacy">
        <strong>原凭据仍可使用</strong>
        <p>此接入尚未自动保存，无法恢复原令牌。需要新的凭据文件时，可重新生成并保存；原令牌会失效。</p>
        <Button size="small" disabled={busy} onClick={onRegenerate}>重新生成并保存</Button>
      </div>}
      {info && <>
        <div className="pas-detail-heading"><strong>给程序的接入信息</strong><span>只含连接信息，不含令牌</span></div>
        <Typography.Paragraph className="pas-handoff" copyable={{ text: info }} data-testid="programmatic-connection-info">{info}</Typography.Paragraph>
      </>}
      <dl className="pas-metadata">
        {item.tokenFilePath && <><dt>凭据文件</dt><dd><Typography.Text copyable>{item.tokenFilePath}</Typography.Text><Tag>600</Tag></dd></>}
        <dt>操作权限</dt><dd>{item.scopes.map(scope => <Tag key={scope}>{labels[scope]}</Tag>)}</dd>
        <dt>全部授权执行</dt><dd><div className="pas-full-access"><Switch size="small" checked={item.allowFullAccess} disabled={busy || !!item.revokedAt} onChange={onToggleFullAccess} aria-label={`切换${item.name}允许全部授权执行`} /><span className="pas-full-access-hint">{item.allowFullAccess ? '允许程序请求 full-access' : '已关闭，full-access 请求返回 403'}</span></div></dd>
        <dt>创建时间</dt><dd><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</time></dd>
        <dt>凭据标识</dt><dd><Typography.Text type="secondary" copyable>{item.id}</Typography.Text></dd>
      </dl>
    </div>}
  </article>;
}
