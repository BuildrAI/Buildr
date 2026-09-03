import fs from 'node:fs';
import path from 'node:path';

import { createRuntime } from '../../../src/bootstrap/runtime.ts';
import { TASK_LIFECYCLE_CONTEXT_KEY } from '../profiles.mjs';

export { TASK_LIFECYCLE_CONTEXT_KEY };

function setupOperation(operation, invoke) {
  const previousLog = console.log;
  console.log = () => {};
  try {
    invoke();
  } catch (error) {
    const wrapped = new Error(`test_context_prepare_failed: Task lifecycle setup failed during ${operation}: ${error.message}`);
    wrapped.code = 'test_context_prepare_failed';
    wrapped.details = { provider: TASK_LIFECYCLE_CONTEXT_KEY, operation, cause: error.message };
    throw wrapped;
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

export function createTaskLifecycleContextProvider({ runtime = createRuntime() } = {}) {
  return Object.freeze({
    key: TASK_LIFECYCLE_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'cli', 'workspace-lifecycle']),
    prepare({ contextRoot, seedRoot }) {
      setupOperation('workspace.init', () => runtime.initBuildr(['--target', seedRoot, '--name', 'system-task-context', '--description', 'Task lifecycle System context', '--profile', 'team']));
      setupOperation('project.create:demo', () => runtime.createProject(['demo', '--target', seedRoot, '--name', 'Demo', '--description', 'System context Project']));
      setupOperation('project.create:other', () => runtime.createProject(['other', '--target', seedRoot, '--name', 'Other', '--description', 'Secondary System context Project']));
      const serviceSource = path.join(contextRoot, 'service-source');
      fs.mkdirSync(serviceSource);
      fs.writeFileSync(path.join(serviceSource, 'README.md'), '# API\n');
      setupOperation('service.create:demo/api', () => runtime.createService(['demo/api', serviceSource, '--target', seedRoot, '--name', 'API', '--description', 'System context Service', '--type', 'backend']));
      for (const [project, change] of [['demo', 'same-change'], ['demo', 'second-change'], ['demo', 'review-change'], ['other', 'same-change']]) {
        writeChange(seedRoot, project, change);
      }
      return { applicationOperations: 4 };
    },
    inspect({ marker }) {
      if (marker.providerData?.applicationOperations !== 4) {
        const error = new Error('test_context_provider_data_invalid: Task lifecycle Context marker is incomplete.');
        error.code = 'test_context_provider_data_invalid';
        throw error;
      }
    },
  });
}

export const taskLifecycleContextProvider = createTaskLifecycleContextProvider();
