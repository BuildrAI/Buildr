import crypto from 'node:crypto';
import { validateConfig, validateAuthentication, type ConnectionBinding, type ConnectionDefinition } from '../domain/definition.ts';
import { assertRevision, diagnostic, failure, identifier, object, text, type AuthenticationGroup, type ConnectionInstance, type ConnectionScope, type Expected, type Values } from '../domain/instance.ts';
import { normalizeHookOutput } from '../domain/hook-result.ts';
import { publicFieldLabels, validatedFieldLabels } from '../domain/field-labels.ts';
import { ConnectionFiles, digest } from '../persistence/files.ts';
import { createConnectionCatalog, type ConnectionCatalogEntry, type ConnectionCatalogResult } from './catalog.ts';
import { checkProgram, programRecipient, resolveProgram, runProgram } from '../infrastructure/program.ts';

type Catalog = ReturnType<typeof createConnectionCatalog>;
type ProgramAvailability = Record<string, { ready: boolean; diagnostics: string[] }>;
type ConnectionObservation = { catalog: ConnectionCatalogResult; programs: Map<ConnectionCatalogEntry, ProgramAvailability> };
function requireDefinitionObservation(expected: Expected): void {
  if (typeof expected.definitionRevision !== 'string' || !expected.definitionRevision) throw failure('connection_skill_revision_required', '必须提供已观察的接入声明版本。', 400);
}
type AuthIntent = { intent: 'keep' | 'replace' | 'remove'; values?: Values };
type TeamInput = { id?: string; name: string; environment?: string; enabled?: boolean; binding: ConnectionBinding; config: Values; fieldLabels?: unknown; authentication: AuthIntent; expected: Expected };
function publicWebsite(definition: ConnectionDefinition | undefined, config: Values): string | null {
  const presentation = definition?.presentation;
  const valueFor = (key: string | undefined) => key ? Object.hasOwn(config, key) ? config[key] : definition?.config.fields.find(field => field.key === key)?.default : undefined;
  const primary = valueFor(presentation?.websiteField);
  const key = primary === undefined || typeof primary === 'string' && !primary.trim() ? presentation?.websiteFallbackField : presentation?.websiteField;
  const field = definition?.config.fields.find(field => field.key === key);
  if (!key || field?.type !== 'url') return null;
  try {
    const value = validateConfig([field], { [key]: valueFor(key) })[key];
    return typeof value === 'string' ? value : null;
  } catch { return null; }
}
export class ConnectionSkillsApplication {
  readonly files: ConnectionFiles;
  readonly catalog: Catalog;
  readonly resolveScope: (root: string) => ConnectionScope;
  private readonly retire: (scope: ConnectionScope) => string[];
  constructor(options: { dataRoot: string; catalog: Catalog; resolveScope(root: string): ConnectionScope; retire?(scope: ConnectionScope): string[] }) { this.retire = options.retire || (() => []); this.files = new ConnectionFiles(options.dataRoot); this.catalog = options.catalog; this.resolveScope = options.resolveScope; }
  definitions(root: string) { return this.catalog.list(this.resolveScope(root).rootPath); }
  impacts(root: string, assetIdentity: string) {
    const instances: Array<{ id: string; name: string; sourcePath: string; definitionId: string; sourceIdentity: string }> = [], diagnostics: string[] = [];
    try {
      const scope = this.resolveScope(root);
      const team = this.files.listTeam(scope);
      for (const saved of team.instances) { const entry = saved.value; if (entry.binding.skillAssetIdentity === assetIdentity) instances.push({ id: entry.id, name: entry.name, sourcePath: saved.sourcePath, definitionId: entry.binding.definitionId, sourceIdentity: entry.binding.sourceIdentity }); }
      if (team.diagnostics.length) diagnostics.push('某项连接实例无法读取，影响范围未完整核实；实例和认证保留。');
    } catch { diagnostics.push('连接实例影响当前不可读取；源资产操作仍可继续。'); }
    return { instances, diagnostics };
  }
  private observe(scope: ConnectionScope): ConnectionObservation { return { catalog: this.catalog.list(scope.rootPath), programs: new Map() }; }
  private entry(scope: ConnectionScope, binding: ConnectionBinding, expected?: string, allowDisabled = false, observation?: ConnectionObservation): ConnectionCatalogEntry {
    object(binding);
    if (Object.keys(binding).some(key => !['skillAssetIdentity', 'definitionId', 'sourceIdentity', 'configVersion'].includes(key)) || !['skillAssetIdentity', 'definitionId', 'sourceIdentity'].every(key => typeof (binding as unknown as Values)[key] === 'string')) throw failure('connection_skill_binding_invalid', '连接绑定格式无效。', 400);
    const resolved = this.catalog.resolve(scope.rootPath, binding, observation?.catalog);
    if ((!resolved.available && !(allowDisabled && resolved.diagnostics.length > 0 && resolved.diagnostics.every(item => item.code === 'connection_skill_disabled'))) || !resolved.definition) throw failure('connection_skill_definition_unavailable', resolved.diagnostics.map(item => item.message).join(' '));
    if (expected !== undefined) try { assertRevision(resolved.definition.revision, expected); }
    catch (cause) {
      if ((cause as { code?: string }).code === 'connection_skill_revision_conflict') throw failure('connection_skill_revision_conflict', '接入声明或本机程序接收方已变化，请重新读取并核对当前程序路径；未执行或覆盖内容。');
      throw cause;
    }
    return resolved.definition;
  }
  private target(scope: ConnectionScope, instance: Pick<ConnectionInstance, 'id' | 'binding' | 'config'>, entry: ConnectionCatalogEntry, authentication: Values = {}): string {
    return digest([instance.id, [instance.binding.skillAssetIdentity, instance.binding.definitionId, instance.binding.sourceIdentity, instance.binding.configVersion], [...entry.definition.authentication.targetFields].sort().map(key => {
      let value = instance.config[key] ?? null;
      if (entry.definition.config.fields.find(field => field.key === key)?.type === 'url' && typeof value === 'string') { const url = new URL(value); url.hash = ''; value = url.href; }
      return [key, value];
    }), programRecipient(scope.rootPath, entry), entry.definition.authentication.fields.filter(field => field.type !== 'secret').sort((a, b) => a.key.localeCompare(b.key)).map(field => [field.key, authentication[field.key] ?? null])]);
  }
  private group(scope: ConnectionScope, instance: ConnectionInstance, entry: ConnectionCatalogEntry, group: AuthenticationGroup | null): Values {
    if (entry.definition.authentication.fields.length === 0 && !group) return {};
    if (!group) throw failure('connection_skill_auth_missing', '所选认证组尚未配置。');
    if (group.targetBinding !== this.target(scope, instance, entry, group.values)) throw failure('connection_skill_auth_target_changed', '所选认证组绑定的目标或接收程序已变化，请重新录入该组；未回退其他来源。');
    return validateAuthentication(entry.definition.authentication.fields, group.values);
  }
  private public(scope: ConnectionScope, instance: ConnectionInstance, teamRevision: string, sourcePath: string, observationDiagnostic?: string, observation?: ConnectionObservation) {
    const resolved = this.catalog.resolve(scope.rootPath, instance.binding, observation?.catalog), entry = resolved.definition;
    const local = this.files.readLocal(scope, instance.id);
    const summary = (group: AuthenticationGroup | null, problem?: string | null) => {
      let error = problem || null;
      if (!error && entry && resolved.available) try { this.group(scope, instance, entry, group); } catch (cause) { error = diagnostic(cause); }
      const values: Values = {};
      if (entry && resolved.available && group && !error) for (const field of entry.definition.authentication.fields) {
        if (field.type === 'secret' || group.values[field.key] === undefined) continue;
        try { Object.assign(values, validateConfig([field], { [field.key]: group.values[field.key] })); } catch { /* Invalid source values are never projected as arbitrary public objects. */ }
      }
      return { configured: group !== null && !error, values, diagnostic: error };
    };
    const diagnostics = resolved.diagnostics.map(item => item.message);
    if (observationDiagnostic) diagnostics.push(observationDiagnostic);
    let publicConfig: Values = {};
    if (entry) try { publicConfig = validateConfig(entry.definition.config.fields, instance.config); } catch (cause) { diagnostics.push(diagnostic(cause)); }
    const teamAuthentication = summary(instance.authentication), personalAuthentication = { present: local.present, ...summary(local.group, local.diagnostic) };
    const secretFields = entry?.definition.authentication.fields.filter(field => field.type === 'secret') || [];
    const secrets = secretFields.flatMap(field => [instance.authentication?.values[field.key], local.group?.values[field.key]]).filter((value): value is string => typeof value === 'string');
    // An unavailable binding or invalid saved group cannot safely classify old label text.
    // Omit only optional display metadata; the authoritative instance remains readable.
    const labelsAvailable = resolved.available && (!instance.authentication || !teamAuthentication.diagnostic) && (!local.present || !personalAuthentication.diagnostic);
    const fieldLabels = entry && labelsAvailable ? publicFieldLabels(entry.definition.config.fields, publicConfig, instance.fieldLabels, secrets) : {};
    if (instance.category !== entry?.definition.category && entry) diagnostics.push('实例类别与绑定声明不一致。');
    let programAvailability: ProgramAvailability = entry && observation?.programs.get(entry) || {};
    if (entry && !observation?.programs.has(entry)) {
      programAvailability = Object.fromEntries(Object.keys(entry.definition.programs).map(id => {
        try { resolveProgram(scope.rootPath, entry, id); return [id, { ready: true, diagnostics: [] }]; }
        catch (cause) { return [id, { ready: false, diagnostics: [diagnostic(cause)] }]; }
      }));
      observation?.programs.set(entry, programAvailability);
    }
    if (!instance.enabled) diagnostics.push('实例已停用。');
    const definitionRevision = entry?.revision || 'absent';
    let revision = 'unavailable';
    try {
      assertRevision(teamRevision, teamRevision); assertRevision(local.revision, local.revision);
      revision = this.files.revision([teamRevision, local.revision, definitionRevision]);
    } catch {
      if (!observationDiagnostic) diagnostics.push('本机观察版本不可用；连接源内容已保留，需恢复本机观察能力后才能执行或修改。');
    }
    const websiteUrl = publicWebsite(entry?.definition, instance.config);
    return { ...instance, config: publicConfig, fieldLabels, sourcePath, revision, teamRevision, localRevision: local.revision, definitionRevision,
      authentication: { source: local.present ? 'personal' as const : 'team' as const, team: teamAuthentication, personal: personalAuthentication },
      availability: { ready: diagnostics.length === 0, diagnostics }, programAvailability, definition: entry, websiteUrl };
  }
  list(root: string) {
    return this.listObserved(this.resolveScope(root));
  }
  directory(root: string) {
    const scope = this.resolveScope(root), observation = this.observe(scope);
    const listing = this.listObserved(scope, observation);
    return { instances: listing.instances, definitions: observation.catalog.definitions, diagnostics: [...observation.catalog.diagnostics, ...listing.diagnostics] };
  }
  private listObserved(scope: ConnectionScope, observation?: ConnectionObservation) {
    const retirementDiagnostics = this.retire(scope);
    const instances: ReturnType<ConnectionSkillsApplication['public']>[] = [], diagnostics: { id?: string; sourcePath?: string; message: string }[] = retirementDiagnostics.map(message => ({ message }));
    let team: ReturnType<ConnectionFiles['listTeam']>; try { team = this.files.listTeam(scope); } catch (error) { return { instances, diagnostics: [...diagnostics, { message: diagnostic(error) }] }; }
    observation ||= this.observe(scope);
    diagnostics.push(...team.diagnostics);
    for (const saved of team.instances) try { instances.push(this.public(scope, saved.value, saved.revision, saved.sourcePath, saved.diagnostic, observation)); } catch (error) { diagnostics.push({ id: saved.value.id, sourcePath: saved.sourcePath, message: diagnostic(error) }); }
    return { instances, diagnostics };
  }
  private getObserved(scope: ConnectionScope, id: string, observation?: ConnectionObservation) {
    const team = this.files.readTeam(scope, identifier(id));
    if (!team.value) throw failure('connection_skill_not_found', '当前工作空间未配置此连接。', 404);
    return { instance: this.public(scope, team.value, team.revision, team.sourcePath, team.diagnostic, observation || this.observe(scope)) };
  }
  get(root: string, id: string) {
    const scope = this.resolveScope(root);
    return this.getObserved(scope, id);
  }
  save(root: string, id: string | null, raw: unknown) {
    const scope = this.resolveScope(root), input = object(raw) as unknown as TeamInput;
    const instanceId = identifier(id ?? input.id ?? 'connection-' + crypto.randomUUID()); object(input.expected); requireDefinitionObservation(input.expected);
    return this.files.lock(scope, instanceId, () => {
      const before = this.files.readTeam(scope, instanceId); assertRevision(before.revision, input.expected.teamRevision);
      if (id && !before.value) throw failure('connection_skill_not_found', '当前实例不存在。', 404);
      if (!id && before.value) throw failure('connection_skill_already_exists', '连接编号已存在。');
      const entry = this.entry(scope, input.binding, input.expected.definitionRevision, Boolean(id), this.observe(scope));
      if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw failure('connection_skill_input_invalid', '启用状态必须为布尔值。', 400);
      const value: ConnectionInstance = { schemaVersion: 'buildr.connection-instance/v1', id: instanceId, name: text(input.name), environment: typeof input.environment === 'string' ? input.environment.slice(0, 200) : '', enabled: input.enabled ?? true, category: entry.definition.category, binding: input.binding, config: validateConfig(entry.definition.config.fields, input.config), authentication: null };
      value.fieldLabels = input.fieldLabels === undefined
        ? before.value && entry.definition.authentication.targetFields.every(key => JSON.stringify(before.value!.config[key]) === JSON.stringify(value.config[key]))
          ? publicFieldLabels(entry.definition.config.fields, value.config, before.value.fieldLabels) : {}
        : validatedFieldLabels(entry.definition.config.fields, value.config, input.fieldLabels);
      const intent = object(input.authentication || { intent: 'keep' }) as AuthIntent;
      if (intent.intent === 'replace') value.authentication = { targetBinding: this.target(scope, value, entry, validateAuthentication(entry.definition.authentication.fields, intent.values)), values: validateAuthentication(entry.definition.authentication.fields, intent.values) };
      else if (intent.intent === 'keep') {
        value.authentication = before.value?.authentication ?? null;
        if (value.authentication) this.group(scope, value, entry, value.authentication);
      } else if (intent.intent !== 'remove') throw failure('connection_skill_auth_intent_invalid', '请选择保持、替换或移除认证。', 400);
      const labelSecrets = (group: AuthenticationGroup | null, previous = false): string[] => {
        if (!group) return [];
        if (previous) try { this.group(scope, before.value || value, entry, group); }
        catch { return Object.values(group.values).filter((item): item is string => typeof item === 'string'); }
        return entry.definition.authentication.fields.filter(field => field.type === 'secret').map(field => group.values[field.key]).filter((item): item is string => typeof item === 'string');
      };
      // Remove known private text from persisted display metadata before an account
      // can be rotated or removed. Personal saves still never change team files.
      value.fieldLabels = publicFieldLabels(entry.definition.config.fields, value.config, value.fieldLabels, [...labelSecrets(before.value?.authentication ?? null, true), ...labelSecrets(value.authentication), ...labelSecrets(this.files.readLocal(scope, instanceId).group, true)]);
      // Missing authentication and dependencies are allowed when saving; running still checks them.
      // A new observation is required at the write boundary; only the response reuses it.
      const currentObservation = this.observe(scope);
      this.entry(scope, input.binding, input.expected.definitionRevision, Boolean(id), currentObservation);
      this.files.writeTeam(scope, value, input.expected.teamRevision, entry.definition.systemId ?? entry.definition.definitionId);
      return this.getObserved(scope, instanceId, currentObservation);
    });
  }
  saveAuth(root: string, id: string, raw: unknown) {
    const scope = this.resolveScope(root), input = object(raw), expected = object(input.expected) as Expected; identifier(id); requireDefinitionObservation(expected);
    return this.files.lock(scope, id, () => {
      const team = this.files.readTeam(scope, id); assertRevision(team.revision, expected.teamRevision);
      if (!team.value) throw failure('connection_skill_not_found', '当前实例不存在。', 404);
      const entry = input.intent === 'remove' ? null : this.entry(scope, team.value.binding, expected.definitionRevision, true, this.observe(scope));
      let group: AuthenticationGroup | null;
      if (input.intent === 'remove') group = null;
      else if (input.intent === 'replace' && entry) group = { targetBinding: this.target(scope, team.value, entry, validateAuthentication(entry.definition.authentication.fields, input.values)), values: validateAuthentication(entry.definition.authentication.fields, input.values) };
      else throw failure('connection_skill_auth_intent_invalid', '个人认证必须明确整组替换或移除。', 400);
      assertRevision(this.files.readTeam(scope, id).revision, expected.teamRevision);
      const currentObservation = this.observe(scope);
      if (input.intent === 'remove') assertRevision(this.catalog.resolve(scope.rootPath, team.value.binding, currentObservation.catalog).definition?.revision || 'absent', expected.definitionRevision);
      else this.entry(scope, team.value.binding, expected.definitionRevision, true, currentObservation);
      this.files.writeLocal(scope, id, group, expected.localRevision!);
      return this.getObserved(scope, id, currentObservation);
    });
  }
  remove(root: string, id: string, raw: unknown) {
    const scope = this.resolveScope(root), input = object(raw), expected = object(input.expected) as Expected;
    return this.files.lock(scope, id, () => { this.files.removeTeam(scope, id, expected.teamRevision); return { removed: true }; });
  }
  private selected(scope: ConnectionScope, id: string, revision?: string, observation?: ConnectionObservation) {
    const team = this.files.readTeam(scope, id); if (!team.value) throw failure('connection_skill_not_found', '当前实例不存在。', 404);
    observation ||= this.observe(scope);
    const instance = team.value, view = this.public(scope, instance, team.revision, team.sourcePath, team.diagnostic, observation);
    try { assertRevision(view.revision, revision ?? view.revision); }
    catch (cause) {
      if ((cause as { code?: string }).code === 'connection_skill_revision_conflict') throw failure('connection_skill_revision_conflict', '连接配置、认证、接入声明或本机程序接收方已变化，请重新读取并核对当前程序路径；未执行。');
      throw cause;
    }
    if (!instance.enabled) throw failure('connection_skill_disabled', '此连接已停用。');
    const entry = this.entry(scope, instance.binding, undefined, false, observation);
    if (instance.category !== entry.definition.category) throw failure('connection_skill_category_changed', '实例类别与声明不一致。');
    const config = validateConfig(entry.definition.config.fields, instance.config);
    const local = this.files.readLocal(scope, id);
    if (local.present && local.diagnostic) throw failure('connection_skill_auth_unavailable', local.diagnostic);
    assertRevision(local.revision, view.localRevision);
    const source = local.present ? 'personal' as const : 'team' as const, values = this.group(scope, { ...instance, config }, entry, local.present ? local.group : instance.authentication);
    return { entry, context: { id, revision: view.revision, revisions: { teamRevision: view.teamRevision, localRevision: view.localRevision, definitionRevision: view.definitionRevision }, config, authentication: { source, values }, authenticationRevision: local.present ? local.revision : team.revision } };
  }
  /** Internal capability for installed builtins. Authentication never becomes a public response. */
  useSelected<T>(root: string, selection: { id: string; expectedRevision: string }, consume: (selected: {
    scope: ConnectionScope; skillId: string; binding: ConnectionBinding; definition: ConnectionDefinition;
    connection: { id: string; revision: string; config: Values; authentication: { source: 'personal' | 'team'; values: Values } };
  }) => T): T {
    if (typeof selection.expectedRevision !== 'string' || !selection.expectedRevision) throw failure('connection_skill_revision_required', '必须提供所观察的连接版本。', 400);
    const scope = this.resolveScope(root), selected = this.selected(scope, identifier(selection.id), selection.expectedRevision);
    const entry = selected.entry;
    return consume({ scope, skillId: entry.skill.id, definition: entry.definition,
      binding: { skillAssetIdentity: entry.skill.assetIdentity, definitionId: entry.definition.definitionId, sourceIdentity: entry.skill.sourceIdentity, configVersion: entry.definition.configVersion },
      connection: selected.context });
  }
  check(root: string, id: string, program = 'cli') {
    const scope = this.resolveScope(root), observation = this.observe(scope), view = this.getObserved(scope, id, observation).instance;
    const entry = this.entry(scope, view.binding, undefined, false, observation); const resolved = resolveProgram(scope.rootPath, entry, program);
    return { program, ...checkProgram(resolved), identity: resolved.identity, installHint: resolved.declaration.installHint || null };
  }
  async help(root: string, id: string, program = 'cli') {
    const scope = this.resolveScope(root), observation = this.observe(scope), view = this.getObserved(scope, id, observation).instance, entry = this.entry(scope, view.binding, undefined, false, observation), resolved = resolveProgram(scope.rootPath, entry, program);
    return runProgram(resolved, resolved.declaration.helpArgs || ['--help'], { timeoutMs: 5000 });
  }
  async run(root: string, options: { id: string; expectedRevision: string; program?: string; args: string[]; contexts?: Record<string, { id: string; revision: string }>; input?: string | Buffer; timeoutMs?: number }) {
    if (typeof options.expectedRevision !== 'string') throw failure('connection_skill_revision_required', '运行必须提供所观察的连接版本。', 400);
    const scope = this.resolveScope(root), observation = this.observe(scope), selected = this.selected(scope, identifier(options.id), options.expectedRevision, observation), programId = options.program || 'cli';
    const selections = { primary: selected, ...Object.fromEntries(Object.entries(options.contexts || {}).map(([name, value]) => {
      if (name === 'primary' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) throw failure('connection_skill_context_invalid', '上下文名称无效。', 400);
      object(value);
      if (typeof value.revision !== 'string' || !value.revision) throw failure('connection_skill_revision_required', '每个附加实例都必须提供所观察的版本。', 400);
      const other = this.selected(scope, identifier(value.id), value.revision, observation);
      if (other.entry.skill.assetIdentity !== selected.entry.skill.assetIdentity || other.entry.definition.definitionId !== selected.entry.definition.definitionId || other.entry.skill.sourceIdentity !== selected.entry.skill.sourceIdentity) throw failure('connection_skill_context_incompatible', '多个实例必须明确绑定同一接入程序来源。');
      return [name, other];
    })) };
    const program = resolveProgram(scope.rootPath, selected.entry, programId);
    const check = checkProgram(program); if (!check.ready) throw failure('connection_skill_dependency_version', check.diagnostics.join(' '));
    const context = { protocolVersion: 'buildr.connection-context/v1', callId: crypto.randomUUID(), workspace: { id: scope.workspaceId, root: scope.rootPath }, definition: { skillAssetIdentity: selected.entry.skill.assetIdentity, definitionId: selected.entry.definition.definitionId, revision: selected.entry.revision }, connections: Object.fromEntries(Object.entries(selections).map(([name, value]) => [name, value.context])), privateStateRoot: this.files.privateState(scope, selected.entry.skill.assetIdentity) };
    const revalidate = () => {
      const currentScope = this.resolveScope(root); if (currentScope.rootPath !== scope.rootPath || currentScope.workspaceId !== scope.workspaceId) throw failure('connection_skill_context_changed', '工作空间身份已变化。');
      const currentObservation = this.observe(scope);
      for (const item of Object.values(selections)) this.selected(scope, item.context.id, item.context.revision, currentObservation);
      const current = this.entry(scope, this.getObserved(scope, options.id, currentObservation).instance.binding, selected.entry.revision, false, currentObservation);
      if (resolveProgram(scope.rootPath, current, programId).identity !== program.identity) throw failure('connection_skill_program_changed', '执行程序已变化。');
    };
    revalidate();
    return runProgram(program, options.args, { context, input: options.input, timeoutMs: options.timeoutMs, secrets: Object.values(selections).flatMap(item => item.entry.definition.authentication.fields.filter(field => field.type === 'secret').map(field => item.context.authentication.values[field.key]).filter((value): value is string => typeof value === 'string')), revalidate });
  }
  async hook(root: string, raw: unknown, kind: 'test' | 'discover') {
    const scope = this.resolveScope(root), input = object(raw), expected = object(input.expected) as Expected, binding = object(input.binding) as unknown as ConnectionBinding;
    requireDefinitionObservation(expected);
    const entry = this.entry(scope, binding, expected.definitionRevision);
    const hookId = kind === 'test' ? 'test' : text(input.hook, 100), hook = entry.definition.hooks?.[hookId];
    if (!hook) throw failure('connection_skill_hook_missing', '此接入未提供所请求的只读槽位。', 404);
    // Discovery can precede required target selection. It still validates all supplied values,
    // and authentication remains a complete, target-bound group below.
    const discoveryInputs = kind === 'discover' ? hook.inputs : undefined;
    const config = validateConfig(entry.definition.config.fields, input.config, discoveryInputs !== undefined ? { requiredFields: new Set([...entry.definition.authentication.targetFields, ...discoveryInputs.filter(reference => reference.startsWith('config.')).map(reference => reference.slice('config.'.length))]) } : {});
    const authenticationInputs = new Set(discoveryInputs?.filter(reference => reference.startsWith('authentication.')).map(reference => reference.slice('authentication.'.length)));
    const id = input.id ? identifier(input.id) : 'draft-' + crypto.randomUUID();
    const saved = input.id ? this.files.readTeam(scope, id) : { value: null, revision: 'absent' };
    assertRevision(saved.revision, expected.teamRevision);
    const authentication = object(input.authentication), source = authentication.source;
    if (source !== 'team' && source !== 'personal') throw failure('connection_skill_auth_source_invalid', '请明确本次测试采用的完整认证组。', 400);
    const candidate: ConnectionInstance = { schemaVersion: 'buildr.connection-instance/v1', id, name: 'draft', enabled: true, environment: '', category: entry.definition.category, binding, config, authentication: null };
    let values: Values;
    if (authentication.intent === 'replace') values = validateAuthentication(entry.definition.authentication.fields, authentication.values);
    else if (authentication.intent === 'keep') {
      if (!saved.value) throw failure('connection_skill_auth_missing', '草稿没有可保持的认证组。');
      const local = this.files.readLocal(scope, id);
      if (source === 'personal') { assertRevision(local.revision, expected.localRevision); if (local.diagnostic) throw failure('connection_skill_auth_unavailable', local.diagnostic); }
      values = this.group(scope, candidate, entry, source === 'personal' ? local.group : saved.value.authentication);
    } else throw failure('connection_skill_auth_intent_invalid', '测试需选择保持或完整候选认证。', 400);
    if (authenticationInputs.size) values = validateConfig(entry.definition.authentication.fields, values, { requiredFields: authenticationInputs });
    const program = resolveProgram(scope.rootPath, entry, hook.program), checked = checkProgram(program); if (!checked.ready) throw failure('connection_skill_dependency_version', checked.diagnostics.join(' '));
    const context = { protocolVersion: 'buildr.connection-context/v1', callId: crypto.randomUUID(), workspace: { id: scope.workspaceId, root: scope.rootPath }, definition: { skillAssetIdentity: entry.skill.assetIdentity, definitionId: entry.definition.definitionId, revision: entry.revision }, connections: { primary: { id, revision: 'draft', config, authentication: { source, values }, authenticationRevision: 'draft' } }, privateStateRoot: this.files.privateState(scope, entry.skill.assetIdentity) };
    // A version probe may take time or change local files. Re-read before handing over credentials.
    const currentScope = this.resolveScope(root);
    if (currentScope.rootPath !== scope.rootPath || currentScope.workspaceId !== scope.workspaceId) throw failure('connection_skill_context_changed', '工作空间身份已变化。');
    const current = this.entry(scope, binding, expected.definitionRevision);
    if (resolveProgram(scope.rootPath, current, hook.program).identity !== program.identity) throw failure('connection_skill_program_changed', '执行程序已变化；未交接认证，请重新读取。');
    if (input.id) assertRevision(this.files.readTeam(scope, id).revision, expected.teamRevision);
    if (source === 'personal' && authentication.intent === 'keep') assertRevision(this.files.readLocal(scope, id).revision, expected.localRevision);
    let body: Values = {}, outputDiagnostic = '';
    const secrets = entry.definition.authentication.fields.filter(field => field.type === 'secret').map(field => values[field.key]).filter((value): value is string => typeof value === 'string');
    // Draft hooks never gain a write revalidation capability. Typed slot data is normalized
    // before display-only redaction can mutate its control fields or option identities.
    const result = await runProgram(program, hook.args, { context, secrets, timeoutMs: 30_000, consumeStdout: output => {
      try { body = normalizeHookOutput(JSON.parse(output), secrets); }
      catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'connection_skill_hook_result_invalid') outputDiagnostic = cause.message;
        // Malformed output does not prove a successful test.
      }
    } });
    const status = result.status !== 'exited' || body.status === 'unknown' ? 'unknown' : result.exitCode === 0 && body.status === 'success' ? 'success' : 'failure';
    return { ...body, status, checks: Array.isArray(body.checks) ? body.checks : [], observedAt: new Date().toISOString(), diagnostics: [...(Array.isArray(body.diagnostics) ? body.diagnostics : []), ...result.diagnostics, ...(!Object.keys(body).length ? [outputDiagnostic || '程序未返回有效的槽位结果。'] : [])], limitations: Array.isArray(body.limitations) ? body.limitations : [], authenticationSource: source };
  }
}
