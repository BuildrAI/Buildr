import crypto from 'node:crypto';
import { connectionFailure, inputObject, recordRevision, type ConnectionRecord, type ConnectionScope } from '../domain/connection.ts';
import { nacosContent, type NacosConfigDetail, type NacosOperations } from '../domain/nacos-connection.ts';
import { consumeNacosPublicationAuthorization } from '../persistence/nacos-publish-authorizations.ts';

export type NacosAccess = { scope: ConnectionScope; record: ConnectionRecord; credentials: Record<string, unknown>; nacos: NacosOperations };
type AccessResolver = (root: string, id: string) => NacosAccess;
const sha256 = (content: string) => 'sha256-' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');
const candidateContent = nacosContent;
function target(access: NacosAccess, detail: NacosConfigDetail) {
  return { connectionId: access.record.id, consoleUrl: access.record.config.consoleUrl, namespaceId: detail.namespaceId, group: detail.group, dataId: detail.dataId, apiVersion: detail.apiVersion };
}
function publicationScope(access: NacosAccess, detail: NacosConfigDetail, content: string) {
  return { workspaceId: access.scope.workspaceId, connectionId: access.record.id, expectedRevision: recordRevision(access.record), namespaceId: detail.namespaceId, group: detail.group, dataId: detail.dataId, type: detail.type, expectedMd5: detail.md5, contentSha256: sha256(content) };
}
/** A bounded single replacement hunk; hashes always cover the complete, unmodified text. */
export function compareNacosContents(before: string, after: string) {
  const oldLines = before.split('\n'), newLines = after.split('\n');
  let prefix = 0, suffix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  const deleted = oldLines.length - prefix - suffix, added = newLines.length - prefix - suffix, lines: string[] = [];
  let bytes = 0, truncated = false;
  const append = (line: string) => {
    const size = Buffer.byteLength(line, 'utf8');
    if (lines.length >= 200 || bytes + size > 32 * 1024) { truncated = true; return; }
    lines.push(line); bytes += size;
  };
  if (before !== after) {
    append(`@@ -${prefix + 1},${deleted} +${prefix + 1},${added} @@`);
    for (let index = prefix; index < oldLines.length - suffix; index++) append('-' + oldLines[index]);
    for (let index = prefix; index < newLines.length - suffix; index++) append('+' + newLines[index]);
  }
  return { equal: before === after, beforeSha256: sha256(before), afterSha256: sha256(after), diff: { lines, truncated, deletedLines: before === after ? 0 : deleted, addedLines: before === after ? 0 : added } };
}
function authorizeProduction(value: unknown, scope: ReturnType<typeof publicationScope>) {
  if (value === undefined) throw connectionFailure('nacos_production_authorization_required', '每次生产发布前必须展示具体目标与差异，取得用户针对本次发布的授权，并提交授权依据。', 403);
  const authorization = inputObject(value, ['source', 'statement', 'scope']);
  if (![authorization.source, authorization.statement].every(text => typeof text === 'string' && text.trim().length > 0 && Buffer.byteLength(text, 'utf8') <= 8192)) throw connectionFailure('nacos_production_authorization_invalid', '授权依据必须包含可回查的用户指令来源与本次授权原意。', 403);
  const observed = inputObject(authorization.scope, Object.keys(scope));
  if (Object.keys(scope).some(key => observed[key] !== scope[key as keyof typeof scope])) throw connectionFailure('nacos_production_authorization_mismatch', '授权依据不匹配本次连接、配置、原版本或新内容；请重新展示差异并取得用户授权。', 403);
  return { source: authorization.source as string, statement: authorization.statement as string };
}

export class NacosConfigurationApplication {
  private readonly access: AccessResolver;
  private readonly assertWritable: () => void;
  constructor(access: AccessResolver, assertWritable: () => void) { this.access = access; this.assertWritable = assertWritable; }
  async namespaces(root: string, id: string) {
    const access = this.access(root, id);
    return { connectionId: id, consoleUrl: access.record.config.consoleUrl, namespaces: await access.nacos.namespaces(access.record.config, access.credentials) };
  }
  async list(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['dataId', 'group', 'pageNo', 'pageSize']), access = this.access(root, id);
    return { connectionId: id, consoleUrl: access.record.config.consoleUrl, ...await access.nacos.configs(access.record.config, access.credentials, input) };
  }
  async get(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['dataId', 'group']), access = this.access(root, id);
    const detail = await access.nacos.get(access.record.config, access.credentials, { dataId: input.dataId, ...(input.group === undefined ? {} : { group: input.group }) });
    return { ...detail, target: target(access, detail), connectionId: id, expectedRevision: recordRevision(access.record), contentSha256: sha256(detail.content) };
  }
  async diff(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['dataId', 'group', 'content', 'compareConnection', 'compareDataId', 'compareGroup']), access = this.access(root, id);
    if ((input.content !== undefined) === (input.compareConnection !== undefined) || input.compareConnection === undefined && (input.compareDataId !== undefined || input.compareGroup !== undefined)) throw connectionFailure('nacos_comparison_invalid', '比较需要候选内容或明确第二连接，不能同时提供。');
    const current = await access.nacos.get(access.record.config, access.credentials, { dataId: input.dataId, ...(input.group === undefined ? {} : { group: input.group }) });
    let content: string, comparisonTarget: ReturnType<typeof target> | null = null;
    if (input.compareConnection !== undefined) {
      if (typeof input.compareConnection !== 'string') throw connectionFailure('nacos_comparison_invalid', '比较连接编号无效。');
      const compared = this.access(root, input.compareConnection);
      const detail = await compared.nacos.get(compared.record.config, compared.credentials, { dataId: input.compareDataId ?? current.dataId, group: input.compareGroup ?? current.group });
      content = detail.content; comparisonTarget = target(compared, detail);
    } else content = candidateContent(input.content);
    return { connectionId: id, target: target(access, current), comparisonTarget, expectedRevision: recordRevision(access.record), expectedMd5: current.md5, ...compareNacosContents(current.content, content), authorizationScope: publicationScope(access, current, content) };
  }
  async publish(root: string, id: string, value: unknown) {
    this.assertWritable();
    const input = inputObject(value, ['dataId', 'group', 'content', 'expectedRevision', 'expectedMd5', 'authorization']), access = this.access(root, id), content = candidateContent(input.content);
    if (input.expectedRevision !== recordRevision(access.record)) throw connectionFailure('connection_revision_conflict', '连接已变化，请重新读取并核对本次发布目标。', 409);
    if (typeof input.expectedMd5 !== 'string' || !/^[a-fA-F0-9]{32}$/.test(input.expectedMd5)) throw connectionFailure('nacos_expected_md5_required', '发布必须提供刚读取的配置 MD5 摘要。', 409);
    const current = await access.nacos.get(access.record.config, access.credentials, { dataId: input.dataId, ...(input.group === undefined ? {} : { group: input.group }) });
    if (current.md5 !== input.expectedMd5.toLowerCase()) throw connectionFailure('nacos_content_conflict', '配置已被其他入口修改，请重新读取并比较。', 409);
    const fresh = this.access(root, id);
    if (recordRevision(fresh.record) !== recordRevision(access.record)) throw connectionFailure('connection_revision_conflict', '读取期间连接已变化，未发布配置；请重新核对目标。', 409);
    if (content === current.content) return { connectionId: id, target: target(access, current), published: false, verified: true, unchanged: true, md5: current.md5, serviceReloaded: false };
    if (access.record.config.production === true && current.type === null) throw connectionFailure('nacos_metadata_unavailable', '未能确认本次生产配置的实际格式，授权尚未使用；请重新读取详情并核对差异。', 409);
    const scope = publicationScope(access, current, content);
    if (access.record.config.production === true) {
      const authorization = authorizeProduction(input.authorization, scope);
      consumeNacosPublicationAuthorization(access.scope, id, authorization.source, authorization.statement);
    } else if (input.authorization !== undefined) authorizeProduction(input.authorization, scope);
    const result = await access.nacos.publish(access.record.config, access.credentials, { dataId: current.dataId, group: current.group, content, expectedMd5: current.md5, ...(current.type ? { type: current.type } : {}) });
    return { connectionId: id, target: target(access, current), ...result, serviceReloaded: false, ...(access.record.config.production === true ? { authorizationKind: 'user-dialogue-evidence' } : {}) };
  }
}
