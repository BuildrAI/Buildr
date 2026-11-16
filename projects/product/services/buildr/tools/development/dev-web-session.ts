/**
 * Development-only browser session bridge for the Vite servers.
 *
 * The development host owns the page session token and only exposes it by
 * rendering the ordinary page. The Vite servers read that page once per
 * document request, inject the same meta tag and forward the image cookie.
 * Release builds never load this module in serve mode.
 */

const SESSION_PATTERN = /<meta\s+name=["']buildr-session["']\s+content=["']([^"']+)["']/i;

export type DevelopmentHostSession = {
  token: string;
  imageCookie: string | null;
};

export function parseDevelopmentHostSession(html: string, setCookie: readonly string[] = []): DevelopmentHostSession {
  const token = SESSION_PATTERN.exec(html)?.[1];
  if (!token) throw new Error('Development host page does not expose a session token.');
  return { token, imageCookie: setCookie.find(value => value.startsWith('buildr-image=')) ?? null };
}

export function injectDevelopmentSession(
  html: string,
  session: DevelopmentHostSession,
  { profile = 'development', replacePlaceholders = false }: { profile?: string; replacePlaceholders?: boolean } = {},
): string {
  if (replacePlaceholders) {
    return html
      .replaceAll('__BUILDR_SESSION_TOKEN__', session.token)
      .replaceAll('__BUILDR_PREVIEW_IDENTITY__', '')
      .replaceAll('__BUILDR_WEB_PROFILE__', profile);
  }
  return html.replace('</head>', `<meta name="buildr-session" content="${session.token}"><meta name="buildr-web-profile" content="${profile}"></head>`);
}

export async function readDevelopmentHostSession(hostUrl: string, timeoutMs = 5000): Promise<DevelopmentHostSession> {
  // The Vite configs deliberately do not pull Node or DOM types into the
  // application type surface; the dev host page is fetched with the runtime
  // globals that Node already provides.
  const runtime = globalThis as any;
  const response = await runtime.fetch(new runtime.URL('/', hostUrl), {
    headers: { accept: 'text/html' },
    signal: runtime.AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Development host page is unavailable: HTTP ${response.status}.`);
  const headers = response.headers as any;
  const cookies: string[] = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return parseDevelopmentHostSession(await response.text(), cookies);
}

function isDocumentPath(url: string | undefined): boolean {
  const pathname = (url || '/').split('?')[0];
  return pathname === '/' || pathname === '/index.html' || pathname.endsWith('/') || pathname.endsWith('/index.html');
}

export function developmentSessionPlugin({ hostUrl, profile = 'development', replacePlaceholders = false }: {
  hostUrl: string;
  profile?: string;
  replacePlaceholders?: boolean;
}): any {
  return {
    name: 'buildr-development-session',
    apply: 'serve',
    configureServer(server: any) {
      server.middlewares.use((request: any, response: any, next: (error?: unknown) => void) => {
        if (request.method !== 'GET' || !isDocumentPath(request.url)) return next();
        readDevelopmentHostSession(hostUrl).then(session => {
          if (session.imageCookie) response.setHeader('set-cookie', session.imageCookie);
          next();
        }).catch(next);
      });
    },
    async transformIndexHtml(html: string) {
      return injectDevelopmentSession(html, await readDevelopmentHostSession(hostUrl), { profile, replacePlaceholders });
    },
  };
}

export function developmentApiProxy(hostUrl: string): any {
  return {
    target: hostUrl,
    changeOrigin: true,
    configure(proxy: any) {
      // The host validates Host and Origin against its own loopback origin.
      proxy.on('proxyReq', (request: any) => request.setHeader('origin', hostUrl));
    },
  };
}
