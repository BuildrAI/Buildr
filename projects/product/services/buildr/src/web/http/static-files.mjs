import fs from 'node:fs';
import path from 'node:path';

import { resolveProductResource } from '../../infrastructure/product-resources/index.mjs';
import { binaryResponse, textResponse } from './responses.mjs';

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

export function resolveDistFile(pathname, staticRoot = DEFAULT_STATIC_ROOT) {
  const root = path.resolve(staticRoot || DEFAULT_STATIC_ROOT);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0')) return null;
  const relative = decoded.slice(1);
  if (!relative || relative.split('/').some((part) => part === '..')) return null;
  const resolved = path.resolve(root, relative);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

export function injectedIndexHtml(sessionToken, previewIdentity, webProfile, staticRoot = DEFAULT_STATIC_ROOT) {
  const indexPath = path.join(path.resolve(staticRoot || DEFAULT_STATIC_ROOT), 'index.html');
  if (!fs.existsSync(indexPath)) {
    const error = new Error('Buildr Web dist 缺失，请先运行 npm run build:web。');
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

export function serveDistAsset(response, pathname, staticRoot = DEFAULT_STATIC_ROOT) {
  const filePath = resolveDistFile(pathname, staticRoot);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const contentType = STATIC_CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('javascript') || contentType.includes('svg')) {
    textResponse(response, 200, fs.readFileSync(filePath, 'utf8'), contentType);
  } else {
    binaryResponse(response, 200, fs.readFileSync(filePath), contentType);
  }
  return true;
}
