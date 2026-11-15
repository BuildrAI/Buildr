export type SessionHeaders = Record<string, string>;

export interface SessionAdapter {
  writeHeaders(): SessionHeaders;
  /**
   * 可选：重新从同源页面取得当前 session token 并使其对后续 writeHeaders 生效。
   * 无法取得当前令牌时返回 false，由调用方决定重试策略。
   */
  refreshSession?(signal?: AbortSignal): Promise<boolean>;
}

export function readSessionTokenFromDocument(doc: Document = document): string | null {
  return doc.querySelector('meta[name="buildr-session"]')?.getAttribute('content') ?? null;
}

/** 服务端把本次启动的 session token 注入 index.html 的 meta 节点；两种属性顺序都接受。 */
function readSessionTokenFromHtml(html: string): string | null {
  return (
    /<meta\b[^>]*\bname=["']buildr-session["'][^>]*\bcontent=["']([^"']*)["']/i.exec(html)?.[1]
    ?? /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']buildr-session["']/i.exec(html)?.[1]
    ?? null
  );
}

export class LocalSessionAdapter implements SessionAdapter {
  private readonly getToken: () => string | null;
  private readonly doc: Document | null;
  private refreshedToken: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(getToken: () => string | null = readSessionTokenFromDocument, doc: Document | null = typeof document === 'undefined' ? null : document) {
    this.getToken = getToken;
    this.doc = doc;
  }

  writeHeaders(): SessionHeaders {
    const token = this.refreshedToken ?? this.getToken();
    if (!token) {
      const error = new Error('Buildr Web session 已失效，请刷新页面。');
      (error as Error & { code?: string }).code = 'session_forbidden';
      throw error;
    }
    return {
      'content-type': 'application/json',
      'x-buildr-session': token,
    };
  }

  async refreshSession(signal?: AbortSignal): Promise<boolean> {
    // A bounded observer owns its refresh cancellation. It must not cancel or
    // permanently occupy the shared refresh used by other page operations.
    if (signal) return this.requestSessionToken(signal);
    this.refreshInFlight ??= this.requestSessionToken().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async requestSessionToken(signal?: AbortSignal): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') return false;
    let html: string;
    try {
      signal?.throwIfAborted();
      const response = await fetch(window.location.href, { cache: 'no-store', signal });
      if (!response.ok) return false;
      html = await response.text();
      signal?.throwIfAborted();
    } catch {
      return false;
    }
    const token = readSessionTokenFromHtml(html);
    if (!token) return false;
    this.refreshedToken = token;
    this.doc?.querySelector('meta[name="buildr-session"]')?.setAttribute('content', token);
    return true;
  }
}
