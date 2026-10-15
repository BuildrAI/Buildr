import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connectionFailure, inputObject, passwordInput } from './errors.mjs';
import { nacosConfiguration, nacosContent } from './configuration.mjs';
import { createNacosProvider } from './operations.mjs';
import { createOutputProtection } from './output.mjs';

const sha256 = content => 'sha256-' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');
function privateDirectory(root, name) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw connectionFailure('nacos_private_state_invalid', '本机专业状态目录无效。', 409);
  for (const directory of [root, path.join(root, name)]) {
    const observed = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (observed && (!observed.isDirectory() || observed.isSymbolicLink())) throw connectionFailure('nacos_private_state_invalid', '本机专业状态目录被替换，未写入。', 409);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }
  return path.join(root, name);
}
function newArtifact(root, content, extension = 'txt') {
  const filename = path.join(privateDirectory(root, 'artifacts'), crypto.randomUUID() + '.' + extension);
  fs.writeFileSync(filename, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return filename;
}
export function compareContents(before, after) {
  const oldLines = before.split('\n'), newLines = after.split('\n');
  let prefix = 0, suffix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  const deleted = oldLines.length - prefix - suffix, added = newLines.length - prefix - suffix, lines = [];
  let bytes = 0, truncated = false;
  const append = line => { const size = Buffer.byteLength(line); if (lines.length >= 200 || bytes + size > 32 * 1024) { truncated = true; return; } lines.push(line); bytes += size; };
  if (before !== after) {
    append(`@@ -${prefix + 1},${deleted} +${prefix + 1},${added} @@`);
    for (let index = prefix; index < oldLines.length - suffix; index++) append('-' + oldLines[index]);
    for (let index = prefix; index < newLines.length - suffix; index++) append('+' + newLines[index]);
  }
  return { equal: before === after, beforeSha256: sha256(before), afterSha256: sha256(after), diff: { lines, truncated, deletedLines: before === after ? 0 : deleted, addedLines: before === after ? 0 : added } };
}
function access(connection, secrets) {
  if (!connection || typeof connection.id !== 'string' || !connection.id || typeof connection.revision !== 'string' || !connection.revision || !connection.authentication || !['team', 'personal'].includes(connection.authentication.source)) {
    throw connectionFailure('nacos_context_invalid', '实例身份、观察版本或认证来源无效。', 409);
  }
  const values = inputObject(connection.authentication.values, ['username', 'password']);
  if (!Object.hasOwn(values, 'username') || !Object.hasOwn(values, 'password')) throw connectionFailure('nacos_credentials_missing', '所选认证组必须同时含用户名和密码，不混合其他来源。', 409);
  const config = inputObject(connection.config, ['apiBaseUrl', 'consoleUrl', 'namespaceId', 'defaultGroup', 'production', 'apiVersion']);
  const credentials = { password: passwordInput(values.password) };
  secrets.add(credentials.password);
  return { connection, config: nacosConfiguration({ ...config, username: values.username }), credentials };
}
function target(current, detail) {
  return { connectionId: current.connection.id, apiBaseUrl: current.config.apiBaseUrl, ...(current.config.consoleUrl === undefined ? {} : { consoleUrl: current.config.consoleUrl }), namespaceId: detail.namespaceId, group: detail.group, dataId: detail.dataId, apiVersion: detail.apiVersion };
}
function publicationScope(context, current, detail, content) {
  return { workspaceId: context.workspace.id, connectionId: current.connection.id, expectedRevision: current.connection.revision, namespaceId: detail.namespaceId, group: detail.group, dataId: detail.dataId, type: detail.type, expectedMd5: detail.md5, contentSha256: sha256(content) };
}
function authorize(value, scope) {
  if (value === undefined) throw connectionFailure('nacos_production_authorization_required', '生产实际发布必须展示具体目标与差异，并取得此次用户授权。', 403);
  const evidence = inputObject(value, ['source', 'statement', 'scope']);
  if (![evidence.source, evidence.statement].every(value => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= 8192)) throw connectionFailure('nacos_production_authorization_invalid', '授权依据缺少真实用户指令来源或本次原意。', 403);
  const observed = inputObject(evidence.scope, Object.keys(scope));
  if (Object.keys(scope).some(key => observed[key] !== scope[key])) throw connectionFailure('nacos_production_authorization_mismatch', '授权范围与本次目标、版本、格式或完整新内容不一致。', 403);
  return evidence;
}
function consume(context, connectionId, evidence) {
  try {
    const directory = privateDirectory(context.privateStateRoot, 'publication-authorizations');
    const key = crypto.createHash('sha256').update(JSON.stringify([context.workspace.id, connectionId, evidence.source.trim(), evidence.statement.trim()])).digest('hex');
    fs.writeFileSync(path.join(directory, key + '.json'), JSON.stringify({ schemaVersion: 'nacos.authorization-use/v1', usedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw connectionFailure('nacos_production_authorization_used', '这份授权已用于一次生产发布尝试；请先观察当前配置，再取得新的具体授权。', 403);
    throw connectionFailure('nacos_production_authorization_store_failed', '无法安全记录此次生产授权使用，未提交发布。', 409);
  }
}

export function createNacosWorkflow(context, options = {}) {
  if (context?.protocolVersion !== 'buildr.connection-context/v1' || typeof context.workspace?.id !== 'string' || !context.workspace.id || !context.connections?.primary) throw connectionFailure('nacos_context_invalid', '私有连接上下文无效。', 409);
  const protection = options.protection ?? createOutputProtection();
  const primary = access(context.connections.primary, protection.secrets);
  const provider = createNacosProvider({ ...options.http, secrets: protection.secrets });
  const revalidate = options.revalidate ?? (() => { throw connectionFailure('nacos_context_required', '发布前必须通过宿主重新核对本机连接上下文。', 409); });
  return {
    protection,
    async test() {
      const result = await provider.test(primary.config, primary.credentials);
      return { ...result, status: 'success', connectionId: primary.connection.id, authenticationSource: primary.connection.authentication.source, checks: ['login', 'namespace-visible', 'bounded-config-read'], diagnostics: [], limitations: ['只验证登录、所选命名空间和一页配置读取；没有发布配置，也未证明服务加载或业务结果。'], observedAt: new Date().toISOString() };
    },
    async namespaces() {
      const namespaces = await provider.nacos.namespaces(primary.config, primary.credentials);
      return { status: 'success', checks: ['login', 'namespace-discovery'], diagnostics: [], limitations: ['返回当前账号可见范围，未运行发布。'], observedAt: new Date().toISOString(), connectionId: primary.connection.id, apiBaseUrl: primary.config.apiBaseUrl, namespaces, options: namespaces.map(value => ({ value: value.namespaceId, label: value.namespaceName })) };
    },
    async list(input) {
      return { connectionId: primary.connection.id, apiBaseUrl: primary.config.apiBaseUrl, ...await provider.nacos.configs(primary.config, primary.credentials, input) };
    },
    async get(input, outputFile) {
      const detail = await provider.nacos.get(primary.config, primary.credentials, input);
      let filename;
      if (outputFile === undefined) filename = newArtifact(context.privateStateRoot, detail.content);
      else {
        filename = path.resolve(outputFile);
        try { fs.writeFileSync(filename, detail.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
        catch { throw connectionFailure('nacos_cli_output_invalid', '无法创建原文产物；已有文件不会被覆盖。'); }
      }
      const { content, ...metadata } = detail;
      return { ...metadata, target: target(primary, detail), connectionId: primary.connection.id, expectedRevision: primary.connection.revision, contentSha256: sha256(content), outputFile: filename, contentBytes: Buffer.byteLength(content), contentDelivery: 'private-artifact' };
    },
    async diff(input) {
      inputObject(input, ['dataId', 'group', 'content', 'compareContext', 'compareDataId', 'compareGroup']);
      if ((input.content !== undefined) === (input.compareContext !== undefined) || input.compareContext === undefined && (input.compareDataId !== undefined || input.compareGroup !== undefined)) throw connectionFailure('nacos_comparison_invalid', '比较必须选择候选内容或明确第二上下文，不能同时提供。');
      let compared;
      if (input.compareContext !== undefined) {
        if (typeof input.compareContext !== 'string' || input.compareContext === 'primary' || !Object.hasOwn(context.connections, input.compareContext)) throw connectionFailure('nacos_comparison_invalid', '未收到明确选定的第二实例上下文。');
        compared = access(context.connections[input.compareContext], protection.secrets);
      }
      const current = await provider.nacos.get(primary.config, primary.credentials, { dataId: input.dataId, ...(input.group === undefined ? {} : { group: input.group }) });
      let content, comparisonTarget = null;
      if (compared) {
        const detail = await provider.nacos.get(compared.config, compared.credentials, { dataId: input.compareDataId ?? current.dataId, group: input.compareGroup ?? current.group });
        content = detail.content; comparisonTarget = target(compared, detail);
      } else content = nacosContent(input.content);
      return { connectionId: primary.connection.id, target: target(primary, current), comparisonTarget, expectedRevision: primary.connection.revision, expectedMd5: current.md5, ...compareContents(current.content, content), authorizationScope: publicationScope(context, primary, current, content) };
    },
    async publish(input) {
      inputObject(input, ['dataId', 'group', 'content', 'expectedRevision', 'expectedMd5', 'authorization']);
      if (input.expectedRevision !== primary.connection.revision) throw connectionFailure('connection_revision_conflict', '本次连接观察版本不匹配，请重新读取。', 409);
      if (typeof input.expectedMd5 !== 'string' || !/^[a-fA-F0-9]{32}$/u.test(input.expectedMd5)) throw connectionFailure('nacos_expected_md5_required', '发布必须提供完整已观察 MD5。', 409);
      const content = nacosContent(input.content);
      const current = await provider.nacos.get(primary.config, primary.credentials, { dataId: input.dataId, ...(input.group === undefined ? {} : { group: input.group }) });
      if (current.md5 !== input.expectedMd5.toLowerCase()) throw connectionFailure('nacos_content_conflict', '配置已变化，请重新读取和比较。', 409);
      if (content === current.content) { await revalidate(); return { connectionId: primary.connection.id, target: target(primary, current), submitted: false, published: false, verified: true, unchanged: true, md5: current.md5, serviceReloaded: false }; }
      if (primary.config.production && current.type === null) throw connectionFailure('nacos_metadata_unavailable', '生产配置格式未确认，未消费授权或发布。', 409);
      const scope = publicationScope(context, primary, current, content);
      if (primary.config.production || input.authorization !== undefined) authorize(input.authorization, scope);
      const result = await provider.nacos.publish(primary.config, primary.credentials, { dataId: current.dataId, group: current.group, content, expectedMd5: current.md5, ...(current.type ? { type: current.type } : {}), beforeWrite: async observed => {
        await revalidate();
        if (primary.config.production) consume(context, primary.connection.id, authorize(input.authorization, publicationScope(context, primary, observed, content)));
      } });
      return { connectionId: primary.connection.id, target: target(primary, current), submitted: true, ...result, serviceReloaded: false, ...(primary.config.production ? { authorizationKind: 'user-dialogue-evidence' } : {}) };
    },
  };
}
