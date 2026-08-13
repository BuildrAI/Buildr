import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

import { directoryInventory, inventorySize, sha256 } from './release-files.mjs';

export const runtimeRoleVerificationSchemaVersion = 'buildr.runtime-role-verification/v1';

const PROJECT_CODE = 'runtime-role';
const PROJECT_ID = '3854137c-f6c4-5d53-bcdd-b3e665e69794';
const CAPABILITY_ID = 'runtime-role.workspace-owned';
const COMMAND_TIMEOUT_MS = 180_000;

function canonical(file) {
  return fs.realpathSync(path.resolve(file));
}

function runBuildr(invocation, args, { cwd, env, label }) {
  const result = spawnSync(invocation.command, [...(invocation.argsPrefix ?? []), ...args], {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function runBuildrJson(invocation, args, options) {
  const stdout = runBuildr(invocation, args, options);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${options.label} returned invalid JSON: ${error.message}`);
  }
}

export function currentNodeDistributionRoot(executable = process.execPath, platform = process.platform) {
  const node = canonical(executable);
  const root = platform === 'win32' ? path.dirname(node) : path.dirname(path.dirname(node));
  const npm = platform === 'win32' ? path.join(root, 'npm.cmd') : path.join(root, 'bin', 'npm');
  if (!fs.statSync(npm, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Workspace Node verification requires a complete Node distribution with npm: ${root}`);
  }
  return canonical(root);
}

function writeWorkspaceFixture(workspaceRoot) {
  const workspaceFile = path.join(workspaceRoot, '.buildr', 'workspace.yml');
  const workspace = YAML.parse(fs.readFileSync(workspaceFile, 'utf8'));
  const workspaceId = workspace?.id;
  const declaredVersion = workspace?.runtime?.node?.version;
  if (typeof workspaceId !== 'string' || typeof declaredVersion !== 'string') {
    throw new Error('Runtime-role Workspace must declare an id and exact runtime.node.version.');
  }

  const projectRoot = path.join(workspaceRoot, 'projects', PROJECT_CODE);
  fs.mkdirSync(path.join(projectRoot, 'services'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'projects', 'manifest.yml'), YAML.stringify({
    schemaVersion: 'buildr.projects/v2',
    projects: {
      [PROJECT_CODE]: {
        id: PROJECT_ID,
        workspaceId,
        code: PROJECT_CODE,
        name: 'Runtime role verification fixture',
        description: 'Verifies that Workspace-owned commands use the exact declared Workspace Node.',
        source: { type: 'workspace', path: `projects/${PROJECT_CODE}` },
      },
    },
  }, { lineWidth: 0 }));
  fs.writeFileSync(path.join(projectRoot, 'services', 'manifest.yml'), YAML.stringify({
    schemaVersion: 'buildr.services/v2',
    projectId: PROJECT_ID,
    services: {},
  }, { lineWidth: 0 }));
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [{
      id: CAPABILITY_ID,
      title: 'Workspace-owned Node runtime probe',
      scope: { project: PROJECT_CODE, services: [] },
      invocation: { kind: 'command', argv: ['node', 'runtime-probe.mjs'], cwd: '.' },
      applicability: { paths: ['**'] },
      proves: ['Workspace-owned verification runs with the exact declared Workspace Node identity and path.'],
      requiredForDelivery: false,
      environment: { requires: ['node'] },
      effects: { writes: [], externalSystems: [], authorization: 'implicit' },
      resourceClaims: [],
    }],
  }, { lineWidth: 0 }));
  fs.writeFileSync(path.join(projectRoot, 'runtime-probe.mjs'), `import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const nested = spawnSync('node', ['-p', 'JSON.stringify({ executable: process.execPath, version: process.versions.node })'], {
  encoding: 'utf8',
  env: process.env,
});
if (nested.status !== 0) {
  process.stderr.write(nested.stderr || 'Nested Workspace Node probe failed.\\n');
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  schemaVersion: 'buildr.workspace-runtime-probe/v1',
  executable: process.execPath,
  version: process.versions.node,
  executableSha256: crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex'),
  workspaceIdentity: process.env.BUILDR_WORKSPACE_NODE_IDENTITY || null,
  workspaceVersion: process.env.BUILDR_WORKSPACE_NODE_VERSION || null,
  pathFirstEntry: (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')[0] || null,
  nested: JSON.parse(nested.stdout),
}));
`, 'utf8');
  return { workspaceId, declaredVersion, projectRoot };
}

function assertNoHostNode(environment) {
  const result = spawnSync(process.platform === 'win32' ? 'node.exe' : 'node', ['--version'], {
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!result.error || result.error.code !== 'ENOENT') {
    throw new Error('Runtime-role verification requires a PATH with no discoverable Host Node.');
  }
}

function pathWithoutHostNode(environment, fallback) {
  const executableName = process.platform === 'win32' ? 'node.exe' : 'node';
  const entries = String(environment.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .filter((entry) => !fs.existsSync(path.join(entry, executableName)));
  return [...new Set(entries)].join(path.delimiter) || fallback;
}

function runtimeSnapshot(workspaceNode, probe, nodeRuntimeDataRoot, declaredVersion) {
  const identity = workspaceNode?.identity;
  if (!identity || identity.digest !== probe.workspaceIdentity || identity.version !== declaredVersion) {
    throw new Error('Workspace verification identity does not match the exact Workspace Node declaration and subprocess receipt.');
  }
  if (workspaceNode.actualVersion !== declaredVersion || probe.version !== declaredVersion || probe.workspaceVersion !== declaredVersion) {
    throw new Error('Workspace-owned subprocess did not use the exact declared Workspace Node version.');
  }
  const expectedRoot = path.join(
    path.resolve(nodeRuntimeDataRoot),
    'runtimes',
    'node',
    declaredVersion,
    `${identity.platform}-${identity.arch}`,
  );
  const runtimeRoot = canonical(expectedRoot);
  const executable = canonical(workspaceNode.executable);
  if (identity.platform === 'win') {
    if (executable !== canonical(path.join(runtimeRoot, 'node.exe'))) throw new Error('Workspace Node executable escaped its exact managed runtime root.');
  } else if (executable !== canonical(path.join(runtimeRoot, 'bin', 'node'))) {
    throw new Error('Workspace Node executable escaped its exact managed runtime root.');
  }
  if (canonical(probe.executable) !== executable || canonical(probe.nested.executable) !== executable) {
    throw new Error('Workspace-owned verification or its nested subprocess did not use the declared Workspace Node executable.');
  }
  if (canonical(probe.pathFirstEntry) !== canonical(path.dirname(executable))) {
    throw new Error('Workspace-owned subprocess PATH is not pinned to the declared Workspace Node.');
  }
  const inventory = directoryInventory(runtimeRoot);
  return {
    identity,
    declaredVersion,
    executable,
    executableSha256: probe.executableSha256,
    runtimeRoot,
    runtimeDigest: `sha256-${sha256(Buffer.from(JSON.stringify(inventory)))}`,
    runtimeSize: inventorySize(inventory),
    runtimeFileCount: inventory.length,
  };
}

function publicMainIdentity(identity) {
  return {
    channel: identity.channel,
    role: identity.runtime?.role,
    version: identity.version,
    applicationPayloadDigest: identity.applicationPayloadDigest,
    installationIdentity: identity.installationIdentity,
    runtime: identity.runtime,
  };
}

function sameMainRuntime(before, after) {
  return JSON.stringify(publicMainIdentity(before)) === JSON.stringify(publicMainIdentity(after));
}

export async function verifyWorkspaceOwnedRuntime({
  invocation,
  verificationRoot,
  workspaceRoot = path.join(verificationRoot, 'workspace'),
  appDataRoot = path.join(verificationRoot, 'app-data'),
  nodeRuntimeDataRoot = path.join(verificationRoot, 'node-runtime'),
  workspaceNodeSourceRoot = currentNodeDistributionRoot(),
  environment = process.env,
  expectedMainRole,
  expectedChannel,
}) {
  if (!invocation?.command) throw new Error('Runtime-role verification requires an explicit Buildr invocation.');
  const emptyPath = path.join(verificationRoot, 'empty-path');
  fs.mkdirSync(emptyPath, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(appDataRoot, { recursive: true });
  fs.mkdirSync(nodeRuntimeDataRoot, { recursive: true });
  const env = {
    ...environment,
    PATH: pathWithoutHostNode(environment, emptyPath),
    BUILDR_APP_DATA_DIR: appDataRoot,
    BUILDR_NODE_RUNTIME_DATA_DIR: nodeRuntimeDataRoot,
    ...(workspaceNodeSourceRoot ? { BUILDR_NODE_RUNTIME_SOURCE_ROOT: workspaceNodeSourceRoot } : {}),
    BUILDR_DISABLE_UPDATE_CHECK: '1',
    npm_config_update_notifier: 'false',
  };
  assertNoHostNode(env);
  const workspaceFile = path.join(workspaceRoot, '.buildr', 'workspace.yml');
  if (!fs.existsSync(workspaceFile)) {
    runBuildr(invocation, [
      'init', '--agent', 'codex', '--target', workspaceRoot,
      '--name', 'runtime-role-verification',
      '--description', 'Workspace Node runtime-role release verification',
      '--profile', 'team',
    ], { cwd: workspaceRoot, env, label: 'Initialize runtime-role Workspace through installed Buildr' });
  }
  const fixture = writeWorkspaceFixture(workspaceRoot);
  const before = runBuildrJson(invocation, ['version', '--json'], {
    cwd: workspaceRoot,
    env,
    label: 'Read installed Buildr main-process identity before Workspace verification',
  });
  if (before.runtime?.role !== expectedMainRole || before.channel !== expectedChannel) {
    throw new Error(`Installed Buildr main process must remain ${expectedChannel}/${expectedMainRole}; got ${before.channel}/${before.runtime?.role}.`);
  }
  const execution = runBuildrJson(invocation, [
    'verification', 'run',
    '--project', PROJECT_CODE,
    '--capability', CAPABILITY_ID,
    '--target-identity', `sha256-${sha256(Buffer.from(`${fixture.workspaceId}:${fixture.declaredVersion}:${CAPABILITY_ID}`))}`,
    '--target', workspaceRoot,
    '--json',
  ], { cwd: workspaceRoot, env, label: 'Execute Workspace-owned verification through installed Buildr' });
  if (execution.schemaVersion !== 'buildr.verification-execution/v1' || execution.status !== 'passed') {
    throw new Error('Workspace-owned verification execution did not pass.');
  }
  const check = execution.checks?.find((item) => item.id === CAPABILITY_ID);
  if (!check || check.status !== 'passed') throw new Error('Workspace-owned runtime probe capability did not pass.');
  let probe;
  try { probe = JSON.parse(check.stdout); } catch (error) { throw new Error(`Workspace runtime probe returned invalid JSON: ${error.message}`); }
  if (probe.schemaVersion !== 'buildr.workspace-runtime-probe/v1') throw new Error('Workspace runtime probe schema is invalid.');
  const workspaceRuntime = runtimeSnapshot(execution.workspaceNode, probe, nodeRuntimeDataRoot, fixture.declaredVersion);
  const after = runBuildrJson(invocation, ['version', '--json'], {
    cwd: workspaceRoot,
    env,
    label: 'Read installed Buildr main-process identity after Workspace verification',
  });
  if (!sameMainRuntime(before, after)) throw new Error('Workspace-owned verification changed the Buildr main-process runtime identity.');
  const mainExecutable = canonical(after.runtime?.executable);
  if (mainExecutable === canonical(workspaceRuntime.executable)) {
    throw new Error('Buildr main process and Workspace-owned subprocess unexpectedly share one runtime executable.');
  }
  return {
    schemaVersion: runtimeRoleVerificationSchemaVersion,
    status: 'verified',
    mainProcess: publicMainIdentity(after),
    workspaceRuntime,
    execution: {
      schemaVersion: execution.schemaVersion,
      status: execution.status,
      executionIdentity: execution.executionIdentity,
      capability: CAPABILITY_ID,
      executableMatchesDeclaration: true,
      nestedExecutableMatchesDeclaration: true,
    },
    separation: {
      mainRolePreserved: true,
      mainAndWorkspaceExecutablesDistinct: true,
      identityAndPathComparedIndependentlyOfVersion: true,
      hostNodeAbsentFromPath: true,
    },
  };
}

export function assertWorkspaceRuntimeOnDiskUnchanged(evidence) {
  if (evidence?.status !== 'verified') throw new Error('Workspace runtime on-disk verification requires a verified observation.');
  const expected = evidence.workspaceRuntime;
  const inventory = directoryInventory(expected.runtimeRoot);
  const actual = {
    executableSha256: sha256(fs.readFileSync(expected.executable)),
    runtimeDigest: `sha256-${sha256(Buffer.from(JSON.stringify(inventory)))}`,
    runtimeSize: inventorySize(inventory),
    runtimeFileCount: inventory.length,
  };
  if (
    actual.executableSha256 !== expected.executableSha256
    || actual.runtimeDigest !== expected.runtimeDigest
    || actual.runtimeSize !== expected.runtimeSize
    || actual.runtimeFileCount !== expected.runtimeFileCount
  ) throw new Error('Buildr installation lifecycle changed the Workspace Node on-disk runtime after its verified execution.');
  return true;
}
