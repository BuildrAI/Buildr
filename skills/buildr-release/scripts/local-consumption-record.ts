import { isDeepStrictEqual } from 'node:util';
import { LOCAL_PACKAGE_MODEL, LOCAL_PLATFORM_POLICY, consumptionInputHandoff, validatePackageHandoff } from './local-package-handoff.ts';
import { assertReleaseConsumptionCoverage } from '../../../projects/product/services/buildr/test/verification/release/release-consumption-contract.ts';
import { currentVerificationRules } from '../../../projects/product/services/buildr/test/verification/release/verification-rules.ts';
import { CANDIDATE_CI_AGGREGATE_SCHEMA } from '../../../projects/product/services/buildr/test/verification/release/candidate-ci-contract.ts';

/** The aggregate is derived once locally. The immutable handoff binds it to all
 * original proof bytes; omitting its embedded handoff avoids a recursive digest. */
export function freezeLocalConsumption(handoff: any, aggregate: any): any {
  const input = consumptionInputHandoff(handoff);
  const producer = aggregate?.packageHandoff && consumptionInputHandoff(aggregate.packageHandoff);
  if (input.platformPolicy !== LOCAL_PLATFORM_POLICY || input.kind === 'plugin' || !input.verificationRules) {
    throw new Error('Frozen main consumption requires the explicit local package policy and rules.');
  }
  if (aggregate?.schemaVersion !== CANDIDATE_CI_AGGREGATE_SCHEMA || aggregate.purpose !== 'candidate'
    || aggregate.rehearsalIdentity || !Array.isArray(aggregate.findings) || aggregate.findings.length !== 0 || aggregate.deferredIds?.length
    || aggregate.workflow || aggregate.sourceBinding || aggregate.verificationSource
    || aggregate.executionModel !== LOCAL_PACKAGE_MODEL || !isDeepStrictEqual(producer, input)) {
    throw new Error('Only complete local consumption without remote or independent execution can be frozen.');
  }
  assertReleaseConsumptionCoverage(aggregate, input, aggregate.artifact);
  const { packageHandoff: _handoff, ...proof } = aggregate;
  return { schemaVersion: 'buildr.local-consumption/v1', inputIdentity: input.identity, aggregate: proof };
}

/** Preservation checks the frozen recipe, source, proof binding, coverage and
 * actual package bytes. It never relabels a local test as remote execution. */
export function adoptLocalConsumption(options: { handoff: any; repo: string; artifact: any; workflow: any;
  sourceCommit: string; sourceTree: string }): any {
  const handoff = validatePackageHandoff(options.handoff), record = handoff.consumption;
  if (!record) throw new Error('Frozen local consumption is missing.');
  const input = consumptionInputHandoff(handoff);
  if (record.schemaVersion !== 'buildr.local-consumption/v1' || record.inputIdentity !== input.identity
    || input.sourceCommit !== options.sourceCommit || input.sourceTree !== options.sourceTree
    || !isDeepStrictEqual(input.verificationRules, currentVerificationRules(options.repo, input.verificationScope, 'buildr', input.platformPolicy))) {
    throw new Error('Frozen consumption inputs or rules differ from the preserved package.');
  }
  // Reuse the same complete-record validation without re-deriving source proofs.
  freezeLocalConsumption(input, { ...record.aggregate, packageHandoff: input });
  const workflow = options.workflow;
  if (!/^[1-9]\d*$/u.test(String(workflow?.runId)) || !/^[1-9]\d*$/u.test(String(workflow?.runAttempt))) {
    throw new Error('Consumption preservation requires the exact remote run and attempt.');
  }
  const result = { ...record.aggregate, packageHandoff: handoff,
    workflow: { runId: String(workflow.runId), aggregateAttempt: Number(workflow.runAttempt), evidenceAttempts: [] },
    preservedConsumption: { inputIdentity: input.identity, origin: 'local' } };
  assertReleaseConsumptionCoverage(result, options, options.artifact);
  return result;
}
