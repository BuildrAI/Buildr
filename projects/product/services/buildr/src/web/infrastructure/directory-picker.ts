import process from 'node:process';
import { execFileSync } from 'node:child_process';

export function pickWorkspaceDirectory({ platform = process.platform, execute = execFileSync }: any = {}) {
  try {
    if (platform === 'darwin') {
      return execute('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择 Buildr 工作空间目录")'], { encoding: 'utf8' }).trim() || null;
    }
    if (platform === 'win32') {
      const script = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        '$dialog.Description = "选择 Buildr 工作空间目录"',
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
      ].join('; ');
      return execute('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim() || null;
    }
    const error: Error & Record<string, any> = new Error('当前平台暂不支持图形目录选择，请使用 buildr web --target <workspace>。');
    error.code = 'workspace_picker_unsupported';
    error.status = 501;
    throw error;
  } catch (error: any) {
    if (error.code === 'workspace_picker_unsupported') throw error;
    if (error.status === 1 || error.signal) return null;
    const wrapped: Error & Record<string, any> = new Error(`无法打开工作空间目录选择器：${error.message}`);
    wrapped.code = 'workspace_picker_failed';
    wrapped.status = 500;
    throw wrapped;
  }
}
