function includeCapability(capability, request) {
  if (!capability.stages.includes(request.level)) return false;
  if (capability.maturity !== 'stable' && !request.includeAdvisory) return false;
  if (capability.enforcement?.[request.level] === 'required') return true;
  return request.includeAdvisory === true;
}

export function createProjectVerificationPlan(declaration, request) {
  const byId = new Map(declaration.capabilities.map((capability) => [capability.id, capability]));
  const selected = new Set(declaration.capabilities.filter((capability) => includeCapability(capability, request)).map((capability) => capability.id));
  const reasons = new Map([...selected].map((id) => [id, [`${request.level} ${byId.get(id).enforcement?.[request.level] || 'advisory'}`]]));

  const visitDependencies = (id, trail = []) => {
    if (trail.includes(id)) throw new Error(`Verification dependency cycle: ${[...trail, id].join(' -> ')}`);
    for (const dependency of byId.get(id)?.dependsOn || []) {
      selected.add(dependency);
      reasons.set(dependency, [...(reasons.get(dependency) || []), `dependency of ${id}`]);
      visitDependencies(dependency, [...trail, id]);
    }
  };
  for (const id of [...selected]) visitDependencies(id);

  const superseded = [];
  for (const id of [...selected]) {
    for (const replaced of byId.get(id)?.supersedes || []) {
      if (!selected.has(replaced)) continue;
      selected.delete(replaced);
      superseded.push({ capability: replaced, by: id });
    }
  }

  const ordered = [];
  const visited = new Set();
  const order = (id) => {
    if (visited.has(id) || !selected.has(id)) return;
    for (const dependency of byId.get(id).dependsOn || []) order(dependency);
    visited.add(id);
    ordered.push({ ...byId.get(id), reasons: reasons.get(id) || [] });
  };
  for (const capability of declaration.capabilities) order(capability.id);
  const required = declaration.capabilities.filter((capability) => capability.stages.includes(request.level) && capability.enforcement?.[request.level] === 'required').map((capability) => capability.id);
  const uncoveredRequired = required.filter((id) => !selected.has(id) && !superseded.some((entry) => entry.capability === id));
  return { level: request.level, steps: ordered, superseded, required, uncoveredRequired };
}
