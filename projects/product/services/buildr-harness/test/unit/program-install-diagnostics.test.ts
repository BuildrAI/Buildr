import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProgramInstallDiagnostics } from '../../src/executors/program-install-diagnostics.ts';

test('download failures retain their real cause, destination and final unterminated fragment', () => {
  const diagnostics = new ProgramInstallDiagnostics({});
  diagnostics.append('stdout', Buffer.from('[@qoder-ai/qoder-agent-sdk] Downloading: https://download.qoder.com/qodercli/runtime.tgz\n'));
  diagnostics.append('stderr', Buffer.from('npm error code 1\nnpm error [@qoder-ai/qoder-agent-sdk] Unexpected error: Request timeout (60s)'));
  const message = diagnostics.failure(1);
  assert.match(message, /退出码 1/);
  assert.match(message, /下载程序文件/);
  assert.match(message, /下载来源：https:\/\/download\.qoder\.com/);
  assert.match(message, /Request timeout \(60s\)/);
  assert.doesNotMatch(message, /检查网络、磁盘/);
});

test('filesystem, archive and unfamiliar installer errors remain distinguishable', () => {
  for (const [raw, expectedStage, expectedCause] of [
    ['npm error Error: spawn tar ENOENT', '解压程序文件', 'spawn tar ENOENT'],
    ['npm error Checksum verification failed. Expected abc, actual def', '校验下载文件', 'Expected abc, actual def'],
    ['npm error Download failed: HTTP 403', '', 'HTTP 403'],
    ['npm ERR! code ENOTFOUND', '', 'ENOTFOUND'],
    ['npm error ENOSPC: no space left on device', '', 'ENOSPC'],
    ['npm error Unsupported zip compression method 93', '', 'Unsupported zip compression method 93'],
  ]) {
    const diagnostics = new ProgramInstallDiagnostics({});
    diagnostics.append('stderr', Buffer.from(raw));
    const message = diagnostics.failure(7);
    assert.ok(message.includes(expectedCause));
    if (expectedStage) assert.ok(message.includes(expectedStage));
    assert.match(message, /退出码 7/);
  }
});

test('credentials, signed URL components and common token formats never enter the summary', () => {
  const diagnostics = new ProgramInstallDiagnostics({ HTTPS_PROXY: 'http://proxy-user:proxy%40password@proxy.example:8080', NPM_TOKEN: 'known-secret-value' });
  const lines = [
    'npm error request to https://user:password@download.qoder.com/private-token/file?signature=query-secret#fragment-secret failed: ECONNRESET',
    'npm error authentication failed for proxy-user with proxy@password and known-secret-value',
    'npm error Authorization: Bearer bearer-secret',
    'npm error {"_authToken": "config-secret"}',
    'npm error Cookie: session=cookie-secret',
    'npm error invalid credential npm_1234567890123456',
    'npm error invalid credential sk-1234567890123456',
    'npm error invalid credential eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.signatureSecret',
  ];
  for (const line of lines) diagnostics.append('stderr', Buffer.from(line + '\n'));
  const message = diagnostics.failure(1);
  for (const secret of ['proxy-user', 'proxy@password', 'proxy%40password', 'known-secret-value', 'user:password', 'private-token', 'query-secret', 'fragment-secret', 'bearer-secret', 'config-secret', 'cookie-secret', 'npm_1234567890123456', 'sk-1234567890123456', 'signatureSecret']) assert.ok(!message.includes(secret), secret);
  assert.match(message, /已隐藏/);
});

test('the destination remains useful without publishing credentials from a failed request URL', () => {
  const diagnostics = new ProgramInstallDiagnostics({});
  diagnostics.append('stderr', Buffer.from('npm ERR! request to https://private-user:private-pass@registry.npmjs.org/private-path?token=private-token failed: ETIMEDOUT\n'));
  const message = diagnostics.failure(1);
  assert.match(message, /https:\/\/registry\.npmjs\.org/);
  assert.match(message, /ETIMEDOUT/);
  assert.doesNotMatch(message, /private-user|private-pass|private-path|private-token/);
});

test('multiline credential values and command flag arguments stay hidden', () => {
  const diagnostics = new ProgramInstallDiagnostics({});
  diagnostics.append('stderr', Buffer.from('npm error {"_authToken":\nnpm error "multiline-secret-value",\nnpm error }\nnpm error request failed with --password "flag secret value" and --token flag-token-value\nnpm error proxy handshake failed: ECONNRESET\n'));
  const message = diagnostics.failure(1);
  assert.match(message, /proxy handshake failed: ECONNRESET/);
  assert.doesNotMatch(message, /multiline-secret-value|flag secret value|flag-token-value/);
});

test('redaction works across output chunks and preserves split UTF-8 on separate streams', () => {
  const diagnostics = new ProgramInstallDiagnostics({ HTTPS_PROXY: 'http://user:split-secret@proxy.example' });
  const output = Buffer.from('\u001b[31mnpm error 下载失败：ECONNREFUSED https://user:split-secret@download.qoder.com/token?auth=hidden\u001b[0m\n');
  for (let index = 0; index < output.length; index++) diagnostics.append('stderr', output.subarray(index, index + 1));
  diagnostics.append('stdout', Buffer.from('npm error _authTo'));
  diagnostics.append('stderr', Buffer.from('npm error errno ECONNREFUSED\n'));
  diagnostics.append('stdout', Buffer.from('ken=split-token-secret\n'));
  const message = diagnostics.failure(1);
  assert.match(message, /下载失败：ECONNREFUSED https:\/\/download\.qoder\.com/);
  assert.doesNotMatch(message, /split-secret|split-token-secret|auth=|hidden|\u001b|�/);
});

test('noisy output is bounded and oversized lines are discarded without exposing a truncated secret', () => {
  const diagnostics = new ProgramInstallDiagnostics({});
  diagnostics.append('stderr', Buffer.from('npm error ' + 'x'.repeat(9000) + 'token=oversized-secret'));
  diagnostics.append('stderr', Buffer.from('\n'));
  for (let index = 0; index < 1000; index++) diagnostics.append('stderr', Buffer.from(`npm error unrelated error ${index} ${'a'.repeat(220)}\n`));
  diagnostics.append('stderr', Buffer.from('npm error ENOSPC: no space left on device\n'));
  const message = diagnostics.failure(1);
  assert.ok(message.length < 1800);
  assert.match(message, /ENOSPC/);
  assert.doesNotMatch(message, /oversized-secret|xxxx/);
});

test('empty output, timeouts, signals and spawn failures report observed facts without inventing a cause', () => {
  assert.match(new ProgramInstallDiagnostics({}).failure(1), /无法确定底层原因/);
  assert.match(new ProgramInstallDiagnostics({}).failure(null, 'SIGKILL'), /信号 SIGKILL/);
  const diagnostics = new ProgramInstallDiagnostics({});
  diagnostics.append('stderr', Buffer.from('npm error ETIMEDOUT'));
  assert.match(diagnostics.failure(null, 'SIGTERM', true), /超时.*ETIMEDOUT/);
  assert.equal(diagnostics.startFailure(Object.assign(new Error('secret-token'), { code: 'ENOENT' })), '无法启动安装进程（ENOENT）。安装所需的程序或目录不存在。');
  assert.doesNotMatch(diagnostics.startFailure(Object.assign(new Error('secret-token'), { code: 'secret-token' })), /secret-token/);
});
