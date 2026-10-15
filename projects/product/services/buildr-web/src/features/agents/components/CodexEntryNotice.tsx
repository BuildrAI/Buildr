import { Alert } from 'antd';
import { useLocation } from 'react-router-dom';
import { readCodexLocation } from '../../../app/codex-navigation';

export function CodexEntryNotice() {
  useLocation();
  const target = readCodexLocation(window.location, window.history.state);
  return <Alert id="codex-entry-error" type="warning" showIcon message="无法打开 Codex 工作页面" description={target?.error || '请使用有效的当前工作空间任务链接。'} />;
}
