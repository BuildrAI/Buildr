import path from 'node:path';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { registerWorkspaceRegistryRepository } from '../../src/infrastructure/filesystem/workspace-registry-repository.mjs';
import { registerWorkspaceManagementFence } from '../../src/infrastructure/filesystem/workspace-management-fence.mjs';
import { resolveWebProfile } from '../../src/infrastructure/product-identity/web-profile.mjs';
import { registerLocalWorkspaceAppInterface } from '../../src/interfaces/local-app/http/server.mjs';

const identity = JSON.parse(process.env.BUILDR_TEST_PRODUCT_IDENTITY);
const current = resolveWebProfile(identity, { dataRoot: process.env.BUILDR_APP_DATA_DIR });
const profiles = {
  released: resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, { dataRoot: process.env.BUILDR_TEST_RELEASED_ROOT }),
  development: resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { dataRoot: process.env.BUILDR_TEST_DEVELOPMENT_ROOT }),
};
const runtime = createRuntime();
registerWorkspaceRegistryRepository(runtime, { productIdentity: identity, webProfile: current });
registerWorkspaceManagementFence(runtime, { peerProfiles: profiles });
registerLocalWorkspaceAppInterface(runtime, { readProductIdentity: () => identity });
await runtime.startLocalWorkspaceApp(['--no-open', '--port', '0']);
process.stdout.write(`PROFILE_CHILD_READY ${current.profile} ${path.join(current.dataRoot, 'instance.json')}\n`);
