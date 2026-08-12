#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchRemoteText, remoteTextTimeouts } from '../../../src/infrastructure/network/fetch-remote-text.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-remote-text-'));
const portFile = path.join(root, 'port');
const workspace = path.join(root, 'workspace');
const serverScript = `
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
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const temporaryPortFile = portFile + '.tmp-' + process.pid;
  fs.writeFileSync(temporaryPortFile, String(server.address().port));
  fs.renameSync(temporaryPortFile, portFile);
});
`;
const server = spawn(process.execPath, ['-e', serverScript, portFile], { stdio: ['ignore', 'ignore', 'inherit'] });

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [buildr, ...args], {
    cwd: productRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if ((options.expected ?? 0) !== result.status) throw new Error(`buildr ${args.join(' ')} returned ${result.status}:\n${result.stderr || result.stdout || result.error?.message}`);
  return result;
}

try {
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(portFile), true, 'test server did not start');
  const port = fs.readFileSync(portFile, 'utf8').trim();
  assert.match(port, /^\d+$/, 'test server port must be complete');
  const baseUrl = `http://127.0.0.1:${port}`;
  const offlineEnv = { ...process.env, BUILDR_VERIFICATION_NETWORK_MODE: 'offline' };
  assert.equal(fetchRemoteText(`${baseUrl}/ok`, { env: offlineEnv }), 'ready');
  assert.throws(
    () => fetchRemoteText('https://example.com/skill.md', { env: offlineEnv }),
    /disabled during offline verification/,
  );
  assert.throws(() => remoteTextTimeouts({ BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS: '0' }), /must be an integer/);
  assert.throws(() => remoteTextTimeouts({ BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS: '120001' }), /must be an integer/);

  const timeoutEnv = {
    ...offlineEnv,
    BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS: '150',
    BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS: '500',
  };
  const started = Date.now();
  assert.throws(() => fetchRemoteText(`${baseUrl}/hang`, { label: 'timeout fixture', env: timeoutEnv }), /Failed to fetch timeout fixture/);
  assert(Date.now() - started < 5000, 'remote text timeout was not bounded');

  fs.mkdirSync(workspace);
  run(['init', '--target', workspace, '--name', 'remote-timeout', '--profile', 'personal']);
  run(['skills', 'add', 'slow-skill', '--resolved-source', `${baseUrl}/hang`, '--scope', '.', '--target', workspace]);
  const render = run(['skills', 'render', 'codex', '--scope', '.', '--target', workspace], { env: timeoutEnv, expected: 1 });
  assert.match(render.stderr, /Failed to fetch workspace Skill slow-skill/);
  assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'slow-skill')), false);
  console.log('Remote text timeout verification passed.');
} finally {
  server.kill('SIGTERM');
  fs.rmSync(root, { recursive: true, force: true });
}
