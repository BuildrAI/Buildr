import path from 'node:path';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createWorkspaceRegistryRepository } from '../../src/workspace/persistence/workspace-registry-repository.ts';
import { registerWorkspaceManagementFence } from '../../src/workspace/infrastructure/workspace-management-fence.ts';
import { oppositeWebProfile, resolveWebProfile } from '../../src/system/installation/contracts/web-profile.ts';
import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { ensureRegisteredTarget } from '../../src/workspace/module.ts';
import { assertCurrentNpmLauncherBinding } from '../../src/system/installation/module.ts';

const identity: any = JSON.parse(process.env.BUILDR_TEST_PRODUCT_IDENTITY);
const current: any = resolveWebProfile(identity, { dataRoot: process.env.BUILDR_APP_DATA_DIR });
const profiles: any = {
  released: resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, { dataRoot: process.env.BUILDR_TEST_RELEASED_ROOT }),
  development: resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { dataRoot: process.env.BUILDR_TEST_DEVELOPMENT_ROOT }),
};
const runtime: any = createRuntime();
Object.assign(runtime, createWorkspaceRegistryRepository(runtime, { productIdentity: identity, webProfile: current, resolveWebProfile }));
registerWorkspaceManagementFence(runtime, { peerProfiles: profiles, oppositeWebProfile });
registerWebInstanceLifecycle(runtime, { readProductIdentity: () => identity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget });
await runtime.startBuildrWeb(['--no-open', '--port', '0']);
process.stdout.write(`PROFILE_CHILD_READY ${current.profile} ${path.join(current.dataRoot, 'instance.json')}\n`);
