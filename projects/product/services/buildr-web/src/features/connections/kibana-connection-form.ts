import type { KibanaConnection, KibanaConnectionInput } from './connection-types';

export type KibanaConnectionDraft = { name: string; environment: string; consoleUrl: string; username: string; password: string; dataViewId: string | null };

export function kibanaConnectionDraft(connection?: KibanaConnection): KibanaConnectionDraft {
  return { name: connection?.name || '', environment: connection?.environment || '', consoleUrl: connection?.config.consoleUrl || '', username: connection?.config.username || '', password: '', dataViewId: connection?.config.dataViewId || null };
}

export function kibanaConnectionDraftUpdate<K extends keyof KibanaConnectionDraft>(draft: KibanaConnectionDraft, field: K, value: KibanaConnectionDraft[K]): KibanaConnectionDraft {
  const next = { ...draft, [field]: value };
  let targetChanged = next.username.trim() !== draft.username.trim();
  if (field === 'consoleUrl' && next.consoleUrl !== draft.consoleUrl) {
    try { targetChanged = kibanaWebsiteTarget(next.consoleUrl).apiBaseUrl !== kibanaWebsiteTarget(draft.consoleUrl).apiBaseUrl; }
    catch { targetChanged = true; }
  }
  return targetChanged ? { ...next, dataViewId: null } : next;
}

/** Keep proxy and Space paths; never carry browser search state or credentials into a link. */
export function kibanaWebsiteTarget(value: string): { apiBaseUrl: string; consoleUrl: string } {
  const input = value.trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/u.test(input)) throw new Error('请填写有效的 Kibana 网站地址。');
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 网站地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || /\\/u.test(input)) throw new Error('网站地址只支持完整的 HTTP 或 HTTPS 地址。');
  if (url.username || url.password) throw new Error('网站地址不能包含账号密码。');
  let path = url.pathname.replace(/\/+$/u, '');
  const application = path.indexOf('/app/');
  if (application >= 0) {
    if (path.slice(application) !== '/app/discover') throw new Error('请使用 Kibana 站点基址或 Discover 页面地址。');
    path = path.slice(0, application);
  }
  if (/\/(?:api|internal|app)(?:\/|$)/u.test(path) || /\/s\/(?:[^/]+\/|\/)/u.test(path) || /\/s$/u.test(path) || /%(?:2f|5c)/iu.test(path)) throw new Error('请使用完整的 Kibana 站点或空间（Space）地址。');
  url.search = ''; url.hash = ''; url.pathname = path || '/';
  const apiBaseUrl = url.href.replace(/\/$/u, '');
  url.pathname = `${path}/app/discover`;
  return { apiBaseUrl, consoleUrl: url.href };
}

export function kibanaConnectionInput(draft: KibanaConnectionDraft, previous?: KibanaConnection): KibanaConnectionInput {
  const name = draft.name.trim(), environment = draft.environment.trim(), username = draft.username.trim();
  if (!name || !environment || !username) throw new Error('请填写名称、环境、网站地址和用户。');
  if (new TextEncoder().encode(username).length > 128 || username.includes(':') || /[\u0000-\u001f\u007f]/u.test(username)) throw new Error('Kibana 用户名无效，不能包含冒号或控制字符。');
  const target = kibanaWebsiteTarget(draft.consoleUrl);
  const targetChanged = previous && (target.apiBaseUrl !== kibanaWebsiteTarget(previous.config.consoleUrl).apiBaseUrl || username !== previous.config.username);
  if (targetChanged && previous.hasCredentials && !draft.password) throw new Error('网站地址或用户已变化，请重新填写密码。');
  if (!previous?.hasCredentials && !draft.password) throw new Error('请填写 Kibana 登录密码。');
  const dataViewId = draft.dataViewId || null;
  if (dataViewId && (new TextEncoder().encode(dataViewId).length > 1024 || /[\u0000-\u001f\u007f]/u.test(dataViewId))) throw new Error('数据视图（Data View）编号无效。');
  return {
    name, environment, category: 'logs', type: 'kibana', config: { consoleUrl: target.consoleUrl, username, dataViewId },
    ...(!previous || draft.password || targetChanged ? { credentials: { password: draft.password } } : {}),
  };
}

export function kibanaConsoleHref(connection: KibanaConnection): string | null {
  try { return kibanaWebsiteTarget(connection.config.consoleUrl).consoleUrl; } catch { return null; }
}
