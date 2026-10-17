import { Button, Tag } from 'antd';
import type { CatalogEntry, ConnectionInstance } from '../connection-skill-types';
import { authorizationAccountLabel } from '../connection-skill-form';

type Props = { entry: CatalogEntry; instance?: ConnectionInstance; disabled: boolean; conflict: boolean; dirty: boolean; authorizing: boolean; onAuthorize(): void; onCancel(): void };

export function ConnectionBrowserAuthorization({ entry, instance, disabled, conflict, dirty, authorizing, onAuthorize, onCancel }: Props) {
  const method = entry.definition.authentication.authorization!;
  const account = instance?.authentication.personal, label = authorizationAccountLabel(entry, instance);
  return <section className="buildr-connection-skill-section buildr-connection-browser-authorization" aria-label="个人账号授权">
    <h3>个人账号</h3>
    <div id="connection-skill-authorization-state" role="status"><Tag color={account?.configured ? 'success' : undefined}>{account?.configured ? '本机已授权' : account?.present ? '授权需更新' : '尚未授权'}</Tag>{account?.configured && label && <strong>{label}</strong>}</div>
    <p className="buildr-connection-skill-muted">在外部系统完成个人账号授权，认证信息仅加密保存在本机。</p>
    {!instance && <small className="buildr-connection-skill-muted">点击授权会先保存连接配置，授权后可继续选择使用范围。</small>}
    {dirty && <small id="connection-skill-authorization-dirty" className="buildr-connection-skill-muted">连接配置有未保存修改，请先保存配置，再授权。</small>}
    <div className="buildr-connection-personal-actions"><Button id="authorize-connection-skill-personal" type="primary" disabled={disabled || conflict || dirty || !entry.enabled || !entry.available || authorizing} loading={authorizing} onClick={onAuthorize}>{account?.present ? method.reauthorizeLabel : method.label}</Button>{authorizing && <Button id="cancel-connection-skill-authorization" onClick={onCancel}>取消授权</Button>}</div>
    {authorizing && <small id="connection-skill-authorization-waiting" role="status" className="buildr-connection-skill-muted">请在打开的外部登录窗口完成授权。关闭此面板会取消本次等待。</small>}
  </section>;
}
