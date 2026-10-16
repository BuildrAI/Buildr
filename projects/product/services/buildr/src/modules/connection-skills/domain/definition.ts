import YAML from 'yaml';

export const CONNECTION_DEFINITION_SCHEMA = 'buildr.connection-definition/v1';
export const CONNECTION_CONTEXT_PROTOCOL = 'buildr.connection-context/v1';
export const CONNECTION_AUTHORIZATION_PROTOCOL = 'buildr.connection-authorization-context/v1';
export type ConnectionValue = string | number | boolean | string[];
export type ConnectionValues = Record<string, ConnectionValue>;
export interface ConnectionDiagnostic { code: string; message: string; field?: string }
export interface ConnectionField {
  key: string; label: string; type: 'string' | 'url' | 'integer' | 'boolean' | 'enum' | 'select' | 'multiselect' | 'secret';
  required?: boolean; default?: ConnectionValue; values?: Array<string | number | boolean>;
  optionsFrom?: string; description?: string; group?: string;
  minLength?: number; maxLength?: number; minimum?: number; maximum?: number;
  dependsOn?: { field: string; equals: string | number | boolean };
}
export interface ConnectionDependency { executable: string; version?: { args: string[]; constraint: string }; installHint?: string }
export interface ConnectionProgram {
  kind: 'bundled' | 'installed'; runtime?: string; entry?: string; executable?: string;
  args?: string[]; helpArgs?: string[]; contextProtocol?: typeof CONNECTION_CONTEXT_PROTOCOL | typeof CONNECTION_AUTHORIZATION_PROTOCOL;
  version?: { args: string[]; constraint: string }; dependencies?: ConnectionDependency[]; installHint?: string;
}
export type ConnectionFieldReference = `config.${string}` | `authentication.${string}`;
export type AuthenticationSource = 'team' | 'personal';
export interface ConnectionAuthorization { program: string; args?: string[]; inputs?: `config.${string}`[]; label: string; reauthorizeLabel: string; timeoutMs?: number; accountLabelField?: string }
export interface ConnectionPresentationGroup { id: string; title: string; fields: ConnectionFieldReference[]; collapsed?: boolean }
export interface ConnectionHook { program: string; args: string[]; effect: 'read'; inputs?: ConnectionFieldReference[] }
export interface ConnectionDefinition {
  schemaVersion: typeof CONNECTION_DEFINITION_SCHEMA; definitionId: string; name: string; description: string;
  category: string; systemId?: string; configVersion: number;
  config: { fields: ConnectionField[] };
  authentication: { fields: ConnectionField[]; targetFields: string[]; allowedSources?: AuthenticationSource[]; authorization?: ConnectionAuthorization };
  programs: Record<string, ConnectionProgram>; hooks?: Record<string, ConnectionHook>;
  presentation?: { summaryFields: string[]; websiteField?: string; websiteFallbackField?: string; categoryLabel?: string; methodLabel?: string; groups?: ConnectionPresentationGroup[]; environment?: 'hidden' };
}
export interface ConnectionBinding { skillAssetIdentity: string; definitionId: string; sourceIdentity: string; configVersion: number }
export function connectionError(code: string, message: string, field?: string): Error & ConnectionDiagnostic & { status: number; statusCode: number } {
  return Object.assign(new Error(message), { code, message, ...(field ? { field } : {}), status: 409, statusCode: 409 });
}
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const key = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]*$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const command = (value: unknown) => typeof value === 'string' && /^[^\s/\\\0]+$/.test(value);
const scalar = (value: unknown) => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
function ensure(condition: unknown, field: string, message: string): asserts condition { if (!condition) throw connectionError('connection_definition_invalid', message, field); }
function closed(value: unknown, fields: string[], location: string): asserts value is Record<string, any> {
  ensure(object(value), location, `${location} 必须是对象。`);
  for (const name of Object.keys(value)) ensure(fields.includes(name), `${location}.${name}`, `${location} 包含不支持的字段。`);
}
function strings(value: unknown, field: string): asserts value is string[] { ensure(Array.isArray(value) && value.every(item => typeof item === 'string' && !item.includes('\0')), field, `${field} 必须是文本数组。`); }
export function safeConnectionRelativePath(value: unknown): string {
  ensure(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..'), 'path', '连接资源路径必须位于技能目录内。');
  ensure(['agents', 'assets', 'examples', 'references', 'scripts', 'templates'].includes(value.split('/')[0]!), 'path', '连接资源必须位于技能受支持的附件目录。');
  return value;
}
function fields(value: unknown, authentication: boolean): ConnectionField[] {
  ensure(Array.isArray(value) && value.length <= 100, 'fields', '字段声明必须是有界数组。');
  const seen = new Set<string>();
  for (const item of value) {
    closed(item, ['key', 'label', 'type', 'required', 'default', 'values', 'optionsFrom', 'description', 'group', 'minLength', 'maxLength', 'minimum', 'maximum', 'dependsOn'], 'field');
    ensure(key(item.key) && !seen.has(item.key), 'field.key', '字段编号非法或重复。'); seen.add(item.key);
    ensure(typeof item.label === 'string' && item.label.trim(), item.key, '字段名称不能为空。');
    ensure(['string', 'url', 'integer', 'boolean', 'enum', 'select', 'multiselect', 'secret'].includes(item.type), item.key, '字段类型不支持。');
    ensure(authentication || item.type !== 'secret', item.key, '秘密字段只能位于完整认证组。');
    ensure(item.type !== 'secret' || !Object.hasOwn(item, 'default'), item.key, '秘密字段不能提供默认值。');
    for (const name of ['description', 'group', 'optionsFrom']) if (item[name] !== undefined) ensure(typeof item[name] === 'string', item.key, '字段说明必须是文本。');
    if (item.required !== undefined) ensure(typeof item.required === 'boolean', item.key, '必填声明必须是布尔值。');
    for (const name of ['minLength', 'maxLength']) if (item[name] !== undefined) ensure(Number.isSafeInteger(item[name]) && item[name] >= 0, item.key, '长度约束必须是非负整数。');
    for (const name of ['minimum', 'maximum']) if (item[name] !== undefined) ensure(typeof item[name] === 'number' && Number.isFinite(item[name]), item.key, '数值约束必须是有限数值。');
    ensure(item.minLength === undefined || item.maxLength === undefined || item.minLength <= item.maxLength, item.key, '长度约束不兼容。');
    ensure(item.minimum === undefined || item.maximum === undefined || item.minimum <= item.maximum, item.key, '数值约束不兼容。');
    if (item.values !== undefined) ensure(Array.isArray(item.values) && item.values.length > 0 && item.values.every(scalar) && new Set(item.values).size === item.values.length, item.key, '固定选项必须是非空、不重复的文本、布尔值或有限数值。');
    if (item.values !== undefined && ['select', 'multiselect'].includes(item.type)) ensure(item.values.every((value: unknown) => typeof value === 'string'), item.key, '单选和多选的固定编号必须是文本。');
    ensure(item.type !== 'enum' || item.values, item.key, '固定枚举必须声明选项。');
    ensure(!item.optionsFrom || ['select', 'multiselect'].includes(item.type), item.key, '动态选项只适用于选择字段。');
    if (item.dependsOn !== undefined) {
      closed(item.dependsOn, ['field', 'equals'], `${item.key}.dependsOn`);
      ensure(key(item.dependsOn.field) && scalar(item.dependsOn.equals), item.key, '条件只支持文本、布尔值或有限数值的字段等值判断。');
    }
    if (Object.hasOwn(item, 'default')) normalizeField(item as ConnectionField, item.default);
  }
  for (const item of value) if (item.dependsOn) ensure(seen.has(item.dependsOn.field) && item.dependsOn.field !== item.key, item.key, '条件引用必须指向同组另一字段。');
  return value as ConnectionField[];
}
function dependency(value: unknown, location: string): void {
  closed(value, ['executable', 'version', 'installHint'], location);
  ensure(command(value.executable), location, '依赖必须使用明确的可执行名称。');
  if (value.installHint !== undefined) ensure(typeof value.installHint === 'string', location, '安装指引必须是文本。');
  if (value.version !== undefined) {
    closed(value.version, ['args', 'constraint'], `${location}.version`); strings(value.version.args, location);
    ensure(typeof value.version.constraint === 'string' && value.version.constraint.trim(), location, '版本约束不能为空。');
  }
}
export function parseConnectionDefinition(content: string): ConnectionDefinition {
  let value: any;
  try { value = YAML.parse(content, { uniqueKeys: true, maxAliasCount: 0 }); } catch { throw connectionError('connection_definition_invalid', '连接声明不是有效的 YAML。'); }
  closed(value, ['schemaVersion', 'definitionId', 'name', 'description', 'category', 'systemId', 'configVersion', 'config', 'authentication', 'programs', 'hooks', 'presentation'], 'definition');
  ensure(value.schemaVersion === CONNECTION_DEFINITION_SCHEMA, 'schemaVersion', '连接声明格式不支持。');
  ensure(key(value.definitionId), 'definitionId', '连接定义编号不合法。');
  for (const name of ['name', 'description', 'category']) ensure(typeof value[name] === 'string' && value[name].trim(), name, '连接名称、说明和类别不能为空。');
  if (value.systemId !== undefined) ensure(key(value.systemId), 'systemId', '系统名称编号不合法。');
  ensure(Number.isSafeInteger(value.configVersion) && value.configVersion > 0, 'configVersion', '配置版本必须是正整数。');
  closed(value.config, ['fields'], 'config'); value.config.fields = fields(value.config.fields, false);
  closed(value.authentication, ['fields', 'targetFields', 'allowedSources', 'authorization'], 'authentication'); value.authentication.fields = fields(value.authentication.fields, true);
  if (value.authentication.allowedSources !== undefined) {
    const sources = value.authentication.allowedSources;
    ensure(Array.isArray(sources) && sources.length > 0 && sources.length <= 2 && sources.every(source => ['team', 'personal'].includes(source)) && new Set(sources).size === sources.length, 'authentication.allowedSources', '认证来源必须为非空、不重复的 team/personal 数组。');
  }
  value.authentication.targetFields ??= []; strings(value.authentication.targetFields, 'authentication.targetFields');
  const configuration = new Map<string, ConnectionField>(value.config.fields.map((f: ConnectionField) => [f.key, f]));
  const fieldReferences = new Set([...value.config.fields.map((field: ConnectionField) => `config.${field.key}`), ...value.authentication.fields.map((field: ConnectionField) => `authentication.${field.key}`)]);
  const references = (input: unknown, location: string): void => {
    strings(input, location);
    ensure(input.length <= 200 && new Set(input).size === input.length && input.every(reference => fieldReferences.has(reference)), location, '字段引用必须有限、不重复且指向已声明的配置或认证字段。');
  };
  ensure(new Set(value.authentication.targetFields).size === value.authentication.targetFields.length && value.authentication.targetFields.every((name: string) => configuration.has(name)), 'authentication.targetFields', '认证目标字段必须引用配置字段且不重复。');
  ensure(object(value.programs) && Object.keys(value.programs).length > 0 && Object.keys(value.programs).length <= 32, 'programs', '必须声明有界的程序集合。');
  for (const [id, raw] of Object.entries(value.programs)) {
    ensure(key(id), 'programs', '程序编号不合法。');
    closed(raw, ['kind', 'runtime', 'entry', 'executable', 'args', 'helpArgs', 'contextProtocol', 'version', 'dependencies', 'installHint'], `programs.${id}`);
    ensure(['bundled', 'installed'].includes(raw.kind), id, '程序来源不支持。');
    if (raw.kind === 'bundled') { safeConnectionRelativePath(raw.entry); ensure(raw.runtime === undefined || command(raw.runtime), id, '程序运行时名称不合法。'); ensure(raw.executable === undefined, id, '随附程序不能同时声明独立程序。'); }
    else { ensure(command(raw.executable) && raw.entry === undefined && raw.runtime === undefined, id, '独立程序必须只声明可执行名称。'); }
    for (const name of ['args', 'helpArgs']) if (raw[name] !== undefined) strings(raw[name], id);
    ensure(raw.contextProtocol === undefined || raw.contextProtocol === CONNECTION_CONTEXT_PROTOCOL || raw.contextProtocol === CONNECTION_AUTHORIZATION_PROTOCOL, id, '上下文协议不支持。');
    if (raw.version !== undefined) dependency({ executable: raw.executable || raw.runtime || 'program', version: raw.version }, id);
    if (raw.installHint !== undefined) ensure(typeof raw.installHint === 'string', id, '安装指引必须是文本。');
    if (raw.dependencies !== undefined) { ensure(Array.isArray(raw.dependencies) && raw.dependencies.length <= 32, id, '程序依赖必须是有界数组。'); raw.dependencies.forEach((item: unknown) => dependency(item, id)); }
  }
  if (value.authentication.authorization !== undefined) {
    const authorization = value.authentication.authorization;
    closed(authorization, ['program', 'args', 'inputs', 'label', 'reauthorizeLabel', 'timeoutMs', 'accountLabelField'], 'authentication.authorization');
    ensure(value.authentication.allowedSources?.length === 1 && value.authentication.allowedSources[0] === 'personal', 'authentication.authorization', '授权程序只允许本机个人认证。');
    ensure(key(authorization.program) && Object.hasOwn(value.programs, authorization.program), 'authentication.authorization.program', '授权必须引用已声明程序。');
    const program = value.programs[authorization.program];
    ensure(program.contextProtocol === CONNECTION_AUTHORIZATION_PROTOCOL && (program.runtime === 'node' || program.kind === 'installed'), 'authentication.authorization.program', '授权程序必须明确使用受支持的私有授权上下文协议。');
    for (const name of ['label', 'reauthorizeLabel']) ensure(typeof authorization[name] === 'string' && authorization[name].trim() && authorization[name].length <= 200, `authentication.authorization.${name}`, '授权按钮名称必须是有界非空文本。');
    if (authorization.args !== undefined) strings(authorization.args, 'authentication.authorization.args');
    if (authorization.inputs !== undefined) {
      references(authorization.inputs, 'authentication.authorization.inputs');
      ensure(authorization.inputs.every((reference: string) => reference.startsWith('config.')), 'authentication.authorization.inputs', '授权前置项只能引用配置，不得请求旧认证。');
    }
    if (authorization.timeoutMs !== undefined) ensure(Number.isSafeInteger(authorization.timeoutMs) && authorization.timeoutMs >= 1000 && authorization.timeoutMs <= 300_000, 'authentication.authorization.timeoutMs', '授权等待须为 1000 到 300000 毫秒。');
    if (authorization.accountLabelField !== undefined) ensure(value.authentication.fields.some((field: ConnectionField) => field.key === authorization.accountLabelField && field.type !== 'secret'), 'authentication.authorization.accountLabelField', '账号展示只能引用已声明的非秘密认证字段。');
  }
  if (value.hooks !== undefined) {
    ensure(object(value.hooks) && Object.keys(value.hooks).length <= 32, 'hooks', '槽位必须是有界声明对象。');
    for (const [id, raw] of Object.entries(value.hooks)) { ensure(key(id), id, '槽位编号不合法。'); closed(raw, ['program', 'args', 'effect', 'inputs'], id); ensure(Object.hasOwn(value.programs, raw.program) && raw.effect === 'read' && value.programs[raw.program].contextProtocol !== CONNECTION_AUTHORIZATION_PROTOCOL, id, '槽位必须引用普通上下文程序并限定只读效果。'); strings(raw.args, id); if (raw.inputs !== undefined) references(raw.inputs, `hooks.${id}.inputs`); }
  }
  for (const field of value.config.fields) if (field.optionsFrom) ensure(Object.hasOwn(value.hooks || {}, field.optionsFrom), field.key, '动态选项必须引用已声明槽位。');
  if (value.presentation !== undefined) {
    closed(value.presentation, ['summaryFields', 'websiteField', 'websiteFallbackField', 'categoryLabel', 'methodLabel', 'groups', 'environment'], 'presentation'); value.presentation.summaryFields ??= []; strings(value.presentation.summaryFields, 'presentation.summaryFields');
    ensure(value.presentation.environment === undefined || value.presentation.environment === 'hidden', 'presentation.environment', '环境展示声明只支持 hidden；省略保持原行为。');
    ensure(new Set(value.presentation.summaryFields).size === value.presentation.summaryFields.length && value.presentation.summaryFields.every((name: string) => configuration.has(name)), 'presentation.summaryFields', '摘要只能引用非秘密配置字段。');
    for (const name of ['websiteField', 'websiteFallbackField']) if (value.presentation[name] !== undefined) ensure(configuration.get(value.presentation[name])?.type === 'url', `presentation.${name}`, '网站入口必须引用网址字段。');
    for (const name of ['categoryLabel', 'methodLabel']) if (value.presentation[name] !== undefined) ensure(typeof value.presentation[name] === 'string' && value.presentation[name].trim(), `presentation.${name}`, '展示名称必须是非空文本。');
    if (value.presentation.groups !== undefined) {
      ensure(Array.isArray(value.presentation.groups) && value.presentation.groups.length <= 32, 'presentation.groups', '展示分组必须是有界数组。');
      const groupIds = new Set<string>(), groupedFields = new Set<string>();
      for (const group of value.presentation.groups) {
        closed(group, ['id', 'title', 'fields', 'collapsed'], 'presentation.groups');
        ensure(key(group.id) && !groupIds.has(group.id), 'presentation.groups.id', '展示分组编号非法或重复。'); groupIds.add(group.id);
        ensure(typeof group.title === 'string' && group.title.trim(), 'presentation.groups.title', '展示分组名称不能为空。');
        if (group.collapsed !== undefined) ensure(typeof group.collapsed === 'boolean', 'presentation.groups.collapsed', '默认折叠状态必须是布尔值。');
        references(group.fields, `presentation.groups.${group.id}.fields`);
        for (const reference of group.fields) { ensure(!groupedFields.has(reference), 'presentation.groups.fields', '同一字段不能重复加入展示分组。'); groupedFields.add(reference); }
      }
    }
  }
  return value as ConnectionDefinition;
}
function normalizeField(field: ConnectionField, value: unknown): ConnectionValue {
  const invalid = () => connectionError('connection_field_invalid', `字段“${field.label}”不符合类型或校验要求。`, field.key);
  if (typeof value === 'number' && !Number.isFinite(value)) throw invalid();
  if (['string', 'url', 'select', 'secret'].includes(field.type)) {
    if (typeof value !== 'string') throw invalid();
    if ((field.minLength !== undefined && value.length < field.minLength) || (field.maxLength !== undefined && value.length > field.maxLength)) throw invalid();
    if (field.type === 'url') {
      try {
        const url = new URL(value), confidential = new Set(['password', 'passwd', 'pwd', 'token', 'access_token', 'refresh_token', 'id_token', 'authorization', 'api_key', 'apikey', 'secret', 'client_secret', 'credential', 'credentials']);
        const fragment = url.hash.slice(1), fragmentParams = new URLSearchParams(fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys(), ...fragmentParams.keys()].some(name => confidential.has(name.toLowerCase()))) throw invalid();
        value = url.href;
      } catch { throw invalid(); }
    }
  } else if (field.type === 'integer') { if (!Number.isSafeInteger(value) || (field.minimum !== undefined && (value as number) < field.minimum) || (field.maximum !== undefined && (value as number) > field.maximum)) throw invalid(); }
  else if (field.type === 'boolean') { if (typeof value !== 'boolean') throw invalid(); }
  else if (field.type === 'multiselect') { if (!Array.isArray(value) || !value.every(item => typeof item === 'string') || new Set(value).size !== value.length) throw invalid(); }
  if (field.values && (Array.isArray(value) ? value.some(item => !field.values!.includes(item)) : !field.values.includes(value as string | number | boolean))) throw invalid();
  if (field.type === 'enum' && !field.values?.includes(value as string | number | boolean)) throw invalid();
  return Array.isArray(value) ? [...value] as string[] : value as ConnectionValue;
}
export function validateConfig(fields: ConnectionField[], input: unknown, options: { requiredFields?: ReadonlySet<string> } = {}): ConnectionValues {
  if (!object(input)) throw connectionError('connection_field_invalid', '配置或认证必须是字段对象。');
  const names = new Set(fields.map(field => field.key));
  for (const name of Object.keys(input)) if (!names.has(name)) throw connectionError('connection_field_unknown', '配置或认证包含未声明的字段。');
  const values: ConnectionValues = {};
  for (const field of fields) { const value = Object.hasOwn(input, field.key) ? input[field.key] : field.default; if (value !== undefined) values[field.key] = normalizeField(field, value); }
  for (const field of fields) {
    const active = !field.dependsOn || values[field.dependsOn.field] === field.dependsOn.equals;
    const required = options.requiredFields ? options.requiredFields.has(field.key) : active && field.required;
    if (required && !Object.hasOwn(values, field.key)) throw connectionError('connection_field_required', `请填写“${field.label}”。`, field.key);
  }
  return values;
}
export function validateAuthentication(fields: ConnectionField[], input: unknown): ConnectionValues { return validateConfig(fields, input); }
