import crypto from 'node:crypto';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function evidenceBoundary(step) {
  return String(step.testing?.executionBoundary || 'System').toLowerCase();
}

function selectionFromAudit(entry, internalPlan, request) {
  const dependency = entry.triggers?.find((trigger) => trigger.kind === 'dependency-closure');
  const direct = entry.triggers?.find((trigger) => trigger.kind === 'direct-owner');
  const full = entry.triggers?.find((trigger) => trigger.kind === 'full-scope');
  if (dependency) return { kind: 'dependency', reasonCode: 'dependency-closure', trigger: dependency.parentStepId, parent: dependency.parentStepId, scope: 'affected' };
  if (direct) return { kind: 'direct', reasonCode: 'affected-owner', trigger: direct.path, parent: null, scope: 'affected' };
  return { kind: 'full', reasonCode: full?.reasons?.[0]?.code || (request.target.kind === 'product-candidate' ? 'product-candidate' : request.target.kind === 'published-release' ? 'published-release' : 'requested-full'), trigger: request.target.identity, parent: null, scope: 'full' };
}

export function createProductVerificationProvider({ providerId = 'buildr.product-verification/v1', providerIdentity, createInternalPlan, createSelectionAudit }) {
  if (typeof providerIdentity !== 'string' || !providerIdentity) throw new Error('Product verification provider requires providerIdentity.');
  if (typeof createInternalPlan !== 'function' || typeof createSelectionAudit !== 'function') throw new Error('Product verification provider requires internal planner and selection audit ports.');
  return Object.freeze({
    id: providerId,
    identity: providerIdentity,
    plan({ request, declaration, declarationIdentity }) {
      const capability = declaration.capabilities.find((item) => item.usableFor.includes(request.target.kind)
        && [item.invocation.affected, item.invocation.full].filter(Boolean).some((entry) => entry.kind === 'provider' && entry.provider === providerId));
      if (!capability) throw new Error(`Product verification provider has no capability for ${request.target.kind}.`);
      const internalRequest = request.target.kind === 'task-delivery' && request.selection.scope === 'affected'
        ? { paths: request.changedPaths }
        : request.target.kind === 'published-release'
          ? { groups: ['release'] }
          : { profiles: [request.target.kind === 'product-candidate' ? 'candidate' : 'core'] };
      const internalPlan = createInternalPlan(internalRequest);
      const audit = createSelectionAudit(internalPlan);
      const stepById = new Map((internalPlan.steps || []).map((step) => [step.id, step]));
      const selectedItems = (audit.stepSelections || []).map((entry) => {
        const step = stepById.get(entry.stepId);
        const selection = selectionFromAudit(entry, internalPlan, request);
        return {
          id: entry.stepId,
          capability: capability.id,
          evidence: [evidenceBoundary(step)],
          proves: [entry.publicOutcome || step?.testing?.proves || step?.name || entry.stepId],
          selection,
        };
      });
      const coverageGaps = internalPlan.status === 'blocked'
        ? [{ scope: 'provider', code: internalPlan.diagnostic?.code || 'provider-blocked', summary: internalPlan.diagnostic?.message || 'Product verification provider is blocked.' }]
        : [];
      const fullReasons = selectedItems.filter((item) => item.selection.kind === 'full').map((item) => ({ code: item.selection.reasonCode, trigger: item.selection.trigger }));
      const executionUnit = {
        id: `${capability.id}:${digest(selectedItems.map((item) => item.id))}`,
        capability: capability.id,
        scope: selectedItems.some((item) => item.selection.scope === 'full') ? 'full' : 'affected',
        invocation: { kind: 'provider', provider: providerId },
        resourceClaims: [...new Set((internalPlan.steps || []).flatMap((step) => step.resources || []))].sort(),
      };
      for (const item of selectedItems) item.executionUnit = executionUnit;
      const material = {
        schemaVersion: 'buildr.verification-plan/v1',
        requestIdentity: request.identity,
        declarationIdentity,
        providerIdentity,
        target: request.target,
        selection: request.selection,
        selectedItems,
        executionUnits: selectedItems.length ? [executionUnit] : [],
        fullReasons: [...new Map(fullReasons.map((item) => [JSON.stringify(item), item])).values()],
        coverageGaps,
        status: coverageGaps.length ? 'blocked' : 'ready',
      };
      return Object.freeze({ ...material, identity: digest(material) });
    },
  });
}
