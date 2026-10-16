import type { AuthenticationInput, CatalogEntry, ConnectionBinding, ConnectionField, ConnectionInstance, HookInput } from './connection-skill-types.ts';

export function categoryLabel(category: string): string {
  return ({ 'data-source': '数据源', configuration: '配置系统', logs: '日志系统', scheduling: '任务调度', 'ci-cd': '持续集成与交付（CI/CD）' } as Record<string, string>)[category] || category;
}
export function connectionSystems(entries: CatalogEntry[]): { key: string; category: string; categoryLabel: string; name: string; entries: CatalogEntry[] }[] {
  const systems = new Map<string, { key: string; category: string; categoryLabel: string; name: string; entries: CatalogEntry[] }>();
  for (const entry of entries.filter(item => item.enabled)) {
    const key = JSON.stringify([entry.definition.category, entry.definition.systemId || entry.definition.definitionId]);
    const system = systems.get(key) || { key, category: entry.definition.category, categoryLabel: entry.definition.presentation?.categoryLabel || categoryLabel(entry.definition.category), name: entry.definition.name, entries: [] };
    system.entries.push(entry); systems.set(key, system);
  }
  return [...systems.values()];
}

export function bindingFor(entry: CatalogEntry): ConnectionBinding {
  return { skillAssetIdentity: entry.skill.assetIdentity, definitionId: entry.definition.definitionId, sourceIdentity: entry.skill.sourceIdentity, configVersion: entry.definition.configVersion };
}
export function bindingKey(binding: ConnectionBinding): string {
  return JSON.stringify([binding.skillAssetIdentity, binding.definitionId, binding.sourceIdentity, binding.configVersion]);
}
export function personalAuthenticationOnly(entry?: CatalogEntry): boolean {
  const sources = entry?.definition.authentication.allowedSources;
  return Boolean(sources?.includes('personal') && !sources.includes('team'));
}
export function authenticationSourceAllowed(entry: CatalogEntry | undefined, source: AuthenticationInput['source']): boolean {
  return entry?.definition.authentication.allowedSources?.includes(source) ?? true;
}
export function connectionEnvironmentHidden(entry?: CatalogEntry): boolean {
  return entry?.definition.presentation?.environment === 'hidden';
}
export function authorizationAccountLabel(entry: CatalogEntry | undefined, instance?: ConnectionInstance): string {
  const key = entry?.definition.authentication.authorization?.accountLabelField;
  const field = entry?.definition.authentication.fields.find(field => field.key === key && field.type !== 'secret');
  const value = field && instance?.authentication.personal.values[field.key];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}
export function connectionDraftChanged(instance: ConnectionInstance | undefined, draft: { name: string; environment: string; enabled: boolean; config: Record<string, unknown>; fieldLabels?: Record<string, unknown> }): boolean {
  if (!instance) return false;
  const ordered = (value: Record<string, unknown>) => JSON.stringify(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  return draft.name.trim() !== instance.name || draft.environment.trim() !== instance.environment || draft.enabled !== instance.enabled || ordered(draft.config) !== ordered(instance.config) || ordered(draft.fieldLabels || {}) !== ordered(instance.fieldLabels || {});
}
export function fieldDefaults(fields: ConnectionField[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => field.default !== undefined && field.type !== 'secret').map(field => [field.key, structuredClone(field.default)]));
}
export function fieldVisible(field: ConnectionField, values: Record<string, unknown>): boolean {
  return !field.dependsOn || values[field.dependsOn.field] === field.dependsOn.equals;
}
export function validateFields(fields: ConnectionField[], values: Record<string, unknown>, keepSecrets = false): void {
  for (const field of fields) {
    if (!fieldVisible(field, values) || keepSecrets && field.type === 'secret') continue;
    const value = values[field.key];
    const empty = value === undefined || value === null;
    if (empty) { if (field.required) throw new Error(`请填写${field.label}。`); continue; }
    if (field.type === 'integer' && (!Number.isInteger(value) || field.minimum !== undefined && Number(value) < field.minimum || field.maximum !== undefined && Number(value) > field.maximum)) throw new Error(`${field.label}应为允许范围内的整数。`);
    if (typeof value === 'string' && (field.minLength !== undefined && value.length < field.minLength || field.maxLength !== undefined && value.length > field.maxLength)) throw new Error(`${field.label}长度不符合要求。`);
    if (field.type === 'enum' && !field.values?.includes(value as string | number | boolean)) throw new Error(`请选择有效的${field.label}。`);
    if (field.type === 'url' && !websiteHref(String(value))) throw new Error(`${field.label}应为不含账号密码的 HTTP 或 HTTPS 地址。`);
  }
}
export function targetDraftChanged(entry: CatalogEntry, config: Record<string, unknown>, instance?: ConnectionInstance): boolean {
  return Boolean(instance && entry.definition.authentication.targetFields.some(key => JSON.stringify(config[key]) !== JSON.stringify(instance.config[key])));
}
export function websiteHref(value: string | null | undefined): string | null {
  try {
    const url = new URL(value || '');
    const confidential = new Set(['password', 'passwd', 'pwd', 'token', 'access_token', 'refresh_token', 'id_token', 'authorization', 'api_key', 'apikey', 'secret', 'client_secret', 'credential', 'credentials']);
    const fragment = url.hash.slice(1), params = new URLSearchParams(fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && ![...url.searchParams.keys(), ...params.keys()].some(name => confidential.has(name.toLowerCase())) ? url.href : null;
  } catch { return null; }
}
export function withFieldValue(values: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const next = { ...values };
  if (value === undefined || value === null) delete next[key]; else next[key] = value;
  return next;
}
export function diagnosticText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const item = value as { message?: unknown; label?: unknown; name?: unknown; status?: unknown };
    return String(item.message ?? item.label ?? item.name ?? item.status ?? '检查结果已返回');
  }
  return String(value ?? '');
}
export function authenticationLabel(fields: ConnectionField[], values: Record<string, unknown>): string {
  return fields.filter(field => field.type !== 'secret' && values[field.key] !== undefined && values[field.key] !== '').map(field => `${field.label}：${String(values[field.key])}`).join(' / ') || '认证内容已隐藏';
}
export type DraftObservations = {
  team: { teamRevision: string; definitionRevision: string };
  personal: { teamRevision: string; definitionRevision: string; localRevision: string };
};
export function draftObservations(instance?: ConnectionInstance, definitionRevision = 'absent'): DraftObservations {
  const common = { teamRevision: instance?.teamRevision || 'absent', definitionRevision: instance?.definitionRevision || definitionRevision };
  return { team: { ...common }, personal: { ...common, localRevision: instance?.localRevision || 'absent' } };
}
export function afterTeamSave(observed: DraftObservations, instance: ConnectionInstance): DraftObservations {
  return { team: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision }, personal: { ...observed.personal, teamRevision: instance.teamRevision } };
}
export function afterPersonalSave(observed: DraftObservations, instance: ConnectionInstance): DraftObservations {
  return { team: observed.team, personal: { ...observed.personal, localRevision: instance.localRevision } };
}
export type PersonalAuthenticationDraft = { enabled: boolean; intent: 'keep' | 'replace'; values: Record<string, unknown> };
export function personalDraftFor(instance?: ConnectionInstance): PersonalAuthenticationDraft {
  const personal = instance?.authentication.personal;
  return { enabled: personal?.present ?? false, intent: personal?.configured ? 'keep' : 'replace', values: structuredClone(personal?.values || {}) };
}
export function personalDraftDirty(baseline: PersonalAuthenticationDraft, draft: PersonalAuthenticationDraft): boolean {
  if (baseline.enabled !== draft.enabled) return true;
  if (!draft.enabled) return false;
  const ordered = (values: Record<string, unknown>) => JSON.stringify(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
  return baseline.intent !== draft.intent || ordered(baseline.values) !== ordered(draft.values);
}
export function authenticationDraftsAfterRead(instance: ConnectionInstance, team: { intent: 'keep' | 'replace' | 'remove'; values: Record<string, unknown>; edited: boolean }, personalBaseline: PersonalAuthenticationDraft, personal: PersonalAuthenticationDraft) {
  const freshPersonal = personalDraftFor(instance), preservePersonal = personalDraftDirty(personalBaseline, personal);
  const replacingPersonal = preservePersonal && personal.intent === 'replace';
  return {
    team: team.edited && team.intent !== 'keep' ? team : { intent: instance.authentication.team.configured ? 'keep' as const : 'replace' as const, values: structuredClone(instance.authentication.team.values), edited: false },
    personal: replacingPersonal ? personal : { ...freshPersonal, enabled: preservePersonal ? personal.enabled : freshPersonal.enabled },
    personalBaseline: replacingPersonal ? personalBaseline : freshPersonal,
  };
}
export function hooksAvailable(entry: CatalogEntry | undefined, instance: ConnectionInstance | undefined, check: { program?: string; ready: boolean } | undefined, disabled: boolean, hook = 'test'): boolean {
  const program = entry?.definition.hooks?.[hook]?.program;
  return Boolean(program && entry?.enabled && entry.available && instance?.availability.ready !== false && instance?.programAvailability?.[program]?.ready !== false && ((check?.program || 'cli') !== program || check?.ready !== false) && !disabled);
}

/** A candidate selects one complete group without changing the persisted source. */
export function draftHookInput(entry: CatalogEntry, instance: ConnectionInstance | undefined, config: Record<string, unknown>, authentication: AuthenticationInput, hook?: string): HookInput {
  if (!authenticationSourceAllowed(entry, authentication.source)) throw new Error('此接入方式不支持所选认证来源。');
  const inputs = hook && hook !== 'test' ? entry.definition.hooks?.[hook]?.inputs : undefined;
  const requiredConfig = new Set(inputs ? [...inputs.filter(reference => reference.startsWith('config.')).map(reference => reference.slice(7)), ...entry.definition.authentication.targetFields] : []);
  validateFields(inputs ? entry.definition.config.fields.map(field => ({ ...field, required: requiredConfig.has(field.key), ...(requiredConfig.has(field.key) || Object.hasOwn(config, field.key) ? { dependsOn: undefined } : {}) })) : entry.definition.config.fields, config);
  const values = authentication.intent === 'replace' ? authentication.values || {} : instance?.authentication[authentication.source].values || {};
  if (authentication.intent === 'keep' && (!instance || targetDraftChanged(entry, config, instance))) throw new Error('目标已改变或没有已保存认证，请为本次候选重新填写完整认证。');
  if (entry.definition.authentication.authorization) {
    if (authentication.source !== 'personal' || authentication.intent !== 'keep' || !instance?.authentication.personal.configured) throw new Error('请先授权本机个人账号，再读取外部系统。');
  } else validateFields(inputs ? entry.definition.authentication.fields.map(field => inputs.includes(`authentication.${field.key}`) ? { ...field, required: true, dependsOn: undefined } : field) : entry.definition.authentication.fields, values, authentication.intent === 'keep');
  return { ...(instance ? { id: instance.id } : {}), binding: bindingFor(entry), config, expected: { teamRevision: instance?.teamRevision || 'absent', definitionRevision: entry.revision, ...(instance ? { localRevision: instance.localRevision } : {}) }, authentication };
}

/** Cancellation alone does not stop a server or prevent a late response. */
export function createDraftRequestScope() {
  let current: AbortController | undefined;
  return {
    invalidate() { current?.abort(); current = undefined; },
    begin() {
      current?.abort(); const controller = new AbortController(); current = controller;
      return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted };
    },
  };
}
