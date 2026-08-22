import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { withExclusiveFileLock } from '../../infrastructure/filesystem/index.mjs';

export const WORKSPACE_MANAGEMENT_SCHEMA = 'buildr.workspace-web-management/v1';
const OWNER_SCHEMA = 'buildr.workspace-web-management-owner/v1';
const PREVIEW_SCHEMA = 'buildr.local-app-preview/v1';

function managementError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  error.details = details;
  error.nextAction = '使用隔离副本，或先从错误channel的Workspace registry移除该Workspace；不要force、降级或直接修改SQLite。';
  return error;
}

function canonicalRoot(root) {
  const resolved = path.resolve(root);
  try { return fs.realpathSync.native(resolved); } catch { return fs.realpathSync(resolved); }
}

function previewOwnsWorkspace(targetRoot, env = process.env) {
  if (!env.BUILDR_LOCAL_APP_PREVIEW) return false;
  try {
    const owner = JSON.parse(env.BUILDR_LOCAL_APP_PREVIEW);
    if (owner?.schemaVersion !== PREVIEW_SCHEMA || typeof owner.instance !== 'string' || !owner.instance || typeof owner.worktree !== 'string') return false;
    const ownerRoot = owner.environmentRoot || owner.worktree;
    return typeof ownerRoot === 'string' && path.isAbsolute(ownerRoot) && canonicalRoot(ownerRoot) === canonicalRoot(targetRoot);
  } catch {
    return false;
  }
}

function ownerFor(profile) {
  return Object.freeze({
    schemaVersion: OWNER_SCHEMA,
    profile: profile.profile,
    channel: profile.channel,
    runtimeRole: profile.runtimeRole,
    profileIdentity: profile.identity,
  });
}

function validateOwner(value) {
  const fields = ['channel', 'profile', 'profileIdentity', 'runtimeRole', 'schemaVersion'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error('management owner fields are invalid');
  if (value.schemaVersion !== OWNER_SCHEMA) throw new Error('management owner schema is unsupported');
  if (!['released', 'development'].includes(value.profile)) throw new Error('management owner profile is unsupported');
  if ((value.profile === 'released') !== (value.channel === 'npm' && value.runtimeRole === 'host')) throw new Error('management owner released identity is inconsistent');
  if ((value.profile === 'development') !== (value.channel === 'development' && value.runtimeRole === 'development')) throw new Error('management owner development identity is inconsistent');
  if (typeof value.profileIdentity !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value.profileIdentity)) throw new Error('management owner profile identity is invalid');
  return Object.freeze({ ...value });
}

function validateManagementRecord(value) {
  const fields = ['canonicalRoot', 'claimedAt', 'owner', 'schemaVersion', 'workspaceId'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error('management record fields are invalid');
  if (value.schemaVersion !== WORKSPACE_MANAGEMENT_SCHEMA) throw new Error('management record schema is unsupported');
  if (typeof value.workspaceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.workspaceId)) throw new Error('management record Workspace UUID is invalid');
  if (typeof value.canonicalRoot !== 'string' || !path.isAbsolute(value.canonicalRoot)) throw new Error('management record canonical root is invalid');
  if (typeof value.claimedAt !== 'string' || !Number.isFinite(Date.parse(value.claimedAt))) throw new Error('management record claimedAt is invalid');
  return Object.freeze({ ...value, canonicalRoot: path.resolve(value.canonicalRoot), owner: validateOwner(value.owner) });
}

function readManagementRecord(file) {
  if (!fs.existsSync(file)) return { status: 'absent', record: null, reason: null };
  try {
    return { status: 'ready', record: validateManagementRecord(JSON.parse(fs.readFileSync(file, 'utf8'))), reason: null };
  } catch (error) {
    return { status: 'invalid', record: null, reason: error.message };
  }
}

function sameOwner(left, right) {
  return left?.profileIdentity === right?.profileIdentity
    && left?.channel === right?.channel
    && left?.runtimeRole === right?.runtimeRole;
}

export function registerWorkspaceManagementFence(runtime, options = {}) {
  const oppositeWebProfile = options.oppositeWebProfile;
  if (typeof oppositeWebProfile !== 'function') throw new Error('Workspace Management Fence requires the System Installation Web Profile contract.');
  function managementIdentity(targetRoot) {
    const root = canonicalRoot(targetRoot);
    const persistence = runtime.readWorkspacePersistence(root);
    const workspaceId = persistence.metadata.canonical ? persistence.metadata.workspace.id : null;
    if (!workspaceId) throw managementError('workspace_management_identity_missing', 'Workspace缺少canonical UUID，不能建立Web管理身份。', { root });
    return { canonicalRoot: root, workspaceId };
  }

  function managementPath(targetRoot) {
    return path.join(canonicalRoot(targetRoot), '.buildr', 'local', 'web-management.json');
  }

  function peerRegistry(profile) {
    const peerName = profile.profile === 'released' ? 'development' : 'released';
    const peer = options.peerProfiles?.[peerName]
      || oppositeWebProfile(profile, runtime.currentProductIdentity(), options.webProfileOptions);
    const file = path.join(peer.dataRoot, 'workspace-registry.json');
    return { profile: peer, observation: runtime.readWorkspaceRegistryFile(file) };
  }

  function peerWorkspaceIdentity(root) {
    try { return managementIdentity(root); } catch (error) {
      throw managementError('workspace_management_peer_identity_unknown', `对侧registry中的Workspace identity无法安全读取：${root}。`, { root, reason: error.message });
    }
  }

  function assertNoPeerRegistration(identity, profile) {
    const peer = peerRegistry(profile);
    if (peer.observation.status === 'invalid') {
      throw managementError('workspace_management_peer_registry_invalid', '对侧Workspace registry损坏，当前操作保持fail closed。', {
        registry: peer.observation.file,
        current: ownerFor(profile),
        conflicting: ownerFor(peer.profile),
        reason: peer.observation.reason,
      });
    }
    for (const registeredRoot of peer.observation.registry.roots) {
      const registered = peerWorkspaceIdentity(registeredRoot);
      if (registered.canonicalRoot === identity.canonicalRoot || registered.workspaceId === identity.workspaceId) {
        throw managementError('workspace_management_channel_conflict', '同一Workspace已由另一Buildr Web channel登记。', {
          workspace: identity,
          current: ownerFor(profile),
          conflicting: ownerFor(peer.profile),
          conflictingRoot: registeredRoot,
          registry: peer.observation.file,
        });
      }
    }
    return peer;
  }

  function assertCurrentRegistryReadable() {
    const observation = runtime.readWorkspaceRegistryFile(runtime.workspaceRegistryPath());
    if (observation.status === 'invalid') {
      throw managementError('workspace_management_current_registry_invalid', '当前Workspace registry损坏，不能安全判断Web management身份。', {
        registry: observation.file,
        reason: observation.reason,
      });
    }
    return observation;
  }

  function assertRecord(identity, profile, observation) {
    if (observation.status === 'invalid') {
      throw managementError('workspace_management_record_invalid', 'Workspace-local Web management记录损坏，当前操作保持fail closed。', {
        workspace: identity,
        file: managementPath(identity.canonicalRoot),
        reason: observation.reason,
      });
    }
    if (!observation.record) return;
    const expected = ownerFor(profile);
    if (
      observation.record.workspaceId !== identity.workspaceId
      || observation.record.canonicalRoot !== identity.canonicalRoot
      || !sameOwner(observation.record.owner, expected)
    ) {
      throw managementError('workspace_management_channel_conflict', 'Workspace-local Web management身份属于另一channel或Data Root。', {
        workspace: identity,
        current: expected,
        conflicting: observation.record.owner,
        record: managementPath(identity.canonicalRoot),
      });
    }
  }

  function assertWorkspaceManagementAccess(targetRoot, options = {}) {
    if (previewOwnsWorkspace(targetRoot)) return { status: 'preview', claimed: false, identity: null, profile: null };
    const profile = options.profile || runtime.currentWebProfile();
    const identity = managementIdentity(targetRoot);
    assertCurrentRegistryReadable();
    assertNoPeerRegistration(identity, profile);
    const file = managementPath(identity.canonicalRoot);
    const observation = readManagementRecord(file);
    assertRecord(identity, profile, observation);
    return { status: 'ready', claimed: observation.status === 'ready', identity, profile, file, record: observation.record };
  }

  function withWorkspaceManagementClaim(targetRoot, operation, options = {}) {
    if (previewOwnsWorkspace(targetRoot)) return operation({ status: 'preview', created: false });
    const profile = options.profile || runtime.currentWebProfile();
    const identity = managementIdentity(targetRoot);
    const file = managementPath(identity.canonicalRoot);
    const lock = `${file}.lock`;
    return withExclusiveFileLock(lock, identity.canonicalRoot, () => {
      assertCurrentRegistryReadable();
      assertNoPeerRegistration(identity, profile);
      const observed = readManagementRecord(file);
      assertRecord(identity, profile, observed);
      let created = false;
      if (observed.status === 'absent') {
        runtime.atomicWriteJson(file, {
          schemaVersion: WORKSPACE_MANAGEMENT_SCHEMA,
          workspaceId: identity.workspaceId,
          canonicalRoot: identity.canonicalRoot,
          owner: ownerFor(profile),
          claimedAt: new Date().toISOString(),
        }, { mode: 0o600 });
        created = true;
      }
      try {
        return operation({ status: 'ready', identity, profile, file, created });
      } catch (error) {
        if (created) {
          const current = readManagementRecord(file);
          if (current.record?.workspaceId === identity.workspaceId && sameOwner(current.record.owner, ownerFor(profile))) runtime.removePath(file);
        }
        throw error;
      }
    });
  }

  function ensureWorkspaceManagementClaim(targetRoot, options = {}) {
    return withWorkspaceManagementClaim(targetRoot, (claim) => claim, options);
  }

  function releaseWorkspaceManagementClaim(targetRoot, workspaceId, options = {}) {
    if (previewOwnsWorkspace(targetRoot)) return false;
    const profile = options.profile || runtime.currentWebProfile();
    const identity = managementIdentity(targetRoot);
    if (workspaceId && identity.workspaceId !== workspaceId) return false;
    const file = managementPath(identity.canonicalRoot);
    const lock = `${file}.lock`;
    return withExclusiveFileLock(lock, identity.canonicalRoot, () => {
      const observed = readManagementRecord(file);
      if (!observed.record || observed.record.workspaceId !== identity.workspaceId || !sameOwner(observed.record.owner, ownerFor(profile))) return false;
      const current = runtime.readWorkspaceRegistryPersistence().registry;
      const stillRegistered = current.roots.some((root) => {
        try {
          const registered = managementIdentity(root);
          return registered.canonicalRoot === identity.canonicalRoot || registered.workspaceId === identity.workspaceId;
        } catch { return true; }
      });
      if (stillRegistered) return false;
      runtime.removePath(file);
      return true;
    });
  }

  Object.assign(runtime, {
    workspaceManagementPath: managementPath,
    canonicalWorkspaceManagementIdentity: managementIdentity,
    assertWorkspaceManagementAccess,
    withWorkspaceManagementClaim,
    ensureWorkspaceManagementClaim,
    releaseWorkspaceManagementClaim,
  });
  return runtime;
}
