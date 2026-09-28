import path from 'node:path';
import { prepareDshPlugin } from '../../../../resources/runtime/dsh/delivery.ts';

/** DSH owns activation; this application registers this machine's Buildr and emits a bundle. No
 * channel is involved: each plugin package serves exactly one installation by design. */
export function registerDshPluginDelivery(dependencies: {
  productRoot(): string;
  currentProductInvocation(): { command: string; argsPrefix: string[] };
}) {
  return {
    prepareDshPlugin(input: { output: string; bundleRoot?: string }) {
      return prepareDshPlugin({
        ...input,
        bundleRoot: input.bundleRoot ?? path.join(dependencies.productRoot(), 'build', 'dsh-plugin'),
        invocation: dependencies.currentProductInvocation(),
      });
    },
  };
}
