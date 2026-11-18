import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {AgentServiceError} from '../domain/agent-state.ts';

const execute = promisify(execFile);
type PickerRunner = (command: string, args: string[], options: {encoding: 'utf8'; timeout: number; maxBuffer: number; windowsHide: boolean}) => Promise<{stdout: string}>;
/** The chooser runs on the service computer; it never uploads directory contents. */
export async function chooseHarnessDirectory(platform = process.platform, run: PickerRunner = execute): Promise<string | null> {
  let command: string, args: string[];
  if (platform === 'darwin') {
    command = '/usr/bin/osascript';
    args = ['-e', 'try', '-e', 'POSIX path of (choose folder with prompt "选择工作空间目录")', '-e', 'on error number -128', '-e', 'return ""', '-e', 'end try'];
  } else if (platform === 'win32') {
    command = 'powershell.exe';
    args = ['-NoProfile', '-STA', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "选择工作空间目录"; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }; $dialog.Dispose()'];
  } else {
    throw new AgentServiceError('agent_directory_picker_unsupported', '当前服务所在平台不支持图形目录选择，无法在此创建工作空间。', 501);
  }
  try {
    const result = await run(command, args, {encoding: 'utf8', timeout: 120000, maxBuffer: 16384, windowsHide: true});
    const selected = String(result.stdout).trim();
    if (!selected) return null;
    // The platform override is also used by tests running on another OS.
    if (!(platform === 'win32' ? path.win32 : path.posix).isAbsolute(selected)) throw new Error('invalid path');
    return selected;
  } catch {
    throw new AgentServiceError('agent_directory_picker_failed', '目录选择未完成或已超时，未登记工作空间；请重新选择目录。', 500);
  }
}
