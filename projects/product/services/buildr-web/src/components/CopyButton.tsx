import { useEffect, useRef, useState, type ReactNode } from 'react';
import { App, Button } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { copyText } from '../lib/copyText';

type Props = {
  text: string;
  children?: ReactNode;
  ariaLabel?: string;
  title?: string;
  failureMessage?: string;
  type?: 'text' | 'default' | 'primary' | 'link';
  size?: 'small' | 'middle' | 'large';
  block?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  onFailure?(): void;
};

export function CopyButton({ text, children, ariaLabel, title, failureMessage, type, size = 'small', block, className, id, disabled, onFailure }: Props) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!await copyText(text)) { if (onFailure) onFailure(); else void message.warning(failureMessage ?? '复制失败，请手动选择内容复制。'); return; }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 3000);
  };
  const name = ariaLabel ?? (typeof children === 'string' ? children : '复制');
  return <Button id={id} type={type} size={size} block={block} className={className} disabled={disabled || copied}
    icon={copied ? <CheckOutlined aria-hidden /> : <CopyOutlined aria-hidden />}
    aria-label={copied ? '已复制' : name} title={copied ? '已复制' : title ?? name}
    onClick={() => void copy()}>{children}</Button>;
}
