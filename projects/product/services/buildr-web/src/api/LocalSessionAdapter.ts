export type SessionHeaders = Record<string, string>;

export interface SessionAdapter {
  writeHeaders(): SessionHeaders;
}

export function readSessionTokenFromDocument(doc: Document = document): string | null {
  return doc.querySelector('meta[name="buildr-session"]')?.getAttribute('content') ?? null;
}

export class LocalSessionAdapter implements SessionAdapter {
  private readonly getToken: () => string | null;

  constructor(getToken: () => string | null = readSessionTokenFromDocument) {
    this.getToken = getToken;
  }

  writeHeaders(): SessionHeaders {
    const token = this.getToken();
    if (!token) {
      const error = new Error('Buildr 本地应用 session 已失效，请刷新页面。');
      (error as Error & { code?: string }).code = 'session_forbidden';
      throw error;
    }
    return {
      'content-type': 'application/json',
      'x-buildr-session': token,
    };
  }
}
