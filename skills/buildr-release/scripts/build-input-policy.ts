import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const releaseScripts = 'skills/buildr-release/scripts/';
const releaseInputs = Object.freeze([
  `${releaseScripts}package.json`, `${releaseScripts}local-package-build.ts`,
  ...['candidate-package', 'application-payload', 'application-payload-entry', 'mysql-connection-entry',
    'release-artifact', 'release-files', 'release-contract', 'release-notes'].map(name => `${releaseScripts}${name}.ts`),
  `${releaseScripts}dsh-plugin/release.ts`,
]);
export const releaseBuildInputPaths: ReadonlySet<string> = new Set(releaseInputs);
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;

// Versioned interpretation, not the current default classifier. Never change
// an existing version's definition or algorithm; add and retain a new version.
const definitionV1 = {
  version: 'buildr.build-input-policy/v1',
  algorithm: 'release-verifier-roots-with-public-context-exceptions/v1',
  projectOnly: ['knowledge', 'openspec', 'tasks'],
  releaseRoot: 'skills/buildr-release/', releaseInputs,
  webFixtureRoot: 'projects/product/services/buildr-web/test/',
  serviceRoot: 'projects/product/services/buildr/',
  publicTestRoot: 'test/context/', packageProducer: 'test/verification/release/candidate-package.ts',
};
export const BUILD_INPUT_POLICY = Object.freeze({ version: definitionV1.version, identity: digest(definitionV1) });

export function assertBuildInputPolicy(value: any): void {
  if (!isDeepStrictEqual(value, BUILD_INPUT_POLICY)) throw new Error('Unsupported or changed frozen build input policy.');
}

/** Explicit policy selection keeps a later default from reinterpreting an
 * already frozen product/verifier binding. Unknown paths remain build inputs. */
export function verificationOnlyPath(file: string, policy: any = BUILD_INPUT_POLICY): boolean {
  assertBuildInputPolicy(policy);
  if (/^projects\/product\/(?:knowledge|openspec|tasks)\//u.test(file)) return true;
  if (file.startsWith(definitionV1.releaseRoot)) return !releaseInputs.includes(file);
  if (file.startsWith(definitionV1.webFixtureRoot)) return true;
  if (!file.startsWith(definitionV1.serviceRoot)) return false;
  const relative = file.slice(definitionV1.serviceRoot.length);
  if (relative.startsWith('test/') && !relative.startsWith(definitionV1.publicTestRoot)
    && relative !== definitionV1.packageProducer) return true;
  return /^tools\/release\//u.test(relative)
    && !/^tools\/release\/(?:application-payload|release-artifact|release-contract|release-notes)(?:[./-]|$)/u.test(relative);
}

/** Pure value contract shared by the producer, data handoff and consumers.
 * Recipe discovery stays with verification; no execution code is transported. */
export function freezeVerificationRules(input: {
  kind: 'buildr' | 'plugin'; recipeIdentity: string; consumptionIdentity: string;
  scopeIdentity: string | null; platformPolicy: string | null;
}): any {
  const body = { schemaVersion: 'buildr.frozen-verification-rules/v1', inputPolicy: BUILD_INPUT_POLICY,
    kind: input.kind, recipeIdentity: input.recipeIdentity, consumptionIdentity: input.consumptionIdentity,
    scopeIdentity: input.scopeIdentity, platformPolicy: input.platformPolicy };
  const value = { ...body, identity: digest(body) };
  assertFrozenVerificationRules(value);
  return value;
}

export function assertFrozenVerificationRules(value: any): void {
  const { identity, ...body } = value ?? {};
  const fields = ['schemaVersion', 'inputPolicy', 'kind', 'recipeIdentity', 'consumptionIdentity', 'scopeIdentity', 'platformPolicy'];
  if (Object.keys(body).length !== fields.length || fields.some(key => !Object.hasOwn(body, key))
    || body.schemaVersion !== 'buildr.frozen-verification-rules/v1'
    || !['buildr', 'plugin'].includes(body.kind)
    || ![body.recipeIdentity, body.consumptionIdentity].every(item => /^sha256-[a-f0-9]{64}$/u.test(item ?? ''))
    || body.scopeIdentity !== null && !/^sha256-[a-f0-9]{64}$/u.test(body.scopeIdentity ?? '')
    || body.platformPolicy !== null && body.platformPolicy !== 'buildr.local-required-remote-optional/v1'
    || identity !== digest(body)) throw new Error('Frozen verification rules are invalid or changed.');
  assertBuildInputPolicy(body.inputPolicy);
}
