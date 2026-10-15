/** Cooperative ownership exercised against the real pinned Cordis lifecycle. */
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createSdkRequire } from '../../tools/sdk-require.ts';
import { createActivation } from '../../plugin/activation.ts';

const sdk = resolve(process.env.BUILDR_DSH_SDK_ROOT ?? 'build/dsh-0.2.0-rc.1');
const req = createSdkRequire(sdk);
const { build } = req('esbuild');
const output = resolve('build/activation-runtime/cordis.mjs');
await mkdir(resolve('build/activation-runtime'), { recursive: true });
await build({ stdin: { contents: "export { Context } from '@deepseek-ai/cordis';", resolveDir: sdk, loader: 'ts' },
  outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'es2022',
  tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')] });
const { Context } = await import(pathToFileURL(output).href);
const release = '@buildr-ai/buildr-dsh-plugin', development = '@buildr-ai/buildr-dsh-plugin-dev';

for (const order of [[release, development], [development, release]]) {
  test(`same-domain qualification is exclusive in order ${order.join(' then ')}`, async () => {
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

test('normal owner disposal releases the lease for a surviving plugin recheck', async () => {
  const host = new Context(); let first!: ReturnType<typeof createActivation>, second!: ReturnType<typeof createActivation>;
  const owner = host.plugin({ name: release, apply(ctx: InstanceType<typeof Context>) { first = createActivation(ctx, release); first.status(); } });
  await owner;
  const candidate = host.plugin({ name: development, apply(ctx: InstanceType<typeof Context>) { second = createActivation(ctx, development); second.status(); } });
  await candidate;
  assert.equal(second.status().active, false); await owner.dispose();
  assert.deepEqual(second.status(), { active: true, packageName: development });
  await host.fiber.dispose();
});

test('independent service domains each retain their own owner', async () => {
  const host = new Context(); let left!: ReturnType<typeof createActivation>, right!: ReturnType<typeof createActivation>;
  await host.isolate('buildrPluginOwner').plugin({ name: 'left', apply(ctx: InstanceType<typeof Context>) { left = createActivation(ctx, release); left.status(); } });
  await host.isolate('buildrPluginOwner').plugin({ name: 'right', apply(ctx: InstanceType<typeof Context>) { right = createActivation(ctx, development); right.status(); } });
  assert.equal(left.status().active, true); assert.equal(right.status().active, true);
  await host.fiber.dispose();
});
