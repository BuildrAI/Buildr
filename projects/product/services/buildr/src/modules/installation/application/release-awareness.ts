import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  atomicWriteJson,
  withExclusiveFileLock,
} from '../../../infrastructure/filesystem/index.ts';
import {
  compareVersions,
  defaultReleaseTrack,
  parseSemver,
} from '../domain/release-version.ts';
import { productDataRoot } from '../../../infrastructure/filesystem/product-data-root.ts';
import { spawnCommandSync } from '../../../infrastructure/process.ts';
import { inspectProductUpdateAuthority } from '../infrastructure/installation-registry.ts';

export const RELEASE_AWARENESS_SCHEMA = 'buildr.release-awareness/v1';
export const RELEASE_AWARENESS_STATE_SCHEMA = 'buildr.release-awareness-state/v1';
export const RELEASE_TRACKS: Readonly<Record<string, any>> = Object.freeze({
  stable: Object.freeze({ tag: 'latest', label: 'GA 正式版', prerelease: false }),
  candidate: Object.freeze({ tag: 'next', label: 'RC 候选版', prerelease: true }),
});

export { compareVersions, defaultReleaseTrack, parseSemver } from '../domain/release-version.ts';

function emptyTrackState() {
  return { lastSeenVersion: null, lastNotifiedVersion: null, checkedAt: null };
}

export function emptyReleaseAwarenessState() {
  return {
    schemaVersion: RELEASE_AWARENESS_STATE_SCHEMA,
    tracks: { stable: emptyTrackState(), candidate: emptyTrackState() },
  };
}

function canonicalTrackState(value: any, label: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const allowed = new Set(['lastSeenVersion', 'lastNotifiedVersion', 'checkedAt']);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new Error(`${label}.${field} is not supported.`);
  const result: Record<string, any> = {};
  for (const field of allowed) {
    const item = value[field] ?? null;
    if (item !== null && typeof item !== 'string') throw new Error(`${label}.${field} must be a string or null.`);
    result[field] = item;
  }
  return result;
}

export function canonicalReleaseAwarenessState(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('release-awareness.json must be an object.');
  const allowed = new Set(['schemaVersion', 'tracks']);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new Error(`release-awareness.json.${field} is not supported.`);
  if (value.schemaVersion !== RELEASE_AWARENESS_STATE_SCHEMA) throw new Error(`release-awareness.json.schemaVersion must be ${RELEASE_AWARENESS_STATE_SCHEMA}.`);
  if (!value.tracks || typeof value.tracks !== 'object' || Array.isArray(value.tracks)) throw new Error('release-awareness.json.tracks must be an object.');
  for (const track of Object.keys(value.tracks)) if (!RELEASE_TRACKS[track]) throw new Error(`release-awareness.json.tracks.${track} is not supported.`);
  return {
    schemaVersion: RELEASE_AWARENESS_STATE_SCHEMA,
    tracks: {
      stable: canonicalTrackState(value.tracks.stable || emptyTrackState(), 'release-awareness.json.tracks.stable'),
      candidate: canonicalTrackState(value.tracks.candidate || emptyTrackState(), 'release-awareness.json.tracks.candidate'),
    },
  };
}

export function releaseAwarenessStatePath(options: any = {}) {
  return path.join(path.resolve(options.dataRoot || productDataRoot()), 'release-awareness.json');
}

export function readReleaseAwarenessState(options: any = {}) {
  const file = releaseAwarenessStatePath(options);
  if (!fs.existsSync(file)) return { file, state: emptyReleaseAwarenessState() };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) { throw new Error(`release-awareness.json is invalid JSON: ${error.message}`); }
  return { file, state: canonicalReleaseAwarenessState(value) };
}

function nextReleaseAwarenessState(current: any, versions: any, notifyable: any, observedAt: any, notify: any) {
  const next = structuredClone(current);
  for (const track of Object.keys(RELEASE_TRACKS)) {
    next.tracks[track].checkedAt = observedAt;
    if (versions[track]) next.tracks[track].lastSeenVersion = versions[track];
    if (notify && notifyable[track] && versions[track]) next.tracks[track].lastNotifiedVersion = versions[track];
  }
  return canonicalReleaseAwarenessState(next);
}

export function observeReleaseAwarenessState({ versions, notifyable, observedAt, notify = false, ...options }: any) {
  const file = releaseAwarenessStatePath(options);
  const lockFile = `${file}.lock`;
  return withExclusiveFileLock(lockFile, file, () => {
    const before = readReleaseAwarenessState(options).state;
    const after = nextReleaseAwarenessState(before, versions, notifyable, observedAt, notify);
    atomicWriteJson(file, after, { mode: 0o600 });
    return { file, before, after };
  }, { timeoutMs: options.lockTimeoutMs ?? 2000 });
}

function commandResult(command: any, args: any, options: any = {}) {
  const result = spawnCommandSync(command, args, { encoding: 'utf8', timeout: 5000, ...options });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error?.message || null,
  };
}

function lookupTags(source: any, options: any) {
  if (options.registryTags) return { tags: options.registryTags, error: null, authority: 'fixture' };
  if (options.registryLookup) {
    try {
      const result = options.registryLookup(source.package, 'dist-tags');
      if (result && typeof result === 'object' && !Array.isArray(result)) return { tags: result, error: null, authority: 'fixture' };
      const track = defaultReleaseTrack(source.version);
      return { tags: { [RELEASE_TRACKS[track].tag]: result }, error: null, authority: 'fixture' };
    } catch (error: any) {
      return { tags: null, error: error.message, authority: 'fixture' };
    }
  }

  let result;
  if (source.mode === 'npm') {
    const authority = inspectProductUpdateAuthority(source.updateAuthority, { productRoot: source.productRoot });
    if (authority.status !== 'ready') {
      return {
        tags: null,
        error: `当前 npm package 缺少可用的 receipt registry update authority：${authority.reason}；Buildr 不会根据 PATH、文件名或目录布局猜测更新命令。`,
        authority: 'receipt-registry',
      };
    }
    result = commandResult(authority.authority!.nodeExecutable, [
      authority.authority!.npmCliPath,
      'view', source.package, 'dist-tags', '--json',
    ], options.registryCommandOptions);
  } else if (source.mode === 'development') {
    if (options.allowDevelopmentQuery === false) {
      return { tags: null, error: 'development checkout 不自动查询 npm 发布版本。', authority: 'development-disabled' };
    }
    result = commandResult('npm', ['view', source.package, 'dist-tags', '--json'], options.registryCommandOptions);
  } else {
    return { tags: null, error: '当前 Buildr 安装来源不可证明，无法检查发布版本。', authority: 'unavailable' };
  }
  if (!result.ok) return { tags: null, error: result.stderr || result.error || 'unknown error', authority: source.mode === 'npm' ? 'receipt-registry' : 'development-npm' };
  try {
    const tags = JSON.parse(result.stdout);
    if (!tags || typeof tags !== 'object' || Array.isArray(tags)) throw new Error('dist-tags must be an object');
    return { tags, error: null, authority: source.mode === 'npm' ? 'receipt-registry' : 'development-npm' };
  } catch (error: any) {
    return { tags: null, error: `npm registry 返回了无法解析的 dist-tags：${error.message}`, authority: source.mode === 'npm' ? 'receipt-registry' : 'development-npm' };
  }
}

function validTrackVersion(track: any, rawValue: any) {
  const definition = RELEASE_TRACKS[track];
  const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!raw) return { version: null, observedVersion: null, status: 'not-published', diagnostic: `${definition.label}尚未发布。` };
  const parsed = parseSemver(raw);
  if (!parsed) return { version: null, observedVersion: raw, status: 'misconfigured', diagnostic: `${definition.tag} 指向无效 semver：${raw}。` };
  const prerelease = parsed.prerelease.length > 0;
  if (prerelease !== definition.prerelease) {
    if (track === 'stable') {
      return { version: null, observedVersion: parsed.version, status: 'not-published', diagnostic: `GA 正式版尚未发布；latest 配置仍指向历史候选版 ${parsed.version}。` };
    }
    return { version: null, observedVersion: parsed.version, status: 'misconfigured', diagnostic: `next 配置指向正式版 ${parsed.version}，不是 RC 候选版。` };
  }
  return { version: parsed.version, observedVersion: parsed.version, status: null, diagnostic: null };
}

function buildTrack(track: any, validation: any, currentVersion: any, before: any, after: any) {
  const definition = RELEASE_TRACKS[track];
  if (!validation.version) {
    const observed = validation.observedVersion;
    return {
      track, tag: definition.tag, label: definition.label,
      version: null, observedVersion: validation.observedVersion,
      status: validation.status, available: false, installable: false,
      seen: Boolean(observed && after.lastSeenVersion === observed),
      newlyObserved: Boolean(observed && before.lastSeenVersion !== observed),
      notified: Boolean(observed && after.lastNotifiedVersion === observed),
      shouldNotify: Boolean(observed && before.lastNotifiedVersion !== observed),
    };
  }
  const comparison = compareVersions(validation.version, currentVersion);
  const status = comparison > 0 ? 'update-available' : comparison === 0 ? 'current' : 'behind-current';
  return {
    track, tag: definition.tag, label: definition.label,
    version: validation.version, observedVersion: validation.observedVersion,
    status,
    available: comparison > 0,
    installable: comparison > 0,
    seen: after.lastSeenVersion === validation.version,
    newlyObserved: before.lastSeenVersion !== validation.version,
    notified: after.lastNotifiedVersion === validation.version,
    shouldNotify: comparison > 0 && before.lastNotifiedVersion !== validation.version,
  };
}

function releaseNotice(track: any, currentVersion: any) {
  if (!track.available) return null;
  const command = `buildr update --track ${track.track}`;
  const message = track.track === 'stable' && parseSemver(currentVersion)?.prerelease.length
    ? `GA 正式版 ${track.version} 已发布；当前使用 RC 候选版 ${currentVersion}。`
    : `${track.label} ${track.version} 可更新。`;
  return { code: `release.${track.track}.update-available`, track: track.track, level: 'info', message, command, notify: track.shouldNotify };
}

export function buildReleaseAwareness(source: any, options: any = {}) {
  const observedAt = options.observedAt || new Date().toISOString();
  const selectedTrack = options.track || defaultReleaseTrack(source.version);
  if (!RELEASE_TRACKS[selectedTrack]) throw new Error(`Unsupported release track: ${selectedTrack}. Use stable or candidate.`);
  const currentParsed = parseSemver(source.version);
  const query = lookupTags(source, options);
  const current = {
    package: source.package,
    version: source.version,
    prerelease: Boolean(currentParsed?.prerelease.length),
    mode: source.mode,
    channel: source.channel,
    productRoot: source.productRoot,
    installPrefix: source.installPrefix || null,
    installationIdentity: source.installationIdentity || null,
    hostNode: process.versions.node,
    updateAuthority: source.updateAuthority || null,
  };
  const notices: any[] = [];
  const blockingReasons: any[] = [];
  if (!currentParsed) blockingReasons.push(`当前安装版本不是有效 semver：${source.version || 'unknown'}。`);
  if (query.error) blockingReasons.push(`无法检查 npm 发布版本：${query.error}`);

  const validations = Object.fromEntries(Object.entries(RELEASE_TRACKS).map(([track, definition]: any) => [
    track,
    query.error
      ? { version: null, observedVersion: null, status: 'unavailable', diagnostic: null }
      : validTrackVersion(track, query.tags?.[definition.tag]),
  ]));
  const versions = Object.fromEntries(Object.entries(validations).map(([track, value]: any) => [track, value.observedVersion]));
  const installable = Object.fromEntries(Object.entries(validations).map(([track, validation]: any) => [
    track,
    Boolean(validation.version && currentParsed && compareVersions(validation.version, currentParsed.version) > 0),
  ]));
  const notifyable = Object.fromEntries(Object.entries(validations).map(([track, validation]: any) => [
    track,
    installable[track] || Boolean(validation.diagnostic && validation.observedVersion),
  ]));

  let stateObservation: any = { before: emptyReleaseAwarenessState(), after: emptyReleaseAwarenessState() };
  if (!query.error && currentParsed && options.persistState === true) {
    try {
      stateObservation = observeReleaseAwarenessState({
        versions,
        notifyable,
        observedAt,
        notify: options.notify === true,
        dataRoot: options.dataRoot,
        lockTimeoutMs: options.lockTimeoutMs,
      });
    } catch (error: any) {
      notices.push({ code: 'release.state.unavailable', track: null, level: 'warning', message: `版本提醒状态暂不可用：${error.message}`, command: null, notify: false });
    }
  }

  const tracks = Object.fromEntries(Object.keys(RELEASE_TRACKS).map((track: any) => [
    track,
    buildTrack(track, validations[track], currentParsed?.version || '0.0.0', stateObservation.before.tracks[track], stateObservation.after.tracks[track]),
  ]));
  for (const track of Object.keys(RELEASE_TRACKS)) {
    if (validations[track].diagnostic) {
      notices.push({ code: `release.${track}.${validations[track].status}`, track, level: 'warning', message: validations[track].diagnostic, command: null, notify: tracks[track].shouldNotify });
    }
    const notice = currentParsed ? releaseNotice(tracks[track], currentParsed.version) : null;
    if (notice) notices.push(notice);
  }
  if (query.error) notices.push({ code: 'release.registry.unavailable', track: null, level: 'warning', message: 'GA/RC 版本检查暂不可用；Workspace 功能不受影响。', command: null, notify: false });

  const nextActions = Object.values(tracks).filter((track: any) => track.available).map((track: any) => `运行 buildr update --track ${track.track} 更新到 ${track.version}。`);
  const status = blockingReasons.length ? 'blocked' : Object.values(tracks).some((track: any) => track.available) ? 'update-available' : 'up-to-date';
  return {
    schemaVersion: RELEASE_AWARENESS_SCHEMA,
    mode: source.mode,
    channel: source.channel,
    current,
    selectedTrack,
    tracks,
    notices,
    observedAt: query.error ? null : observedAt,
    freshness: {
      status: query.error ? 'unavailable' : 'fresh',
      source: query.authority,
      checkedAt: query.error ? null : observedAt,
    },
    status,
    blockingReasons,
    nextActions,
  };
}
