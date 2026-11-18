import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertReadRequest, assertRequestHost} from '../../src/web/http/session.ts';

/** Loaded only by an explicit source-development host, never by a preview. */
export async function createDevelopmentWebs({server, sessionToken, origin, serviceRoot}: {
  server: any; sessionToken: string; origin(): string; serviceRoot: string;
}) {
  const modulePath = path.resolve(serviceRoot, '../buildr-harness-web/tools/dev-server.mjs');
  const {createDevelopmentWeb} = await import(pathToFileURL(modulePath).href);
  const authorize = (request: any) => {
    const expected = origin();
    assertRequestHost(request, expected);
    assertReadRequest({...request, headers: {...request.headers, 'x-buildr-session': sessionToken}}, expected, sessionToken);
  };
  const inject = (html: string, profile: string) => html
    .replaceAll('__BUILDR_SESSION_TOKEN__', sessionToken)
    .replaceAll('__BUILDR_PREVIEW_IDENTITY__', '')
    .replaceAll('__BUILDR_WEB_PROFILE__', profile)
    .replace('</head>', `<meta name="buildr-session" content="${sessionToken}"><meta name="buildr-web-profile" content="${profile}"></head>`);
  const web = await createDevelopmentWeb({root: path.resolve(serviceRoot, '../buildr-web'), server, authorize, inject: (html: string) => inject(html, 'development')});
  try {
    const harness = await createDevelopmentWeb({root: path.resolve(serviceRoot, '../buildr-harness-web'), base: '/harness/', server,
      authorize: (request: any) => {
        authorize(request);
        const cookie = String(request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('buildr-frame='));
        if (cookie?.slice('buildr-frame='.length) !== sessionToken) throw Object.assign(new Error('Harness 页面会话已失效。'), {code: 'session_forbidden', status: 403});
      }, inject: (html: string) => inject(html, 'development-harness'),
    });
    return {web, harness, async close() { await Promise.all([web.close(), harness.close()]); }};
  } catch (error) { await web.close(); throw error; }
}
