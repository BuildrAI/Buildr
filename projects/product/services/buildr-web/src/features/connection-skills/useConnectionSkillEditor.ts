import { useContext, useEffect, useRef, useState } from 'react';
import { WorkspaceViewActiveContext } from '../../app/pageTabs';
import type { ApiError } from '../../api/client';
import type { ConnectionSkillsClient } from './api/connection-skills-api';
import type { CatalogEntry, ConnectionFieldLabels, ConnectionInstance, HookInput, HookResult } from './connection-skill-types';
import { afterPersonalSave, afterTeamSave, authenticationDraftsAfterRead, bindingFor, bindingKey, createDraftRequestScope, draftHookInput, draftObservations, fieldDefaults, hooksAvailable, personalDraftDirty, personalDraftFor, targetDraftChanged, validateFields, withFieldValue } from './connection-skill-form';
import { displayFieldLabels, fieldLabelsAfterRead } from './connection-skill-summary';

type Props = { instance?: ConnectionInstance; definitions: CatalogEntry[]; client: ConnectionSkillsClient; onSaved(saved: ConnectionInstance): void; onTeamSaved(): void };

export function useConnectionSkillEditor({ instance: initial, definitions, client, onSaved, onTeamSaved }: Props) {
  const active = useContext(WorkspaceViewActiveContext);
  const [instance, setInstance] = useState(initial);
  const [observed, setObserved] = useState(() => draftObservations(initial));
  const [definitionKey, setDefinitionKey] = useState(initial ? bindingKey(initial.binding) : '');
  const entry = definitions.find(candidate => bindingKey(bindingFor(candidate)) === definitionKey) || (instance?.definition && bindingKey(bindingFor(instance.definition)) === definitionKey ? instance.definition : undefined);
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
  const [programCheck, setProgramCheck] = useState<{ program: string; ready: boolean; diagnostics: string[]; installHint: string | null }>(), [checking, setChecking] = useState(false);
  const requests = useRef(createDraftRequestScope()).current, mounted = useRef(true);
  const enteredSecrets = useRef(new Map<string, string>()).current;
  function rememberSecret(source: 'team' | 'personal', key: string, value: unknown) {
    if (typeof value === 'string' && value && entry?.definition.authentication.fields.some(field => field.key === key && field.type === 'secret')) enteredSecrets.set(`${source}.${key}`, value);
  }
  function invalidate(clearOptions = true) {
    requests.invalidate(); setTesting(null); setDiscovering(''); setTestStale({ team: true, personal: true }); setNotice('');
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
    setPersonalEnabled(false); setPersonalValues({}); setPersonalIntent('replace'); setPersonalBaseline(personalDraftFor()); setError('');
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
  async function savePersonal() {
    try {
      if (!instance) throw new Error('请先保存连接，再保存个人账号。');
      if (personalEnabled) {
        const current = ensureEntry();
        if (targetDraftChanged(current, config, instance)) throw new Error('连接地址尚有未保存变化，请先保存连接。');
        validateFields(current.definition.authentication.fields, personalValues);
      }
      invalidate(false); setSaving('personal'); setError('');
      const response = await client.savePersonal(instance.id, { intent: personalEnabled ? 'replace' : 'remove', ...(personalEnabled ? { values: personalValues } : {}), expected: observed.personal });
      if (mounted.current) {
        const savedDraft = personalDraftFor(response.instance);
        setFieldLabels(previous => fieldLabelsAfterRead(entry?.definition.config.fields || [], config, previous, instance.fieldLabels, response.instance.fieldLabels));
        setInstance(response.instance); setPersonalValues(savedDraft.values); setPersonalBaseline(savedDraft);
        setObserved(previous => afterPersonalSave(previous, response.instance));
        setPersonalEnabled(savedDraft.enabled); setPersonalIntent(savedDraft.intent);
        setConflict(false); setNotice(personalEnabled ? '个人账号已保存，仅本机使用。' : '个人账号已移除，后续使用团队账号。'); onSaved(response.instance);
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
  async function runHook(hook?: string, source: 'team' | 'personal' = 'team') {
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
    instance, entry, definitionKey, name, environment, enabled, config, fieldLabels: visibleLabels, teamIntent, teamValues, personalEnabled, personalIntent, personalValues,
    saving, testing, discovering, testResult: testResults.team, testStale: testStale.team, personalTestResult: testResults.personal, personalTestStale: testStale.personal, options, discoveryResults, error, notice, conflict, reading, programCheck, checking,
    disabled, ready: hooksAvailable(entry, instance, programCheck, disabled), hookReady(hook: string) { return hooksAvailable(entry, instance, programCheck, disabled, hook); }, chooseDefinition, saveTeam, savePersonal, reread, checkProgram, runHook, changeTeamIntent,
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
    changePersonal(key: string, value: unknown) { invalidate(); rememberSecret('personal', key, value); setPersonalIntent('replace'); setPersonalValues(previous => withFieldValue(previous, key, value)); },
    replacePersonal() { invalidate(); setPersonalIntent('replace'); setPersonalValues(fieldDefaults(entry?.definition.authentication.fields || [])); },
    close() { invalidate(); },
  };
}
