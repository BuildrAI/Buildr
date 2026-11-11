import type { AccessCredential, ProgrammaticAccessView } from './api/programmatic-access-api';

/** Connection coordinates, not a second API tutorial. Never include the secret. */
export function programmaticConnectionInfo(view: ProgrammaticAccessView, credential: AccessCredential): string | null {
  if (credential.revokedAt || !credential.tokenFilePath) return null;
  return [
    `使用本机 Buildr 接入「${credential.name}」。`,
    `API／发现入口：${view.apiUrl}`,
    `凭据文件：${credential.tokenFilePath}`,
    '从该本机私有文件读取令牌，作为 Authorization: Bearer 请求头使用；不要输出令牌或读取浏览器认证。',
    `授权工作空间：${credential.workspaceIds.map(id => `${view.workspaces.find(item => item.id === id)?.name ?? id}（${id}）`).join('、')}`,
    `权限：${credential.scopes.join(', ')}`,
    `全部授权执行：${credential.allowFullAccess ? '已开启，start/send/续聊可请求 permissionMode=full-access' : '已关闭，请求 full-access 将返回 403'}`,
    `使用指南：${view.documentationUrl}`,
    `轻量操作目录：${view.operationsUrl ?? view.apiUrl + '/operations'}`,
    '先看指南和目录，按需读取目录中单个操作的 documentationUrl；可按 contractVersion 缓存文档，无需每次读取完整 OpenAPI。',
    `完整 OpenAPI（可选导入）：${view.openapiUrl}`,
    '文档入口使用同一 Bearer。请自行读取文档理解能力与调用契约，并仅在用户授权的目标范围内使用。',
    '问题与敏感审批按当前权限交由用户本人处理，不因 API 接入获得额外授权。',
  ].join('\n');
}
