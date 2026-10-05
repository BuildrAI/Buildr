import type { ReactNode } from 'react';
import { Alert, Button, Space } from 'antd';

type Props = {
  latest: ReactNode;
  loading: boolean;
  busy: boolean;
  error: string;
  canContinue: boolean;
  canSave?: boolean;
  onRead: () => void;
  onUseLatest: () => void;
  onKeep: () => void;
  onCopy: () => void;
};

/** Shared recovery presentation; each feature owns its object and observed revision. */
export function MetadataConflictNotice({ latest, loading, busy, error, canContinue, canSave = true, onRead, onUseLatest, onKeep, onCopy }: Props) {
  return <Alert className="metadata-conflict" type="warning" showIcon
    message="内容已被其他操作修改，你的输入已保留。"
    description={<>
      {latest && <><p>请核对最新内容。保留修改时，未修改字段采用最新值。</p>{latest}</>}
      {error && <p role="alert">{error}</p>}
      <Space wrap>
        <Button size="small" loading={loading} disabled={busy} onClick={onRead}>读取最新内容</Button>
        <Button size="small" disabled={busy} onClick={onCopy}>复制我的修改</Button>
        {canContinue && <>
          <Button size="small" disabled={busy || loading} onClick={onUseLatest}>使用最新内容</Button>
          <Button size="small" disabled={busy || loading || !canSave} onClick={onKeep}>保留修改并按最新版本保存</Button>
        </>}
      </Space>
    </>} />;
}
