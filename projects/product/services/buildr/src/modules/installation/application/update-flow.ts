import { spawnCommand } from '../../../infrastructure/process.ts';
import { identifyCliSource } from './cli-update.ts';
import { inspectProductUpdateAuthority } from '../infrastructure/installation-registry.ts';
import {
  RELEASE_TRACKS,
  compareVersions,
  parseSemver,
} from './release-awareness.ts';

export const WEB_UPDATE_FLOW_SCHEMA = 'buildr.web-update-flow/v1';
const UPDATE_PACKAGE = '@buildr-ai/buildr';
const JOB_STATUSES = ['idle', 'preparing', 'ready', 'failed', 'applying', 'completed'];

function updateFlowError(code: any, message: any, status: any = 409, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function emptyJob() {
  return { status: 'idle', track: null, version: null, error: null, updatedAt: null };
}

/**
 * 页面分阶段更新任务：进程内单例，实例生命周期内有效。
 * prepare 钉住版本并后台下载；apply 复用 CLI 更新同一 authority 安装并交接。
 */
export function createWebUpdateFlow(dependencies: {
  productRoot(): string;
  releaseAwareness(options?: any): any;
  handoffUpdatedBuildrWeb(input: any): Promise<any>;
  spawnProcess?: typeof spawnCommand;
  identifySource?: typeof identifyCliSource;
  inspectAuthority?: typeof inspectProductUpdateAuthority;
  devTiming?: { downloadMs?: number; installMs?: number };
  now?(): string;
}) {
  const spawnProcess = dependencies.spawnProcess || spawnCommand;
  const identifySource = dependencies.identifySource || identifyCliSource;
  const inspectAuthority = dependencies.inspectAuthority || inspectProductUpdateAuthority;
  const devTiming = { downloadMs: 2000, installMs: 3000, ...dependencies.devTiming };
  const now = dependencies.now || (() => new Date().toISOString());
  let job: any = emptyJob();

  function transition(next: any) {
    if (!JOB_STATUSES.includes(next.status)) throw new Error(`Unknown update job status: ${next.status}.`);
    job = { ...job, ...next, updatedAt: now() };
  }

  function snapshot() {
    let currentVersion: any = null;
    try { currentVersion = identifySource(dependencies.productRoot()).version; } catch {}
    return {
      schemaVersion: WEB_UPDATE_FLOW_SCHEMA,
      status: job.status,
      track: job.track,
      version: job.version,
      currentVersion,
      error: job.error,
      updatedAt: job.updatedAt,
    };
  }

  function assertSupportedSource() {
    const source = identifySource(dependencies.productRoot());
    if (source.mode !== 'npm' && source.mode !== 'development') {
      throw updateFlowError(
        'update_flow_not_supported',
        `当前 Buildr 安装来源为 ${source.mode || 'unknown'}，页面内更新只适用于 npm registry package 或 development checkout（模拟）。`,
        409,
        { mode: source.mode || 'unknown' },
      );
    }
    return source;
  }

  function simulated(source: any, track: any, version: any, stage: 'download' | 'install') {
    const ms = stage === 'download' ? devTiming.downloadMs : devTiming.installMs;
    const activeStatus = stage === 'download' ? 'preparing' : 'applying';
    const doneStatus = stage === 'download' ? 'ready' : 'completed';
    void (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, ms));
        if (job.status === activeStatus && job.version === version && job.track === track) {
          transition({ status: doneStatus });
        }
      } catch (error: any) {
        if (job.status === activeStatus && job.version === version && job.track === track) {
          transition({ status: 'failed', error: { code: 'update_simulation_failed', message: error.message } });
        }
      }
    })();
  }

  function assertAuthority(source: any) {
    const inspected = inspectAuthority(source.updateAuthority, { productRoot: source.productRoot });
    if (inspected.status !== 'ready' || !inspected.authority) {
      throw updateFlowError(
        'update_flow_authority_unavailable',
        `当前 npm package 缺少可用的 receipt registry update authority：${inspected.reason || 'unknown'}。`,
        409,
      );
    }
    return inspected.authority;
  }

  function assertIdle() {
    if (job.status === 'preparing' || job.status === 'applying') {
      throw updateFlowError('update_flow_busy', `已有更新任务处于 ${job.status} 状态。`, 409, { status: job.status });
    }
  }

  function assertTarget(track: any, expectedVersion: any) {
    if (!RELEASE_TRACKS[track]) {
      throw updateFlowError('update_flow_track_invalid', `不支持的 release track：${track}。`, 400);
    }
    if (typeof expectedVersion !== 'string' || !parseSemver(expectedVersion)) {
      throw updateFlowError('update_flow_target_invalid', `更新目标版本不是有效 semver：${expectedVersion}。`, 400);
    }
  }

  async function download(authority: any, track: any, version: any, pkg: any) {
    try {
      const result = await spawnProcess(authority.nodeExecutable, [authority.npmCliPath, 'cache', 'add', `${pkg}@${version}`]);
      if (!result.ok) {
        throw updateFlowError('update_download_failed', `更新包下载失败：${result.stderr || result.error || 'unknown error'}`);
      }
      if (job.status === 'preparing' && job.version === version && job.track === track) {
        transition({ status: 'ready' });
      }
    } catch (error: any) {
      if (job.status === 'preparing' && job.version === version && job.track === track) {
        transition({ status: 'failed', error: { code: error.code || 'update_download_failed', message: error.message } });
      }
    }
  }

  function prepare(input: any = {}) {
    const { track, expectedVersion } = input;
    assertTarget(track, expectedVersion);
    const source = assertSupportedSource();
    assertIdle();
    if (compareVersions(expectedVersion, source.version) <= 0) {
      throw updateFlowError(
        'update_flow_target_invalid',
        `更新目标 ${expectedVersion} 不高于当前安装版本 ${source.version}。`,
        409,
        { currentVersion: source.version },
      );
    }
    if (source.mode === 'development') {
      transition({ status: 'preparing', track, version: expectedVersion, error: null });
      simulated(source, track, expectedVersion, 'download');
      return snapshot();
    }
    const authority = assertAuthority(source);
    const awareness = dependencies.releaseAwareness({ track, allowDevelopmentQuery: false });
    const selected = awareness?.tracks?.[track];
    if (!awareness || awareness.freshness?.status !== 'fresh' || !selected) {
      throw updateFlowError('update_flow_registry_unavailable', '暂时无法核对 npm 发布版本，请稍后重试。', 503);
    }
    if (selected.version !== expectedVersion) {
      throw updateFlowError(
        'update_flow_version_conflict',
        `所选轨道当前可安装版本为 ${selected.version || '无'}，与请求的 ${expectedVersion} 不一致。`,
        409,
        { expectedVersion, registryVersion: selected.version || null, track },
      );
    }
    if (!selected.installable) {
      throw updateFlowError('update_flow_not_installable', `版本 ${expectedVersion} 当前不可安装。`, 409, { track });
    }
    transition({ status: 'preparing', track, version: expectedVersion, error: null });
    void download(authority, track, expectedVersion, source.package || UPDATE_PACKAGE);
    return snapshot();
  }

  async function applyPipeline(authority: any, source: any, track: any, version: any) {
    try {
      const result = await spawnProcess(authority.nodeExecutable, [
        authority.npmCliPath, 'install', '--global', '--prefer-offline', '--prefix', authority.prefix,
        `${source.package || UPDATE_PACKAGE}@${version}`,
      ]);
      if (!result.ok) throw updateFlowError('update_install_failed', `更新包安装失败：${result.stderr || result.error || 'unknown error'}`);
      const handoff = await dependencies.handoffUpdatedBuildrWeb({
        productRoot: source.productRoot,
        expectedVersion: version,
        previousInstallationIdentity: source.installationIdentity,
      });
      if (handoff?.status === 'failed') {
        throw updateFlowError(handoff.code || 'update_handoff_failed', `网页更新交接失败：${handoff.message || 'unknown error'}`);
      }
      if (job.status === 'applying' && job.version === version && job.track === track) {
        transition({ status: 'completed' });
      }
    } catch (error: any) {
      if (job.status === 'applying' && job.version === version && job.track === track) {
        transition({ status: 'failed', error: { code: error.code || 'update_install_failed', message: error.message } });
      }
    }
  }

  function apply(input: any = {}) {
    const { expectedVersion } = input;
    if (typeof expectedVersion !== 'string' || !parseSemver(expectedVersion)) {
      throw updateFlowError('update_flow_target_invalid', `更新目标版本不是有效 semver：${expectedVersion}。`, 400);
    }
    const source = assertSupportedSource();
    if (job.status !== 'ready' || job.version !== expectedVersion) {
      throw updateFlowError(
        'update_flow_apply_conflict',
        job.status === 'ready'
          ? `确认版本 ${expectedVersion} 与已准备版本 ${job.version} 不一致。`
          : `当前没有已就绪的更新任务（状态：${job.status}）。`,
        409,
        { expectedVersion, preparedVersion: job.version, status: job.status },
      );
    }
    const authority = source.mode === 'npm' ? assertAuthority(source) : null;
    transition({ status: 'applying', error: null });
    if (source.mode === 'development') {
      simulated(source, job.track, job.version, 'install');
      return snapshot();
    }
    void applyPipeline(authority, source, job.track, job.version);
    return snapshot();
  }

  return Object.freeze({
    webUpdatePrepare: prepare,
    webUpdateStatus: snapshot,
    webUpdateApply: apply,
  });
}
