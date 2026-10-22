export type Stage = 'available' | 'checking' | 'latest' | 'check-error' | 'downloading' | 'ready' | 'installing' | 'launcher-updating' | 'restarting' | 'verifying' | 'completed' | 'completed-no-launcher' | 'download-error' | 'install-error' | 'launcher-error' | 'launcher-repairing' | 'launcher-repair-error' | 'reconnect-error' | 'combined-error' | 'verification-error';
export const TARGET = '0.1.0-rc.48';
export const PREVIOUS = '0.1.0-rc.47';
export const INSTALL_STAGES: Stage[] = ['installing', 'launcher-updating', 'restarting', 'verifying', 'launcher-repairing'];
export const OUTCOME_STAGES: Stage[] = ['completed', 'completed-no-launcher', 'launcher-error', 'launcher-repair-error', 'reconnect-error', 'combined-error', 'verification-error'];
export const LAUNCHER_ERRORS: Stage[] = ['launcher-error', 'launcher-repair-error', 'combined-error'];
export const titles: Record<Stage, string> = {
  available:'发现新版本', checking:'正在检查更新', latest:'已是最新版本', 'check-error':'暂时无法检查更新', downloading:'正在下载更新', ready:'更新已准备好', installing:'正在安装更新', 'launcher-updating':'正在更新启动入口', restarting:'正在重新连接', verifying:'正在核验更新结果', completed:'更新完成', 'completed-no-launcher':'更新完成', 'download-error':'下载未完成', 'install-error':'安装未完成', 'launcher-error':'新版已运行，启动入口需修复', 'launcher-repairing':'正在修复启动入口', 'launcher-repair-error':'启动入口仍需修复', 'reconnect-error':'已安装，尚未重新连接', 'combined-error':'已安装，仍有两项待恢复', 'verification-error':'页面已连接，版本尚未更新',
};
export const descriptions: Record<Stage, string> = {
  available:'新版本已就绪，下载完成后由你决定何时安装。', checking:'正在获取可用版本，请稍候。', latest:'当前版本已是最新，发现更新时会提醒你。', 'check-error':'检查失败。你仍可以继续使用当前版本。', downloading:'你可以关闭此窗口，继续手头的工作。', ready:'将一起更新 Buildr 和已安装的桌面启动入口，随后重启并核验结果。', installing:'正在替换应用文件，请保持 Buildr 运行。', 'launcher-updating':'让下次点击桌面图标时，也能打开本次安装的版本。', restarting:'正在等待本机服务恢复。重新连接后，还会核实实际运行版本。', verifying:'核实实际运行版本，以及已安装的桌面启动入口是否可用。', completed:'实际运行版本与启动入口均已确认，可以继续工作。', 'completed-no-launcher':'新版已运行。本机没有安装桌面启动入口，无需更新。', 'download-error':'连接中断，当前版本仍可正常使用。', 'install-error':'安装过程已中断，尚未确认新版可用。请查看原因后重试。', 'launcher-error':'当前网页可以继续使用，但下次点击桌面图标可能无法启动。', 'launcher-repairing':'只修复桌面启动入口，保留已安装的新版和当前工作页面。', 'launcher-repair-error':'当前网页仍可使用。自动修复未完成，可重试或查看恢复方法。', 'reconnect-error':'软件包已经安装完成，但还没有确认新版服务恢复。无需再次下载。', 'combined-error':'启动入口未更新，网页也尚未恢复。软件包已安装，请按下面的顺序恢复。', 'verification-error':'当前连接到的仍是旧版。软件包已安装，需重新启动并连接新版。',
};
export type StepStatus = 'done' | 'active' | 'waiting' | 'warning' | 'skipped';
export function stepStatuses(stage:Stage, launcherNeedsRepair:boolean):StepStatus[] {
  if(stage==='installing')return ['active','waiting','waiting','waiting'];
  if(stage==='launcher-updating')return ['done','active','waiting','waiting'];
  if(stage==='launcher-repairing')return ['done','active','done','waiting'];
  if(stage==='restarting')return ['done',launcherNeedsRepair?'warning':'done','active','waiting'];
  if(stage==='verifying')return ['done',launcherNeedsRepair?'warning':'done','done','active'];
  if(stage==='launcher-error'||stage==='launcher-repair-error')return ['done','warning','done','done'];
  if(stage==='reconnect-error')return ['done','done','warning','waiting'];
  if(stage==='combined-error')return ['done','warning','warning','waiting'];
  if(stage==='verification-error')return ['done','done','done','warning'];
  if(stage==='completed-no-launcher')return ['done','skipped','done','done'];
  if(stage==='install-error')return ['warning','waiting','waiting','waiting'];
  return ['done','done','done','done'];
}
