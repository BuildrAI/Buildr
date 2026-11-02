import fs from 'node:fs';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import { resolveProductResource } from '../../infrastructure/product-resources/index.ts';
import { mermaidRendererResponse } from './responses.ts';

const DEFAULT_STATIC_ROOT = resolveProductResource('product/web-dist');
const STATIC_CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.map', 'application/json; charset=utf-8'],
]);

export function resolveDistFile(pathname: any, staticRoot: any = DEFAULT_STATIC_ROOT) {
  const root = path.resolve(staticRoot || DEFAULT_STATIC_ROOT);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0')) return null;
  const relative = decoded.slice(1);
  if (!relative || relative.split('/').some((part: any) => part === '..')) return null;
  const resolved = path.resolve(root, relative);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

export function injectedIndexHtml(sessionToken: any, previewIdentity: any, webProfile: any, staticRoot: any = DEFAULT_STATIC_ROOT) {
  const indexPath = path.join(path.resolve(staticRoot || DEFAULT_STATIC_ROOT), 'index.html');
  if (!fs.existsSync(indexPath)) {
    const error: Error & Record<string, any> = new Error('Buildr Web dist 缺失，请先运行 npm run build:web。');
    error.code = 'web_dist_missing';
    error.status = 503;
    throw error;
  }
  const profile = ['released', 'development'].includes(webProfile?.profile) ? webProfile.profile : '';
  return fs.readFileSync(indexPath, 'utf8')
    .replace('__BUILDR_SESSION_TOKEN__', sessionToken)
    .replace('__BUILDR_PREVIEW_IDENTITY__', previewIdentity ? encodeURIComponent(JSON.stringify(previewIdentity)) : '')
    .replace('__BUILDR_WEB_PROFILE__', profile);
}

/** Explicit coding preferences win over wildcards; q=0 must never be selected. */
export function acceptedAssetEncodings(value = ''): string[] {
  const weights = new Map(value.toLowerCase().split(',').map(part => {
    const [coding, ...parameters] = part.trim().split(';');
    const q = parameters.map(parameter => parameter.trim()).find(parameter => parameter.startsWith('q='));
    const weight = q ? Number(q.slice(2)) : 1;
    return [coding, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0] as const;
  }));
  return ['br', 'gzip'].map(coding => ({coding, q: weights.get(coding) ?? weights.get('*') ?? 0}))
    .filter(item => item.q > 0).sort((a, b) => b.q - a.q).map(item => item.coding);
}

export async function serveDistAsset(response: any, pathname: any, staticRoot: any = DEFAULT_STATIC_ROOT, request?: { headers: Record<string, string | string[] | undefined> }) {
  const filePath = resolveDistFile(pathname, staticRoot);
  // Compression sidecars are representations, never standalone public resources.
  if (!filePath || /\.(?:br|gz)$/.test(filePath)) return false;
  try { if (!(await stat(filePath)).isFile()) return false; }
  catch (error: any) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false; throw error; }
  const contentType = STATIC_CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  if (filePath === path.join(path.resolve(staticRoot || DEFAULT_STATIC_ROOT), 'mermaid-renderer.html')) {
    mermaidRendererResponse(response, await readFile(filePath, 'utf8')); return true;
  }
  const immutable = /^\/assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(pathname);
  let content: Buffer | undefined, encoding: string | undefined;
  if (immutable) for (const coding of acceptedAssetEncodings(String(request?.headers['accept-encoding'] || ''))) {
    try { content = await readFile(filePath + (coding === 'br' ? '.br' : '.gz')); encoding = coding; break; }
    catch (error: any) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  content ??= await readFile(filePath);
  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    'content-length': content.length,
    'x-content-type-options': 'nosniff',
    ...(immutable ? {vary: 'Accept-Encoding'} : {}),
    ...(encoding ? {'content-encoding': encoding} : {}),
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:*; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  });
  response.end(content); return true;
}
