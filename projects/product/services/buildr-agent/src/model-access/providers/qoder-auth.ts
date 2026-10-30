import type { AccountObservation } from '../../contracts.ts';
import { ModelAccessError } from '../contracts.ts';

export const qoderLoginExpiredMessage = 'Qoder 登录授权已失效，请重新登录。若团队账号额度已用尽，请更换有额度的账号后登录，反复登录原账号不能恢复使用；所选模型来源保持不变。';
export const qoderTeamQuotaMessage = 'Qoder 团队账号额度已用尽，无法继续使用，请更换有额度的账号后重新登录。';

/** Only explicit authentication failures establish expiration, never quota or network failures. */
export function qoderAccountFailure(error: unknown, authExpired = false): AccountObservation {
  const value = error as { code?: unknown; message?: unknown } | undefined;
  const message = typeof value?.message === 'string' ? value.message : '';
  if (authExpired || value?.code === 'TOKEN_EXPIRE' || /^(?:Local login has expired\.|Login expired$|token is not active$)/i.test(message)) {
    return { status: 'expired', diagnostic: qoderLoginExpiredMessage };
  }
  if (value?.code === 'ENOENT' || message === 'qoder_login_required' || message === 'No qodercli login found. Run "qodercli login" first.') {
    return { status: 'not-authenticated', diagnostic: '请先登录 Qoder 账号；不要求购买或选择 Qoder 自有模型。' };
  }
  return { status: 'failed', diagnostic: 'Qoder 账号检查未完成，请检查网络或程序连接后重试；当前不能确定登录是否失效。' };
}

/** Qoder also reports expired browser credentials as HTTP 403 / code 105. */
export function qoderAuthenticationError(status: number, value: { code?: unknown; message?: unknown }): ModelAccessError | undefined {
  if (status === 401 || (status === 403 && qoderAccountFailure(value).status === 'expired')) {
    return new ModelAccessError('qoder_platform_login_expired', qoderLoginExpiredMessage, 401);
  }
  return undefined;
}
