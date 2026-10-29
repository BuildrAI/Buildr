/** Explicit temporary failures only; quota, identity and user decisions take precedence. */
export function transientFailure(message: string): boolean {
  if (/quota|usage.?limit|daily.?limit|insufficient|credit|billing|exhaust|unauthori|forbidden|permission|login|authentic|identity|binding|cancel|abort|user.?stop|额度|配额|余额|权限|登录|身份|取消|主动停止/i.test(message)) return false;
  return /at capacity|overloaded|temporar(?:y|ily).*(?:unavailable|failure|error)|server[ _]error|service[ _]unavailable|connection[ _](?:reset|refused)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|stream.*disconnect|(?:^|\D)50[234](?:\D|$)|^agent_native_(?:timeout|process_closed|process_failed)$|模型繁忙|服务暂时不可用/i.test(message);
}
export const RETRY_DELAYS = [2_000, 5_000, 10_000] as const;
