import { useState } from 'react';
import { App, Button, Space } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { CopyButton } from './CopyButton';

export function FileSystemActions({ path, onOpen, disabled = false }: { path: string; onOpen(): Promise<unknown>; disabled?: boolean }) {
  const { message } = App.useApp();
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try { await onOpen(); void message.success('已请求打开本机文件管理器'); }
    catch (error) { void message.error(error instanceof Error ? error.message : '打开失败，请重试。'); }
    finally { setOpening(false); }
  };
  return <Space wrap><Button size="small" icon={<FolderOpenOutlined />} disabled={disabled} loading={opening} onClick={() => void open()}>在文件系统中打开</Button><CopyButton text={path} failureMessage="复制失败，请选中路径复制。">复制路径</CopyButton></Space>;
}
