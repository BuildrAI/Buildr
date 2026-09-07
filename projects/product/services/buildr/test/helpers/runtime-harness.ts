import {
  createRuntime as createProductRuntime,
  runtimeProvide,
} from '../../src/bootstrap/runtime.ts';
import {
  AGENT_ASSETS_APPLICATION,
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_INTERNAL,
  AGENT_ASSETS_RUNTIME,
} from '../../src/modules/agent-assets/module.ts';
import { CHANGE_APPLICATION } from '../../src/modules/task/change/module.ts';
import { OPENSPEC_APPLICATION, OPENSPEC_QUERY } from '../../src/modules/openspec/module.ts';
import { VERIFICATION_APPLICATION } from '../../src/modules/project-testing/module.ts';
import { PUBLICATION_APPLICATION } from '../../src/modules/publication/module.ts';
import {
  PARENT_COORDINATION_RUNTIME_PORT,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_RUNTIME_PORT,
  TASK_VERIFICATION_RUNTIME_PORT,
  TASK_WORKTREE_PROVIDER,
} from '../../src/modules/task/module.ts';
import { SYSTEM_DOCTOR_APPLICATION } from '../../src/modules/diagnostics/module.ts';
import { SYSTEM_INSTALLATION_APPLICATION } from '../../src/modules/installation/module.ts';
import { WORKSPACE_RUNTIME_PORT } from '../../src/modules/workspace/module.ts';
import { WEB_INSTANCE_LIFECYCLE } from '../../src/web/module.ts';

export * from '../../src/bootstrap/runtime.ts';

const DIRECT_CAPABILITIES = Object.freeze([
  AGENT_ASSETS_APPLICATION,
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_INTERNAL,
  AGENT_ASSETS_RUNTIME,
  PUBLICATION_APPLICATION,
  OPENSPEC_APPLICATION,
  OPENSPEC_QUERY,
  TASK_WORKTREE_PROVIDER,
  CHANGE_APPLICATION,
  VERIFICATION_APPLICATION,
  SYSTEM_INSTALLATION_APPLICATION,
  WEB_INSTANCE_LIFECYCLE,
  SYSTEM_DOCTOR_APPLICATION,
]);

const RUNTIME_PORTS = Object.freeze([
  WORKSPACE_RUNTIME_PORT,
  TASK_RUNTIME_PORT,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_VERIFICATION_RUNTIME_PORT,
  PARENT_COORDINATION_RUNTIME_PORT,
]);

/**
 * Full-product tests exercise the external CLI/HTTP behavior through one explicit adapter.
 * Production composition never receives this flattened compatibility surface.
 */
export function createRuntime(): any {
  const runtime = createProductRuntime();
  for (const capability of DIRECT_CAPABILITIES) Object.assign(runtime, runtimeProvide(runtime, capability));
  for (const capability of RUNTIME_PORTS) {
    const port = runtimeProvide(runtime, capability);
    Object.assign(runtime, port.methods);
    for (const [name, bridge] of Object.entries<any>(port.testSupportProperties || {})) {
      Object.defineProperty(runtime, name, {
        configurable: true,
        enumerable: false,
        get: bridge.get,
        set: bridge.set,
      });
    }
  }
  return runtime;
}
