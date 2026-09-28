import fs from 'node:fs';
import path from 'node:path';
import { productDataRoot } from '../../../infrastructure/filesystem/product-data-root.ts';
import { prepareDshPlugin } from '../../../../resources/runtime/dsh/delivery.ts';

/** DSH owns activation; this application registers this machine's Buildr and emits a bundle. No
 * channel is involved: each plugin package serves exactly one installation by design. */
export function registerDshPluginDelivery(dependencies: {
  productRoot(): string;
  currentProductInvocation(): { command: string; argsPrefix: string[] };
  productDataRoot?(): string;
  /** Installation status when the caller already has it; preparation reads it through the entry
   * that invoked it otherwise. */
  installationStatus?: unknown;
}) {
  return {
    /** Omitting the output writes under Buildr's own data root, and repeating the command there
     * replaces the previous result. DSH records this archive as the plugin's source, so it must
     * outlive the command: a caller-chosen temporary directory disappears and reinstalling the
     * plugin then fails with nothing to point at. Preparation owns this directory — no user files
     * are placed in it — which is what makes replacing it safe. */
    prepareDshPlugin(input: { output?: string; bundleRoot?: string }) {
      const bundleRoot = input.bundleRoot ?? path.join(dependencies.productRoot(), 'build', 'dsh-plugin');
      const output = input.output ?? path.join(
        (dependencies.productDataRoot ?? productDataRoot)(),
        'dsh-plugin',
        String(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'package.json'), 'utf8')).name ?? 'buildr-dsh-plugin'),
      );
      if (input.output === undefined) fs.rmSync(output, { recursive: true, force: true });
      return prepareDshPlugin({
        ...input,
        output,
        bundleRoot,
        invocation: dependencies.currentProductInvocation(),
        ...(dependencies.installationStatus === undefined ? {} : { status: dependencies.installationStatus as never }),
      });
    },
  };
}
