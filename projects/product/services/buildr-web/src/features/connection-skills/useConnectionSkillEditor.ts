import { useContext, useEffect, useRef, useState } from 'react';
import { WorkspaceViewActiveContext } from '../../app/pageTabs';
import type { ApiError } from '../../api/client';
import type { ConnectionSkillsClient } from './api/connection-skills-api';
import type { CatalogEntry, ConnectionFieldLabels, ConnectionInstance, HookInput, HookResult } from './connection-skill-types';
import { afterPersonalSave, afterTeamSave, authenticationDraftsAfterRead, authenticationSourceAllowed, bindingFor, bindingKey, createDraftRequestScope, draftHookInput, draftObservations, fieldDefaults, hooksAvailable, personalAuthenticationOnly, personalDraftDirty, personalDraftFor, targetDraftChanged, validateFields, withFieldValue } from './connection-skill-form';
import { displayFieldLabels, fieldLabelsAfterRead } from './connection-skill-summary';

type Props = { instance?: ConnectionInstance; definitions: CatalogEntry[]; client: ConnectionSkillsClient; onSaved(saved: ConnectionInstance): void; onTeamSaved(): void };

export function useConnectionSkillEditor({ instance: initial, definitions, client, onSaved, onTeamSaved }: Props) {
  const active = useContext(WorkspaceViewActiveContext);
  const [instance, setInstance] = useState(initial);
  const [observed, setObserved] = useState(() => draftObservations(initial));
  const [definitionKey, setDefinitionKey] = useState(initial ? bindingKey(initial.binding) : '');
  const entry = definitions.find(candidate => bindingKey(bindingFor(candidate)) === definitionKey) || (instance?.definition && bindingKey(bindingFor(instance.definition)) === definitionKey ? instance.definition : undefined);
  const personalOnly = personalAuthenticationOnly(entry);
  const personalAllowed = authenticationSourceAllowed(entry, 'personal');
  const [name, setName] = useState(initial?.name || ''), [environment, setEnvironment] = useState(initial?.environment || ''), [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [config, setConfig] = useState<Record<string, unknown>>(initial?.config || {});
  const [fieldLabels, setFieldLabels] = useState<ConnectionFieldLabels>(initial?.fieldLabels || {});
  const [teamIntent, setTeamIntent] = useState<'keep' | 'replace' | 'remove'>(initial?.authentication.team.configured ? 'keep' : 'replace');
  const [teamValues, setTeamValues] = useState<Record<string, unknown>>(initial?.authentication.team.values || {});
  const [teamAuthenticationEdited, setTeamAuthenticationEdited] = useState(false);
  const [personalBaseline, setPersonalBaseline] = useState(() => personalDraftFor(initial));
  const [personalEnabled, setPersonalEnabled] = useState(personalBaseline.enabled);
  const [personalIntent, setPersonalIntent] = useState(personalBaseline.intent);
  const [personalValues, setPersonalValues] = useState(personalBaseline.values);
  const [saving, setSaving] = useState<'team' | 'personal' | null>(null), [testing, setTesting] = useState<'team' | 'personal' | null>(null), [discovering, setDiscovering] = useState('');
  const [testResults, setTestResults] = useState<Partial<Record<'team' | 'personal', HookResult>>>({});
  const [testStale, setTestStale] = useState({ team: false, personal: false });
  const [options, setOptions] = useState<Record<string, NonNullable<HookResult['options']>>>({});
  const [discoveryResults, setDiscoveryResults] = useState<Record<string, HookResult>>({}), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false), [reading, setReading] = useState(false);
  const [secretEpoch, setSecretEpoch] = useState(0);
  const [programCheck, setProgramCheck] = useState<{ program: string; ready: boolean; diagnostics: string[]; installHint: string | null }>(), [checking, setChecking] = useState(false);
  const requests = useRef(createDraftRequestScope()).current, mounted = useRef(true);
  const enteredSecrets = useRef(new Map<string, string>()).current;
  function rememberSecret(source: 'team' | 'personal', key: string, value: unknown) {
    if (typeof value === 'string' && value && entry?.definition.authentication.fields.some(field => field.key === key && field.type === 'secret')) enteredSecrets.set(`${source}.${key}`, value);
  }
  function invalidate(clearOptions = true) {
    requests.invalidate(); setTesting(null); setDiscovering(''); setTestStale({ team: true, personal: true }); setNotice('');
    setSecretEpoch(previous => previous + 1);
    if (clearOptions) { setOptions({}); setDiscoveryResults({}); }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requests.invalidate(); enteredSecrets.clear(); }; }, [requests, enteredSecrets]);
  useEffect(() => { if (!active) invalidate(); }, [active]);
  function chooseDefinition(selected: CatalogEntry) {
    if (instance) return;
    invalidate(); enteredSecrets.clear(); setDefinitionKey(bindingKey(bindingFor(selected))); setConfig(fieldDefaults(selected.definition.config.fields)); setFieldLabels({});
    setObserved(draftObservations(undefined, selected.revision)); setProgramCheck(undefined);
    setName(previous => previous || selected.definition.name);
    setTeamValues(fieldDefaults(selected.definition.authentication.fields)); setTeamIntent('replace'); setTeamAuthenticationEdited(false);
    setPersonalEnabled(personalAuthenticationOnly(selected)); setPersonalValues(fieldDefaults(selected.definition.authentication.fields)); setPersonalIntent('replace'); setPersonalBaseline(personalDraftFor()); setError('');
  }
  function reportSaveError(cause: unknown) {
    const failure = cause as ApiError; setError(failure.message || '保存失败。');
    if (failure.status === 409) setConflict(true);
  }
  async function reread() {
    if (!instance) return;
    setReading(true);
    try {
      const response = await client.get(instance.id);
      if (mounted.current) {
        const refreshed = authenticationDraftsAfterRead(response.instance, { intent: teamIntent, values: teamValues, edited: teamAuthenticationEdited }, personalBaseline, { enabled: personalEnabled, intent: personalIntent, values: personalValues });
        setFieldLabels(previous => fieldLabelsAfterRead(entry?.definition.config.fields || [], config, previous, instance.fieldLabels, response.instance.fieldLabels, Boolean(entry && targetDraftChanged(entry, config, response.instance))));
        invalidate(); setInstance(response.instance); setObserved(draftObservations(response.instance));
        setTeamIntent(refreshed.team.intent); setTeamValues(refreshed.team.values); setTeamAuthenticationEdited(refreshed.team.edited);
        setPersonalEnabled(refreshed.personal.enabled); setPersonalIntent(refreshed.personal.intent); setPersonalValues(refreshed.personal.values); setPersonalBaseline(refreshed.personalBaseline);
        setConflict(false); setNotice('已读取最新配置；草稿已保留，请核对后保存。'); onSaved(response.instance);
      }
    } catch (cause) { if (mounted.current) reportSaveError(cause); }
    finally { if (mounted.current) setReading(false); }
  }
  async function checkProgram() {
    if (!instance) return;
    setChecking(true); setError('');
    try { const result = await client.check(instance.id); if (mounted.current) setProgramCheck(result); }
    catch (cause) { if (mounted.current) setError((cause as Error).message); }
    finally { if (mounted.current) setChecking(false); }
  }
  function ensureEntry() { if (!entry) throw new Error('请先选择连接系统。'); return entry; }
  async function saveTeam() {
    try {
      const keepPersonalDraft = personalDraftDirty(personalBaseline, { enabled: personalEnabled, intent: personalIntent, values: personalValues });
      const current = ensureEntry();
      if (!name.trim()) throw new Error('请填写连接名称。');
      validateFields(current.definition.config.fields, config);
      if (teamIntent !== 'remove') validateFields(current.definition.authentication.fields, teamValues, teamIntent === 'keep');
      invalidate(false); setSaving('team'); setError('');
      const input = { name: name.trim(), environment: environment.trim(), enabled, binding: bindingFor(current), config, fieldLabels, authentication: { intent: teamIntent, ...(teamIntent === 'replace' ? { values: teamValues } : {}) }, expected: observed.team };
      const response = instance ? await client.update(instance.id, input) : await client.create(input);
      if (mounted.current) {
        setInstance(response.instance); setName(response.instance.name); setEnvironment(response.instance.environment); setConfig(response.instance.config); setFieldLabels(response.instance.fieldLabels || {});
        setObserved(previous => afterTeamSave(previous, response.instance));
        setTeamValues(response.instance.authentication.team.values); setTeamIntent(response.instance.authentication.team.configured ? 'keep' : 'replace'); setTeamAuthenticationEdited(false);
        setConflict(false); setNotice(keepPersonalDraft ? '连接已保存；个人账号修改尚未保存，请在下方单独保存。' : '连接已保存。'); onSaved(response.instance);
        if (!keepPersonalDraft) onTeamSaved();
      }
    } catch (cause) { if (mounted.current) reportSaveError(cause); }
    finally { if (mounted.current) setSaving(null); }
  }
  async function savePersonalConnection() {
    let configurationSaved = false;
    try {
      const current = ensureEntry();
      if (instance?.authentication.team.present) throw new Error('检测到旧版共享认证，请先迁移为本机个人账号，再保存连接。');
      if (!name.trim()) throw new Error('请填写连接名称。');
      validateFields(current.definition.config.fields, config);
      if (personalIntent === 'keep' && (!instance?.authentication.personal.configured || targetDraftChanged(current, config, instance))) throw new Error('连接地址已改变，请重新填写个人账号。');
      validateFields(current.definition.authentication.fields, personalValues, personalIntent === 'keep');
      invalidate(false); setSaving('team'); setError('');
      const input = { name: name.trim(), environment: environment.trim(), enabled, binding: bindingFor(current), config, fieldLabels, authentication: { intent: 'remove' as const }, expected: observed.team };
      const configuration = instance ? await client.update(instance.id, input) : await client.create(input);
      if (!mounted.current) return;
      configurationSaved = true;
      let saved = configuration.instance, nextObserved = afterTeamSave(observed, saved);
      setInstance(saved); setName(saved.name); setEnvironment(saved.environment); setConfig(saved.config); setFieldLabels(saved.fieldLabels || {}); setObserved(nextObserved); onSaved(saved);
      if (personalIntent === 'replace') {
        const authentication = await client.savePersonal(saved.id, { intent: 'replace', values: personalValues, expected: nextObserved.personal });
        if (!mounted.current) return;
        saved = authentication.instance; nextObserved = afterPersonalSave(nextObserved, saved);
        const savedDraft = personalDraftFor(saved);
        setInstance(saved); setObserved(nextObserved); setPersonalValues(savedDraft.values); setPersonalEnabled(savedDraft.enabled); setPersonalIntent(savedDraft.intent); setPersonalBaseline(savedDraft); onSaved(saved);
      }
      setConflict(false); setNotice('连接和本机个人账号已保存。'); onTeamSaved();
    } catch (cause) {
      if (mounted.current) { reportSaveError(cause); if (configurationSaved) setNotice('连接配置已保存；个人账号尚未保存，请核对后重试。'); }
    } finally { if (mounted.current) setSaving(null); }
  }
  async function migratePersonal() {
    if (!instance) return;
    invalidate(); setSaving('personal'); setError('');
    try {
      const response = await client.migratePersonal(instance.id, { source: { id: instance.id, authenticationSource: 'team', expected: observed.personal }, expected: observed.personal, removeSource: true });
      if (!mounted.current) return;
      const refreshed = authenticationDraftsAfterRead(response.instance, { intent: teamIntent, values: teamValues, edited: teamAuthenticationEdited }, personalBaseline, { enabled: personalEnabled, intent: personalIntent, values: personalValues });
      setInstance(response.instance); setObserved(draftObservations(response.instance)); setPersonalBaseline(refreshed.personalBaseline); setPersonalEnabled(refreshed.personal.enabled); setPersonalIntent(refreshed.personal.intent); setPersonalValues(refreshed.personal.values);
      setConflict(false); setNotice('旧版认证已迁移并加密保存在本机；原共享认证已移除，其他草稿已保留。'); onSaved(response.instance);
    } catch (cause) {
      if (mounted.current) { reportSaveError(cause); if ((cause as ApiError).code === 'connection_skill_auth_migration_partial') { setConflict(true); setNotice('本机个人认证已保全；旧版共享认证移除尚未确认，请重新读取后核对。'); } }
    } finally { if (mounted.current) setSaving(null); }
  }
  async function savePersonal(remove = false) {
    try {
      if (!instance) throw new Error('请先保存连接，再保存个人账号。');
      const replacing = personalEnabled && !remove;
      if (replacing) {
        const current = ensureEntry();
        if (!authenticationSourceAllowed(current, 'personal')) throw new Error('此接入方式不支持保存个人认证；可以移除遗留个人账号。');
        if (targetDraftChanged(current, config, instance)) throw new Error('连接地址尚有未保存变化，请先保存连接。');
        validateFields(current.definition.authentication.fields, personalValues);
      }
      invalidate(false); setSaving('personal'); setError('');
      const response = await client.savePersonal(instance.id, { intent: replacing ? 'replace' : 'remove', ...(replacing ? { values: personalValues } : {}), expected: observed.personal });
      if (mounted.current) {
        const savedDraft = personalDraftFor(response.instance);
        setFieldLabels(previous => fieldLabelsAfterRead(entry?.definition.config.fields || [], config, previous, instance.fieldLabels, response.instance.fieldLabels));
        setInstance(response.instance); setPersonalValues(savedDraft.values); setPersonalBaseline(savedDraft);
        setObserved(previous => afterPersonalSave(previous, response.instance));
        setPersonalEnabled(savedDraft.enabled); setPersonalIntent(savedDraft.intent);
        setConflict(false); setNotice(replacing ? '个人账号已保存，仅本机使用。' : personalOnly ? '本机个人账号已移除，请填写账号后再使用此连接。' : '个人账号已移除，后续使用团队账号。'); onSaved(response.instance);
      }
    } catch (cause) { if (mounted.current) reportSaveError(cause); }
    finally { if (mounted.current) setSaving(null); }
  }
  function candidate(source: 'team' | 'personal', hook?: string): HookInput {
    const current = ensureEntry();
    const intent = source === 'personal' ? personalIntent : teamIntent === 'remove' ? 'replace' : teamIntent;
    const values = source === 'personal' ? personalValues : teamValues;
    if (source === 'team' && teamIntent === 'remove') throw new Error('请填写团队账号后再测试。');
    const input = draftHookInput(current, instance, config, { source, intent, ...(intent === 'replace' ? { values } : {}) }, hook);
    return { ...input, expected: { ...observed.team, ...(instance ? { localRevision: observed.personal.localRevision } : {}) } };
  }
  async function runHook(hook?: string, source: 'team' | 'personal' = personalOnly ? 'personal' : 'team') {
    let input: HookInput;
    try { input = candidate(source, hook); } catch (cause) { setError((cause as Error).message); return; }
    const request = requests.begin();
    setError(''); if (hook) setDiscovering(hook); else { setTesting(source); setTestResults(previous => ({ ...previous, [source]: undefined })); setTestStale(previous => ({ ...previous, [source]: false })); }
    try {
      const result = hook ? await client.discover({ ...input, hook }, request.signal) : await client.test(input, request.signal);
      if (!mounted.current || !request.isCurrent()) return;
      if (hook) {
        setOptions(previous => ({ ...previous, [hook]: result.options || [] })); setDiscoveryResults(previous => ({ ...previous, [hook]: result }));
        const discovered = Object.fromEntries((entry?.definition.config.fields || []).filter(field => field.type === 'select' && field.optionsFrom === hook).flatMap(field => {
          const match = result.options?.find(option => option.value === config[field.key]);
          return match ? [[field.key, { value: match.value, label: match.label }]] : [];
        }));
        setFieldLabels(previous => ({ ...previous, ...discovered }));
      }
      else { setTestResults(previous => ({ ...previous, [source]: result })); setTestStale(previous => ({ ...previous, [source]: false })); }
    } catch (cause) {
      if (!mounted.current || !request.isCurrent()) return;
      const failure: HookResult = { status: 'failure', checks: [], observedAt: new Date().toISOString(), diagnostics: [(cause as Error).message], limitations: [], authenticationSource: source };
      if (hook) setDiscoveryResults(previous => ({ ...previous, [hook]: failure })); else { setTestResults(previous => ({ ...previous, [source]: failure })); setTestStale(previous => ({ ...previous, [source]: false })); }
    } finally { if (mounted.current && request.isCurrent()) { setTesting(null); setDiscovering(''); } }
  }
  const disabled = Boolean(saving) || !active || reading;
  function changeTeamIntent(intent: 'keep' | 'replace' | 'remove') {
    invalidate(); setTeamIntent(intent); setTeamAuthenticationEdited(intent !== 'keep'); setTeamValues(intent === 'replace' ? fieldDefaults(entry?.definition.authentication.fields || []) : intent === 'keep' ? instance?.authentication.team.values || {} : {});
  }
  const visibleLabels = displayFieldLabels(entry?.definition.config.fields || [], config, fieldLabels, [...enteredSecrets.values()]);
  return {
    instance, entry, definitionKey, name, environment, enabled, config, fieldLabels: visibleLabels, teamIntent, teamValues, personalOnly, personalAllowed, personalEnabled, personalIntent, personalValues, secretEpoch,
    saving, testing, discovering, testResult: testResults.team, testStale: testStale.team, personalTestResult: testResults.personal, personalTestStale: testStale.personal, options, discoveryResults, error, notice, conflict, reading, programCheck, checking,
    disabled, ready: hooksAvailable(entry, instance, programCheck, disabled), hookReady(hook: string) { return hooksAvailable(entry, instance, programCheck, disabled, hook); }, chooseDefinition, saveTeam: personalOnly ? savePersonalConnection : saveTeam, savePersonal, migratePersonal, reread, checkProgram, runHook, changeTeamIntent, reportAuthenticationConflict: reportSaveError,
    resetDefinition() { if (!instance) { invalidate(); setDefinitionKey(''); setError(''); } },
    setName(value: string) { invalidate(false); setName(value); },
    setEnvironment(value: string) { invalidate(false); setEnvironment(value); },
    setEnabled(value: boolean) { invalidate(false); setEnabled(value); },
    changeConfig(key: string, value: unknown, label?: string) {
      invalidate(); setConfig(previous => withFieldValue(previous, key, value));
      setFieldLabels(previous => {
        if (entry?.definition.authentication.targetFields.includes(key)) return {};
        const next = { ...previous }, field = entry?.definition.config.fields.find(field => field.key === key);
        if (field?.type === 'select' && field.optionsFrom && typeof value === 'string' && label?.trim()) next[key] = { value, label };
        else delete next[key];
        return next;
      });
    },
    changeTeam(key: string, value: unknown) { invalidate(); rememberSecret('team', key, value); setTeamIntent('replace'); setTeamAuthenticationEdited(true); setTeamValues(previous => withFieldValue(previous, key, value)); },
    setPersonalEnabled(value: boolean) { invalidate(); setPersonalEnabled(value); },
    changePersonal(key: string, value: unknown) { invalidate(); rememberSecret('personal', key, value); if (personalOnly) setPersonalEnabled(true); setPersonalIntent('replace'); setPersonalValues(previous => withFieldValue(previous, key, value)); },
    replacePersonal() { invalidate(); if (personalOnly) setPersonalEnabled(true); setPersonalIntent('replace'); setPersonalValues(fieldDefaults(entry?.definition.authentication.fields || [])); },
    keepPersonal() { invalidate(); if (personalOnly) setPersonalEnabled(true); setPersonalIntent('keep'); setPersonalValues(instance?.authentication.personal.values || {}); },
    close() { invalidate(); },
  };
}
