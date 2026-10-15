import { Button, Tooltip, type ButtonProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

type Props = {
  id?: string;
  label: string;
  text?: string;
  loading?: boolean;
  disabled?: boolean;
  stableLoading?: boolean;
  size?: ButtonProps['size'];
  onClick: () => void;
};

export function RefreshButton({ id, label, text, loading = false, disabled = false, stableLoading = false, size, onClick }: Props) {
  return <Tooltip title={label}>
    <Button id={id} icon={<ReloadOutlined spin={stableLoading && loading} />} aria-label={label} aria-busy={loading}
      loading={!stableLoading && loading} disabled={disabled || (!stableLoading && loading)} aria-disabled={disabled || loading} size={size} onClick={() => { if (!disabled && !loading) onClick(); }}>{text}</Button>
  </Tooltip>;
}
