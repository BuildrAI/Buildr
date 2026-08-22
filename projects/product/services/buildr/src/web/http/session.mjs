export const MAX_JSON_BODY_BYTES = 32 * 1024;

export function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('请求体超过允许大小。');
        error.code = 'request_body_too_large';
        error.status = 413;
        reject(error);
        return;
      }
      try {
        const content = Buffer.concat(chunks).toString('utf8');
        resolve(content ? JSON.parse(content) : {});
      } catch {
        const error = new Error('请求体必须是合法 JSON。');
        error.code = 'invalid_json';
        error.status = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export function assertWriteRequest(request, origin, sessionToken) {
  if (request.headers.origin !== origin) {
    const error = new Error('写请求必须来自当前 Buildr Web。');
    error.code = 'origin_forbidden';
    error.status = 403;
    throw error;
  }
  if (request.headers['x-buildr-session'] !== sessionToken) {
    const error = new Error('Buildr Web session 已失效，请刷新页面。');
    error.code = 'session_forbidden';
    error.status = 403;
    throw error;
  }
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error = new Error('Buildr Web 请求 content type 必须是 application/json。');
    error.code = 'content_type_unsupported';
    error.status = 415;
    throw error;
  }
}

export async function readAllowedJsonBody(request, allowed, label) {
  const input = await readJsonBody(request);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error(`${label} 请求必须是 JSON object。`);
    error.code = 'task_api_input_invalid';
    error.status = 400;
    throw error;
  }
  for (const field of Object.keys(input)) {
    if (['target', 'root', 'path'].includes(field)) {
      const error = new Error('Task API 不接受 filesystem path。');
      error.code = 'target_forbidden';
      error.status = 400;
      throw error;
    }
    if (!allowed.has(field)) {
      const error = new Error(`${label} 不支持字段：${field}。`);
      error.code = 'task_api_field_forbidden';
      error.status = 400;
      error.details = { field };
      throw error;
    }
  }
  return input;
}
