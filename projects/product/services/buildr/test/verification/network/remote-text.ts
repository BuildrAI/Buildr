#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchRemoteText, remoteTextTimeouts } from '../../../src/infrastructure/network/fetch-remote-text.ts';
import { streamRemoteText } from '../../../src/infrastructure/network/stream-remote-text.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr: any = path.join(productRoot, 'bin', 'buildr.mjs');
const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-remote-text-'));
const portFile: any = path.join(root, 'port');
const workspace: any = path.join(root, 'workspace');
const serverScript: any = `
const fs = require('node:fs');
const http = require('node:http');
const portFile = process.argv[1];
const server = http.createServer((req, res) => {
  if (req.url === '/ok') {
    res.end('ready');
    return;
  }
  if (req.url === '/hang') {
    res.writeHead(200, { 'content-type': 'text/markdown' });
    res.write('---\\nname: slow-skill\\n');
    return;
  }
  if (req.url === '/active') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    const timer = setInterval(() => res.write('active'), 40);
    res.on('close', () => clearInterval(timer));
    return;
  }
  if (req.url === '/redirect') {
    res.writeHead(302, { location: '/ok' });
    res.write('redirect-body');
    const timer = setInterval(() => res.write('.'), 40);
    res.on('close', () => clearInterval(timer));
    return;
  }
  if (req.url === '/redirect-external') {
    res.writeHead(302, { location: 'https://example.com/skill.md' });
    res.end();
    return;
  }
  if (req.url === '/redirect-invalid') {
    res.writeHead(302, { location: 'http://[invalid' });
    res.end();
    return;
  }
  if (req.url === '/error') {
    res.writeHead(503);
    res.end('unavailable');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const temporaryPortFile = portFile + '.tmp-' + process.pid;
  fs.writeFileSync(temporaryPortFile, String(server.address().port));
  fs.renameSync(temporaryPortFile, portFile);
});
`;
const server: any = spawn(process.execPath, ['-e', serverScript, portFile], { stdio: ['ignore', 'ignore', 'inherit'] });

function run(args: any, options: any = {}): any  {
  const result: any = spawnSync(process.execPath, [buildr, ...args], {
    cwd: productRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 10000,
  });
  if ((options.expected ?? 0) !== result.status) throw new Error(`buildr ${args.join(' ')} returned ${result.status}:\n${result.stderr || result.stdout || result.error?.message}`);
  return result;
}

try {
  for (let attempt: any = 0; attempt < 100 && !fs.existsSync(portFile); attempt += 1) {
    await new Promise((resolve: any) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(portFile), true, 'test server did not start');
  const port: any = fs.readFileSync(portFile, 'utf8').trim();
  assert.match(port, /^\d+$/, 'test server port must be complete');
  const baseUrl: any = `http://127.0.0.1:${port}`;
  const offlineEnv: any = { ...process.env, BUILDR_VERIFICATION_NETWORK_MODE: 'offline' };
  const directInvocation: any = { command: process.execPath, argsPrefix: [buildr], kind: 'verification-product-entry' };
  assert.equal(fetchRemoteText(`${baseUrl}/ok`, { env: offlineEnv, invocation: directInvocation }), 'ready');
  const redirectStarted: any = Date.now();
  assert.equal(fetchRemoteText(`${baseUrl}/redirect`, { env: offlineEnv, invocation: directInvocation }), 'ready');
  assert(Date.now() - redirectStarted < 5000, 'redirect must close the abandoned response body within the bounded verification window');
  assert.throws(
    () => fetchRemoteText(`${baseUrl}/redirect-external`, { env: offlineEnv, invocation: directInvocation }),
    /Remote text redirect is disabled during offline verification/,
  );
  assert.throws(
    () => fetchRemoteText(`${baseUrl}/redirect-invalid`, { env: offlineEnv, invocation: directInvocation }),
    /Invalid URL/,
  );
  assert.throws(
    () => fetchRemoteText(`${baseUrl}/error`, { env: offlineEnv, invocation: directInvocation }),
    /HTTP 503/,
  );
  assert.throws(
    () => fetchRemoteText('https://example.com/skill.md', { env: offlineEnv }),
    /disabled during offline verification/,
  );
  assert.throws(() => remoteTextTimeouts({ BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS: '0' }), /must be an integer/);
  assert.throws(() => remoteTextTimeouts({ BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS: '120001' }), /must be an integer/);

  const inactivityStarted: any = Date.now();
  await assert.rejects(
    streamRemoteText(`${baseUrl}/hang`, 150, 0, { env: offlineEnv, stdout: { write(): any  {} } }),
    /Remote (?:request|response) inactivity timeout after 150ms/,
  );
  assert(Date.now() - inactivityStarted < 5000, 'remote text inactivity timeout was not bounded');

  const timeoutEnv: any = {
    ...offlineEnv,
    BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS: '150',
    BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS: '10000',
  };

  const totalTimeoutEnv: any = {
    ...offlineEnv,
    BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS: '1000',
    BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS: '300',
  };
  assert.throws(
    () => fetchRemoteText(`${baseUrl}/active`, { label: 'total timeout fixture', env: totalTimeoutEnv, invocation: directInvocation }),
    /total timeout after 300ms/,
  );

  fs.mkdirSync(workspace);
  run(['init', '--target', workspace, '--name', 'remote-timeout', '--profile', 'personal']);
  run(['skills', 'add', 'slow-skill', '--resolved-source', `${baseUrl}/hang`, '--scope', '.', '--target', workspace]);
  const render: any = run(['skills', 'render', 'codex', '--scope', '.', '--target', workspace], { env: timeoutEnv, expected: 1, timeout: 15000 });
  assert.match(render.stderr, /Failed to fetch workspace Skill slow-skill/);
  assert.match(render.stderr, /Remote (?:request|response) inactivity timeout after 150ms/);
  assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'slow-skill')), false);
  console.log('Remote text timeout verification passed.');
} finally {
  server.kill('SIGTERM');
  fs.rmSync(root, { recursive: true, force: true });
}
