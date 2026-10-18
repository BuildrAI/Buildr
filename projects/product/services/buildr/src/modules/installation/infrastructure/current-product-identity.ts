import fs from 'node:fs';
import path from 'node:path';

import {
  readApplicationPayloadManifest,
  resolveApplicationPayloadRoot,
  resolveProductRoot,
} from '../../../infrastructure/product-resources/index.ts';
import { readCurrentInstallationOrigin, runtimeIdentityForOrigin } from './installation-origin.ts';
import { registeredProductInstallations } from './installation-registry.ts';
import { npmLauncherInstallationSlotIdentity, validateNpmLauncherBinding } from './launcher-binding.ts';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';

function registeredEntrySlotIdentity(entry: any): string | null {
  if (!entry?.updateAuthority?.prefix || !entry.productRoot || !entry.envelopePath) return null;
  return npmLauncherInstallationSlotIdentity({ packageRoot: entry.productRoot, prefix: entry.updateAuthority.prefix, originEnvelope: entry.envelopePath });
}

export function registeredNpmInstallationSlot(registered: any, currentOwnership: any, coordinates: any = null) {
  const entries = (registered?.installations || []).map((item: any) => item?.entry).filter((entry: any) => entry?.origin?.channel === 'npm');
  const candidates = entries.filter((entry: any) => entry.origin.ownershipIdentity === currentOwnership && (!coordinates
    || (sameFilesystemPath(entry.productRoot, coordinates.productRoot) && sameFilesystemPath(entry.entryPath, coordinates.entryPath) && registeredEntrySlotIdentity(entry) === registeredEntrySlotIdentity(coordinates))));
  const slots = new Set(candidates.map(registeredEntrySlotIdentity).filter(Boolean));
  if (slots.size !== 1) return { slotIdentity: null, slotOriginOwnerships: new Set<string>() };
  const current = candidates[0];
  const slotIdentity = registeredEntrySlotIdentity(current);
  const siblings = entries.filter((entry: any) => sameFilesystemPath(entry.entryPath, current.entryPath) && registeredEntrySlotIdentity(entry) === slotIdentity);
  return {
    slotIdentity,
    slotOriginOwnerships: new Set<string>(siblings.map((entry: any) => entry.origin.ownershipIdentity)),
  };
}

function updateHandoffError(code: string, message: string) { return Object.assign(new Error(message), { code, status: 409 }); }

/** Read the installed files and registry again after npm has replaced the package. */
export function readNpmUpdateHandoffInstallation(input: { productRoot: string; expectedVersion?: string; previousInstallationIdentity?: string }, options: any = {}) {
  const registered = options.registeredInstallations || registeredProductInstallations(options);
  if (registered.status === 'invalid') throw updateHandoffError('web_update_installation_registry_invalid', registered.reason || '安装登记无法读取。');
  const candidates = registered.installations.filter((item: any) => item.status === 'installed' && item.entry?.origin.channel === 'npm' && sameFilesystemPath(item.entry.productRoot, input.productRoot));
  if (candidates.length !== 1) throw updateHandoffError('web_update_installation_unconfirmed', '无法从安装登记确认唯一的新版 npm 入口。');
  const entry = candidates[0].entry;
  if (input.expectedVersion && entry.origin.version !== input.expectedVersion) throw updateHandoffError('web_update_installation_changed', '安装版本已变化，未使用其他版本接管网页。');
  const slot = registeredNpmInstallationSlot(registered, entry.origin.ownershipIdentity, entry);
  if (!slot.slotIdentity || !entry.updateAuthority || (input.previousInstallationIdentity && !slot.slotOriginOwnerships.has(input.previousInstallationIdentity))) {
    throw updateHandoffError('web_update_installation_slot_conflict', '新版入口与更新前安装无法证明属于同一安装槽位。');
  }
  return { entry, slot, registered };
}

export function assertNpmUpdateHandoffTarget(instance: any, options: any = {}) {
  const current = options.productIdentity || readCurrentProductIdentity();
  if (current.channel !== 'npm' || current.runtime?.role !== 'host') throw updateHandoffError('web_update_channel_conflict', '只有 npm 安装可执行更新交接。');
  const target = readNpmUpdateHandoffInstallation({ productRoot: options.productRoot || resolveProductRoot(), expectedVersion: current.version }, options);
  if (target.entry.origin.ownershipIdentity !== current.installationIdentity) throw updateHandoffError('web_update_installation_changed', '当前运行入口与已登记新版身份不一致。');
  const running = instance?.productIdentity;
  const historicalEntries = target.registered.installations.filter((item: any) => item.entry?.origin.ownershipIdentity === running?.installationIdentity);
  const historical = historicalEntries.find((item: any) => registeredEntrySlotIdentity(item.entry) === target.slot.slotIdentity)?.entry.origin;
  if (!historical || running?.runtime?.role !== 'host' || ['package', 'version', 'protocolIdentity', 'applicationPayloadDigest', 'sourceCommit', 'channel'].some(field => running[field] !== historical[field])) {
    throw updateHandoffError('web_update_instance_ownership_conflict', '正在运行的实例不能证明属于当前 npm 安装槽位，已保留现场。');
  }
  if (instance.launcherIdentity) {
    let binding;
    try { binding = validateNpmLauncherBinding(instance.launcherIdentity); } catch { throw updateHandoffError('web_update_launcher_identity_invalid', '旧实例的启动器身份无法核实。'); }
    if (binding.installationOwnershipIdentity !== running.installationIdentity || binding.installationSlotIdentity !== target.slot.slotIdentity) {
      throw updateHandoffError('web_update_instance_ownership_conflict', '旧启动器实例属于其他安装槽位，已保留现场。');
    }
  } else if (historicalEntries.some((item: any) => {
    const slot = registeredEntrySlotIdentity(item.entry);
    if (slot) return slot !== target.slot.slotIdentity;
    // An ordinary CLI enrollment can lack npm update authority. Its physical
    // coordinates still count; an unknown foreign slot is not absence of one.
    return !['productRoot', 'entryPath', 'envelopePath'].every(field => sameFilesystemPath(item.entry[field], target.entry[field]));
  })) {
    throw updateHandoffError('web_update_instance_ownership_ambiguous', '同一版本已登记在多个 npm 安装槽位，旧命令行实例缺少唯一归属证明，已保留现场。');
  }
  return target.entry;
}

/** Compare source origins, never launcher build IDs or the querying process's Node runtime. */
export function developmentInstanceMatchesInstallation(expected: any, running: any): boolean | null {
  const expectedOwnership = expected?.installationIdentity ?? expected?.ownershipIdentity;
  const runningOwnership = running?.installationIdentity;
  const validOwnership = (value: any) => typeof value === 'string' && /^sha256-[a-f0-9]{64}$/.test(value);
  const validCommit = (value: any) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (expected?.channel !== 'development' || running?.channel !== 'development'
      || !validOwnership(expectedOwnership) || !validOwnership(runningOwnership)
      || !validCommit(expected.sourceCommit) || !validCommit(running.sourceCommit)
      || !expected.version || !running.version || !expected.protocolIdentity || !running.protocolIdentity) return null;
  // The origin ownership digest already binds the canonical source root, commit, version and
  // protocol. Older products with that digest still prove their root without a separate field.
  return expectedOwnership === runningOwnership
    && expected.sourceCommit === running.sourceCommit
    && expected.version === running.version
    && expected.protocolIdentity === running.protocolIdentity;
}

export function readCurrentProductIdentity() {
  const productRoot = resolveProductRoot();
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  if (!metadata.name || !metadata.version) throw new Error('Buildr package identity is incomplete.');
  const payloadRoot = resolveApplicationPayloadRoot();
  const payload = payloadRoot ? readApplicationPayloadManifest(payloadRoot) : null;
  const origin = readCurrentInstallationOrigin(productRoot, { payloadRoot, payloadManifest: payload });
  const runtime = runtimeIdentityForOrigin(origin);
  const formal = origin.channel === 'npm';
  return Object.freeze({
    package: metadata.name,
    version: metadata.version,
    protocolIdentity: formal ? origin.protocolIdentity : payload?.protocolIdentity || origin.protocolIdentity,
    applicationPayloadDigest: formal ? origin.applicationPayloadDigest : payload?.applicationPayloadDigest || origin.applicationPayloadDigest,
    channel: origin.channel,
    runtime,
    installationIdentity: origin.ownershipIdentity,
    sourceCommit: origin.channel === 'development' || formal ? origin.sourceCommit : payload?.sourceCommit || origin.sourceCommit,
    ...(origin.channel === 'development' ? { sourceRoot: origin.sourceRoot || origin.installUnit } : {}),
  });
}
