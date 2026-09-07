import path from 'node:path';

import { capabilityKey, validateCapabilityIdentity } from './capability-identity.ts';

type Dependencies = {
  isPlainObject(value: unknown): boolean;
  isValidAssetId(value: unknown): boolean;
  normalizeRelativePathForBuildr(value: string, message: string): string;
  parseYamlDocument(content: string, label: string): any;
  quoteYaml(value: unknown): string;
};

export function createComponentDefinitionDomain(dependencies: Dependencies) {
  function parseComponentDefinitionYaml(content: string): any {
    const definition = dependencies.parseYamlDocument(content, 'component definition');
    definition.upstream = dependencies.isPlainObject(definition.upstream) ? definition.upstream : {};
    definition.members = dependencies.isPlainObject(definition.members) ? definition.members : {};
    definition.contributions = dependencies.isPlainObject(definition.contributions) ? definition.contributions : { skillFragments: [], skillDependencies: [] };
    for (const key of ['rules', 'skills', 'commandCollections', 'skillContributions']) if (definition.members[key] === undefined) definition.members[key] = [];
    if (definition.contributions.skillFragments === undefined) definition.contributions.skillFragments = [];
    if (definition.contributions.skillDependencies === undefined) definition.contributions.skillDependencies = [];
    if (definition.integrity === undefined) definition.integrity = [];
    return definition;
  }

  function renderComponentDefinitionYaml(definition: any): string {
    const lines = [
      'schemaVersion: buildr.component/v1',
      `id: ${dependencies.quoteYaml(definition.id)}`,
      `kind: ${dependencies.quoteYaml(definition.kind)}`,
      `version: ${dependencies.quoteYaml(definition.version)}`,
      `source: ${dependencies.quoteYaml(definition.source)}`,
    ];
    if (definition.upstream && Object.keys(definition.upstream).length) {
      lines.push('upstream:');
      for (const [key, value] of Object.entries(definition.upstream)) lines.push(`  ${key}: ${dependencies.quoteYaml(value)}`);
    }
    lines.push('members:');
    for (const key of ['rules', 'skills', 'commandCollections', 'skillContributions']) lines.push(`  ${key}: ${dependencies.quoteYaml(definition.members?.[key] || [])}`);
    if (definition.contributions?.skillFragments?.length || definition.contributions?.skillDependencies?.length) {
      lines.push('contributions:', `  skillFragments: ${dependencies.quoteYaml(definition.contributions.skillFragments || [])}`);
      if (definition.contributions.skillDependencies?.length) {
        lines.push('  skillDependencies:');
        for (const dependency of definition.contributions.skillDependencies) {
          lines.push(`    - skill: ${dependencies.quoteYaml(dependency.skill)}`);
          lines.push(`      capability: ${dependencies.quoteYaml(dependency.capability)}`);
          lines.push(`      version: ${dependencies.quoteYaml(dependency.version)}`);
          lines.push(`      mode: ${dependencies.quoteYaml(dependency.mode)}`);
        }
      }
    }
    lines.push(`integrity: ${dependencies.quoteYaml(definition.integrity || [])}`);
    return `${lines.join('\n')}\n`;
  }

  function componentIntegrityMap(definition: any): Map<string, string> {
    const result = new Map<string, string>();
    for (const item of definition.integrity || []) {
      if (typeof item !== 'string' || !item.includes('=')) continue;
      const index = item.lastIndexOf('=');
      result.set(item.slice(0, index), item.slice(index + 1));
    }
    return result;
  }

  function componentMemberPaths(definition: any): string[] {
    return [
      ...(definition.members?.rules || []),
      ...(definition.members?.skills || []),
      ...(definition.members?.commandCollections || []),
      ...(definition.members?.skillContributions || []),
    ];
  }

  function parseSkillContributionDeclaration(value: unknown): any {
    if (typeof value !== 'string') throw new Error(`Skill contribution declaration must be a string: ${String(value)}.`);
    const slotMatch = value.match(/^([A-Za-z0-9._-]+)#([a-z][a-z0-9-]*)=(.+)$/);
    const boundaryMatch = value.match(/^([A-Za-z0-9._-]+)@(prepend|append)=(.+)$/);
    if (!slotMatch && !boundaryMatch) throw new Error(`Skill contribution declaration is invalid: ${value}. Expected <skill-id>#<slot>=<fragment-path> or <skill-id>@<prepend|append>=<fragment-path>.`);
    const rawFragment = slotMatch ? slotMatch[3] : boundaryMatch![3];
    const fragment = dependencies.normalizeRelativePathForBuildr(rawFragment, `Skill contribution fragment path is unsafe: ${rawFragment}`);
    return slotMatch
      ? { skillId: slotMatch[1], placement: 'slot', slot: slotMatch[2], fragment: fragment.split(path.sep).join('/') }
      : { skillId: boundaryMatch![1], placement: boundaryMatch![2], slot: null, fragment: fragment.split(path.sep).join('/') };
  }

  function parseSkillDependencyContribution(value: any, label = 'Skill dependency contribution'): any {
    if (!dependencies.isPlainObject(value)) throw new Error(`${label} must be an object.`);
    const allowed = new Set(['skill', 'capability', 'version', 'mode']);
    for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not supported.`);
    if (typeof value.skill !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value.skill)) throw new Error(`${label}.skill must be a valid Skill id.`);
    validateCapabilityIdentity(value.capability, value.version, label);
    if (!['required', 'optional'].includes(value.mode)) throw new Error(`${label}.mode must be required or optional.`);
    return { skillId: value.skill, capability: value.capability, version: value.version, mode: value.mode };
  }

  function validateComponentDefinition(definition: any, expectedId: string | null = null): string[] {
    const errors: string[] = [];
    const allowedTop = new Set(['schemaVersion', 'id', 'kind', 'version', 'source', 'upstream', 'members', 'contributions', 'integrity']);
    const forbiddenExtensions = new Set(['adapter', 'adapters', 'adapterModule', 'runtimeHook', 'runtimeHooks', 'executable', 'executables', 'registryPatch', 'runtimeRegistry']);
    for (const key of Object.keys(definition)) {
      if (forbiddenExtensions.has(key)) errors.push(`component field cannot extend or execute runtime adapters: ${key}.`);
      else if (!allowedTop.has(key)) errors.push(`component definition field is not supported: ${key}.`);
    }
    if (definition.schemaVersion !== 'buildr.component/v1') errors.push('component definition schemaVersion must be buildr.component/v1.');
    if (!definition.id || !dependencies.isValidAssetId(definition.id)) errors.push('component id is invalid.');
    if (expectedId && definition.id !== expectedId) errors.push(`component id differs from registry: ${definition.id} != ${expectedId}.`);
    if (!['integration', 'bundle', 'addon'].includes(definition.kind)) errors.push('component kind must be integration, bundle, or addon.');
    if (!definition.version || typeof definition.version !== 'string') errors.push('component version is required.');
    if (!['buildr', 'workspace'].includes(definition.source)) errors.push('component source must be buildr or workspace.');
    for (const key of Object.keys(definition.upstream || {})) if (!['name', 'version'].includes(key)) errors.push(`component upstream field is not supported: ${key}.`);
    const members = definition.members || {};
    for (const key of Object.keys(members)) {
      if (['adapters', 'adapterModules', 'runtimeHooks', 'executables', 'registryPatches'].includes(key)) errors.push(`component member type cannot extend or execute runtime adapters: ${key}.`);
      else if (!['rules', 'skills', 'commandCollections', 'skillContributions'].includes(key)) errors.push(`component members field is not supported: ${key}.`);
    }
    for (const key of ['rules', 'skills', 'commandCollections', 'skillContributions']) {
      if (!Array.isArray(members[key]) || !members[key].every((item: unknown) => typeof item === 'string')) errors.push(`component members.${key} must be an array of paths.`);
    }
    const all = componentMemberPaths(definition);
    if (!all.length) errors.push('component must declare at least one member.');
    const seen = new Set<string>();
    for (const member of all) {
      if (seen.has(member)) errors.push(`duplicate component member: ${member}.`);
      seen.add(member);
      try {
        const normalized = dependencies.normalizeRelativePathForBuildr(member, `component member path is unsafe: ${member}`);
        const validRule = members.rules?.includes(member) && normalized.startsWith('rules/') && normalized !== 'rules/manifest.yml';
        const validSkill = members.skills?.includes(member) && normalized.startsWith('skills/') && normalized !== 'skills/manifest.yml';
        const validCommands = members.commandCollections?.includes(member) && normalized.startsWith('commands/') && normalized !== 'commands/manifest.yml' && normalized.endsWith('/manifest.yml');
        const contributionRoot = `components/${definition.source}/${definition.id}/contributions/`;
        const validContribution = members.skillContributions?.includes(member) && normalized.startsWith(contributionRoot) && normalized.endsWith('.md');
        if (!validRule && !validSkill && !validCommands && !validContribution) errors.push(`component member path does not match its type: ${member}.`);
      } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    const contributions = definition.contributions || {};
    for (const key of Object.keys(contributions)) if (!['skillFragments', 'skillDependencies'].includes(key)) errors.push(`component contributions field is not supported: ${key}.`);
    const fragmentTargets = new Set<string>();
    if (!Array.isArray(contributions.skillFragments) || !contributions.skillFragments.every((item: unknown) => typeof item === 'string')) errors.push('component contributions.skillFragments must be an array of strings.');
    else {
      const contributionMembers = new Set<string>(members.skillContributions || []);
      const referencedFragments = new Set<string>();
      const seenDeclarations = new Set<string>();
      for (const declaration of contributions.skillFragments) {
        if (seenDeclarations.has(declaration)) errors.push(`duplicate Skill contribution declaration: ${declaration}.`);
        seenDeclarations.add(declaration);
        try {
          const parsed = parseSkillContributionDeclaration(declaration);
          fragmentTargets.add(parsed.skillId);
          if (!contributionMembers.has(parsed.fragment)) errors.push(`Skill contribution fragment is not declared as a member: ${parsed.fragment}.`);
          if (referencedFragments.has(parsed.fragment)) errors.push(`Skill contribution fragment is referenced more than once: ${parsed.fragment}.`);
          referencedFragments.add(parsed.fragment);
        } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      }
      for (const member of contributionMembers) if (!referencedFragments.has(member)) errors.push(`Skill contribution member has no declaration: ${member}.`);
    }
    if (!Array.isArray(contributions.skillDependencies)) errors.push('component contributions.skillDependencies must be an array.');
    else {
      const seenDependencies = new Set<string>();
      for (const [index, dependency] of contributions.skillDependencies.entries()) {
        try {
          const parsed = parseSkillDependencyContribution(dependency, `component contributions.skillDependencies[${index}]`);
          if (!fragmentTargets.has(parsed.skillId)) errors.push(`Component Skill dependency target must also receive a Skill fragment: ${parsed.skillId}.`);
          const key = `${parsed.skillId}:${capabilityKey(parsed.capability, parsed.version)}`;
          if (seenDependencies.has(key)) errors.push(`duplicate Component Skill dependency contribution: ${key}.`);
          seenDependencies.add(key);
        } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      }
    }
    const integrityItems = Array.isArray(definition.integrity) ? definition.integrity : [];
    if (!Array.isArray(definition.integrity)) errors.push('component integrity must be an array.');
    const integrityMembers = new Set<string>();
    for (const item of integrityItems) {
      if (typeof item !== 'string' || !item.includes('=')) { errors.push(`component integrity entry is invalid: ${String(item)}.`); continue; }
      const member = item.slice(0, item.lastIndexOf('='));
      if (integrityMembers.has(member)) errors.push(`duplicate component integrity entry: ${member}.`);
      integrityMembers.add(member);
    }
    const integrity = componentIntegrityMap(definition);
    for (const member of all) if (!integrity.get(member) || !/^sha256-[a-f0-9]{64}$/.test(integrity.get(member)!)) errors.push(`component member integrity is missing or invalid: ${member}.`);
    for (const member of integrity.keys()) if (!seen.has(member)) errors.push(`component integrity references unknown member: ${member}.`);
    return errors;
  }

  return Object.freeze({ parseComponentDefinitionYaml, renderComponentDefinitionYaml, componentIntegrityMap, componentMemberPaths, parseSkillContributionDeclaration, parseSkillDependencyContribution, validateComponentDefinition });
}
