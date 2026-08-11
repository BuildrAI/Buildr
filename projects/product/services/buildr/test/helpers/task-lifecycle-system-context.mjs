import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

export const TASK_LIFECYCLE_CONTEXT_ENV = 'BUILDR_SYSTEM_TASK_LIFECYCLE_CONTEXT';
export const TASK_LIFECYCLE_CONTEXT_ID = 'task-lifecycle/v1';

const CONTEXT_SCHEMA = 'buildr.system-test-context/v1';
const MARKER = 'context.json';

let localContext = null;

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function contextError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  return error;
}

function digestTree(root) {
  const hash = crypto.createHash('sha256');
  const visit = (target) => {
    const stat = fs.lstatSync(target);
    const relative = path.relative(root, target).split(path.sep).join('/');
    if (stat.isSymbolicLink()) {
      hash.update(`symlink:${relative}:${fs.readlinkSync(target)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      hash.update(`directory:${relative}\0`);
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry));
      return;
    }
    if (stat.isFile()) {
      hash.update(`file:${relative}:${stat.mode & 0o777}\0`);
      hash.update(fs.readFileSync(target));
      hash.update('\0');
    }
  };
  visit(root);
  return `sha256-${hash.digest('hex')}`;
}

function runSetupOperation(operation, invoke) {
  const previousLog = console.log;
  console.log = () => {};
  try {
    invoke();
  } catch (error) {
    throw contextError('system_test_context_setup_failed', `Task lifecycle context setup failed during ${operation}.`, {
      operation,
      cause: error.message,
    });
  } finally {
    console.log = previousLog;
  }
}

function writeChange(workspaceRoot, project, change) {
  const changeRoot = path.join(workspaceRoot, 'projects', project, 'openspec', 'changes', change);
  fs.mkdirSync(changeRoot, { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(changeRoot, 'proposal.md'), `# ${change}\n`);
}

function parseMarker(contextRoot) {
  const markerPath = path.join(contextRoot, MARKER);
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (error) {
    throw contextError('system_test_context_marker_invalid', 'Task lifecycle context marker is missing or invalid.', {
      contextRoot,
      markerPath,
      cause: error.message,
    });
  }
  if (marker.schemaVersion !== CONTEXT_SCHEMA || marker.contextId !== TASK_LIFECYCLE_CONTEXT_ID || marker.workspace !== 'workspace') {
    throw contextError('system_test_context_marker_invalid', 'Task lifecycle context marker does not match the supported contract.', { contextRoot, marker });
  }
  if (!/^sha256-[a-f0-9]{64}$/.test(marker.identity || '') || marker.setup?.applicationOperations !== 4 || !Number.isFinite(marker.setup?.durationMs)) {
    throw contextError('system_test_context_marker_invalid', 'Task lifecycle context marker is incomplete.', { contextRoot, marker });
  }
  return marker;
}

export function inspectTaskLifecycleSystemContext(contextRoot) {
  let resolvedContextRoot;
  try {
    resolvedContextRoot = fs.realpathSync(contextRoot);
  } catch (error) {
    throw contextError('system_test_context_root_invalid', 'Task lifecycle context root is missing or unavailable.', {
      contextRoot: path.resolve(contextRoot),
      cause: error.message,
    });
  }
  const marker = parseMarker(resolvedContextRoot);
  const workspaceRoot = path.resolve(resolvedContextRoot, marker.workspace);
  if (!inside(resolvedContextRoot, workspaceRoot) || !fs.existsSync(workspaceRoot) || !sameFilesystemPath(fs.realpathSync(workspaceRoot), workspaceRoot)) {
    throw contextError('system_test_context_workspace_invalid', 'Task lifecycle context Workspace is missing, linked, or outside the context root.', {
      contextRoot: resolvedContextRoot,
      workspaceRoot,
    });
  }
  const actualIdentity = digestTree(workspaceRoot);
  if (actualIdentity !== marker.identity) {
    throw contextError('system_test_context_identity_changed', 'Task lifecycle context baseline was modified after setup.', {
      contextRoot: resolvedContextRoot,
      expectedIdentity: marker.identity,
      actualIdentity,
    });
  }
  return { contextRoot: resolvedContextRoot, workspaceRoot, marker };
}

export function prepareTaskLifecycleSystemContext({ runtime = createRuntime() } = {}) {
  const contextRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-system-task-context-'));
  const workspaceRoot = path.join(contextRoot, 'workspace');
  const setupStartedAt = Date.now();
  try {
    runSetupOperation('workspace.init', () => runtime.initBuildr(['--target', workspaceRoot, '--name', 'system-task-context', '--description', 'Task lifecycle System context', '--profile', 'team']));
    runSetupOperation('project.create:demo', () => runtime.createProject(['demo', '--target', workspaceRoot, '--name', 'Demo', '--description', 'System context Project']));
    runSetupOperation('project.create:other', () => runtime.createProject(['other', '--target', workspaceRoot, '--name', 'Other', '--description', 'Secondary System context Project']));
    const serviceSource = path.join(contextRoot, 'service-source');
    fs.mkdirSync(serviceSource);
    fs.writeFileSync(path.join(serviceSource, 'README.md'), '# API\n');
    runSetupOperation('service.create:demo/api', () => runtime.createService(['demo/api', serviceSource, '--target', workspaceRoot, '--name', 'API', '--description', 'System context Service', '--type', 'backend']));
    for (const [project, change] of [
      ['demo', 'same-change'],
      ['demo', 'second-change'],
      ['demo', 'review-change'],
      ['other', 'same-change'],
    ]) writeChange(workspaceRoot, project, change);

    const marker = {
      schemaVersion: CONTEXT_SCHEMA,
      contextId: TASK_LIFECYCLE_CONTEXT_ID,
      workspace: 'workspace',
      identity: digestTree(workspaceRoot),
      setup: { applicationOperations: 4, durationMs: Date.now() - setupStartedAt },
    };
    fs.writeFileSync(path.join(contextRoot, MARKER), `${JSON.stringify(marker, null, 2)}\n`);
    inspectTaskLifecycleSystemContext(contextRoot);
    let cleaned = false;
    return {
      contextRoot,
      workspaceRoot,
      marker,
      cleanup() {
        if (cleaned) return { status: 'already-cleaned', identity: marker.identity };
        let validationError = null;
        try {
          inspectTaskLifecycleSystemContext(contextRoot);
        } catch (error) {
          validationError = error;
        } finally {
          fs.rmSync(contextRoot, { recursive: true, force: true });
          cleaned = true;
        }
        if (validationError) throw validationError;
        return { status: 'cleaned', identity: marker.identity };
      },
    };
  } catch (error) {
    fs.rmSync(contextRoot, { recursive: true, force: true });
    throw error;
  }
}

function currentTaskLifecycleSystemContext() {
  const provided = process.env[TASK_LIFECYCLE_CONTEXT_ENV];
  if (provided) return inspectTaskLifecycleSystemContext(provided);
  if (!localContext) localContext = prepareTaskLifecycleSystemContext();
  return inspectTaskLifecycleSystemContext(localContext.contextRoot);
}

export function copyTaskLifecycleWorkspace(t, name = 'task-lifecycle') {
  const context = currentTaskLifecycleSystemContext();
  const safeName = String(name).replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'task-lifecycle';
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${safeName}-`));
  const root = path.join(base, 'workspace');
  try {
    fs.cpSync(context.workspaceRoot, root, { recursive: true });
    inspectTaskLifecycleSystemContext(context.contextRoot);
    if (sameFilesystemPath(fs.realpathSync(root), context.workspaceRoot)) throw contextError('system_test_context_sandbox_invalid', 'Task lifecycle sandbox aliases the immutable baseline.', { root });
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    return {
      base,
      root,
      context: {
        id: context.marker.contextId,
        identity: context.marker.identity,
        root: context.contextRoot,
        setupApplicationOperations: context.marker.setup.applicationOperations,
      },
    };
  } catch (error) {
    fs.rmSync(base, { recursive: true, force: true });
    throw error;
  }
}

export function cleanupLocalTaskLifecycleSystemContext() {
  if (!localContext) return { status: 'not-owned' };
  const result = localContext.cleanup();
  localContext = null;
  return result;
}
