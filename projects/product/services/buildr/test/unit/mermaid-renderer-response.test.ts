import assert from 'node:assert/strict';
import test from 'node:test';
import { mermaidRendererResponse, textResponse } from '../../src/web/http/responses.ts';

test('只有绘图页面可同源嵌入，且禁用图示网络和内联脚本，普通页面继续禁止嵌入', () => {
  let headers: Record<string, string> = {};
  const response = { writeHead(_status: number, value: Record<string, string>) { headers = value; }, end() {} };
  mermaidRendererResponse(response, '<html></html>');
  assert.equal(headers['x-frame-options'], 'SAMEORIGIN');
  for (const policy of ["default-src 'none'", "connect-src 'none'", "img-src 'none'", "frame-src 'none'", "frame-ancestors 'self'", "script-src 'self'"]) assert.ok(headers['content-security-policy'].includes(policy));
  assert.ok(!headers['content-security-policy'].includes("script-src 'unsafe-inline'"));
  textResponse(response, 200, 'ordinary', 'text/html');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.ok(headers['content-security-policy'].includes("frame-ancestors 'none'"));
});
