import type {ConnectionView, ProgramUpdatesView} from './types';

type Program = ProgramUpdatesView['programs'][number];
const labels = {unchecked:'尚未检查更新','not-connected':'尚未接入',available:'有新版本',latest:'已是最新',ahead:'无需更新',unknown:'更新检查失败',stale:'更新状态待刷新'};
export const programUpgradeRunning = (program:Program) => Boolean(program.upgrade && ['downloading','waiting','restarting'].includes(program.upgrade.state));

/** Preparation and release checks are different observations, never substitute a login status. */
export function agentProgramView(program:Program, connection?:ConnectionView) {
  const job=program.upgrade, pending=programUpgradeRunning(program);
  const completed=job?.state==='completed' && job.installedExecutable===program.executable && (!program.latestVersion || program.latestVersion===job.expectedVersion);
  const failure=Boolean(job && ['failed','interrupted'].includes(job.state));
  const prepared=connection?connection.enabled && Boolean(connection.configPath):Boolean(program.executable);
  const updateLabel=pending?job!.state==='waiting'?'等待工作结束':job!.state==='restarting'?'正在重启':'正在下载':failure?'更新未完成':completed && program.status!=='latest'?'已更新':labels[program.status];
  return {pending,completed,failure,prepared,updateLabel,
    version:program.currentVersion ?? (completed?job?.currentVersion:undefined),
    canUpdate:Boolean(program.latestVersion && program.executable && (program.status==='available' || program.status==='latest' && !program.managed)),
  };
}
