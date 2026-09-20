import { Button, Tooltip, type ButtonProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

type Props = {
  id?: string;
  label: string;
  text?: string;
  loading?: boolean;
  disabled?: boolean;
  size?: ButtonProps['size'];
  onClick: () => void;
};

export function RefreshButton({ id, label, text, loading = false, disabled = false, size, onClick }: Props) {
  return <Tooltip title={label}>
    <Button id={id} icon={<ReloadOutlined />} aria-label={label} aria-busy={loading}
      loading={loading} disabled={disabled || loading} size={size} onClick={onClick}>{text}</Button>
  </Tooltip>;
}
