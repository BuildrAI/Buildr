import type { XxlJobApiVersion, XxlJobConnection, XxlJobConnectionInput, XxlJobServiceBinding } from './connection-types';

export type XxlJobConnectionDraft = {
  name: string; environment: string; consoleUrl: string; username: string; password: string;
  production: boolean; apiVersion: XxlJobApiVersion; serviceBindings: XxlJobServiceBinding[];
};

export function xxlJobConnectionDraft(connection?: XxlJobConnection): XxlJobConnectionDraft {
  return {
    name: connection?.name || '', environment: connection?.environment || '', consoleUrl: connection?.config.consoleUrl || '',
    username: connection?.config.username || '', password: '', production: connection?.config.production ?? true,
    apiVersion: connection?.config.apiVersion || 'auto', serviceBindings: connection?.config.serviceBindings.map(binding => ({ ...binding })) || [],
  };
}

export function xxlJobConsoleUrl(value: string): string {
  const input = value.trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/u.test(input)) throw new Error('请填写有效的 XXL-JOB 网站地址。');
  try { encodeURIComponent(input); } catch { throw new Error('请填写有效的 XXL-JOB 网站地址。'); }
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 网站地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('网站地址只支持 HTTP 或 HTTPS。');
  if (url.username || url.password || url.search || url.hash) throw new Error('网站地址不能包含账号密码、查询参数或网页锚点，请填写调度中心的根地址。');
  return url.href;
}

export function xxlJobWebsiteIdentity(value: string): string {
  const url = new URL(xxlJobConsoleUrl(value));
  return url.origin + url.pathname.replace(/\/+$/u, '');
}

export function xxlJobConnectionInput(draft: XxlJobConnectionDraft, previous?: XxlJobConnection): XxlJobConnectionInput {
  const name = draft.name.trim(), environment = draft.environment.trim(), username = draft.username.trim();
  if (!name || !environment || !username) throw new Error('请填写名称、环境、网站地址和用户。');
  const consoleUrl = xxlJobConsoleUrl(draft.consoleUrl);
  const websiteChanged = previous && xxlJobWebsiteIdentity(consoleUrl) !== xxlJobWebsiteIdentity(previous.config.consoleUrl);
  const targetChanged = previous && (websiteChanged || username !== previous.config.username);
  if (targetChanged && previous.hasCredentials && !draft.password) throw new Error('网站地址或用户已变化，请重新填写密码。');
  if (!previous?.hasCredentials && !draft.password) throw new Error('请填写 XXL-JOB 登录密码。');
  if (!['auto', '2.3.0'].includes(draft.apiVersion)) throw new Error('XXL-JOB 接口版本无效。');
  if (typeof draft.production !== 'boolean') throw new Error('请明确是否为生产连接。');
  return {
    name, environment, category: 'scheduling', type: 'xxl-job',
    config: { consoleUrl, username, production: draft.production, apiVersion: draft.apiVersion, serviceBindings: websiteChanged ? [] : draft.serviceBindings.map(binding => ({ ...binding })) },
    ...(!previous || draft.password || targetChanged ? { credentials: { password: draft.password } } : {}),
  };
}

/** Only the configured, validated root address may become an external browser link. */
export function xxlJobConsoleHref(connection: XxlJobConnection): string | null {
  try { return xxlJobConsoleUrl(connection.config.consoleUrl); } catch { return null; }
}
