import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

export function launchPlatformLauncher({ platform = process.platform, target, workspace, environment }) {
  if (platform === 'darwin') {
    const opened = spawnSync('/usr/bin/open', [
      '--env', `HOME=${environment.HOME}`,
      '--env', `PATH=${environment.PATH}`,
      '--env', `BUILDR_NODE_EXECUTABLE=${environment.BUILDR_NODE_EXECUTABLE}`,
      '--env', `BUILDR_APP_DATA_DIR=${environment.BUILDR_APP_DATA_DIR}`,
      '--env', `BUILDR_PRODUCT_DATA_DIR=${environment.BUILDR_PRODUCT_DATA_DIR}`,
      '--env', 'BUILDR_LAUNCHER_NO_OPEN=1',
      '--env', 'BUILDR_LAUNCHER_NO_NOTIFY=1',
      target,
    ], { cwd: workspace, env: environment, encoding: 'utf8' });
    if (opened.status !== 0) throw new Error(`/usr/bin/open exited ${opened.status}:\n${opened.stdout}\n${opened.stderr}`);
    return { process: null, output: `${opened.stdout || ''}\n${opened.stderr || ''}` };
  }
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:BUILDR_LAUNCHER_SHORTCUT -Wait'], {
    cwd: workspace,
    env: { ...environment, BUILDR_LAUNCHER_SHORTCUT: target },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return { process: child, output: '' };
}
