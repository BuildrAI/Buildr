import { randomUUID } from 'node:crypto';
import { spawnCommand } from '../../../infrastructure/process.ts';
import { identifyCliSource } from './cli-update.ts';
import { inspectProductUpdateAuthority } from '../infrastructure/installation-registry.ts';
import { RELEASE_TRACKS, compareVersions, parseSemver } from './release-awareness.ts';
import { pendingSteps, updateError, type UpdateRecord, type UpdateStore, type UpdateStage, type WorkspaceUpdate } from '../domain/update-flow-state.ts';
import type { UpdateLauncher, LauncherResult } from './update-launcher.ts';

export const WEB_UPDATE_FLOW_SCHEMA = 'buildr.web-update-flow/v2';
const UPDATE_PACKAGE = '@buildr-ai/buildr';
const noLauncher: UpdateLauncher = { inspect: () => ({ status: 'absent' }), repair: () => ({ status: 'absent' }) };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Installation observations survive the outgoing process; receipts remain the write authority. */
export function createWebUpdateFlow(dependencies: {
  productRoot(): string;
  releaseAwareness(options?: any): any;
  handoffUpdatedBuildrWeb(input: any): Promise<any>;
  spawnProcess?: typeof spawnCommand;
  identifySource?: typeof identifyCliSource;
  inspectAuthority?: typeof inspectProductUpdateAuthority;
  store?: UpdateStore;
  launcher?: UpdateLauncher;
  devTiming?: { downloadMs?: number; installMs?: number };
  workspaces?: { list(): WorkspaceUpdate[]; observeResources?(): string | null; prepareResources?(expectedId?: string | null): unknown; prepare(entry: WorkspaceUpdate, options?: any): Promise<unknown> };
  now?(): string;
}) {
  const spawnProcess = dependencies.spawnProcess || spawnCommand;
  const identifySource = dependencies.identifySource || identifyCliSource;
  const inspectAuthority = dependencies.inspectAuthority || inspectProductUpdateAuthority;
  const launcher = dependencies.launcher || noLauncher;
  const now = dependencies.now || (() => new Date().toISOString());
  const timing = { downloadMs: 2000, installMs: 750, ...dependencies.devTiming };
  // Reading package.json after npm replaces it cannot prove what this process booted.
  let bootSource: any = null;
  try { bootSource = identifySource(dependencies.productRoot()); } catch { /* Only the update surface is unavailable. */ }
  let job: UpdateRecord | null = null;
  let loaded = false;
  let preparingWorkspaces = false;
  let observedLauncher: { key: string; result: LauncherResult } | null = null;

  function load() {
    if (dependencies.store) job = dependencies.store.read();
    loaded = true;
    return job;
  }
  function record(next: Partial<UpdateRecord>, create = false) {
    if (!loaded) load();
    const revision = job?.revision ?? null;
    const value = { ...job, ...next, revision: (revision ?? 0) + 1, updatedAt: now(), ownerPid: process.pid } as UpdateRecord;
    if (!create && (!job || value.id !== job.id)) throw updateError('update_record_conflict', '更新任务已变化。');
    dependencies.store?.write(value, revision);
    job = value;
    return value;
  }
  function inspectLauncher(value: UpdateRecord) {
    const key = `${value.id}:${value.revision}`;
    if (observedLauncher?.key === key) return observedLauncher.result;
    const result = launcher.inspect(value);
    observedLauncher = { key, result };
    return result;
  }
  function snapshot() {
    const value = dependencies.store ? dependencies.store.read() : job;
    if (!value) return { schemaVersion: WEB_UPDATE_FLOW_SCHEMA, id: null, revision: 0, status: 'idle', stage: 'idle', track: null, version: null,
      currentVersion: bootSource?.version || null, runningVersion: bootSource?.version || null, installedVersion: null,
      workspaces: [], steps: pendingSteps(), launcherError: null, error: null, updatedAt: null, simulated: bootSource?.mode === 'development' };
    const view = structuredClone(value);
    if (view.mode === 'npm' && bootSource?.mode === 'npm' && bootSource.version === view.version && (view.ownerPid !== process.pid || view.status !== 'applying')) {
      try {
        const result = inspectLauncher(view);
        view.installedVersion = view.version;
        view.steps = { install: 'done', launcher: result.status === 'absent' ? 'skipped' : result.status === 'ready' ? 'done' : 'failed', restart: 'done', verify: 'done' };
        view.launcherError = result.error || null;
        view.status = result.status === 'failed' ? 'partial' : 'completed';
        view.stage = result.status === 'failed' ? 'launcher' : 'completed';
        const pending = ['pending','running'].includes(view.resources || '') || (view.workspaces || []).some(entry => ['pending', 'running'].includes(entry.status));
        const failed = view.resources === 'failed' || (view.workspaces || []).some(entry => entry.status === 'failed');
        if (pending || failed) { view.status = view.resources === 'failed' || ['failed','partial'].includes(view.status) ? 'partial' : pending ? 'applying' : 'partial'; view.stage = 'workspaces'; }
        view.error = value.stage === 'workspaces' && value.status === 'partial' ? value.error : null;
      } catch (error: any) {
        view.status = 'partial'; view.stage = 'verify'; view.steps.verify = 'failed';
        view.error = { code: error.code || 'update_installation_unconfirmed', message: error.message || '目标安装归属尚未核实。' };
      }
    } else if (view.mode === 'npm' && view.status === 'completed') {
      view.status = 'partial'; view.stage = 'verify'; view.steps.verify = 'failed';
      view.error = { code: 'update_running_version_mismatch', message: '页面已连接，但当前进程尚未运行目标版本。' };
    } else if (view.ownerPid !== process.pid && !alive(view.ownerPid) && ['preparing', 'applying'].includes(view.status)) {
      view.status = view.installedVersion ? 'partial' : 'failed';
      view.stage = view.installedVersion ? 'restart' : view.stage;
      if (view.installedVersion) view.steps.restart = 'failed';
      view.error = { code: 'update_interrupted', message: view.installedVersion ? '软件包已安装，网页恢复尚未确认。' : '上次更新已中断，可以重试失败环节。' };
    }
    return { schemaVersion: WEB_UPDATE_FLOW_SCHEMA, id: view.id, revision: value.revision, status: view.status, stage: view.stage, track: view.track,
      version: view.version, currentVersion: bootSource?.version || null, runningVersion: bootSource?.version || null,
      installedVersion: view.installedVersion, workspaces: view.workspaces || [], steps: view.steps, launcherError: view.launcherError, error: view.error,
      updatedAt: view.updatedAt, simulated: view.mode === 'development' };
  }
  function source() {
    const value = identifySource(dependencies.productRoot());
    if (!['npm', 'development'].includes(value.mode)) throw updateError('update_flow_not_supported', `当前安装来源 ${value.mode || 'unknown'} 不支持页面内更新。`);
    return { ...value, mode: value.mode as 'npm' | 'development' };
  }
  function authority(value: any) {
    const inspected = inspectAuthority(value.updateAuthority, { productRoot: value.productRoot });
    if (inspected.status !== 'ready' || !inspected.authority) throw updateError('update_flow_authority_unavailable', `无法核实当前安装的更新权限：${inspected.reason || 'unknown'}。`);
    return inspected.authority;
  }
  function assertTarget(track: any, version: any) {
    if (!RELEASE_TRACKS[track]) throw updateError('update_flow_track_invalid', `不支持的发布通道：${track}。`, 400);
    if (typeof version !== 'string' || !parseSemver(version)) throw updateError('update_flow_target_invalid', `更新目标版本无效：${version}。`, 400);
  }
  function busy() {
    const observed = snapshot();
    if (['preparing', 'applying'].includes(observed.status)) throw updateError('update_flow_busy', `已有更新处于 ${observed.status} 状态。`);
  }
  function failure(stage: UpdateStage, error: any) {
    if (!job) return;
    const steps = { ...job.steps };
    if (stage === 'install' || stage === 'launcher' || stage === 'restart' || stage === 'verify') steps[stage] = 'failed';
    record({ status: job.installedVersion ? 'partial' : 'failed', stage, steps,
      ...(stage === 'launcher' ? { launcherError: { code: error.code || 'update_launcher_failed', message: error.message || '启动入口修复未完成。' } } : {}),
      error: { code: error.code || 'update_failed', message: error.message || '更新未完成。', ...(error.diagnostic?{details:String(error.diagnostic).slice(-6000)}:{}) } });
  }
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  function launcherResult(result: LauncherResult) {
    record({ steps: { ...job!.steps, launcher: result.status === 'ready' ? 'done' : result.status === 'absent' ? 'skipped' : 'failed' }, launcherError: result.error || null });
  }
  async function reconnect() {
    record({ status: 'applying', stage: 'restart', steps: { ...job!.steps, restart: 'running' }, error: null });
    const result = await dependencies.handoffUpdatedBuildrWeb({ productRoot: job!.productRoot, expectedVersion: job!.version,
      previousInstallationIdentity: job!.previousInstallationIdentity });
    if (!['restarted', 'current'].includes(result?.status) || result.version !== job!.version) {
      throw updateError(result?.code || 'update_handoff_failed', result?.message || '尚未确认目标版本的网页已恢复。');
    }
    record({ stage: 'verify', steps: { ...job!.steps, restart: 'done', verify: 'running' } });
    // The Web owner verified the precise successor. This outgoing process still reports its boot version.
    record({ status: job!.resources === 'pending' || job!.workspaces?.length ? 'applying' : job!.launcherError ? 'partial' : 'completed', stage: job!.resources === 'pending' || job!.workspaces?.length ? 'workspaces' : job!.launcherError ? 'launcher' : 'completed',
      steps: { ...job!.steps, verify: 'done' } });
  }
  async function install(auth: any, selectedSource: any) {
    let stage: UpdateStage = 'install';
    try {
      const result = await spawnProcess(auth!.nodeExecutable, [auth!.npmCliPath, 'install', '--global', '--prefer-offline', '--prefix', auth.prefix, `${selectedSource.package || UPDATE_PACKAGE}@${job!.version}`]);
      if (!result.ok) throw updateError('update_install_failed', `更新包安装失败：${result.stderr || result.error || 'unknown error'}`);
      launcher.inspect(job!); // Verify the installed receipt and slot before claiming installation.
      record({ installedVersion: job!.version, steps: { ...job!.steps, install: 'done' }, stage: 'launcher' });
      stage = 'launcher';
      record({ steps: { ...job!.steps, launcher: 'running' } });
      let inspected: LauncherResult;
      try { inspected = launcher.repair(job!); }
      catch (error: any) { inspected = { status: 'failed', error: { code: error.code || 'update_launcher_failed', message: error.message } }; }
      launcherResult(inspected);
      stage = 'restart';
      await reconnect();
    } catch (error: any) {
      try { failure(stage, error); } catch { /* Preserve a newer writer's record. */ }
    }
  }
  async function simulate(start: 'download' | 'install' | 'launcher' | 'restart') {
    try {
      if (start === 'download') { await pause(timing.downloadMs); record({ status: 'ready', stage: 'ready' }); if (job!.autoApply) apply({ expectedVersion: job!.version }); return; }
      const stages = start === 'install' ? ['install', 'launcher', 'restart', 'verify'] as const : start === 'launcher' ? ['launcher', 'verify'] as const : ['restart', 'verify'] as const;
      for (const stage of stages) {
        record({ stage, steps: { ...job!.steps, [stage]: 'running' } });
        await pause(timing.installMs);
        record({ steps: { ...job!.steps, [stage]: stage === 'verify' ? 'skipped' : 'done' } });
      }
      record({ status: 'completed', stage: 'completed', error: null, launcherError: null });
    } catch (error: any) { try { failure(job?.stage || 'install', error); } catch {} }
  }
  function prepare(input: any = {}) {
    const { track, expectedVersion } = input;
    assertTarget(track, expectedVersion);
    const selected = source();
    busy();
    load();
    if (compareVersions(expectedVersion, selected.version) <= 0) throw updateError('update_flow_target_invalid', `更新目标 ${expectedVersion} 不高于当前安装版本 ${selected.version}。`);
    const auth = selected.mode === 'npm' ? authority(selected) : null;
    if (selected.mode === 'npm') {
      const awareness = dependencies.releaseAwareness({ track, allowDevelopmentQuery: false });
      const target = awareness?.tracks?.[track];
      if (awareness?.freshness?.status !== 'fresh' || !target) throw updateError('update_flow_registry_unavailable', '暂时无法核对发布版本，请稍后重试。', 503);
      if (target.version !== expectedVersion) throw updateError('update_flow_version_conflict', `所选通道当前版本 ${target.version || '无'} 与请求的 ${expectedVersion} 不一致。`, 409, { expectedVersion, registryVersion: target.version || null, track });
      if (!target.installable) throw updateError('update_flow_not_installable', `版本 ${expectedVersion} 当前不可安装。`);
    }
    record({ id: randomUUID(), productRoot: selected.productRoot, mode: selected.mode, previousVersion: selected.version,
      previousInstallationIdentity: selected.installationIdentity || null, track, version: expectedVersion,
      autoApply: input.autoApply === true, ...(selected.mode === 'npm' && dependencies.workspaces?.observeResources ? {resourceSetBefore:dependencies.workspaces.observeResources()} : {}), resources: selected.mode === 'npm' && dependencies.workspaces ? 'pending' : 'skipped', workspaces: selected.mode === 'npm' ? dependencies.workspaces?.list() || [] : [],
      status: 'preparing', stage: 'download', steps: pendingSteps(), installedVersion: null, error: null, launcherError: null }, true);
    if (selected.mode === 'development') void simulate('download');
    else void (async () => {
      try {
        const result = await spawnProcess(auth!.nodeExecutable, [auth!.npmCliPath, 'cache', 'add', `${selected.package || UPDATE_PACKAGE}@${expectedVersion}`]);
        if (!result.ok) throw updateError('update_download_failed', `更新包下载失败：${result.stderr || result.error || 'unknown error'}`);
        record({ status: 'ready', stage: 'ready' });
        if (job!.autoApply) apply({ expectedVersion: job!.version });
      } catch (error: any) { try { failure('download', error); } catch {} }
    })();
    return snapshot();
  }
  function apply(input: any = {}) {
    const { expectedVersion } = input;
    if (typeof expectedVersion !== 'string' || !parseSemver(expectedVersion)) throw updateError('update_flow_target_invalid', '更新目标版本无效。', 400);
    const selected = source();
    load();
    const observed = snapshot();
    if (observed.status !== 'ready' || job?.version !== expectedVersion) throw updateError('update_flow_apply_conflict', '确认版本与已准备的更新不一致，或更新尚未就绪。', 409, { expectedVersion, preparedVersion: job?.version || null, status: observed.status });
    if (selected.mode !== job!.mode || selected.productRoot !== job!.productRoot || (selected.installationIdentity || null) !== job!.previousInstallationIdentity) throw updateError('update_flow_installation_changed', '当前安装与下载时的安装身份不同，请重新检查。');
    const auth = selected.mode === 'npm' ? authority(selected) : null;
    record({ status: 'applying', stage: 'install', steps: { ...job!.steps, install: 'running' }, error: null });
    setImmediate(() => { if (selected.mode === 'development') void simulate('install'); else void install(auth, selected); });
    return snapshot();
  }
  async function prepareWorkspaces(onlyRoot?: string, keepCustomizations = false) {
    if (preparingWorkspaces || !dependencies.workspaces) return;
    load();
    if (!job || job.mode !== 'npm' || bootSource?.mode !== 'npm' || bootSource.version !== job.version || !job.installedVersion) return;
    preparingWorkspaces = true;
    try {
      launcher.inspect(job);
      record({ status: 'applying', stage: 'workspaces', steps: { ...job.steps, install: 'done', restart: 'done', verify: 'done' }, error: null });
      if (job.resources !== 'done') { record({resources:'running'}); await dependencies.workspaces.prepareResources?.(job.resourceSetBefore); record({resources:'done'}); }
      const known = new Set((job.workspaces || []).map(entry => entry.rootPath));
      const added = dependencies.workspaces.list().filter(entry => !known.has(entry.rootPath));
      if (added.length) record({ workspaces: [...(job.workspaces || []), ...added] });
      const entries = [...(job.workspaces || [])];
      for (const entry of entries) {
        if (['done','skipped'].includes(entry.status) || (onlyRoot && entry.rootPath !== onlyRoot)) continue;
        const patch = (status: WorkspaceUpdate['status'], error: string | null) => record({ workspaces: job!.workspaces!.map(item => item.rootPath === entry.rootPath ? { ...item, status, error } : item) });
        patch('running', null);
        try { const result:any=await dependencies.workspaces.prepare(entry, keepCustomizations ? {keepCustomizations:entry.customizations || []} : {}); patch(result?.status==='removed'?'skipped':'done', null); }
        catch (error: any) { patch('failed', error.message || '工作空间准备未完成。'); if(error.diagnostic) record({workspaces:job!.workspaces!.map(item=>item.rootPath===entry.rootPath?{...item,details:error.diagnostic}:item)}); if(error.customizations) record({workspaces:job!.workspaces!.map(item=>item.rootPath===entry.rootPath?{...item,customizations:error.customizations}:item)}); }
      }
      const incomplete = job!.workspaces!.some(entry => !['done','skipped'].includes(entry.status));
      record({ status: incomplete || job!.launcherError ? 'partial' : 'completed', stage: incomplete ? 'workspaces' : job!.launcherError ? 'launcher' : 'completed' });
    } catch (error: any) { try { record({ resources: job?.resources === 'running' ? 'failed' : job?.resources }); failure('workspaces', error); } catch {} }
    finally { preparingWorkspaces = false; }
  }
  function resume() {
    try { load(); } catch { return; }
    if (job && job.resources !== 'failed' && job.mode === 'npm' && bootSource?.version === job.version && job.installedVersion && (['pending','running'].includes(job.resources || '') || (job.workspaces || []).some(entry => ['pending', 'running'].includes(entry.status)))) setImmediate(() => { void prepareWorkspaces(); });
  }
  function recover(input: any = {}) {
    load();
    const observed = snapshot();
    if (!job || input.expectedJobId !== job.id || input.expectedVersion !== job.version) throw updateError('update_flow_recovery_conflict', '本次更新的任务或目标版本已变化，请重新读取。');
    if (!['launcher', 'restart', 'install', 'workspaces'].includes(input.action)) throw updateError('update_flow_recovery_action_invalid', '恢复环节无效。', 400);
    if (!['partial', 'failed'].includes(observed.status)) throw updateError('update_flow_recovery_conflict', '当前更新没有可恢复的失败环节。');
    const selected = source();
    if (selected.mode !== job.mode || selected.productRoot !== job.productRoot) throw updateError('update_flow_installation_changed', '安装范围已变化。');
    if (input.action === 'workspaces') {
      if (input.keepCustomizations === true && !input.rootPath) throw updateError('update_flow_recovery_action_invalid', '请明确需要保留定制的工作空间。', 400);
      if (preparingWorkspaces || selected.version !== job.version || !job.installedVersion || !(job.resources === 'failed' || job.workspaces?.some(entry => !['done','skipped'].includes(entry.status) && (!input.rootPath || entry.rootPath === input.rootPath)))) throw updateError('update_flow_recovery_conflict', '当前没有可重试的工作空间。');
      if (input.rootPath !== undefined && typeof input.rootPath !== 'string') throw updateError('update_flow_recovery_action_invalid', '工作空间目录无效。', 400);
      record({ status: 'applying', stage: 'workspaces', error: null });
      setImmediate(() => { void prepareWorkspaces(input.rootPath,input.keepCustomizations === true); });
      return snapshot();
    }
    const action = input.action as 'launcher' | 'restart' | 'install';
    if (action === 'install') {
      if (observed.installedVersion || job.stage !== 'install' || selected.version !== job.previousVersion || (selected.installationIdentity || null) !== job.previousInstallationIdentity) throw updateError('update_flow_recovery_conflict', '当前安装状态不允许重复安装本次版本。');
      const auth = selected.mode === 'npm' ? authority(selected) : null;
      record({ status: 'applying', stage: 'install', error: null, steps: { ...job.steps, install: 'running' } });
      setImmediate(() => { if (selected.mode === 'development') void simulate('install'); else void install(auth, selected); });
    } else {
      if (observed.steps.install !== 'done' || (action === 'launcher' && observed.steps.launcher !== 'failed') || (action === 'restart' && observed.steps.restart !== 'failed' && observed.steps.verify !== 'failed')) throw updateError('update_flow_recovery_conflict', '所选环节当前不需要恢复。');
      // Prove the installed target and slot before any launcher or Web mutation.
      if (selected.mode === 'npm') launcher.inspect(job);
      record({ status: 'applying', stage: action, installedVersion: observed.installedVersion,
        steps: { ...observed.steps, [action]: 'running' }, error: null });
      setImmediate(() => {
        if (selected.mode === 'development') { void simulate(action); return; }
        void (async () => {
          try {
            if (action === 'launcher') launcherResult(launcher.repair(job!));
            if (bootSource.version !== job!.version || action === 'restart') await reconnect();
            else record({ status: job!.launcherError ? 'partial' : 'completed', stage: job!.launcherError ? 'launcher' : 'completed' });
          } catch (error: any) { try { failure(action, error); } catch {} }
        })();
      });
    }
    return snapshot();
  }
  return Object.freeze({ webUpdateResume: resume, webUpdatePrepare: prepare, webUpdateStatus: snapshot, webUpdateApply: apply, webUpdateRecover: recover });
}
