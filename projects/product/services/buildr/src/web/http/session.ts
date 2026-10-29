export const MAX_JSON_BODY_BYTES = 32 * 1024;

export function assertReadRequest(request: any, origin: string, sessionToken: string) {
  if (request.headers['x-buildr-session'] !== sessionToken) {
    const error: Error & Record<string, any> = new Error('Buildr Web session 已失效，请刷新页面。');
    error.code = 'session_forbidden'; error.status = 403; throw error;
  }
  if ((request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') {
    const error: Error & Record<string, any> = new Error('私有交互只允许当前 Buildr Web 读取。');
    error.code = 'origin_forbidden'; error.status = 403; throw error;
  }
}

export function assertRequestHost(request: any, origin: string) {
  const trustedOrigin = new URL(origin);
  const host = request.headers.host;
  const hostCount = request.rawHeaders?.filter((name: string, index: number) => index % 2 === 0 && name.toLowerCase() === 'host').length;
  const explicitPortHost = `${trustedOrigin.hostname}:${trustedOrigin.port || '80'}`;
  // Compare authorities directly: URL parsing would also accept credentials,
  // paths and alternate spellings of IPv4 addresses supplied by the request.
  if (typeof host !== 'string'
    || (hostCount !== undefined && hostCount !== 1)
    || (host.toLowerCase() !== trustedOrigin.host && host.toLowerCase() !== explicitPortHost)) {
    const error: Error & Record<string, any> = new Error('请求 Host 必须匹配当前 Buildr Web 地址。');
    error.code = 'host_forbidden';
    error.status = 403;
    throw error;
  }
}

export function readJsonBody(request: any, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve: any, reject: any) => {
    let size = 0;
    let tooLarge = false;
    const chunks: any[] = [];
    request.on('data', (chunk: any) => {
      size += chunk.length;
      if (size > maxBytes) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error: Error & Record<string, any> = new Error('请求体超过允许大小。');
        error.code = 'request_body_too_large';
        error.status = 413;
        reject(error);
        return;
      }
      try {
        const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
        resolve(content ? JSON.parse(content) : {});
      } catch {
        const error: Error & Record<string, any> = new Error('请求体必须是合法 JSON。');
        error.code = 'invalid_json';
        error.status = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export function assertMutationRequest(request: any, origin: any, sessionToken: any) {
  if (request.headers.origin !== origin) {
    const error: Error & Record<string, any> = new Error('写请求必须来自当前 Buildr Web。');
    error.code = 'origin_forbidden';
    error.status = 403;
    throw error;
  }
  if (request.headers['x-buildr-session'] !== sessionToken) {
    const error: Error & Record<string, any> = new Error('Buildr Web session 已失效，请刷新页面。');
    error.code = 'session_forbidden';
    error.status = 403;
    throw error;
  }
}

export function assertWriteRequest(request: any, origin: any, sessionToken: any) {
  assertMutationRequest(request, origin, sessionToken);
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error: Error & Record<string, any> = new Error('Buildr Web 请求 content type 必须是 application/json。');
    error.code = 'content_type_unsupported';
    error.status = 415;
    throw error;
  }
}

export function readBinaryBody(request: any, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let length = 0; let overflow = false;
    request.on('data', (chunk: Buffer) => { length += chunk.length; if (length > maxBytes) overflow = true; else chunks.push(chunk); });
    request.on('end', () => {
      if (overflow) { const error: Error & { code?: string; status?: number } = new Error('图片超过允许大小。'); error.code = 'request_body_too_large'; error.status = 413; reject(error); }
      else resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}

export async function readAllowedJsonBody(request: any, allowed: any, label: any, maxBytes = MAX_JSON_BODY_BYTES) {
  const input = await readJsonBody(request, maxBytes);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error: Error & Record<string, any> = new Error(`${label} 请求必须是 JSON object。`);
    error.code = 'task_api_input_invalid';
    error.status = 400;
    throw error;
  }
  for (const field of Object.keys(input)) {
    if (['target', 'root', 'path'].includes(field)) {
      const error: Error & Record<string, any> = new Error('Task API 不接受 filesystem path。');
      error.code = 'target_forbidden';
      error.status = 400;
      throw error;
    }
    if (allowed && !allowed.has(field)) {
      const error: Error & Record<string, any> = new Error(`${label} 不支持字段：${field}。`);
      error.code = 'task_api_field_forbidden';
      error.status = 400;
      error.details = { field };
      throw error;
    }
  }
  return input;
}

/** A path-scoped, HttpOnly cookie lets same-origin <img> requests authenticate without a custom header. */
export function imageSessionCookie(sessionToken: string) {
  return `buildr-image=${sessionToken}; Path=/api/v1/conversation-image; HttpOnly; SameSite=Strict`;
}

export function assertImageRequest(request: any, origin: string, sessionToken: string) {
  const cookie = String(request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('buildr-image='));
  if (cookie?.slice('buildr-image='.length) !== sessionToken) {
    const error: Error & Record<string, any> = new Error('图片会话已失效，请刷新页面。');
    error.code = 'session_forbidden'; error.status = 403; throw error;
  }
  if ((request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') {
    const error: Error & Record<string, any> = new Error('图片只允许当前 Buildr Web 读取。');
    error.code = 'origin_forbidden'; error.status = 403; throw error;
  }
}
