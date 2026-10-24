import type { ReleaseAwareness } from '../api/release-awareness-api';
import type { UpdateFlowJob } from '../api/update-flow-api';
import { simulatedTargetVersion } from './simulated-update.ts';

export type UpdatePhase = 'checking' | 'unavailable' | 'latest' | 'available' | 'downloading' | 'ready' | 'installing' | 'launcher-updating' | 'restarting' | 'verifying' | 'completed' | 'download-error' | 'install-error' | 'launcher-error' | 'reconnect-error' | 'combined-error' | 'verification-error' | 'workspaces-updating' | 'workspaces-error';
export type UpdateTarget = { track: 'stable' | 'candidate'; version: string; label: string };
export type UpdateView = {
  phase: UpdatePhase;
  title: string;
  description: string;
  currentVersion: string | null;
  installedVersion: string | null;
  target: UpdateTarget | null;
  targets: UpdateTarget[];
  steps: UpdateFlowJob['steps'] | null;
  error: string | null;
  errorDetails?:string;
  launcherError: string | null;
  simulated: boolean;
  recoveryCommand: string;
};
export type ConnectionState = 'connected' | 'watching' | 'timed-out';
const titles: Record<UpdatePhase, string> = { 'workspaces-updating':'正在准备全部工作空间', 'workspaces-error':'Buildr 已更新，部分工作空间待完成', checking:'正在检查更新', unavailable:'暂时无法检查更新', latest:'已是最新版本', available:'发现新版本', downloading:'正在下载更新', ready:'更新已准备好', installing:'正在安装更新', 'launcher-updating':'正在更新启动入口', restarting:'正在重新连接', verifying:'正在核验更新结果', completed:'更新完成', 'download-error':'下载未完成', 'install-error':'安装未完成', 'launcher-error':'新版已运行，启动入口需修复', 'reconnect-error':'已安装，尚未重新连接', 'combined-error':'已安装，仍有两项待恢复', 'verification-error':'页面已连接，版本尚未更新' };
const descriptions: Record<UpdatePhase, string> = { 'workspaces-updating':'正在为所有已登记目录准备新版工作内容并检查可用性。可以收起窗口。', 'workspaces-error':'已完成的目录可以继续使用。恢复失败目录后重试，无需重新安装 Buildr。',
  checking:'正在获取可用版本，请稍候。', unavailable:'你仍可以继续使用当前版本，稍后重新检查。', latest:'发现新版本时，顶部会显示更新入口。', available:'将一起更新 Buildr、已有桌面启动入口和全部已登记工作空间。请先保存正在编辑的内容。', downloading:'正在下载并校验更新包。可以关闭窗口，继续手头的工作。', ready:'将一起更新 Buildr 和已安装的桌面启动入口，随后重启并核验结果。', installing:'正在替换应用文件，请保持 Buildr 运行。', 'launcher-updating':'让下次点击桌面图标时，也能打开本次安装的版本。', restarting:'正在等待本机服务恢复，随后核实实际运行版本。', verifying:'正在核实实际运行版本和已有桌面启动入口。', completed:'新版与全部已登记工作空间已检查完成。新开智能体对话即可使用。', 'download-error':'更新包尚未准备好，可以重新下载。', 'install-error':'尚未确认目标版本安装成功，请核对原因后重试。', 'launcher-error':'当前网页可以继续使用，但下次点击桌面图标可能无法启动。', 'reconnect-error':'软件包已安装，但尚未确认新版网页恢复。无需重新下载。', 'combined-error':'软件包已安装；启动入口和网页仍需分别恢复。', 'verification-error':'当前连接到的仍是旧版，请重新启动并连接目标版本。',
};
export function availableUpdateTargets(awareness: ReleaseAwareness | null): UpdateTarget[] {
  if (!awareness) return [];
  if (awareness.mode === 'development') {
    const version = simulatedTargetVersion(awareness.current.version);
    return version ? [{ track:'stable', version, label:'开发模拟' }] : [];
  }
  if (awareness.mode !== 'npm' || awareness.freshness.status !== 'fresh') return [];
  return [awareness.tracks.stable, awareness.tracks.candidate].filter(item => item.installable && item.available && item.version).map(item => ({ track:item.track as UpdateTarget['track'], version:item.version!, label:item.track === 'stable'?'正式版':'候选版' }));
}
export function updateEntryVisible(awareness: ReleaseAwareness | null, job: UpdateFlowJob | null, connection: ConnectionState): boolean {
  return connection !== 'connected' || Boolean(job && !['idle','completed'].includes(job.status)) || (awareness?.mode === 'npm' && availableUpdateTargets(awareness).length > 0);
}
export function buildUpdateView({ awareness, job, checking, checkError, selectedTrack, connection, showCompleted=true }: { awareness: ReleaseAwareness | null; job: UpdateFlowJob | null; checking: boolean; checkError: string; selectedTrack: string; connection: ConnectionState; showCompleted?:boolean }): UpdateView {
  const simulated = awareness?.mode === 'development' || Boolean(job?.simulated);
  const targets = availableUpdateTargets(awareness);
  const hasJob = Boolean(job?.id && job.status !== 'idle' && (job.status !== 'completed' || showCompleted));
  const target = hasJob ? { track:job!.track!, version:job!.version!, label:simulated?'开发模拟':job!.track==='stable'?'正式版':'候选版' } : targets.find(item => item.track === selectedTrack) || targets[0] || null;
  let phase: UpdatePhase;
  if (connection === 'watching') phase='restarting';
  else if (connection === 'timed-out') phase=job?.steps.launcher === 'failed'?'combined-error':'reconnect-error';
  else if (hasJob) {
    if (job!.status === 'preparing') phase='downloading';
    else if (job!.status === 'ready') phase='ready';
    else if (job!.status === 'applying') phase=({ install:'installing', launcher:'launcher-updating', restart:'restarting', verify:'verifying', workspaces:'workspaces-updating' } as Record<string,UpdatePhase>)[job!.stage] || 'installing';
    else if (job!.status === 'completed') phase='completed';
    else if (job!.stage === 'workspaces' && job!.runningVersion === job!.version) phase='workspaces-error';
    else if (job!.stage === 'download') phase='download-error';
    else if (job!.stage === 'verify' && job!.steps.verify === 'failed') phase='verification-error';
    else if (!job!.installedVersion) phase='install-error';
    else if (job!.runningVersion !== job!.version) phase=job!.steps.launcher==='failed'?'combined-error':job!.stage==='verify'?'verification-error':'reconnect-error';
    else phase='launcher-error';
  } else phase=checking?'checking':checkError||!awareness||!['npm','development'].includes(awareness.mode)||awareness.freshness.status!=='fresh'&&!simulated?'unavailable':target?'available':'latest';
  const installedVersion = job?.installedVersion || null;
  return { phase, title:phase==='verification-error'&&job?.runningVersion===job?.version?'目标安装尚未核实':phase==='available'&&target?.track==='stable'&&!simulated?'正式版已发布':phase==='completed'&&simulated?'模拟更新完成':titles[phase],
    description:phase==='verification-error'&&job?.runningVersion===job?.version?'当前版本号一致，但目标安装归属尚未核实。请检查原因后恢复。':phase==='completed'&&simulated?'已完成流程模拟，真实软件版本与启动入口均未改变。':phase==='completed'&&job?.steps.launcher==='skipped'?'新版与全部已登记工作空间已检查完成。本机没有安装桌面启动入口，无需更新。':descriptions[phase],
    currentVersion:job?.runningVersion || awareness?.current.version || null, installedVersion, target, targets,
    steps:hasJob?job!.steps:null, error:connection==='timed-out'?'等待超过预期，尚未确认新版网页恢复。':job?.error?.message as string || checkError || null,
    errorDetails:typeof job?.error?.details==='string'?job.error.details:undefined,
    launcherError:job?.launcherError?.message as string || null, simulated,
    recoveryCommand:phase==='combined-error'?'buildr web launcher repair\nbuildr web':phase==='launcher-error'?'buildr web launcher repair':phase==='verification-error'?`buildr update --track ${target?.track || 'stable'}`:'buildr web' };
}
