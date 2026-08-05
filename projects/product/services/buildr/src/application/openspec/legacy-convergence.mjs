export const LEGACY_CONVERGENCE_REGISTRY = Object.freeze({
  baseline: entry('openspec baseline create', 'openspec converge', ['contract-baseline.json']),
  check: entry('openspec check', 'openspec converge', ['contract-pre-sync-receipt.json']),
});

function entry(command, replacement, sidecars) {
  return Object.freeze({
    status: 'deprecated-compatible', command, replacement,
    compatibilityWindow: 'through-next-minor-release', sidecars,
    removalConditions: ['current-consumers-zero', 'new-journeys-use-single-receipt', 'compatibility-window-complete'],
  });
}

export function legacyConvergenceDeprecation(id) {
  const entry = LEGACY_CONVERGENCE_REGISTRY[id];
  if (!entry) throw new Error(`Unknown legacy OpenSpec convergence entry: ${id}`);
  return { ...entry, removalEligible: false };
}

export function legacyConvergenceWarning(id) {
  const deprecation = legacyConvergenceDeprecation(id);
  return `Deprecated compatibility entry: buildr ${deprecation.command}; new Task Finish paths use buildr ${deprecation.replacement}.`;
}

export function legacyConvergenceRetirementStatus({ consumers = [], compatibilityWindowComplete = false } = {}) {
  const normalizedConsumers = [...new Set(consumers)].sort();
  return {
    schemaVersion: 'buildr.openspec-legacy-convergence-retirement/v1',
    consumers: normalizedConsumers,
    currentConsumersZero: normalizedConsumers.length === 0,
    compatibilityWindowComplete,
    removalEligible: normalizedConsumers.length === 0 && compatibilityWindowComplete,
  };
}
