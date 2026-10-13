/** Sole wire contract for Buildr and its DSH desktop extension. No runtime dependencies. */
export const DSH_DESKTOP_BRIDGE_SCHEMA = 'buildr.dsh-desktop-bridge/v1' as const;
export const DSH_DESKTOP_BRIDGE_DISCOVERY_SEGMENTS = ['buildr', 'desktop-bridges'] as const;
export const DSH_DESKTOP_BRIDGE_LIMITS = Object.freeze({ frameBytes: 1024 * 1024, promptBytes: 768 * 1024,
  outputBytes: 128 * 1024, requestsPerConnection: 32, connections: 16, defaultTimeoutMs: 60_000,
  maxTimeoutMs: 180_000, cancelTimeoutMs: 5_000, navigationTimeoutMs: 10_000 });

export type DshDesktopChannel = 'released' | 'development';
export type DshDesktopModelConfig = { model: string | null; modelProvider: string | null; reasoningEffort: string | null };
export type DshDesktopIdentity = { schemaVersion: typeof DSH_DESKTOP_BRIDGE_SCHEMA; channel: DshDesktopChannel;
  profileKey: string; hostInstanceId: string; hostPid: number; dshVersion: string; pluginVersion: string;
  appPath: string; executable: string };
/** Private transport material: must never be included in a web response or log. */
export type DshDesktopDiscovery = DshDesktopIdentity & { address: { host: '127.0.0.1'; port: number }; credential: string };
export type DshDesktopCapabilities = { generate: boolean; currentSession: boolean; openSession: boolean; openTask: boolean };
export type DshDesktopClientState = { clientId: string; sessionId: string | null; desktop: boolean };
export type DshDesktopInspection = DshDesktopIdentity & { capabilities: DshDesktopCapabilities;
  modelConfig: DshDesktopModelConfig | null; clients: DshDesktopClientState[] };
export type DshDesktopHello = { schemaVersion: typeof DSH_DESKTOP_BRIDGE_SCHEMA; channel: DshDesktopChannel;
  profileKey: string; hostInstanceId: string; credential: string };
export type DshDesktopGenerate = { prompt: string; outputSchema: unknown; timeoutMs?: number };
export type DshDesktopSessionTarget = { sessionId: string; clientId?: string };
export type DshDesktopTaskTarget = DshDesktopSessionTarget & { taskUrl: string };
export type DshDesktopRequest =
  | { id: string; method: 'hello'; params: DshDesktopHello }
  | { id: string; method: 'inspect'; params?: never }
  | { id: string; method: 'generate'; params: DshDesktopGenerate }
  | { id: string; method: 'cancel'; params: { requestId: string } }
  | { id: string; method: 'currentSession'; params?: { clientId?: string } }
  | { id: string; method: 'openSession'; params: DshDesktopSessionTarget }
  | { id: string; method: 'openTask'; params: DshDesktopTaskTarget };
export type DshDesktopProtocolError = { code: string; message: string };
export type DshDesktopFrame =
  | { id: string | null; type: 'error'; error: DshDesktopProtocolError }
  | { id: string; type: 'configured'; config: DshDesktopModelConfig }
  | { id: string; type: 'running' }
  | { id: string; type: 'result'; output: unknown };
export type DshDesktopCancelResult = { requestId: string; cancelled: boolean; settled: true };
export type DshDesktopNavigationResult = { clientId: string; sessionId: string; opened: true; taskUrl?: string };
/** Host-to-Client commands travel through the existing extension Remote namespace. */
export type DshDesktopClientCommand = { commandId: string; method: 'openSession' | 'openTask'; sessionId: string; taskUrl?: string };
export type DshDesktopClientAck = { clientId: string; commandId: string; sessionId: string | null; ok: boolean; code?: string };
export type DshDesktopTaskPageRequest = { pageId: string };
export type DshDesktopTaskPageResult = { taskUrl: string | null };

export function dshDesktopRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function dshDesktopIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function dshDesktopDiscoveryFilename(channel: DshDesktopChannel): string { return channel + '.json'; }
/** Strictly validate private discovery before a caller attempts any connection. */
export function readDshDesktopDiscovery(value: unknown): DshDesktopDiscovery {
  const row = dshDesktopRecord(value), address = dshDesktopRecord(row.address);
  if (row.schemaVersion !== DSH_DESKTOP_BRIDGE_SCHEMA || !['released', 'development'].includes(String(row.channel))
    || !dshDesktopIdentifier(row.profileKey) || !dshDesktopIdentifier(row.hostInstanceId)
    || !Number.isSafeInteger(row.hostPid) || Number(row.hostPid) < 1
    || !dshDesktopIdentifier(row.dshVersion) || !dshDesktopIdentifier(row.pluginVersion)
    || !dshDesktopIdentifier(row.appPath) || !dshDesktopIdentifier(row.executable)
    || address.host !== '127.0.0.1' || !Number.isSafeInteger(address.port) || Number(address.port) < 1 || Number(address.port) > 65535
    || typeof row.credential !== 'string' || !/^[a-f0-9]{64}$/.test(row.credential)) {
    throw new Error('DSH desktop discovery is invalid.');
  }
  return { schemaVersion: DSH_DESKTOP_BRIDGE_SCHEMA, channel: row.channel as DshDesktopChannel,
    profileKey: row.profileKey, hostInstanceId: row.hostInstanceId, hostPid: Number(row.hostPid),
    dshVersion: row.dshVersion, pluginVersion: row.pluginVersion,
    appPath: row.appPath, executable: row.executable,
    address: { host: '127.0.0.1', port: Number(address.port) }, credential: row.credential };
}
