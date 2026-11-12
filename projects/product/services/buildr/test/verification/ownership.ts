import development from './ownership/development.ts';
import runtime from './ownership/runtime.ts';
import delivery from './ownership/delivery.ts';
import governance from './ownership/governance.ts';
const freezeOwnership: any = (value: any) => Object.freeze({
  inputs: Object.freeze(value.inputs),
  inputExclusions: Object.freeze(value.inputExclusions),
  preflightInputs: Object.freeze(value.preflightInputs ?? []),
  behaviorOnlyInputs: Object.freeze(value.behaviorOnlyInputs ?? []),
});

export const VERIFICATION_STEP_OWNERSHIP: any = Object.freeze(Object.fromEntries(
  Object.entries({ ...development, ...runtime, ...delivery, ...governance }).map(([id, value]: any) => [id, freezeOwnership(value)]),
));

export const VERIFICATION_IGNORED_INPUTS: any = Object.freeze([
  "node_modules/**",
  ".buildr/**",
  ".gitignore"
]);

export const VERIFICATION_GOVERNED_REPOSITORY_INPUTS: any = Object.freeze([
  ".github/workflows/publish.yml",
  ".github/workflows/publish-dsh-plugin.yml",
  ".github/workflows/verify.yml",
  ".github/workflows/verify-package.yml",
  "skills/buildr-self-bootstrap-sync/",
  "components/workspace/buildr-self-bootstrap/"
]);

export const isVerificationGovernedRepositoryInput = (file: string): boolean =>
  VERIFICATION_GOVERNED_REPOSITORY_INPUTS.some((input: string) => input === file || input.endsWith('/') && file.startsWith(input));

export { VERIFICATION_FULL_SCOPE_AUTHORITIES, VERIFICATION_FULL_SCOPE_INPUTS, isVerificationFrameworkInput } from './ownership/scope-policy.ts';

export const VERIFICATION_DELEGATED_INPUTS: any = Object.freeze([
  { owner: "product.native-boundaries", inputs: ["test/integration/*-boundaries.test.ts"] },
  {
    "owner": "product.browser-e2e",
    "inputs": [
      "test/e2e/**",
      "test/verification/browser-selector-dispatcher.ts",
      "test/verification/browser-selector-catalog.ts",
      "test/verification/web-dist.ts"
    ]
  }
].map((item: any) => Object.freeze({ owner: item.owner, inputs: Object.freeze(item.inputs) })));

export const VERIFICATION_PRODUCTION_OWNER_ALLOWLIST: any = Object.freeze([
  {
    "path": "src/infrastructure/contracts/declaration-intake.ts",
    "owner": "unit",
    "reason": "The trigger is pure declaration selection glue; declaration Application and CLI behavior have separate owners."
  },
  {
    "path": "src/infrastructure/product-resources/index.ts",
    "owner": "application-payload-release",
    "reason": "The resource resolver is exercised directly by the application payload release verifier."
  }
].map((item: any) => Object.freeze(item)));

export const VERIFICATION_SELECTION_METADATA_INPUTS: any = Object.freeze(['verification.yml', 'package.json', 'package-lock.json', '.github/workflows/verify.yml', '.github/workflows/verify-package.yml']);

export function verificationStepOwnership(id: any, executor: any = null): any  {
  const value: any = VERIFICATION_STEP_OWNERSHIP[id];
  if (!value) throw new Error(`Missing verification ownership declaration: ${id}`);
  // The executing file selectors are also changed-path inputs; do not maintain
  // a second hand-copied membership list beside the primary suite registry.
  const members: string[] = executor?.files ?? executor?.discoveredFiles
    ?? (executor?.file === 'test/verification/run-node-tests.ts' ? executor.args : []) ?? [];
  // Ownership declarations govern selection, not the behavior exercised by
  // every row in their file. Related runs verify their framework contracts;
  // actual executable test members remain direct changed-path inputs.
  const sources = [...members];
  return sources.length === 0 ? value : Object.freeze({ ...value, inputs: Object.freeze([...new Set([...value.inputs, ...sources])]) });
}

export function validateVerificationStepOwnership(steps: any): any {
  const entries = steps.map((step: any) => typeof step === 'string' ? { id: step } : step);
  const expected = new Set(entries.map((step: any) => step.id));
  const findings: any[] = [];
  for (const step of entries) {
    // A Service definition is the sole owner of its test membership and inputs.
    // Cross-service recipes retain the explicit project ownership declarations.
    const serviceDeclared = step.serviceOwned === true && typeof step.serviceRoot === 'string'
      && Array.isArray(step.inputs) && step.inputs.length > 0;
    const browserDeclared = typeof step.browserSelector === 'string' && step.executor?.file === 'test/verification/browser-selector-dispatcher.ts'
      && Array.isArray(step.inputs) && step.inputs.length > 0;
    if (!VERIFICATION_STEP_OWNERSHIP[step.id] && !serviceDeclared && !browserDeclared) findings.push({ step: step.id, code: 'missing_step_ownership' });
  }
  for (const id of Object.keys(VERIFICATION_STEP_OWNERSHIP)) if (!expected.has(id)) findings.push({ step: id, code: 'unknown_step_ownership' });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings) });
}
