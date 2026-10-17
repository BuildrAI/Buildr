/** Cooperative ownership exercised against the real pinned Cordis lifecycle. */
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import test, { before, after } from 'node:test';
import { createSdkRequire } from '../../tools/sdk-require.ts';
import { createActivation } from '../../plugin/activation.ts';

const sdk = process.env.BUILDR_DSH_SOURCE_SDK_ROOT ? resolve(process.env.BUILDR_DSH_SOURCE_SDK_ROOT) : null;
const sdkRequired = { skip: sdk ? false : 'explicit verified source SDK required' };
let runtimeRoot: string | undefined;
let Context: any;
before(async () => {
  if (!sdk) return;
  runtimeRoot = await mkdtemp(join(tmpdir(), 'buildr-plugin-activation-'));
  const { build } = createSdkRequire(sdk)('esbuild');
  const output = join(runtimeRoot, 'cordis.mjs');
  await build({ stdin: { contents: "export { Context } from '@deepseek-ai/cordis';", resolveDir: sdk, loader: 'ts' },
    outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'es2022',
    tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')] });
  ({ Context } = await import(pathToFileURL(output).href));
});
after(async () => {
  if (runtimeRoot) await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
});
const release = '@buildr-ai/buildr-dsh-plugin', development = '@buildr-ai/buildr-dsh-plugin-dev';

for (const order of [[release, development], [development, release]]) {
  test(`same-domain qualification is exclusive in order ${order.join(' then ')}`, sdkRequired, async () => {
    const host = new Context();
    const leases: ReturnType<typeof createActivation>[] = [];
    const fibers = order.map(packageName => host.plugin({ name: packageName, apply(ctx: InstanceType<typeof Context>) {
      const lease = createActivation(ctx, packageName); leases.push(lease); lease.status();
    } }));
    await Promise.all(fibers.map(async fiber => { await fiber; }));
    assert.equal(leases[0]!.status().active, true);
    assert.deepEqual(leases[1]!.status(), { active: false, packageName: order[1], code: 'plugin-conflict',
      ownerPackage: order[0], message: '另一个 Buildr 插件正在使用此运行域。请在插件管理页停用不需要的版本，再重新检查。' });
    await fibers[1]!.dispose();
    assert.equal(leases[0]!.status().active, true, 'disabling the rejected candidate must not release the owner');
    await fibers[0]!.dispose();
    assert.equal(leases[0]!.status().active, false);
    await host.fiber.dispose();
  });
}

test('normal owner disposal releases the lease for a surviving plugin recheck', sdkRequired, async () => {
  const host = new Context(); let first!: ReturnType<typeof createActivation>, second!: ReturnType<typeof createActivation>;
  const owner = host.plugin({ name: release, apply(ctx: InstanceType<typeof Context>) { first = createActivation(ctx, release); first.status(); } });
  await owner;
  const candidate = host.plugin({ name: development, apply(ctx: InstanceType<typeof Context>) { second = createActivation(ctx, development); second.status(); } });
  await candidate;
  assert.equal(second.status().active, false); await owner.dispose();
  assert.deepEqual(second.status(), { active: true, packageName: development });
  await host.fiber.dispose();
});

test('independent service domains each retain their own owner', sdkRequired, async () => {
  const host = new Context(); let left!: ReturnType<typeof createActivation>, right!: ReturnType<typeof createActivation>;
  await host.isolate('buildrPluginOwner').plugin({ name: 'left', apply(ctx: InstanceType<typeof Context>) { left = createActivation(ctx, release); left.status(); } });
  await host.isolate('buildrPluginOwner').plugin({ name: 'right', apply(ctx: InstanceType<typeof Context>) { right = createActivation(ctx, development); right.status(); } });
  assert.equal(left.status().active, true); assert.equal(right.status().active, true);
  await host.fiber.dispose();
});
