import fs from 'node:fs';
import path from 'node:path';
import { assertFrozenCandidateCheckout } from '../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts';
import { createCandidateSourceBinding } from './candidate-source-binding.ts';
import { validatePackageHandoff } from './local-package-handoff.ts';

/** Separate verification code may consume, but never replace, frozen product
 * inputs. This entry cannot execute checks, build packages or grant publishing. */
export function localPackageVerifierBinding(options: {
  verifierRoot: string; action: string; env: NodeJS.ProcessEnv;
}): { productRoot: string; binding: any | null } {
  const { env } = options;
  const root = env.BUILDR_LOCAL_PACKAGE_PRODUCT_ROOT;
  const expectedVerifier = env.BUILDR_LOCAL_PACKAGE_VERIFICATION_SOURCE;
  if (!root && !expectedVerifier) return { productRoot: options.verifierRoot, binding: null };
  if (!root || !expectedVerifier || !env.BUILDR_CANDIDATE_SOURCE_SHA || !env.BUILDR_LOCAL_PACKAGE_HANDOFF
    || !['plan', 'aggregate'].includes(options.action)
    || env.GITHUB_EVENT_NAME && env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Independent local package verification requires exact roots, source, handoff and a read-only controlled action.');
  }
  const productRoot = fs.realpathSync(root);
  if (productRoot === fs.realpathSync(options.verifierRoot)) throw new Error('Independent verifier must not replace the product checkout.');
  assertFrozenCandidateCheckout(productRoot, env.BUILDR_CANDIDATE_SOURCE_SHA);
  assertFrozenCandidateCheckout(options.verifierRoot, expectedVerifier);
  const handoff = validatePackageHandoff(JSON.parse(fs.readFileSync(env.BUILDR_LOCAL_PACKAGE_HANDOFF, 'utf8')));
  if (handoff.kind === 'plugin' || handoff.sourceCommit !== env.BUILDR_CANDIDATE_SOURCE_SHA || !handoff.verificationRules) {
    throw new Error('Independent verifier requires the original main-package handoff and frozen rules.');
  }
  const binding = createCandidateSourceBinding(productRoot, handoff.sourceCommit, expectedVerifier, handoff.verificationRules.inputPolicy);
  if (binding.productTree !== handoff.sourceTree) throw new Error('Independent verification product tree differs from the handoff.');
  return { productRoot: path.resolve(productRoot), binding };
}
