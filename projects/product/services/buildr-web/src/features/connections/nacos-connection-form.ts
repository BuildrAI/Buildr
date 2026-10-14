import type { NacosApiVersion, NacosConnection, NacosConnectionInput } from './connection-types';

export type NacosConnectionDraft = {
  name: string; environment: string; consoleUrl: string; username: string; password: string;
  namespaceId: string; defaultGroup: string; production: boolean; apiVersion: NacosApiVersion;
};

export function nacosConnectionDraft(connection?: NacosConnection): NacosConnectionDraft {
  return {
    name: connection?.name || '', environment: connection?.environment || '', consoleUrl: connection?.config.consoleUrl || '',
    username: connection?.config.username || '', password: '', namespaceId: connection?.config.namespaceId || 'public',
    defaultGroup: connection?.config.defaultGroup || 'DEFAULT_GROUP', production: connection?.config.production ?? true,
    apiVersion: connection?.config.apiVersion || 'auto',
  };
}

export function nacosConsoleUrl(value: string): string {
  const input = value.trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/u.test(input)) throw new Error('请填写有效的 Nacos 网站地址。');
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 网站地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('网站地址只支持 HTTP 或 HTTPS。');
  if (url.username || url.password || url.search) throw new Error('网站地址不能包含账号密码或查询参数，请使用原网站的入口地址。');
  return url.href;
}

function authenticationTarget(value: string): string {
  const url = new URL(nacosConsoleUrl(value));
  return url.origin + (url.pathname.replace(/\/+$/u, '') || '/nacos');
}

export function nacosConnectionInput(draft: NacosConnectionDraft, previous?: NacosConnection): NacosConnectionInput {
  const name = draft.name.trim(), environment = draft.environment.trim(), username = draft.username.trim();
  if (!name || !environment || !username) throw new Error('请填写名称、环境、网站地址和用户。');
  const consoleUrl = nacosConsoleUrl(draft.consoleUrl);
  const targetChanged = previous && (authenticationTarget(consoleUrl) !== authenticationTarget(previous.config.consoleUrl) || username !== previous.config.username);
  if (targetChanged && previous.hasCredentials && !draft.password) throw new Error('网站地址或用户已变化，请重新填写密码。');
  if (!previous?.hasCredentials && !draft.password) throw new Error('请填写 Nacos 登录密码。');
  if (!['auto', 'v1', 'v2', 'v3'].includes(draft.apiVersion)) throw new Error('Nacos 接口版本无效。');
  if (typeof draft.production !== 'boolean') throw new Error('请明确是否为生产连接。');
  return {
    name, environment, category: 'configuration', type: 'nacos',
    config: { consoleUrl, username, namespaceId: draft.namespaceId.trim() || 'public', defaultGroup: draft.defaultGroup.trim() || 'DEFAULT_GROUP', production: draft.production, apiVersion: draft.apiVersion },
    ...(!previous || draft.password || targetChanged ? { credentials: { password: draft.password } } : {}),
  };
}

/** Only a validated website address may become an external browser link. */
export function nacosConsoleHref(connection: NacosConnection): string | null {
  try { return nacosConsoleUrl(connection.config.consoleUrl); } catch { return null; }
}
