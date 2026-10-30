import { pathToFileURL } from 'node:url';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONNECTION_AUTHORIZATION_PROTOCOL, validateConfig, validateAuthentication, type AuthenticationSource, type ConnectionBinding, type ConnectionDefinition } from '../domain/definition.ts';
import { assertRevision, diagnostic, failure, identifier, object, text, type AuthenticationGroup, type ConnectionInstance, type ConnectionScope, type Expected, type Values } from '../domain/instance.ts';
import { normalizeHookOutput } from '../domain/hook-result.ts';
import { publicFieldLabels, validatedFieldLabels } from '../domain/field-labels.ts';
import { ConnectionFiles, digest } from '../persistence/files.ts';
import { ConnectionDirectoryReads } from './directory-reads.ts';
import { createConnectionCatalog, type ConnectionCatalogEntry, type ConnectionCatalogResult } from './catalog.ts';
import { checkProgram, programRecipient, resolveProgram, runProgram } from '../infrastructure/program.ts';
import { runAuthorizationProgram } from '../infrastructure/authorization-program.ts';
import { BrowserAuthorization } from '../../browser-authorization/application/browser-authorization-application.ts';

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
  async browserProfiles(root: string, action: string, input: Record<string, unknown> = {}) {
    if (Object.keys(input).some(key => !['id', 'expectedRevision', 'directory', 'confirmSharedReset'].includes(key))) throw failure('browser_authorization_input_invalid', '共享配置输入包含未知字段。', 400);
    const browser = new BrowserAuthorization(this.resolveScope(root).rootPath), profiles = browser.profiles;
    if (action === 'list') return profiles.list();
    if (typeof input.id !== 'string') throw failure('browser_authorization_profile_invalid', '必须提供准确浏览器配置编号。', 400);
    if (action === 'inspect') return browser.inspect(input.id);
    if (typeof input.expectedRevision !== 'string') throw failure('browser_authorization_revision_required', '必须提供当前浏览器配置观察版本。', 400);
    if (action === 'create') return profiles.create(input.id, input.expectedRevision);
    if (action === 'adopt' && typeof input.directory === 'string') return profiles.create(input.id, input.expectedRevision, input.directory);
    if (action === 'reset' && input.confirmSharedReset === true) return profiles.reset(input.id, input.expectedRevision);
    throw failure('browser_authorization_input_invalid', '未知动作；接管须提供目录，重置须明确confirmSharedReset。', 400);
  }
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
  private assertSource(entry: ConnectionCatalogEntry, source: AuthenticationSource): void {
    if (!(entry.definition.authentication.allowedSources ?? ['team', 'personal']).includes(source)) throw failure('connection_skill_auth_source_denied', source === 'team' ? '此接入只允许本机个人认证，不使用或保存团队认证。' : '此接入不允许个人认证。');
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
        if (entry.definition.authentication.authorization && entry.definition.authentication.authorization.accountLabelField !== field.key) continue;
        try { Object.assign(values, validateConfig([field], { [field.key]: group.values[field.key] })); } catch { /* Invalid source values are never projected as arbitrary public objects. */ }
      }
      return { configured: group !== null && !error, values, diagnostic: error };
    };
    const diagnostics = resolved.diagnostics.map(item => item.message);
    if (observationDiagnostic) diagnostics.push(observationDiagnostic);
    let publicConfig: Values = {};
    if (entry) try { publicConfig = validateConfig(entry.definition.config.fields, instance.config); } catch (cause) { diagnostics.push(diagnostic(cause)); }
    const teamAuthentication = { present: instance.authentication !== null, ...summary(instance.authentication) }, personalAuthentication = { present: local.present, ...summary(local.group, local.diagnostic) };
    if (entry) {
      if (instance.authentication) try { this.assertSource(entry, 'team'); } catch (cause) { teamAuthentication.configured = false; teamAuthentication.diagnostic = diagnostic(cause); }
      if (local.present) try { this.assertSource(entry, 'personal'); } catch (cause) { personalAuthentication.configured = false; personalAuthentication.diagnostic = diagnostic(cause); }
    }
    const secretFields = entry?.definition.authentication.fields.filter(field => field.type === 'secret') || [];
    const secrets = secretFields.flatMap(field => [instance.authentication?.values[field.key], local.group?.values[field.key]]).filter((value): value is string => typeof value === 'string');
    if (entry?.definition.authentication.authorization) for (const group of [teamAuthentication, personalAuthentication]) for (const [key, value] of Object.entries(group.values)) {
      if (secrets.some(secret => secret && String(value).includes(secret))) delete group.values[key];
    }
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
      authentication: { source: local.present || entry?.definition.authentication.allowedSources?.every(source => source === 'personal') ? 'personal' as const : 'team' as const, team: teamAuthentication, personal: personalAuthentication },
      availability: { ready: diagnostics.length === 0, diagnostics }, programAvailability, definition: entry, websiteUrl };
  }
  list(root: string) {
    return this.listObserved(this.resolveScope(root));
  }
  private readonly directoryReads = new ConnectionDirectoryReads();
  close(): void { this.directoryReads.close(); }
  invalidateDirectoryReads(root: string): void {
    try { this.directoryReads.invalidate(this.resolveScope(root)); }
    catch { this.directoryReads.invalidate(); }
  }
  directory(root: string) {
    const scope = this.resolveScope(root);
    return this.directoryObserved(scope, this.catalog.list(scope.rootPath));
  }
  async directoryAsync(root: string, load: (root: string, signal: AbortSignal) => Promise<ConnectionCatalogResult>) {
    const scope = this.resolveScope(root), before = fs.lstatSync(scope.rootPath);
    const identity = `${before.dev}:${before.ino}`;
    const catalog = await this.directoryReads.read(scope, identity, signal => load(scope.rootPath, signal));
    const current = this.resolveScope(root), after = fs.lstatSync(current.rootPath);
    if (current.rootPath !== scope.rootPath || current.workspaceId !== scope.workspaceId || after.dev !== before.dev || after.ino !== before.ino) {
      throw failure('connection_skill_context_changed', '目录读取期间工作空间来源已变化。', 409);
    }
    return this.directoryObserved(current, catalog);
  }
  private directoryObserved(scope: ConnectionScope, catalog: ConnectionCatalogResult) {
    const observation: ConnectionObservation = { catalog, programs: new Map() };
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
      if (intent.intent === 'replace') { this.assertSource(entry, 'team'); value.authentication = { targetBinding: this.target(scope, value, entry, validateAuthentication(entry.definition.authentication.fields, intent.values)), values: validateAuthentication(entry.definition.authentication.fields, intent.values) }; }
      else if (intent.intent === 'keep') {
        value.authentication = before.value?.authentication ?? null;
        if (value.authentication) { this.assertSource(entry, 'team'); this.group(scope, value, entry, value.authentication); }
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
      else if (input.intent === 'replace' && entry) { this.assertSource(entry, 'personal'); group = { targetBinding: this.target(scope, team.value, entry, validateAuthentication(entry.definition.authentication.fields, input.values)), values: validateAuthentication(entry.definition.authentication.fields, input.values) }; }
      else throw failure('connection_skill_auth_intent_invalid', '个人认证必须明确整组替换或移除。', 400);
      assertRevision(this.files.readTeam(scope, id).revision, expected.teamRevision);
      const currentObservation = this.observe(scope);
      if (input.intent === 'remove') assertRevision(this.catalog.resolve(scope.rootPath, team.value.binding, currentObservation.catalog).definition?.revision || 'absent', expected.definitionRevision);
      else this.entry(scope, team.value.binding, expected.definitionRevision, true, currentObservation);
      this.files.writeLocal(scope, id, group, expected.localRevision!);
      return this.getObserved(scope, id, currentObservation);
    });
  }
  async authorize(root: string, id: string, raw: unknown, options: { signal?: AbortSignal } = {}) {
    const scope = this.resolveScope(root), input = object(raw), expected = object(input.expected) as Expected;
    if (Object.keys(input).some(key => !['expected', 'browserMode'].includes(key)) || Object.keys(expected).some(key => !['teamRevision', 'localRevision', 'definitionRevision'].includes(key))) throw failure('connection_skill_authorization_input_invalid', '授权只接收准确的三项当前观察及可选browserMode。', 400);
    if (input.browserMode !== undefined && !['headless', 'interactive'].includes(input.browserMode as string)) throw failure('connection_skill_authorization_input_invalid', 'browserMode必须为headless或interactive。', 400);
    identifier(id); requireDefinitionObservation(expected);
    if (typeof expected.teamRevision !== 'string' || typeof expected.localRevision !== 'string') throw failure('connection_skill_revision_required', '授权必须提供连接和本机个人认证的当前观察。', 400);
    const initial = this.observedAuthentication(scope, id, expected), authorization = initial.entry.definition.authentication.authorization;
    if (!authorization) throw failure('connection_skill_authorization_unavailable', '此接入未声明个人授权程序。', 404);
    if (!initial.instance.enabled || !initial.entry.enabled) throw failure('connection_skill_disabled', '此连接已停用。');
    this.assertSource(initial.entry, 'personal');
    const requiredFields = new Set([...initial.entry.definition.authentication.targetFields, ...(authorization.inputs || []).map(reference => reference.slice('config.'.length))]);
    const config = validateConfig(initial.entry.definition.config.fields, initial.instance.config, { requiredFields });
    const program = resolveProgram(scope.rootPath, initial.entry, authorization.program), checked = checkProgram(program);
    if (!checked.ready) throw failure('connection_skill_dependency_version', checked.diagnostics.join(' '));
    const reobserve = () => {
      if (options.signal?.aborted) throw failure('connection_skill_authorization_cancelled', '本次授权已取消；未替换个人认证。');
      const currentScope = this.resolveScope(root);
      if (currentScope.rootPath !== scope.rootPath || currentScope.workspaceId !== scope.workspaceId) throw failure('connection_skill_context_changed', '工作空间身份已变化；未替换个人认证。');
      const current = this.observedAuthentication(scope, id, expected);
      if (!current.instance.enabled || !current.entry.enabled) throw failure('connection_skill_disabled', '此连接已停用；未替换个人认证。');
      if (resolveProgram(scope.rootPath, current.entry, authorization.program).identity !== program.identity) throw failure('connection_skill_program_changed', '授权程序已变化；未替换个人认证。');
      return current;
    };
    reobserve();
    const directory = fs.mkdtempSync(path.join(this.files.privateState(scope, initial.entry.skill.assetIdentity), 'authorization-'));
    fs.chmodSync(directory, 0o700);
    const directoryIdentity = fs.lstatSync(directory);
    const context = {
      protocolVersion: CONNECTION_AUTHORIZATION_PROTOCOL, callId: crypto.randomUUID(), workspace: { id: scope.workspaceId, root: scope.rootPath },
      definition: { skillAssetIdentity: initial.entry.skill.assetIdentity, definitionId: initial.entry.definition.definitionId, revision: initial.entry.revision },
      connection: { id, config, revisions: { teamRevision: expected.teamRevision, localRevision: expected.localRevision, definitionRevision: expected.definitionRevision } }, privateStateRoot: directory,
    };
    let response: { status: 'success'; instance: ReturnType<ConnectionSkillsApplication['get']>['instance']; accountLabel?: string; warnings?: string[] } | undefined;
    let authorizationError: unknown;
    let browser: Awaited<ReturnType<BrowserAuthorization['acquire']>> | undefined;
    try {
      if (authorization.browserProfile) browser = await new BrowserAuthorization(scope.rootPath).acquire(authorization.browserProfile, options.signal, input.browserMode as 'headless' | 'interactive' | undefined);
      const rawValues = await runAuthorizationProgram(program, authorization.args || [], {
        ...context, ...(browser ? { browser: { protocolVersion: 'buildr.browser-authorization/v1', profileId: authorization.browserProfile, mode: browser.mode, clientModule: pathToFileURL(resolveProductResource('browser-authorization/client.mjs', { developmentFallback: 'resources/browser-authorization/client.mjs' })).href } } : {}),
      }, { signal: options.signal, timeoutMs: authorization.timeoutMs ?? 180_000, browser });
      let values: Values;
      try { values = validateAuthentication(initial.entry.definition.authentication.fields, rawValues); }
      catch { throw failure('connection_skill_authorization_result_invalid', '授权程序未返回声明要求的完整认证组；未替换个人认证。'); }
      response = this.files.lock(scope, id, () => {
        const current = reobserve();
        const group = { targetBinding: this.target(scope, current.instance, current.entry, values), values };
        try { this.files.writeLocal(scope, id, group, expected.localRevision!); }
        catch (cause) {
          const saved = this.files.readLocal(scope, id), observed = !saved.diagnostic && saved.group && digest(saved.group) === digest(group);
          throw Object.assign(failure('connection_skill_authorization_persistence_unconfirmed', '个人认证保存结果尚待核验，请重新读取当前状态；不要自动再次授权。'), { details: { authenticationSaved: observed ? 'observed' : 'unknown', durability: 'unconfirmed' } });
        }
        const view = this.getObserved(scope, id).instance;
        const label = authorization.accountLabelField ? view.authentication.personal.values[authorization.accountLabelField] : undefined;
        return { status: 'success' as const, instance: view, ...(typeof label === 'string' || typeof label === 'number' || typeof label === 'boolean' ? { accountLabel: String(label) } : {}) };
      });
      return response;
    } catch (cause) {
      authorizationError = cause;
      throw cause;
    } finally {
      if (browser) try { await browser.close(); } catch {
        if (response) (response.warnings ??= []).push('本次浏览器使用权释放尚未确认；共享配置保留，已保存认证事实不变。');
      }
      let cleaned = false;
      try {
        const current = fs.lstatSync(directory, { throwIfNoEntry: false });
        if (!current) cleaned = true;
        else if (current.isDirectory() && !current.isSymbolicLink() && current.dev === directoryIdentity.dev && current.ino === directoryIdentity.ino) { fs.rmSync(directory, { recursive: true }); cleaned = true; }
      } catch { /* Retain changed or in-use state, never remove an unverified path. */ }
      if (!cleaned && response) (response.warnings ??= []).push('本次授权临时目录尚未清理；已保存个人认证的事实保持，需核对本机浏览器是否退出。');
      if (!cleaned && authorizationError && typeof authorizationError === 'object') Object.assign(authorizationError, { details: { ...('details' in authorizationError && typeof authorizationError.details === 'object' ? authorizationError.details : {}), cleanup: 'unconfirmed' } });
    }
  }
  private observedAuthentication(scope: ConnectionScope, id: string, expected: Expected, allowConfigMigration = false) {
    object(expected); requireDefinitionObservation(expected);
    const saved = this.files.readTeam(scope, identifier(id)); assertRevision(saved.revision, expected.teamRevision);
    if (!saved.value) throw failure('connection_skill_not_found', '当前实例不存在。', 404);
    const resolved = this.catalog.resolve(scope.rootPath, saved.value.binding);
    const entry = allowConfigMigration && resolved.definition && resolved.diagnostics.every(item => item.code === 'connection_config_incompatible')
      ? resolved.definition : this.entry(scope, saved.value.binding, expected.definitionRevision, true);
    assertRevision(entry.revision, expected.definitionRevision);
    const local = this.files.readLocal(scope, id); assertRevision(local.revision, expected.localRevision);
    if (local.diagnostic) throw failure('connection_skill_auth_unavailable', local.diagnostic);
    return { saved, instance: saved.value, entry, local };
  }
  /** An explicit local UI action; regular observations never return secret values. */
  revealPersonal(root: string, id: string, raw: unknown) {
    const scope = this.resolveScope(root), input = object(raw);
    return this.files.lock(scope, identifier(id), () => {
      const current = this.observedAuthentication(scope, id, object(input.expected) as Expected);
      this.assertSource(current.entry, 'personal');
      if (current.entry.definition.authentication.authorization) throw failure('connection_skill_secret_field_invalid', '此接入使用受保护授权，不公开内部认证字段。', 400);
      const field = current.entry.definition.authentication.fields.find(field => field.key === input.field && field.type === 'secret');
      if (!field) throw failure('connection_skill_secret_field_invalid', '只能明确查看当前声明中的一个个人秘密字段。', 400);
      if (!current.local.present) throw failure('connection_skill_auth_missing', '当前本机尚未保存个人认证。');
      const values = this.group(scope, current.instance, current.entry, current.local.group);
      if (typeof values[field.key] !== 'string') throw failure('connection_skill_auth_missing', '该个人秘密字段尚未保存。');
      return { field: field.key, value: values[field.key] as string };
    });
  }
  relocateAuth(root: string, id: string, raw: unknown) {
    const scope = this.resolveScope(root), input = object(raw);
    return this.files.lock(scope, identifier(id), () => {
      const current = this.observedAuthentication(scope, id, object(input.expected) as Expected);
      this.files.relocateLocal(scope, id, current.local.revision);
      return { relocated: true, ...this.getObserved(scope, id) };
    });
  }
  /** Rebinds one complete group locally without returning it through a public channel. */
  migrateAuth(root: string, id: string, raw: unknown) {
    const scope = this.resolveScope(root), input = object(raw), source = object(input.source);
    const sourceId = identifier(source.id); identifier(id);
    if (!['team', 'personal'].includes(String(source.authenticationSource)) || typeof input.removeSource !== 'boolean') throw failure('connection_skill_auth_migration_invalid', '迁移须明确来源认证组及是否移除来源。', 400);
    if (sourceId === id && source.authenticationSource === 'personal') throw failure('connection_skill_auth_migration_invalid', '同一实例的个人认证无需跨实例迁移。', 400);
    const ids = [...new Set([id, sourceId])].sort();
    const locked = (position: number): ReturnType<ConnectionSkillsApplication['get']> & { migrated: true; sourceRemoved: boolean } => position < ids.length
      ? this.files.lock(scope, ids[position]!, () => locked(position + 1))
      : migrate();
    const migrate = () => {
      const target = this.observedAuthentication(scope, id, object(input.expected) as Expected);
      const original = this.observedAuthentication(scope, sourceId, object(source.expected) as Expected, true);
      this.assertSource(target.entry, 'personal');
      const originalGroup = source.authenticationSource === 'personal' ? original.local.group : original.instance.authentication;
      const values = this.group(scope, original.instance, original.entry, originalGroup);
      // Account identity and recipient must agree; environment labels are not credentials.
      const sameSource = (['skillAssetIdentity', 'definitionId', 'sourceIdentity'] as const).every(key => original.instance.binding[key] === target.instance.binding[key]);
      if (!sameSource || this.target(scope, { ...original.instance, id, binding: target.instance.binding }, original.entry, values) !== this.target(scope, target.instance, target.entry, values)) throw failure('connection_skill_auth_migration_target', '来源与目标的绑定、认证接收方或账号字段不一致；未迁移。');
      const group = { targetBinding: this.target(scope, target.instance, target.entry, values), values };
      if (target.local.present && digest(target.local.group) !== digest(group)) throw failure('connection_skill_auth_migration_conflict', '目标已有不同个人认证；未覆盖或移除来源。');
      if (!target.local.present) this.files.writeLocal(scope, id, group, target.local.revision);
      else this.files.relocateLocal(scope, id, target.local.revision);
      if (input.removeSource) {
        // Local preservation happens first; a later conflict retains the source for recovery.
        try {
          assertRevision(this.files.readTeam(scope, id).revision, target.saved.revision);
          const preserved = this.files.readLocal(scope, id);
          if (preserved.diagnostic || digest(preserved.group) !== digest(group)) throw failure('connection_skill_auth_migration_conflict', '目标个人认证在来源移除前已变化；来源保留。');
          assertRevision(this.files.readTeam(scope, sourceId).revision, original.saved.revision);
          if (source.authenticationSource === 'personal') this.files.writeLocal(scope, sourceId, null, original.local.revision);
          else {
            const secrets = original.entry.definition.authentication.fields.filter(field => field.type === 'secret').map(field => values[field.key]).filter((value): value is string => typeof value === 'string');
            const fieldLabels = publicFieldLabels(original.entry.definition.config.fields, original.instance.config, original.instance.fieldLabels, secrets);
            this.files.writeTeam(scope, { ...original.instance, fieldLabels, authentication: null }, original.saved.revision, original.entry.definition.systemId ?? original.entry.definition.definitionId);
          }
        } catch {
          throw Object.assign(failure('connection_skill_auth_migration_partial', '目标本机个人认证已持久保全，但来源移除尚未确认；请重新读取两者核对，不重复迁移。'), { details: { targetPreserved: true, durability: 'confirmed', targetId: id, sourceId, sourceRemoval: 'unresolved' } });
        }
      }
      return { migrated: true as const, sourceRemoved: input.removeSource as boolean, ...this.getObserved(scope, id) };
    };
    return locked(0);
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
    const source = local.present ? 'personal' as const : 'team' as const;
    if (!local.present && entry.definition.authentication.allowedSources?.every(source => source === 'personal')) throw failure('connection_skill_auth_missing', '此接入需要当前本机的个人认证，请先保存完整账号。');
    this.assertSource(entry, source);
    const values = this.group(scope, { ...instance, config }, entry, local.present ? local.group : instance.authentication);
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
    if (program.declaration.contextProtocol === CONNECTION_AUTHORIZATION_PROTOCOL) throw failure('connection_skill_program_protocol', '授权专用程序不能接收普通连接认证，请使用明确的授权入口。', 400);
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
  async hook(root: string, raw: unknown, kind: 'test' | 'discover'): Promise<Record<string, unknown> & { status: string; checks: unknown[]; observedAt: string; diagnostics: unknown[]; limitations: unknown[]; authenticationSource: string }> {
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
    this.assertSource(entry, source);
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
