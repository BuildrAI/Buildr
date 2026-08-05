import fs from 'node:fs';
import path from 'node:path';
import {
  capabilityKey,
  parseCapabilityContract,
  parseProjectCapabilities,
  parseSkillsManifestDocument,
} from './manifests.mjs';
import { resolveSkills } from './sources.mjs';

function layerFor(root, scope) {
  const manifestPath = path.join(root, 'skills', 'manifest.yml');
  if (!fs.existsSync(manifestPath)) return null;
  return { scope, root, manifestPath, document: parseSkillsManifestDocument(manifestPath) };
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function resolveSkillCapabilityGraph(organizationRoot, projectRoot = null, options = {}) {
  const runtime = options.runtime || 'claude-code';
  const scope = projectRoot ? options.scope || `projects/${path.basename(projectRoot)}` : '.';
  const layers = [layerFor(organizationRoot, '.')];
  const visibleLayers = layers.filter(Boolean);
  const projectCapabilitiesPath = projectRoot ? path.join(projectRoot, 'capabilities.yml') : null;
  const projectContext = projectCapabilitiesPath && fs.existsSync(projectCapabilitiesPath) ? parseProjectCapabilities(projectCapabilitiesPath) : null;
  const definitions = new Map();
  for (const layer of visibleLayers) {
    for (const contract of layer.document.contracts || []) {
      const key = capabilityKey(contract.id, contract.version);
      if (definitions.has(key)) {
        throw new Error(`Capability contract identity conflict for ${key}: ${definitions.get(key).manifestPath} and ${layer.manifestPath}`);
      }
      const contractPath = path.resolve(path.dirname(layer.manifestPath), contract.path);
      const parsed = parseCapabilityContract(contractPath, contract);
      definitions.set(key, {
        ...contract,
        digest: parsed.digest,
        scope: layer.scope,
        manifestPath: relative(organizationRoot, layer.manifestPath),
        contractPath: relative(organizationRoot, contractPath),
        absolutePath: contractPath,
      });
    }
  }

  const skills = resolveSkills(organizationRoot, projectRoot, {
    runtime,
    projectScope: scope,
    resolveRemote: false,
  });
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const allEntries = visibleLayers.flatMap((layer) => (layer.document.skills || []).map((skill) => ({ ...skill, declaredScope: layer.scope })));
  for (const reference of projectContext?.skills || []) {
    const id = typeof reference === 'string' ? reference : reference.id;
    if (!allEntries.some((skill) => skill.id === id)) throw new Error(`Project capability context references unknown workspace Skill: ${id} (${projectCapabilitiesPath})`);
  }
  const bindings = [
    ...(projectContext?.bindings || []).map((binding) => ({ ...binding, scope, manifestPath: relative(organizationRoot, projectCapabilitiesPath), context: 'project' })),
    ...[...visibleLayers].reverse().flatMap((layer) => (layer.document.bindings || []).map((binding) => ({ ...binding, scope: layer.scope, manifestPath: relative(organizationRoot, layer.manifestPath), context: 'workspace-default' }))),
  ];
  const memo = new Map();

  function resolveDependency(consumer, dependency, stack) {
    const key = capabilityKey(dependency.capability, dependency.version);
    const contract = definitions.get(key) || null;
    const compatible = skills.filter((skill) => (skill.provides || []).some((item) => item.capability === dependency.capability && item.version === dependency.version));
    const versionCandidates = skills.filter((skill) => (skill.provides || []).some((item) => item.capability === dependency.capability));
    const activeDeclarations = allEntries.filter((skill) => skill.enabled !== false && skill.state !== 'uninstalled');
    const declaredCompatible = activeDeclarations.filter((skill) => (skill.provides || []).some((item) => item.capability === dependency.capability && item.version === dependency.version));
    const declaredVersionCandidates = activeDeclarations.filter((skill) => (skill.provides || []).some((item) => item.capability === dependency.capability));
    const binding = bindings.find((item) => item.capability === dependency.capability && item.version === dependency.version) || null;
    let selected = null;
    let reason = null;
    if (!contract) {
      reason = 'invalid_binding';
    } else if (binding) {
      selected = compatible.find((skill) => skill.id === binding.provider) || null;
      if (!selected) {
        const declaredProvider = declaredCompatible.find((skill) => skill.id === binding.provider);
        reason = declaredProvider && Array.isArray(declaredProvider.runtimes) && !declaredProvider.runtimes.includes(runtime)
          ? 'runtime_unavailable'
          : 'invalid_binding';
      }
    } else if (compatible.length === 1) {
      [selected] = compatible;
    } else if (compatible.length > 1) {
      reason = 'ambiguous_provider';
    } else if (declaredCompatible.some((skill) => Array.isArray(skill.runtimes) && !skill.runtimes.includes(runtime))) {
      reason = 'runtime_unavailable';
    } else if (versionCandidates.length > 0 || declaredVersionCandidates.length > 0) {
      reason = 'version_mismatch';
    } else {
      reason = 'missing_provider';
    }

    let providerResult = null;
    if (selected) {
      if (stack.includes(selected.id)) {
        const start = stack.indexOf(selected.id);
        const cycle = [...stack.slice(start), selected.id];
        providerResult = { consumer: selected.id, scope: selected.declaredScope || scope, readiness: 'blocked', reason: 'dependency_cycle', cycle, dependencies: [] };
        reason = 'dependency_cycle';
      } else {
        providerResult = evaluateConsumer(selected.id, stack);
        if (providerResult.readiness === 'blocked') reason = providerResult.reason === 'dependency_cycle' ? 'dependency_cycle' : 'provider_not_ready';
      }
    }
    const unavailable = Boolean(reason);
    return {
      consumer: consumer.id,
      consumerScope: consumer.declaredScope || scope,
      capability: dependency.capability,
      version: dependency.version,
      mode: dependency.mode,
      readiness: unavailable ? (dependency.mode === 'optional' ? 'degraded' : 'blocked') : 'ready',
      reason,
      contract,
      binding: binding ? { scope: binding.scope, provider: binding.provider, manifestPath: binding.manifestPath } : null,
      candidates: declaredCompatible.map((skill) => {
        const visible = compatible.find((candidate) => candidate.id === skill.id && (candidate.declaredScope || scope) === skill.declaredScope);
        return { id: skill.id, scope: skill.declaredScope || scope, runtimePath: visible?.runtimePath || skill.runtimePath || skill.id, runtimeAvailable: Boolean(visible) };
      }),
      candidateVersions: declaredVersionCandidates.map((skill) => ({ id: skill.id, versions: (skill.provides || []).filter((item) => item.capability === dependency.capability).map((item) => item.version) })),
      selectedProvider: selected ? { id: selected.id, scope: selected.declaredScope || scope, runtimePath: selected.runtimePath || selected.id } : null,
      provenance: binding ? `explicit:${binding.scope}` : selected ? 'unique-visible-provider' : 'unresolved',
      rootCause: providerResult?.readiness === 'blocked' ? providerResult : null,
      cycle: providerResult?.cycle || null,
      nextActions: nextActionsFor(reason, dependency, scope, compatible),
    };
  }

  function evaluateConsumer(skillId, stack = []) {
    if (memo.has(skillId) && stack.length === 0) return memo.get(skillId);
    const skill = skillsById.get(skillId);
    if (!skill) return { consumer: skillId, scope, readiness: 'blocked', reason: 'runtime_unavailable', dependencies: [] };
    const nextStack = [...stack, skillId];
    const dependencies = (skill.requires || []).map((dependency) => resolveDependency(skill, dependency, nextStack));
    const requiredFailure = dependencies.find((item) => item.mode === 'required' && item.readiness === 'blocked');
    const optionalFailure = dependencies.find((item) => item.mode === 'optional' && item.readiness !== 'ready');
    const result = {
      consumer: skill.id,
      scope: skill.declaredScope || scope,
      readiness: requiredFailure ? 'blocked' : optionalFailure ? 'degraded' : 'ready',
      reason: requiredFailure?.reason || optionalFailure?.reason || null,
      dependencies,
      structurallyRoutableOnly: true,
      cycle: requiredFailure?.cycle || null,
    };
    if (stack.length === 0) memo.set(skillId, result);
    return result;
  }

  const consumers = skills.filter((skill) => (skill.requires || []).length > 0).map((skill) => evaluateConsumer(skill.id));
  if (projectContext?.requires?.length) consumers.push({
    consumer: `project:${path.basename(projectRoot)}`,
    scope,
    readiness: 'ready',
    reason: null,
    dependencies: projectContext.requires.map((dependency) => resolveDependency({ id: `project:${path.basename(projectRoot)}`, declaredScope: scope }, dependency, [])),
    structurallyRoutableOnly: true,
    projectContext: true,
  });
  const projectConsumer = consumers.find((consumer) => consumer.projectContext);
  if (projectConsumer) {
    const requiredFailure = projectConsumer.dependencies.find((item) => item.mode === 'required' && item.readiness === 'blocked');
    const optionalFailure = projectConsumer.dependencies.find((item) => item.mode === 'optional' && item.readiness !== 'ready');
    projectConsumer.readiness = requiredFailure ? 'blocked' : optionalFailure ? 'degraded' : 'ready';
    projectConsumer.reason = requiredFailure?.reason || optionalFailure?.reason || null;
  }
  return {
    schemaVersion: 'buildr.skill-capability-graph/v1',
    scope,
    runtime,
    contracts: [...definitions.values()],
    bindings,
    consumers,
    skills,
    projectContext: projectContext ? { path: relative(organizationRoot, projectCapabilitiesPath), skills: projectContext.skills || [] } : null,
    structurallyRoutableOnly: true,
  };
}

function nextActionsFor(reason, dependency, scope, candidates) {
  const identity = capabilityKey(dependency.capability, dependency.version);
  if (reason === 'ambiguous_provider') {
    return candidates.map((candidate) => `buildr skills bind ${identity} --provider ${candidate.id} --scope ${scope} --target <workspace>`);
  }
  if (reason === 'missing_provider' || reason === 'version_mismatch' || reason === 'runtime_unavailable') {
    return [`Install a provider that declares ${identity}, then bind it explicitly if more than one provider is visible.`];
  }
  if (reason === 'invalid_binding') return [`Repair or remove the explicit ${identity} binding in scope \`${scope}\`.`];
  if (reason === 'provider_not_ready' || reason === 'dependency_cycle') return ['Repair the selected provider dependency chain shown by doctor before continuing.'];
  return [];
}

export function capabilityBindingsForSkill(graph, skillId) {
  return graph.consumers.find((consumer) => consumer.consumer === skillId) || null;
}

function capabilityGraphsForWorkspace(organizationRoot, runtime, changedScope = '.') {
  if (changedScope !== '.') {
    const projectRoot = path.join(organizationRoot, changedScope);
    return [resolveSkillCapabilityGraph(organizationRoot, projectRoot, { runtime, scope: changedScope })];
  }
  const graphs = [resolveSkillCapabilityGraph(organizationRoot, null, { runtime })];
  const projectsRoot = path.join(organizationRoot, 'projects');
  if (!fs.existsSync(projectsRoot)) return graphs;
  for (const name of fs.readdirSync(projectsRoot).sort()) {
    const projectRoot = path.join(projectsRoot, name);
    if (!fs.statSync(projectRoot).isDirectory() || !fs.existsSync(path.join(projectRoot, 'capabilities.yml'))) continue;
    graphs.push(resolveSkillCapabilityGraph(organizationRoot, projectRoot, { runtime, scope: `projects/${name}` }));
  }
  return graphs;
}

export function resolveCrossProjectCapabilityContext(organizationRoot, projectNames, options = {}) {
  const graphs = projectNames.map((name) => resolveSkillCapabilityGraph(organizationRoot, path.join(organizationRoot, 'projects', name), { runtime: options.runtime, scope: `projects/${name}` }));
  const byCapability = new Map();
  for (const graph of graphs) for (const binding of graph.bindings.filter((item) => item.context === 'project')) {
    const key = capabilityKey(binding.capability, binding.version);
    if (!byCapability.has(key)) byCapability.set(key, []);
    byCapability.get(key).push({ project: graph.scope, provider: binding.provider });
  }
  const conflicts = [...byCapability.entries()].filter(([, bindings]) => new Set(bindings.map((item) => item.provider)).size > 1).map(([capability, bindings]) => ({ reason: 'cross_project_binding_ambiguous', capability, bindings, nextActions: ['Split the task into per-Project actions.', 'Provide an explicit provider selection for this cross-Project task.'] }));
  return { schemaVersion: 'buildr.cross-project-capability-context/v1', projects: projectNames, readiness: conflicts.length ? 'blocked' : 'ready', conflicts, graphs };
}

export function selectedProviderImpacts(organizationRoot, providerId, options = {}) {
  const runtime = options.runtime || 'codex';
  const changedScope = options.scope || '.';
  const capability = options.capability || null;
  return capabilityGraphsForWorkspace(organizationRoot, runtime, changedScope).flatMap((graph) =>
    graph.consumers.flatMap((consumer) => consumer.dependencies
      .filter((dependency) => dependency.selectedProvider?.id === providerId
        && dependency.selectedProvider?.scope === changedScope
        && (!capability || (dependency.capability === capability.capability && dependency.version === capability.version)))
      .map((dependency) => ({
        scope: graph.scope,
        consumer: consumer.consumer,
        capability: dependency.capability,
        version: dependency.version,
        mode: dependency.mode,
        currentReadiness: dependency.readiness,
        selectedProvider: providerId,
      })))
  );
}

export function resolveCapabilityRoutingEvidence(organizationRoot, runtime) {
  const graphs = capabilityGraphsForWorkspace(organizationRoot, runtime);
  return graphs.map((graph) => {
    const routes = graph.consumers.flatMap((consumer) => consumer.dependencies.map((dependency) => ({ ...dependency, consumer: consumer.consumer })));
    for (const binding of graph.bindings) {
      if (routes.some((route) => route.capability === binding.capability && route.version === binding.version)) continue;
      const provider = graph.skills.find((skill) => skill.id === binding.provider && (skill.provides || []).some((item) => item.capability === binding.capability && item.version === binding.version));
      const contract = graph.contracts.find((item) => item.id === binding.capability && item.version === binding.version) || null;
      routes.push({
        consumer: 'product:buildr',
        capability: binding.capability,
        version: binding.version,
        readiness: provider && contract ? 'ready' : 'blocked',
        reason: provider && contract ? null : 'invalid_binding',
        contract,
        selectedProvider: provider ? { id: provider.id, scope: provider.declaredScope || graph.scope, runtimePath: provider.runtimePath || provider.id } : null,
        provenance: `explicit:${binding.scope}`,
      });
    }
    return { scope: graph.scope, routes };
  });
}
