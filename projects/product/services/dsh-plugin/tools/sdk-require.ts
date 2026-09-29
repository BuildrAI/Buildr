/** Module resolution for packages provided by the pinned DSH SDK's own install. */
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * createRequire rooted at the SDK workspace. pnpm's strict layout only links packages the root
 * manifest declares into node_modules; toolchain-only dependencies such as esbuild stay reachable
 * through the hoisted store at node_modules/.pnpm/node_modules. A flat install of a local checkout
 * still exposes them at the root, so root lookup stays first.
 */
export function createSdkRequire(sdk: string): ReturnType<typeof createRequire> {
  const root = createRequire(join(sdk, 'package.json'));
  const hoisted = createRequire(join(sdk, 'node_modules', '.pnpm', 'node_modules', 'toolchain.cjs'));
  const combined = ((id: string) => { try { return root(id); } catch { return hoisted(id); } }) as ReturnType<typeof createRequire>;
  combined.resolve = ((id: string) => { try { return root.resolve(id); } catch { return hoisted.resolve(id); } }) as ReturnType<typeof createRequire>['resolve'];
  return combined;
}
