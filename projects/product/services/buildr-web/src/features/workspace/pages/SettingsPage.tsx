import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';

/** Legacy deep links open the same drawer and leave a usable workspace page behind it. */
export function SettingsPage() {
  const { workspaceId, openWorkspaceSettings } = useAppShell();
  const navigate = useNavigate();
  useEffect(() => {
    if (!workspaceId) return;
    openWorkspaceSettings(workspaceId);
    navigate(`/workspaces/${workspaceId}/projects`, { replace: true });
  }, [workspaceId, openWorkspaceSettings, navigate]);
  return null;
}
