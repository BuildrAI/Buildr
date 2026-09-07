import fs from 'node:fs';
import path from 'node:path';
import {
  capabilityKey,
  parseCapabilityContract,
  parseProjectCapabilities,
  parseSkillsManifestDocument,
} from './manifests.ts';
import { resolveSkills } from './sources.ts';

function layerFor(root: any, scope: any): any  {
  const manifestPath = path.join(root, 'skills', 'manifest.yml');
  if (!fs.existsSync(manifestPath)) return null;
  return { scope, root, manifestPath, document: parseSkillsManifestDocument(manifestPath) };
}

function relative(root: any, file: any): any  {
  return path.relative(root, file).split(path.sep).join('/');
}

export function resolveSkillCapabilityGraph(organizationRoot: any, projectRoot: any = null, options: any = {}): any  {
  const runtime = options.runtime || 'claude-code';
  const scope = projectRoot ? options.scope || `projects/${path.basename(projectRoot)}` : '.';
  const layers: any[] = [layerFor(organizationRoot, '.')];
  const visibleLayers = layers.filter(Boolean);
  const projectCapabilitiesPath = projectRoot ? path.join(projectRoot, 'capabilities.yml') : null;
  const projectContext = projectCapabilitiesPath && fs.existsSync(projectCapabilitiesPath) ? parseProjectCapabilities(projectCapabilitiesPath) : null;
  const definitions: any = new Map();
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
  const skillsById: any = new Map(skills.map((skill: any) => [skill.id, skill]));
  const allEntries = visibleLayers.flatMap((layer: any) => (layer.document.skills || []).map((skill: any) => ({ ...skill, declaredScope: layer.scope })));
  for (const reference of projectContext?.skills || []) {
    const id = typeof reference === 'string' ? reference : reference.id;
    if (!allEntries.some((skill: any) => skill.id === id)) throw new Error(`Project capability context references unknown workspace Skill: ${id} (${projectCapabilitiesPath})`);
  }
  const bindings: any[] = [
    ...(projectContext?.bindings || []).map((binding: any) => ({ ...binding, scope, manifestPath: relative(organizationRoot, projectCapabilitiesPath), context: 'project' })),
    ...[...visibleLayers].reverse().flatMap((layer: any) => (layer.document.bindings || []).map((binding: any) => ({ ...binding, scope: layer.scope, manifestPath: relative(organizationRoot, layer.manifestPath), context: 'workspace-default' }))),
  ];
  const memo: any = new Map();

  function resolveDependency(consumer: any, dependency: any, stack: any): any  {
    const key = capabilityKey(dependency.capability, dependency.version);
    const contract = definitions.get(key) || null;
    const compatible = skills.filter((skill: any) => (skill.provides || []).some((item: any) => item.capability === dependency.capability && item.version === dependency.version));
    const versionCandidates = skills.filter((skill: any) => (skill.provides || []).some((item: any) => item.capability === dependency.capability));
    const activeDeclarations = allEntries.filter((skill: any) => skill.enabled !== false && skill.state !== 'uninstalled');
    const declaredCompatible = activeDeclarations.filter((skill: any) => (skill.provides || []).some((item: any) => item.capability === dependency.capability && item.version === dependency.version));
    const declaredVersionCandidates = activeDeclarations.filter((skill: any) => (skill.provides || []).some((item: any) => item.capability === dependency.capability));
    const binding = bindings.find((item: any) => item.capability === dependency.capability && item.version === dependency.version) || null;
    let selected: any = null;
    let reason: any = null;
    if (!contract) {
      reason = 'invalid_binding';
    } else if (binding) {
      selected = compatible.find((skill: any) => skill.id === binding.provider) || null;
      if (!selected) {
        const declaredProvider = declaredCompatible.find((skill: any) => skill.id === binding.provider);
        reason = declaredProvider && Array.isArray(declaredProvider.runtimes) && !declaredProvider.runtimes.includes(runtime)
          ? 'runtime_unavailable'
          : 'invalid_binding';
      }
    } else if (compatible.length === 1) {
      [selected] = compatible;
    } else if (compatible.length > 1) {
      reason = 'ambiguous_provider';
    } else if (declaredCompatible.some((skill: any) => Array.isArray(skill.runtimes) && !skill.runtimes.includes(runtime))) {
      reason = 'runtime_unavailable';
    } else if (versionCandidates.length > 0 || declaredVersionCandidates.length > 0) {
      reason = 'version_mismatch';
    } else {
      reason = 'missing_provider';
    }

    let providerResult: any = null;
    if (selected) {
      if (stack.includes(selected.id)) {
        const start = stack.indexOf(selected.id);
        const cycle: any[] = [...stack.slice(start), selected.id];
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
      candidates: declaredCompatible.map((skill: any) => {
        const visible = compatible.find((candidate: any) => candidate.id === skill.id && (candidate.declaredScope || scope) === skill.declaredScope);
        return { id: skill.id, scope: skill.declaredScope || scope, runtimePath: visible?.runtimePath || skill.runtimePath || skill.id, runtimeAvailable: Boolean(visible) };
      }),
      candidateVersions: declaredVersionCandidates.map((skill: any) => ({ id: skill.id, versions: (skill.provides || []).filter((item: any) => item.capability === dependency.capability).map((item: any) => item.version) })),
      selectedProvider: selected ? { id: selected.id, scope: selected.declaredScope || scope, runtimePath: selected.runtimePath || selected.id } : null,
      provenance: binding ? `explicit:${binding.scope}` : selected ? 'unique-visible-provider' : 'unresolved',
      rootCause: providerResult?.readiness === 'blocked' ? providerResult : null,
      cycle: providerResult?.cycle || null,
      nextActions: nextActionsFor(reason, dependency, scope, compatible),
    };
  }

  function evaluateConsumer(skillId: any, stack: any = []): any  {
    if (memo.has(skillId) && stack.length === 0) return memo.get(skillId);
    const skill = skillsById.get(skillId);
    if (!skill) return { consumer: skillId, scope, readiness: 'blocked', reason: 'runtime_unavailable', dependencies: [] };
    const nextStack: any[] = [...stack, skillId];
    const dependencies = (skill.requires || []).map((dependency: any) => resolveDependency(skill, dependency, nextStack));
    const requiredFailure = dependencies.find((item: any) => item.mode === 'required' && item.readiness === 'blocked');
    const optionalFailure = dependencies.find((item: any) => item.mode === 'optional' && item.readiness !== 'ready');
    const result: any = {
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

  const consumers = skills.filter((skill: any) => (skill.requires || []).length > 0).map((skill: any) => evaluateConsumer(skill.id));
  if (projectContext?.requires?.length) consumers.push({
    consumer: `project:${path.basename(projectRoot)}`,
    scope,
    readiness: 'ready',
    reason: null,
    dependencies: projectContext.requires.map((dependency: any) => resolveDependency({ id: `project:${path.basename(projectRoot)}`, declaredScope: scope }, dependency, [])),
    structurallyRoutableOnly: true,
    projectContext: true,
  });
  const projectConsumer = consumers.find((consumer: any) => consumer.projectContext);
  if (projectConsumer) {
    const requiredFailure = projectConsumer.dependencies.find((item: any) => item.mode === 'required' && item.readiness === 'blocked');
    const optionalFailure = projectConsumer.dependencies.find((item: any) => item.mode === 'optional' && item.readiness !== 'ready');
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

function nextActionsFor(reason: any, dependency: any, scope: any, candidates: any): any  {
  const identity = capabilityKey(dependency.capability, dependency.version);
  if (reason === 'ambiguous_provider') {
    return candidates.map((candidate: any) => `buildr skills bind ${identity} --provider ${candidate.id} --scope ${scope} --target <workspace>`);
  }
  if (reason === 'missing_provider' || reason === 'version_mismatch' || reason === 'runtime_unavailable') {
    return [`Install a provider that declares ${identity}, then bind it explicitly if more than one provider is visible.`];
  }
  if (reason === 'invalid_binding') return [`Repair or remove the explicit ${identity} binding in scope \`${scope}\`.`];
  if (reason === 'provider_not_ready' || reason === 'dependency_cycle') return ['Repair the selected provider dependency chain shown by doctor before continuing.'];
  return [];
}

export function capabilityBindingsForSkill(graph: any, skillId: any): any  {
  return graph.consumers.find((consumer: any) => consumer.consumer === skillId) || null;
}

function directCapabilityRoute(graph: any, capability: any, version: any): any  {
  const contract = graph.contracts.find((item: any) => item.id === capability && item.version === version) || null;
  const binding = graph.bindings.find((item: any) => item.capability === capability && item.version === version) || null;
  const providers = graph.skills.filter((skill: any) => (skill.provides || []).some((item: any) => item.capability === capability && item.version === version));
  const selected = binding ? providers.find((skill: any) => skill.id === binding.provider) || null : providers.length === 1 ? providers[0] : null;
  let reason: any = null;
  if (!contract) reason = 'contract_missing';
  else if (binding && !selected) reason = 'invalid_binding';
  else if (!binding && providers.length > 1) reason = 'ambiguous_provider';
  else if (!selected) reason = 'missing_provider';
  const providerReadiness = selected ? graph.consumers.find((consumer: any) => consumer.consumer === selected.id) || null : null;
  if (!reason && providerReadiness?.readiness === 'blocked') reason = 'provider_not_ready';
  return {
    scope: graph.scope,
    capability,
    version,
    readiness: reason ? 'blocked' : providerReadiness?.readiness || 'ready',
    reason,
    contract: contract ? { path: contract.contractPath, digest: `sha256-${contract.digest}` } : null,
    binding: binding ? { scope: binding.scope, provider: binding.provider, provenance: binding.context } : null,
    selectedProvider: selected ? { id: selected.id, scope: selected.declaredScope || graph.scope, runtimePath: selected.runtimePath || selected.id } : null,
  };
}

export function resolveCapabilityRoute(organizationRoot: any, projectNames: any, capability: any, version: any, options: any = {}): any  {
  const projects = [...new Set(projectNames || [])].sort((left: any, right: any) => left.localeCompare(right));
  const graphs = projects.length
    ? projects.map((name: any) => resolveSkillCapabilityGraph(organizationRoot, path.join(organizationRoot, 'projects', name), { runtime: options.runtime, scope: `projects/${name}` }))
    : [resolveSkillCapabilityGraph(organizationRoot, null, { runtime: options.runtime })];
  const routes = graphs.map((graph: any) => directCapabilityRoute(graph, capability, version));
  const blocked = routes.find((route: any) => route.readiness === 'blocked');
  if (blocked) return blocked;
  const providerIdentities: any = new Set(routes.map((route: any) => `${route.selectedProvider?.id || ''}:${route.selectedProvider?.runtimePath || ''}`));
  if (providerIdentities.size > 1) return {
    scope: 'cross-project', capability, version, readiness: 'blocked', reason: 'cross_project_binding_ambiguous', contract: routes[0]?.contract || null, binding: null, selectedProvider: null,
  };
  return routes[0];
}

function capabilityGraphsForWorkspace(organizationRoot: any, runtime: any, changedScope: any = '.'): any  {
  if (changedScope !== '.') {
    const projectRoot = path.join(organizationRoot, changedScope);
    return [resolveSkillCapabilityGraph(organizationRoot, projectRoot, { runtime, scope: changedScope })];
  }
  const graphs: any[] = [resolveSkillCapabilityGraph(organizationRoot, null, { runtime })];
  const projectsRoot = path.join(organizationRoot, 'projects');
  if (!fs.existsSync(projectsRoot)) return graphs;
  for (const name of fs.readdirSync(projectsRoot).sort()) {
    const projectRoot = path.join(projectsRoot, name);
    if (!fs.statSync(projectRoot).isDirectory() || !fs.existsSync(path.join(projectRoot, 'capabilities.yml'))) continue;
    graphs.push(resolveSkillCapabilityGraph(organizationRoot, projectRoot, { runtime, scope: `projects/${name}` }));
  }
  return graphs;
}

export function resolveCrossProjectCapabilityContext(organizationRoot: any, projectNames: any, options: any = {}): any  {
  const graphs = projectNames.map((name: any) => resolveSkillCapabilityGraph(organizationRoot, path.join(organizationRoot, 'projects', name), { runtime: options.runtime, scope: `projects/${name}` }));
  const byCapability: any = new Map();
  for (const graph of graphs) for (const binding of graph.bindings.filter((item: any) => item.context === 'project')) {
    const key = capabilityKey(binding.capability, binding.version);
    if (!byCapability.has(key)) byCapability.set(key, []);
    byCapability.get(key).push({ project: graph.scope, provider: binding.provider });
  }
  const conflicts = [...byCapability.entries()].filter(([, bindings]: any) => new Set(bindings.map((item: any) => item.provider)).size > 1).map(([capability, bindings]: any) => ({ reason: 'cross_project_binding_ambiguous', capability, bindings, nextActions: ['Split the task into per-Project actions.', 'Provide an explicit provider selection for this cross-Project task.'] }));
  return { schemaVersion: 'buildr.cross-project-capability-context/v1', projects: projectNames, readiness: conflicts.length ? 'blocked' : 'ready', conflicts, graphs };
}

export function selectedProviderImpacts(organizationRoot: any, providerId: any, options: any = {}): any  {
  const runtime = options.runtime || 'codex';
  const changedScope = options.scope || '.';
  const capability = options.capability || null;
  return capabilityGraphsForWorkspace(organizationRoot, runtime, changedScope).flatMap((graph: any) =>
    graph.consumers.flatMap((consumer: any) => consumer.dependencies
      .filter((dependency: any) => dependency.selectedProvider?.id === providerId
        && dependency.selectedProvider?.scope === changedScope
        && (!capability || (dependency.capability === capability.capability && dependency.version === capability.version)))
      .map((dependency: any) => ({
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
