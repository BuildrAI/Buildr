import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { freezeVerificationRules, assertFrozenVerificationRules } from '../../../../../../../skills/buildr-release/scripts/build-input-policy.ts';
import { candidateCiRegistryIdentity } from '../candidate-ci-evidence.ts';
import { releaseConsumptionIdentity } from './release-consumption-contract.ts';

const digest = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
export function currentVerificationRules(repo: string, scope: any, kind: 'buildr' | 'plugin', platformPolicy: string | null): any {
  const pluginRecipe = () => [
    'projects/product/services/dsh-plugin/tools/verify-all.ts',
    'projects/product/services/dsh-plugin/tools/full-verification.ts',
    'projects/product/services/dsh-plugin/tools/source-phase-definition.ts',
    'skills/buildr-release/scripts/dsh-plugin/release-candidate.ts',
  ].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex') }));
  return freezeVerificationRules({ kind, recipeIdentity: kind === 'buildr' ? candidateCiRegistryIdentity() : digest(pluginRecipe()),
    consumptionIdentity: kind === 'buildr' ? releaseConsumptionIdentity() : digest({ consumer: 'assertBoundPluginVerification/v1' }),
    scopeIdentity: scope?.identity ?? null, platformPolicy });
}

/** Resume adopts the original value or fails explicitly; never overwrites the
 * scope/rules file because a later tool happens to have a different default. */
export function retainVerificationRules(file: string, expected: any): any {
  assertFrozenVerificationRules(expected);
  if (fs.existsSync(file)) {
    const original = JSON.parse(fs.readFileSync(file, 'utf8'));
    assertFrozenVerificationRules(original);
    if (!isDeepStrictEqual(original, expected)) throw new Error('Frozen verification rules or user scope changed; retain the original selection and diagnose, do not overwrite it.');
    return original;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(expected) + '\n', { flag: 'wx' });
  return expected;
}
