'use strict';
const { execFile } = require('node:child_process');
const { realpath } = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { promisify } = require('node:util');
const manifest = require('./ghost.json');

const exec = promisify(execFile);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function canonicalDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return null;
  return realpath(directory).catch(() => null);
}

function contains(root, directory) {
  const relative = path.relative(root, directory);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}

async function getMainCheckout(directory) {
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    const { stdout } = await exec('git', ['-C', directory, 'worktree', 'list', '--porcelain', '-z'], {
      env, maxBuffer: 1024 * 1024, timeout: 3000, windowsHide: true,
    });
    const first = stdout.split('\0', 1)[0];
    if (!first.startsWith('worktree ')) return null;
    return canonicalDirectory(first.slice('worktree '.length));
  } catch {
    return null;
  }
}

async function readWorkspaceRegistry() {
  const origin = manifest.mainView.workspaceWeb;
  const response = await fetch(origin + '/api/v1/workspaces', {
    redirect: 'error',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('Buildr registry unavailable');
  const registry = await response.json();
  if (registry.schemaVersion !== 'buildr.local-workspace-registry/v1' || !Array.isArray(registry.workspaces)) {
    throw new Error('Unexpected Buildr registry response');
  }
  return (await Promise.all(registry.workspaces.filter(
    row => row?.status === 'ready' && typeof row.workspace?.id === 'string' && uuid.test(row.workspace.id),
  ).map(async row => ({
    root: await canonicalDirectory(row.rootPath),
    id: row.workspace.id,
  })))).filter(row => row.root).sort((left, right) => right.root.length - left.root.length);
}

async function resolveWorkspace(workdir) {
  const [directory, registry] = await Promise.all([canonicalDirectory(workdir), readWorkspaceRegistry()]);
  if (!directory) return { workspaceId: null, path: '/?catalog=1' };
  const direct = registry.find(row => contains(row.root, directory));
  // For a linked checkout use the repository's primary checkout as a second
  // containment candidate. A stale copied workspace manifest grants no identity.
  const primary = await getMainCheckout(directory);
  const linked = primary && registry.find(row => contains(row.root, primary));
  const workspace = direct?.root === directory ? direct : linked ?? direct;
  if (!workspace) return { workspaceId: null, path: '/?catalog=1' };
  return { workspaceId: workspace.id, path: '/workspaces/' + workspace.id + '/overview' };
}

function reply(value) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
}

readline.createInterface({ input: process.stdin }).on('line', async line => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request?.id == null) return;
  if (request.method !== 'workspaceWeb.resolve') {
    reply({ id: request.id, error: { code: -32601, message: 'Method not found' } });
    return;
  }
  try {
    reply({ id: request.id, result: await resolveWorkspace(request.params?.workdir) });
  } catch {
    reply({ id: request.id, error: { code: -32000, message: 'Buildr registry unavailable' } });
  }
});
