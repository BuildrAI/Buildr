import { InfoCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Skeleton, Space, Tooltip } from 'antd';
import { FileSystemActions } from '../../../components/FileSystemActions';
import { resourceLocationApi, type ResourceLocation } from '../api/resource-location-api';

export function InstallationInfoDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [data, setData] = useState<ResourceLocation | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setData(null); setError('');
    void resourceLocationApi.read(controller.signal).then(value => { if (!controller.signal.aborted) setData(value); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message || '安装信息读取失败。'); });
    return () => controller.abort();
  }, [open, retry]);
  return <Modal centered width={480} title={<Space><InfoCircleOutlined />安装信息</Space>} open={open} onCancel={onClose} footer={null}>
    {error ? <Alert type="error" message={error} action={<Button size="small" onClick={() => setRetry(n => n + 1)}>重试</Button>} /> : !data ? <Skeleton active paragraph={{ rows: 3 }} /> : <>
      <p>当前版本：<strong>{data.version}</strong></p>
      <p style={{ marginBottom: 6 }}>共享资源位置</p>
      <Tooltip title={data.path} placement="topLeft"><code className="resource-path" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 400, marginBottom: 12 }}>{data.path}</code></Tooltip>
      <FileSystemActions path={data.path} disabled={!data.available} onOpen={() => resourceLocationApi.open(data.resourceSet)} />
      {data.issue && <Alert style={{ marginTop: 12 }} type="info" showIcon message={data.issue} />}
    </>}
  </Modal>;
}
