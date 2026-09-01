export function recordVerificationResultFromEvidence(runtime, root, taskId, input) {
  return runtime.recordTaskVerification(root, taskId, {
    contentIdentity: input.targetIdentity,
    contentSummary: input.targetSummary,
    checks: input.capabilities.map((item) => ({
      id: `${item.project}-${item.capability}`,
      project: item.project,
      testing: item.capability,
      selection: 'full',
      targets: [item.capability],
      source: 'command',
      outcome: item.outcome,
      summary: item.facts.join(' '),
    })),
    gaps: (input.gaps || input.coverageGaps || []).map((item) => item.testing ? item : { testing: item.scope, reason: item.summary }),
    conclusion: input.conclusion,
  });
}
