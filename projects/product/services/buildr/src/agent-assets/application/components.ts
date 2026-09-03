import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { runFinalDoctor } from '../../infrastructure/final-doctor-process.ts';
import { hasManagedSkillMarker } from '../infrastructure/runtime/render-claude-code.ts';
import { getRuntimeAdapter, isSupportedAgent } from '../infrastructure/runtime/adapter-contract.ts';
import { capabilityKey, validateCapabilityIdentity } from '../infrastructure/runtime/skills/manifests.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import {
  legacySkillProjectionOwnershipReceiptRoot,
  legacySkillProjectionOwnershipReceiptTarget,
  readSkillProjectionReceipt,
  runtimeFileMatches,
  sha256Integrity,
  skillProjectionOwnershipReceiptRoot,
  skillProjectionOwnershipReceiptsEquivalent,
  skillProjectionOwnershipReceiptTarget,
} from '../infrastructure/runtime/skills/projection-files.ts';

export function registerDomainsComponents(runtime: any): any  {
  const renderRuntime = (...args: any[]) => runtime.renderRuntime(...args);
  const doctor = (...args: any[]) => runtime.doctor(...args);
  const isPlainObject = (...args: any[]) => runtime.isPlainObject(...args);
  const assertNoUnknownOptions = (...args: any[]) => runtime.assertNoUnknownOptions(...args);
  const positionalArgs = (...args: any[]) => runtime.positionalArgs(...args);
  const readPackageManifest = (...args: any[]) => runtime.readPackageManifest(...args);
  const collectFiles = (...args: any[]) => runtime.collectFiles(...args);
  const builtinRuleEntry = (...args: any[]) => runtime.builtinRuleEntry(...args);
  const builtinSkillEntry = (...args: any[]) => runtime.builtinSkillEntry(...args);
  const sourcePathFromBuiltin = (...args: any[]) => runtime.sourcePathFromBuiltin(...args);
  const missingAncestorForMutation = (...args: any[]) => runtime.missingAncestorForMutation(...args);
  const mutationPathFingerprint = (...args: any[]) => runtime.mutationPathFingerprint(...args);
  const assertSafeSyncMutationPaths = (...args: any[]) => runtime.assertSafeSyncMutationPaths(...args);
  const isValidAssetId = (...args: any[]) => runtime.isValidAssetId(...args);
  const listManagedDirectories = (...args: any[]) => runtime.listManagedDirectories(...args);
  const rulesManifestPath = (...args: any[]) => runtime.rulesManifestPath(...args);
  const readRulesManifestForWrite = (...args: any[]) => runtime.readRulesManifestForWrite(...args);
  const writeRulesManifest = (...args: any[]) => runtime.writeRulesManifest(...args);
  const assertAgentId = (...args: any[]) => runtime.assertAgentId(...args);
  const normalizeRelativePathForBuildr = (...args: any[]) => runtime.normalizeRelativePathForBuildr(...args);
  const skillsManifestPath = (...args: any[]) => runtime.skillsManifestPath(...args);
  const readSkillsManifestForWrite = (...args: any[]) => runtime.readSkillsManifestForWrite(...args);
  const writeSkillsManifest = (...args: any[]) => runtime.writeSkillsManifest(...args);
  const quoteYaml = (...args: any[]) => runtime.quoteYaml(...args);
  const optionValue = (...args: any[]) => runtime.optionValue(...args);
  const ensureDirectory = (...args: any[]) => runtime.ensureDirectory(...args);
  const atomicWriteFile = (...args: any[]) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args: any[]) => runtime.parseYamlDocument(...args);
  const withWorkspaceMutation = (...args: any[]) => runtime.withWorkspaceMutation(...args);
  const productRoot = (...args: any[]) => runtime.productRoot(...args);
  const resourceWorkspaceRoot = (...args: any[]) => runtime.resourceWorkspaceRoot(...args);
  const hasFlag = (...args: any[]) => runtime.hasFlag(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args: any[]) => runtime.existsDirectory(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);
  const assertInitializedBuildrWorkspace = (...args: any[]) => runtime.assertInitializedBuildrWorkspace(...args);
  const commandRemovalBlockers = (...args: any[]) => runtime.commandRemovalBlockers(...args);
  const parseCommandsManifestYaml = (...args: any[]) => runtime.parseCommandsManifestYaml(...args);
  const validateCommandsManifest = (...args: any[]) => runtime.validateCommandsManifest(...args);

  function componentRegistryPath(targetRoot: any): any  {
    return path.join(targetRoot, 'components', 'manifest.yml');
  }

  function parseComponentsManifestYaml(content: any): any  {
    const manifest = parseYamlDocument(content, 'components/manifest.yml');
    if (!Array.isArray(manifest.components)) manifest.components = [];
    return manifest;
  }

  function validateComponentsManifest(manifest: any): any  {
    const errors: any[] = [];
    if (manifest.schemaVersion !== 'buildr.components/v1') errors.push('components manifest schemaVersion must be buildr.components/v1.');
    if (!Array.isArray(manifest.components)) return [...errors, 'components manifest must declare components as an array.'];
    const ids: any = new Set();
    const allowed: any = new Set(['id', 'source', 'path', 'enabled', 'required', 'state', 'reason']);
    for (const [index, entry] of manifest.components.entries()) {
      const label = `components[${index}]`;
      for (const key of Object.keys(entry)) if (!allowed.has(key)) errors.push(`${label}.${key} is not supported.`);
      if (!entry.id || !isValidAssetId(entry.id)) errors.push(`${label}.id is invalid.`);
      else if (ids.has(entry.id)) errors.push(`Duplicate component id: ${entry.id}.`);
      else ids.add(entry.id);
      if (!['buildr', 'workspace'].includes(entry.source)) errors.push(`${label}.source must be buildr or workspace.`);
      if (!entry.path || typeof entry.path !== 'string') errors.push(`${label}.path is required.`);
      else {
        try {
          const normalized = normalizeRelativePathForBuildr(entry.path, `${label}.path must stay inside components/.`);
          if (!entry.source || !entry.id || normalized.split(path.sep).join('/') !== `components/${entry.source}/${entry.id}`) errors.push(`${label}.path must be components/<source>/<id>.`);
        } catch (error: any) {
          errors.push(error.message);
        }
      }
      if (typeof entry.enabled !== 'boolean') errors.push(`${label}.enabled must be boolean.`);
      if (typeof entry.required !== 'boolean') errors.push(`${label}.required must be boolean.`);
      if (!['installed', 'uninstalled'].includes(entry.state)) errors.push(`${label}.state must be installed or uninstalled.`);
      if (entry.reason !== undefined && typeof entry.reason !== 'string') errors.push(`${label}.reason must be a string.`);
    }
    return errors;
  }

  function renderComponentsManifestYaml(manifest: any): any  {
    const lines: any[] = ['schemaVersion: buildr.components/v1'];
    if (!manifest.components?.length) return `${lines.concat('components: []').join('\n')}\n`;
    lines.push('components:');
    for (const entry of manifest.components) {
      lines.push(`  - id: ${quoteYaml(entry.id)}`);
      for (const key of ['source', 'path']) if (entry[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(entry[key])}`);
      if (entry.enabled !== undefined) lines.push(`    enabled: ${quoteYaml(Boolean(entry.enabled))}`);
      if (entry.required !== undefined) lines.push(`    required: ${quoteYaml(Boolean(entry.required))}`);
      if (entry.state !== undefined) lines.push(`    state: ${quoteYaml(entry.state)}`);
      if (entry.reason !== undefined) lines.push(`    reason: ${quoteYaml(entry.reason)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function readComponentsManifestForWrite(targetRoot: any): any  {
    const file = componentRegistryPath(targetRoot);
    const symlink = workspaceSymlinkSegment(targetRoot, 'components/manifest.yml');
    if (symlink) throw new Error(`Component registry path crosses a symbolic link: ${symlink}`);
    if (!existsFile(file)) return { schemaVersion: 'buildr.components/v1', components: [] };
    const manifest = parseComponentsManifestYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateComponentsManifest(manifest);
    if (errors.length) throw new Error(`components/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    return manifest;
  }

  function writeComponentsManifest(targetRoot: any, manifest: any): any  {
    const file = componentRegistryPath(targetRoot);
    const symlink = workspaceSymlinkSegment(targetRoot, 'components/manifest.yml');
    if (symlink) throw new Error(`Component registry path crosses a symbolic link: ${symlink}`);
    atomicWriteFile(file, renderComponentsManifestYaml(manifest));
    return file;
  }

  function parseComponentDefinitionYaml(content: any): any  {
    const definition = parseYamlDocument(content, 'component definition');
    definition.upstream = isPlainObject(definition.upstream) ? definition.upstream : {};
    definition.members = isPlainObject(definition.members) ? definition.members : {};
    definition.contributions = isPlainObject(definition.contributions) ? definition.contributions : { skillFragments: [], skillDependencies: [] };
    for (const key of ['rules', 'skills', 'commandCollections', 'skillContributions']) if (definition.members[key] === undefined) definition.members[key] = [];
    if (definition.contributions.skillFragments === undefined) definition.contributions.skillFragments = [];
    if (definition.contributions.skillDependencies === undefined) definition.contributions.skillDependencies = [];
    if (definition.integrity === undefined) definition.integrity = [];
    return definition;
  }

  function renderComponentDefinitionYaml(definition: any): any  {
    const lines: any[] = [
      'schemaVersion: buildr.component/v1',
      `id: ${quoteYaml(definition.id)}`,
      `kind: ${quoteYaml(definition.kind)}`,
      `version: ${quoteYaml(definition.version)}`,
      `source: ${quoteYaml(definition.source)}`,
    ];
    if (definition.upstream && Object.keys(definition.upstream).length) {
      lines.push('upstream:');
      for (const [key, value] of Object.entries(definition.upstream)) lines.push(`  ${key}: ${quoteYaml(value)}`);
    }
    lines.push('members:');
    for (const key of ['rules', 'skills', 'commandCollections', 'skillContributions']) lines.push(`  ${key}: ${quoteYaml(definition.members?.[key] || [])}`);
    if (definition.contributions?.skillFragments?.length || definition.contributions?.skillDependencies?.length) {
      lines.push('contributions:');
      lines.push(`  skillFragments: ${quoteYaml(definition.contributions.skillFragments || [])}`);
      if (definition.contributions.skillDependencies?.length) {
        lines.push('  skillDependencies:');
        for (const dependency of definition.contributions.skillDependencies) {
          lines.push(`    - skill: ${quoteYaml(dependency.skill)}`);
          lines.push(`      capability: ${quoteYaml(dependency.capability)}`);
          lines.push(`      version: ${quoteYaml(dependency.version)}`);
          lines.push(`      mode: ${quoteYaml(dependency.mode)}`);
        }
      }
    }
    lines.push(`integrity: ${quoteYaml(definition.integrity || [])}`);
    return `${lines.join('\n')}\n`;
  }

  function componentIntegrityMap(definition: any): any  {
    const result: any = new Map();
    for (const item of definition.integrity || []) {
      if (typeof item !== 'string' || !item.includes('=')) continue;
      const index = item.lastIndexOf('=');
      result.set(item.slice(0, index), item.slice(index + 1));
    }
    return result;
  }

  function componentMemberPaths(definition: any): any  {
    return [
      ...(definition.members?.rules || []),
      ...(definition.members?.skills || []),
      ...(definition.members?.commandCollections || []),
      ...(definition.members?.skillContributions || []),
    ];
  }

  function parseSkillContributionDeclaration(value: any): any  {
    if (typeof value !== 'string') throw new Error(`Skill contribution declaration must be a string: ${String(value)}.`);
    const slotMatch = value.match(/^([A-Za-z0-9._-]+)#([a-z][a-z0-9-]*)=(.+)$/);
    const boundaryMatch = value.match(/^([A-Za-z0-9._-]+)@(prepend|append)=(.+)$/);
    if (!slotMatch && !boundaryMatch) throw new Error(`Skill contribution declaration is invalid: ${value}. Expected <skill-id>#<slot>=<fragment-path> or <skill-id>@<prepend|append>=<fragment-path>.`);
    const rawFragment = slotMatch ? slotMatch[3] : boundaryMatch![3];
    const fragment = normalizeRelativePathForBuildr(rawFragment, `Skill contribution fragment path is unsafe: ${rawFragment}`);
    return slotMatch
      ? { skillId: slotMatch[1], placement: 'slot', slot: slotMatch[2], fragment: fragment.split(path.sep).join('/') }
      : { skillId: boundaryMatch![1], placement: boundaryMatch![2], slot: null, fragment: fragment.split(path.sep).join('/') };
  }

  function parseSkillDependencyContribution(value: any, label: any = 'Skill dependency contribution'): any  {
    if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
    const allowed: any = new Set(['skill', 'capability', 'version', 'mode']);
    for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not supported.`);
    if (typeof value.skill !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value.skill)) throw new Error(`${label}.skill must be a valid Skill id.`);
    validateCapabilityIdentity(value.capability, value.version, label);
    if (!['required', 'optional'].includes(value.mode)) throw new Error(`${label}.mode must be required or optional.`);
    return { skillId: value.skill, capability: value.capability, version: value.version, mode: value.mode };
  }

  function validateComponentDefinition(definition: any, expectedId: any = null): any  {
    const errors: any[] = [];
    const allowedTop: any = new Set(['schemaVersion', 'id', 'kind', 'version', 'source', 'upstream', 'members', 'contributions', 'integrity']);
    const adapterExtensionFields: any = new Set(['adapter', 'adapters', 'adapterModule', 'runtimeHook', 'runtimeHooks', 'executable', 'executables', 'registryPatch', 'runtimeRegistry']);
    for (const key of Object.keys(definition)) {
      if (adapterExtensionFields.has(key)) errors.push(`component field cannot extend or execute runtime adapters: ${key}.`);
      else if (!allowedTop.has(key)) errors.push(`component definition field is not supported: ${key}.`);
    }
    if (definition.schemaVersion !== 'buildr.component/v1') errors.push('component definition schemaVersion must be buildr.component/v1.');
    if (!definition.id || !isValidAssetId(definition.id)) errors.push('component id is invalid.');
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
      if (!Array.isArray(members[key]) || !members[key].every((item: any) => typeof item === 'string')) errors.push(`component members.${key} must be an array of paths.`);
    }
    const all = componentMemberPaths(definition);
    if (all.length === 0) errors.push('component must declare at least one member.');
    const seen: any = new Set();
    for (const member of all) {
      if (seen.has(member)) errors.push(`duplicate component member: ${member}.`);
      seen.add(member);
      try {
        const normalized = normalizeRelativePathForBuildr(member, `component member path is unsafe: ${member}`);
        const validRule = members.rules?.includes(member) && normalized.startsWith('rules/') && normalized !== 'rules/manifest.yml';
        const validSkill = members.skills?.includes(member) && normalized.startsWith('skills/') && normalized !== 'skills/manifest.yml';
        const validCommands = members.commandCollections?.includes(member) && normalized.startsWith('commands/') && normalized !== 'commands/manifest.yml' && normalized.endsWith('/manifest.yml');
        const contributionRoot = `components/${definition.source}/${definition.id}/contributions/`;
        const validContribution = members.skillContributions?.includes(member) && normalized.startsWith(contributionRoot) && normalized.endsWith('.md');
        if (!validRule && !validSkill && !validCommands && !validContribution) errors.push(`component member path does not match its type: ${member}.`);
      } catch (error: any) {
        errors.push(error.message);
      }
    }
    const contributions = definition.contributions || {};
    for (const key of Object.keys(contributions)) if (!['skillFragments', 'skillDependencies'].includes(key)) errors.push(`component contributions field is not supported: ${key}.`);
    const fragmentTargets: any = new Set();
    if (!Array.isArray(contributions.skillFragments) || !contributions.skillFragments.every((item: any) => typeof item === 'string')) {
      errors.push('component contributions.skillFragments must be an array of strings.');
    } else {
      const contributionMembers: any = new Set(members.skillContributions || []);
      const referencedFragments: any = new Set();
      const seenDeclarations: any = new Set();
      for (const declaration of contributions.skillFragments) {
        if (seenDeclarations.has(declaration)) errors.push(`duplicate Skill contribution declaration: ${declaration}.`);
        seenDeclarations.add(declaration);
        try {
          const parsed = parseSkillContributionDeclaration(declaration);
          fragmentTargets.add(parsed.skillId);
          if (!contributionMembers.has(parsed.fragment)) errors.push(`Skill contribution fragment is not declared as a member: ${parsed.fragment}.`);
          if (referencedFragments.has(parsed.fragment)) errors.push(`Skill contribution fragment is referenced more than once: ${parsed.fragment}.`);
          referencedFragments.add(parsed.fragment);
        } catch (error: any) {
          errors.push(error.message);
        }
      }
      for (const member of contributionMembers) if (!referencedFragments.has(member)) errors.push(`Skill contribution member has no declaration: ${member}.`);
    }
    if (!Array.isArray(contributions.skillDependencies)) {
      errors.push('component contributions.skillDependencies must be an array.');
    } else {
      const seenDependencies: any = new Set();
      for (const [index, dependency] of contributions.skillDependencies.entries()) {
        try {
          const parsed = parseSkillDependencyContribution(dependency, `component contributions.skillDependencies[${index}]`);
          if (!fragmentTargets.has(parsed.skillId)) errors.push(`Component Skill dependency target must also receive a Skill fragment: ${parsed.skillId}.`);
          const key = `${parsed.skillId}:${capabilityKey(parsed.capability, parsed.version)}`;
          if (seenDependencies.has(key)) errors.push(`duplicate Component Skill dependency contribution: ${key}.`);
          seenDependencies.add(key);
        } catch (error: any) {
          errors.push(error.message);
        }
      }
    }
    const integrityItems = Array.isArray(definition.integrity) ? definition.integrity : [];
    if (!Array.isArray(definition.integrity)) errors.push('component integrity must be an array.');
    const integrityMembers: any = new Set();
    for (const item of integrityItems) {
      if (typeof item !== 'string' || !item.includes('=')) {
        errors.push(`component integrity entry is invalid: ${String(item)}.`);
        continue;
      }
      const member = item.slice(0, item.lastIndexOf('='));
      if (integrityMembers.has(member)) errors.push(`duplicate component integrity entry: ${member}.`);
      integrityMembers.add(member);
    }
    const integrity = componentIntegrityMap(definition);
    for (const member of all) {
      const value = integrity.get(member);
      if (!value || !/^sha256-[a-f0-9]{64}$/.test(value)) errors.push(`component member integrity is missing or invalid: ${member}.`);
    }
    for (const member of integrity.keys()) if (!seen.has(member)) errors.push(`component integrity references unknown member: ${member}.`);
    return errors;
  }

  function assetIntegrity(assetPath: any): any  {
    if (!existsFile(assetPath) && !existsDirectory(assetPath)) return null;
    const hash = crypto.createHash('sha256');
    if (fs.lstatSync(assetPath).isSymbolicLink()) throw new Error(`Integrity input must not be a symbolic link: ${assetPath}`);
    if (existsFile(assetPath)) {
      hash.update(fs.readFileSync(assetPath));
    } else {
      const files: any[] = [];
      function visit(directory: any): any  {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left: any, right: any) => left.name.localeCompare(right.name))) {
          const absolute = path.join(directory, entry.name);
          if (entry.isSymbolicLink()) throw new Error(`Integrity input contains a symbolic link: ${absolute}`);
          if (entry.isDirectory()) visit(absolute);
          else if (entry.isFile()) files.push(absolute);
        }
      }
      visit(assetPath);
      for (const file of files.sort((left: any, right: any) => toPosixRelative(assetPath, left).localeCompare(toPosixRelative(assetPath, right)))) {
        const relative = path.relative(assetPath, file).split(path.sep).join('/');
        hash.update(relative);
        hash.update('\0');
        hash.update(fs.readFileSync(file));
        hash.update('\0');
      }
    }
    return `sha256-${hash.digest('hex')}`;
  }

  function readComponentDefinition(file: any, expectedId: any = null): any  {
    if (!existsFile(file)) throw new Error(`Component definition not found: ${file}`);
    const definition = parseComponentDefinitionYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateComponentDefinition(definition, expectedId);
    if (errors.length) throw new Error(`Component definition is invalid: ${file}\n- ${errors.join('\n- ')}`);
    return definition;
  }

  function componentDefinitionFile(targetRoot: any, entry: any): any  {
    return path.join(targetRoot, entry.path, 'component.yml');
  }

  function workspaceSymlinkSegment(targetRoot: any, relativePath: any): any  {
    const normalized = normalizeRelativePathForBuildr(relativePath, `Workspace path must stay relative: ${relativePath}`);
    let current = targetRoot;
    for (const segment of normalized.split(path.sep)) {
      current = path.join(current, segment);
      if (!fs.existsSync(current)) continue;
      if (fs.lstatSync(current).isSymbolicLink()) return toPosixRelative(targetRoot, current);
    }
    return null;
  }

  function componentInventory(targetRoot: any, options: any = {}): any  {
    const manifest = readComponentsManifestForWrite(targetRoot);
    const components: any[] = [];
    const ownership: any = new Map();
    const findings: any[] = [];
    for (const entry of manifest.components) {
      const item: any = { entry, definition: null, members: [], status: entry.enabled === false || entry.state === 'uninstalled' ? 'uninstalled' : 'installed' };
      try {
        const definitionLink = workspaceSymlinkSegment(targetRoot, entry.path);
        if (definitionLink) throw new Error(`Component definition path crosses a symbolic link: ${definitionLink}`);
        item.definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), entry.id);
        const integrity = componentIntegrityMap(item.definition);
        for (const member of componentMemberPaths(item.definition)) {
          const memberLink = workspaceSymlinkSegment(targetRoot, member);
          if (memberLink) throw new Error(`Component member path crosses a symbolic link: ${memberLink}`);
          const actual = assetIntegrity(path.join(targetRoot, member));
          const status = actual === null ? 'missing' : actual === integrity.get(member) ? 'installed' : 'modified';
          item.members.push({ path: member, expected: integrity.get(member), actual, status });
          if (item.status !== 'uninstalled' && status !== 'installed') item.status = status;
          if (item.status !== 'uninstalled') {
            if (ownership.has(member)) findings.push({ status: 'error', code: 'components.ownership_conflict', member, owners: [ownership.get(member), entry.id] });
            else ownership.set(member, entry.id);
          }
        }
      } catch (error: any) {
        item.status = entry.enabled === false ? 'uninstalled' : 'invalid';
        item.error = error.message;
        if (entry.enabled !== false || options.includeUninstalled) findings.push({ status: 'error', code: 'components.definition_invalid', componentId: entry.id, message: error.message });
      }
      components.push(item);
    }
    return { manifest, components, ownership, findings };
  }

  function componentOwnerForMember(targetRoot: any, member: any): any  {
    return componentInventory(targetRoot).ownership.get(member) || null;
  }

  function packageComponentEntry(manifest: any, id: any): any  {
    return manifest.components.find((entry: any) => entry.id === id) || null;
  }

  function packageComponentDefinition(entry: any): any  {
    if (!entry?.path || path.isAbsolute(entry.path) || entry.path.startsWith('..')) throw new Error(`Package Component path is invalid: ${entry?.path || '<missing>'}`);
    const file = path.resolve(productRoot(), entry.path);
    const definition = readComponentDefinition(file, entry.id);
    if (definition.source !== 'buildr') throw new Error(`Package Component source must be buildr: ${entry.id}`);
    return { entry, file, definition };
  }

  function componentMemberKind(definition: any, member: any): any  {
    if (definition.members.rules.includes(member)) return 'rule';
    if (definition.members.skills.includes(member)) return 'skill';
    if (definition.members.commandCollections.includes(member)) return 'commandCollection';
    if (definition.members.skillContributions.includes(member)) return 'skillContribution';
    return null;
  }

  function componentBuiltinForMember(manifest: any, definition: any, member: any): any  {
    const kind = componentMemberKind(definition, member);
    if (kind === 'rule') return { kind, builtin: manifest.builtins.rules.find((item: any) => item.target === member) || null };
    if (kind === 'skill') return { kind, builtin: manifest.builtins.skills.find((item: any) => item.target === member) || null };
    return { kind, builtin: null };
  }

  function packageComponentSourcePath(member: any): any  {
    return path.join(resourceWorkspaceRoot(), member);
  }

  function validatePackageComponentMembers(manifest: any, record: any): any  {
    const errors: any[] = [];
    const integrity = componentIntegrityMap(record.definition);
    for (const member of componentMemberPaths(record.definition)) {
      const source = packageComponentSourcePath(member);
      const actual = assetIntegrity(source);
      if (!actual) errors.push(`Package Component member source is missing: ${member}.`);
      else if (actual !== integrity.get(member)) errors.push(`Package Component member integrity differs: ${member}.`);
      const { kind, builtin } = componentBuiltinForMember(manifest, record.definition, member);
      if ((kind === 'rule' || kind === 'skill') && (!builtin || builtin.component !== record.entry.id)) {
        errors.push(`Package Component ${kind} member must have a matching builtin descriptor with component: ${record.entry.id}: ${member}.`);
      }
    }
    for (const declaration of record.definition.contributions?.skillFragments || []) {
      let parsed;
      try {
        parsed = parseSkillContributionDeclaration(declaration);
      } catch (error: any) {
        errors.push(error.message);
        continue;
      }
      const target = manifest.builtins.skills.find((item: any) => item.id === parsed.skillId);
      if (!target) {
        errors.push(`Package Skill contribution target is not a declared builtin Skill: ${parsed.skillId}.`);
        continue;
      }
      const targetFile = path.join(sourcePathFromBuiltin(target), 'SKILL.md');
      if (parsed.placement === 'slot') {
        const slotMarker = `<!-- buildr:skill-contributions ${parsed.slot} -->`;
        const targetContent = existsFile(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
        if (targetContent.split(slotMarker).length - 1 !== 1) {
          errors.push(`Package Skill contribution target does not declare slot ${parsed.slot}: ${parsed.skillId}.`);
        }
      }
      const fragmentFile = packageComponentSourcePath(parsed.fragment);
      if (existsFile(fragmentFile) && !fs.readFileSync(fragmentFile, 'utf8').trim()) {
        errors.push(`Package Skill contribution fragment must not be empty: ${parsed.fragment}.`);
      }
    }
    for (const [index, dependency] of (record.definition.contributions?.skillDependencies || []).entries()) {
      let parsed;
      try {
        parsed = parseSkillDependencyContribution(dependency, `Component ${record.entry.id} contributions.skillDependencies[${index}]`);
      } catch (error: any) {
        errors.push(error.message);
        continue;
      }
      if (!manifest.builtins.skills.some((item: any) => item.id === parsed.skillId)) errors.push(`Package Skill dependency target is not a declared builtin Skill: ${parsed.skillId}.`);
    }
    if (record.entry.id === 'openspec') {
      const contributionContent = (record.definition.contributions?.skillFragments || []).map((declaration: any) => {
        try {
          const { fragment } = parseSkillContributionDeclaration(declaration);
          const file = packageComponentSourcePath(fragment);
          return existsFile(file) ? fs.readFileSync(file, 'utf8') : '';
        } catch {
          return '';
        }
      }).join('\n');
      for (const requiredText of ['openspec validate <change> --strict', 'buildr openspec convergence preflight', 'Planning Review']) {
        if (!contributionContent.includes(requiredText)) errors.push(`OpenSpec Component Skill contributions must include ${JSON.stringify(requiredText)}.`);
      }
    }
    return errors;
  }

  function legacyComponentMemberDecision(targetRoot: any, manifest: any, definition: any, member: any, oldDefinition: any = null): any  {
    const { kind, builtin } = componentBuiltinForMember(manifest, definition, member);
    if (kind === 'skill' && builtin) {
      const entry = readSkillsManifestForWrite(targetRoot).find((item: any) => item.id === builtin.id);
      const desiredSource = member.startsWith('skills/openspec/') ? 'openspec' : 'buildr';
      const desiredPath = member.replace(/^skills\//, '');
      const knownOldFork = oldDefinition?.members?.skills?.includes(`skills/buildr/${builtin.id}`)
        && entry?.source === 'buildr'
        && entry?.path === `buildr/${builtin.id}`;
      if (entry && !knownOldFork && (entry.source !== desiredSource || entry.path !== desiredPath)) return `${kind}:${builtin.id} has a conflicting source or path`;
      if (entry && (entry.enabled === false || ['modified', 'missing', 'uninstalled'].includes(entry.state))) return `${kind}:${builtin.id} is ${entry.state || 'uninstalled'}`;
      if (entry && !knownOldFork && !assetIntegrity(path.join(targetRoot, member))) return `${kind}:${builtin.id} is missing`;
    }
    if (kind === 'rule' && builtin) {
      const entry = readRulesManifestForWrite(targetRoot).rules.find((item: any) => item.id === builtin.id);
      if (entry && (entry.source !== 'buildr' || entry.path !== member)) return `${kind}:${builtin.id} has a conflicting source or path`;
      if (entry && (entry.enabled === false || ['modified', 'missing', 'uninstalled'].includes(entry.state))) return `${kind}:${builtin.id} is ${entry.state || 'uninstalled'}`;
      if (entry && !assetIntegrity(path.join(targetRoot, member))) return `${kind}:${builtin.id} is missing`;
    }
    return null;
  }

  function isAdoptableLegacyComponentMember(targetRoot: any, manifest: any, definition: any, member: any): any  {
    const { kind, builtin } = componentBuiltinForMember(manifest, definition, member);
    if (!builtin) return false;
    if (kind === 'skill') {
      const expectedSource = member.startsWith('skills/openspec/') ? 'openspec' : 'buildr';
      return readSkillsManifestForWrite(targetRoot).some((entry: any) => entry.id === builtin.id && entry.source === expectedSource && entry.path === member.replace(/^skills\//, ''));
    }
    if (kind === 'rule') {
      return readRulesManifestForWrite(targetRoot).rules.some((entry: any) => entry.id === builtin.id && entry.source === 'buildr' && entry.path === member);
    }
    return false;
  }

  function buildComponentReconcilePlan(targetRoot: any, packageManifest: any, record: any): any  {
    const registry = readComponentsManifestForWrite(targetRoot);
    const existingEntry = registry.components.find((entry: any) => entry.id === record.entry.id) || null;
    const restoring = existingEntry?.enabled === false || existingEntry?.state === 'uninstalled';
    let oldDefinition: any = null;
    if (existingEntry && existsFile(componentDefinitionFile(targetRoot, existingEntry))) oldDefinition = readComponentDefinition(componentDefinitionFile(targetRoot, existingEntry), existingEntry.id);
    const inventory = componentInventory(targetRoot, { includeUninstalled: true });
    const issues: any[] = [...validatePackageComponentMembers(packageManifest, record)];
    const nextIntegrity = componentIntegrityMap(record.definition);
    const oldIntegrity = oldDefinition ? componentIntegrityMap(oldDefinition) : new Map();
    const nextMembers: any = new Set(componentMemberPaths(record.definition));
    const oldMembers: any = new Set(oldDefinition ? componentMemberPaths(oldDefinition) : []);

    for (const member of nextMembers) {
      const symlink = workspaceSymlinkSegment(targetRoot, member);
      if (symlink) issues.push(`Component member path crosses a symbolic link: ${symlink}.`);
      const owner = inventory.ownership.get(member);
      if (owner && owner !== record.entry.id) issues.push(`Member is owned by Component ${owner}: ${member}.`);
      const live = assetIntegrity(path.join(targetRoot, member));
      const expectedNew = nextIntegrity.get(member);
      if (restoring) {
        if (live && live !== expectedNew) issues.push(`Restore target conflicts with existing content: ${member}.`);
        continue;
      }
      if (oldMembers.has(member)) {
        const expectedOld = oldIntegrity.get(member);
        if (!live) issues.push(`Installed Component member is missing: ${member}.`);
        else if (live !== expectedOld && live !== expectedNew) issues.push(`Installed Component member is modified: ${member}.`);
      } else {
        const legacyDecision = legacyComponentMemberDecision(targetRoot, packageManifest, record.definition, member, oldDefinition);
        if (legacyDecision) issues.push(`Legacy Component migration requires a user decision: ${legacyDecision}.`);
        const adoptableLegacy = !existingEntry && isAdoptableLegacyComponentMember(targetRoot, packageManifest, record.definition, member);
        if (live && adoptableLegacy && live !== expectedNew) issues.push(`Legacy Component migration requires a user decision: modified member ${member}.`);
        else if (live && !adoptableLegacy) issues.push(`Component target conflicts with existing content: ${member}.`);
      }
    }
    for (const member of oldMembers) {
      if (nextMembers.has(member) || restoring) continue;
      const live = assetIntegrity(path.join(targetRoot, member));
      if (live && live !== oldIntegrity.get(member)) issues.push(`Removed Component member is modified: ${member}.`);
    }
    issues.push(...commandCollectionReferenceIssues(targetRoot, [...oldMembers].filter((member: any) => !nextMembers.has(member) && member.startsWith('commands/'))));
    const receiptPath = `components/buildr/${record.entry.id}/component.yml`;
    const receiptSymlink = workspaceSymlinkSegment(targetRoot, receiptPath);
    if (receiptSymlink) issues.push(`Component receipt path crosses a symbolic link: ${receiptSymlink}.`);
    return { registry, existingEntry, oldDefinition, restoring, issues, nextMembers, oldMembers };
  }

  function commandCollectionReferenceIssues(targetRoot: any, members: any): any  {
    const issues: any[] = [];
    for (const member of members) {
      const file = path.join(targetRoot, member);
      if (!existsFile(file)) continue;
      let manifest;
      try {
        manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
      } catch (error: any) {
        issues.push(`Command collection cannot be parsed before removal: ${member}: ${error.message}`);
        continue;
      }
      const validationErrors = validateCommandsManifest(manifest);
      if (validationErrors.length) {
        issues.push(`Command collection is invalid before removal: ${member}: ${validationErrors.join('; ')}`);
        continue;
      }
      for (const command of manifest.commands) {
        // A legacy workspace default stored on the Component-owned definition
        // disappears with that definition. Component lifecycle only needs to
        // protect independent Project references (and unverifiable contexts).
        const blockers = commandRemovalBlockers(targetRoot, command.id, [file])
          .filter((item: any) => item.kind !== 'workspace-default');
        if (blockers.length) issues.push(`Command definition ${command.id} from ${member} is still referenced or cannot be safely checked: ${blockers.map((item: any) => {
          if (item.kind === 'project') return `Project ${item.project} (${item.path})`;
          if (item.kind === 'invalid-project-context') return `unverifiable Project context${item.project ? ` ${item.project}` : ''} (${item.path})`;
          return `workspace default (${item.path})`;
        }).join(', ')}.`);
      }
    }
    return issues;
  }

  function removeEmptyCommandCollectionParents(targetRoot: any, file: any): any  {
    let current = path.dirname(file);
    const commandsRoot = path.join(targetRoot, 'commands');
    while (current !== commandsRoot && current.startsWith(`${commandsRoot}${path.sep}`)) {
      if (!existsDirectory(current) || fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    }
  }

  function removeComponentMember(targetRoot: any, packageManifest: any, definition: any, member: any, rulesManifest: any, skillsManifest: any, changed: any): any  {
    const { kind, builtin } = componentBuiltinForMember(packageManifest, definition, member);
    const target = path.join(targetRoot, member);
    if (kind === 'rule') {
      const pathKey = builtin?.target || member;
      rulesManifest.rules = rulesManifest.rules.filter((entry: any) => entry.path !== pathKey && (!builtin || entry.id !== builtin.id));
      if (existsFile(target)) fs.rmSync(target, { force: true });
    } else if (kind === 'skill') {
      const skillPath = member.replace(/^skills\//, '');
      skillsManifest.splice(0, skillsManifest.length, ...skillsManifest.filter((entry: any) => entry.path !== skillPath && (!builtin || entry.id !== builtin.id)));
      if (existsDirectory(target)) fs.rmSync(target, { recursive: true, force: true });
    } else if (kind === 'commandCollection') {
      if (existsFile(target)) fs.rmSync(target, { force: true });
      removeEmptyCommandCollectionParents(targetRoot, target);
    } else if (kind === 'skillContribution') {
      if (existsFile(target)) fs.rmSync(target, { force: true });
      const componentRoot = path.join(targetRoot, 'components', definition.source, definition.id);
      let current = path.dirname(target);
      while (current !== componentRoot && current.startsWith(`${componentRoot}${path.sep}`)) {
        if (!existsDirectory(current) || fs.readdirSync(current).length > 0) break;
        fs.rmdirSync(current);
        current = path.dirname(current);
      }
    }
    changed.push(member);
  }

  function installComponentMember(targetRoot: any, packageManifest: any, definition: any, member: any, rulesManifest: any, skillsManifest: any, changed: any): any  {
    const { kind, builtin } = componentBuiltinForMember(packageManifest, definition, member);
    const source = packageComponentSourcePath(member);
    const target = path.join(targetRoot, member);
    if (kind === 'rule') {
      ensureDirectory(path.dirname(target));
      fs.copyFileSync(source, target);
      const desired = builtinRuleEntry(builtin);
      const index = rulesManifest.rules.findIndex((entry: any) => entry.id === desired.id);
      if (index === -1) rulesManifest.rules.push(desired);
      else rulesManifest.rules[index] = desired;
    } else if (kind === 'skill') {
      if (existsDirectory(target)) fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      const desired = builtinSkillEntry(builtin);
      const index = skillsManifest.findIndex((entry: any) => entry.id === desired.id);
      if (index === -1) skillsManifest.push(desired);
      else skillsManifest[index] = desired;
    } else if (kind === 'commandCollection') {
      ensureDirectory(path.dirname(target));
      fs.copyFileSync(source, target);
    } else if (kind === 'skillContribution') {
      ensureDirectory(path.dirname(target));
      fs.copyFileSync(source, target);
    }
    changed.push(member);
  }

  function componentReconcileAffectedPaths(targetRoot: any, record: any, plan: any): any  {
    const componentPath = `components/buildr/${record.entry.id}`;
    const definitionTarget = path.join(targetRoot, componentPath, 'component.yml');
    const affected: any[] = [
      ...new Set([...plan.oldMembers, ...plan.nextMembers].map((member: any) => path.join(targetRoot, member))),
      rulesManifestPath(targetRoot),
      skillsManifestPath(targetRoot),
      componentRegistryPath(targetRoot),
      definitionTarget,
    ];
    for (const target of [...affected]) {
      const missingParent = missingAncestorForMutation(targetRoot, path.dirname(target));
      if (missingParent) affected.push(missingParent);
    }
    return assertSafeSyncMutationPaths(targetRoot, affected);
  }

  function applyPackageComponent(targetRoot: any, packageManifest: any, record: any, preparedPlan: any = null): any  {
    const plan = preparedPlan || buildComponentReconcilePlan(targetRoot, packageManifest, record);
    if (plan.issues.length) throw new Error(`Component ${record.entry.id} cannot be reconciled:\n- ${plan.issues.join('\n- ')}`);
    const componentPath = `components/buildr/${record.entry.id}`;
    const definitionTarget = path.join(targetRoot, componentPath, 'component.yml');
    const affected = componentReconcileAffectedPaths(targetRoot, record, plan);
    return withWorkspaceMutation(targetRoot, `component.reconcile:${record.entry.id}`, affected, () => {
      const changed: any[] = [];
      const rulesManifest = readRulesManifestForWrite(targetRoot);
      const skillsManifest = readSkillsManifestForWrite(targetRoot);
      for (const member of plan.oldMembers) {
        if (!plan.nextMembers.has(member) && !plan.restoring) removeComponentMember(targetRoot, packageManifest, plan.oldDefinition, member, rulesManifest, skillsManifest, changed);
      }
      for (const member of plan.nextMembers) installComponentMember(targetRoot, packageManifest, record.definition, member, rulesManifest, skillsManifest, changed);
      if (record.definition.members.rules.length || plan.oldDefinition?.members.rules.length) changed.push(toPosixRelative(targetRoot, writeRulesManifest(targetRoot, rulesManifest)));
      if (record.definition.members.skills.length || plan.oldDefinition?.members.skills.length) changed.push(toPosixRelative(targetRoot, writeSkillsManifest(targetRoot, skillsManifest)));
      const nextEntry: any = { id: record.entry.id, source: 'buildr', path: componentPath, enabled: true, required: record.entry.required === true, state: 'installed' };
      const registryIndex = plan.registry.components.findIndex((entry: any) => entry.id === record.entry.id);
      if (registryIndex === -1) plan.registry.components.push(nextEntry);
      else plan.registry.components[registryIndex] = nextEntry;
      changed.push(toPosixRelative(targetRoot, writeComponentsManifest(targetRoot, plan.registry)));
      atomicWriteFile(definitionTarget, fs.readFileSync(record.file));
      changed.push(toPosixRelative(targetRoot, definitionTarget));
      return { id: record.entry.id, status: 'installed', changed: [...new Set(changed)] };
    });
  }

  function packageComponentsStatus(targetRoot: any, packageManifest: any = readPackageManifest()): any  {
    let inventory;
    try {
      inventory = componentInventory(targetRoot, { includeUninstalled: true });
    } catch (error: any) {
      return { targetRoot, components: [], findings: [{ status: 'invalid', id: null, error: error.message }], ownership: new Map() };
    }
    const byId: any = new Map(inventory.components.map((item: any) => [item.entry.id, item]));
    const components: any[] = [];
    for (const entry of packageManifest.components) {
      const existing = byId.get(entry.id);
      let status = existing?.status || (entry.defaultEnabled === true ? 'missing' : 'available');
      let availableVersion: any = null;
      let installedVersion = existing?.definition?.version || null;
      try {
        const record = packageComponentDefinition(entry);
        availableVersion = record.definition.version;
        if (status === 'installed' && installedVersion !== availableVersion) status = 'update-available';
      } catch (error: any) {
        status = 'invalid';
        components.push({ id: entry.id, source: existing?.entry.source || 'buildr', expectedState: existing?.entry.state || (entry.defaultEnabled === true ? 'installed' : 'available'), enabled: existing ? existing.entry.enabled !== false : entry.defaultEnabled === true, status, required: entry.required === true, defaultEnabled: entry.defaultEnabled === true, installedVersion, availableVersion, error: error.message, members: existing?.members || [], nextAction: `buildr component check ${entry.id} --target ${targetRoot} --json` });
        continue;
      }
      components.push({ id: entry.id, source: existing?.entry.source || 'buildr', expectedState: existing?.entry.state || (entry.defaultEnabled === true ? 'installed' : 'available'), enabled: existing ? existing.entry.enabled !== false : entry.defaultEnabled === true, status, required: entry.required === true, defaultEnabled: entry.defaultEnabled === true, installedVersion, availableVersion, members: existing?.members || [], nextAction: status === 'uninstalled' || status === 'missing' ? `buildr component install ${entry.id} --agent <agent> --target ${targetRoot}` : `buildr component check ${entry.id} --target ${targetRoot} --json` });
    }
    for (const existing of inventory.components) {
      if (!packageManifest.components.some((entry: any) => entry.id === existing.entry.id)) components.push({ id: existing.entry.id, source: existing.entry.source, expectedState: existing.entry.state || 'installed', enabled: existing.entry.enabled !== false, status: existing.status, required: existing.entry.required === true, installedVersion: existing.definition?.version || null, availableVersion: null, members: existing.members, nextAction: `buildr component check ${existing.entry.id} --target ${targetRoot} --json` });
    }
    return { targetRoot, components, findings: inventory.findings, ownership: inventory.ownership };
  }

  function planPackageComponentsSync(targetRoot: any, options: any = {}): any  {
    const packageManifest = readPackageManifest();
    const onlyId = options.onlyId || null;
    const status = packageComponentsStatus(targetRoot, packageManifest);
    const findings: any[] = [];
    const componentStatus: any = new Map(status.components.map((item: any) => [item.id, item]));
    const errors = status.findings.map((item: any) => {
      const owners = [item.id, item.componentId, ...(item.owners || [])].filter(Boolean);
      return { id: item.id || item.componentId || null, required: owners.some((id: any) => componentStatus.get(id)?.required === true), error: item.error || item.message || item.code || 'Component inventory is invalid.' };
    });
    const plans: any[] = [];
    const affectedPaths: any[] = [];
    const registry = readComponentsManifestForWrite(targetRoot);
    for (const entry of packageManifest.components) {
      if (onlyId && entry.id !== onlyId) continue;
      const installed = registry.components.find((item: any) => item.id === entry.id);
      if (installed && (installed.enabled === false || installed.state === 'uninstalled') && !options.restore) {
        findings.push({ id: entry.id, status: 'uninstalled', required: entry.required === true });
        continue;
      }
      if (!installed && entry.defaultEnabled !== true && !options.restore) {
        findings.push({ id: entry.id, status: 'available', required: entry.required === true });
        continue;
      }
      try {
        const record = packageComponentDefinition(entry);
        const plan = buildComponentReconcilePlan(targetRoot, packageManifest, record);
        if (plan.issues.length) throw new Error(`Component ${entry.id} cannot be reconciled:\n- ${plan.issues.join('\n- ')}`);
        const componentAffectedPaths = componentReconcileAffectedPaths(targetRoot, record, plan);
        plans.push({ id: entry.id, record, plan, affectedPaths: componentAffectedPaths });
        affectedPaths.push(...componentAffectedPaths);
        findings.push({ id: entry.id, status: 'installed', required: entry.required === true });
      } catch (error: any) {
        const finding: any = { id: entry.id, status: 'blocked', required: entry.required === true, error: error.message };
        findings.push(finding);
        errors.push(finding);
      }
    }
    const safeAffectedPaths = assertSafeSyncMutationPaths(targetRoot, affectedPaths);
    const signature = JSON.stringify({
      findings,
      errors: errors.map(({ id, required, error }: any) => ({ id, required, error })),
      affectedPaths: safeAffectedPaths.map((item: any) => ({ path: toPosixRelative(targetRoot, item), fingerprint: mutationPathFingerprint(item) })).sort((left: any, right: any) => left.path.localeCompare(right.path)),
    });
    return { targetRoot, changed: [], findings, errors, plans, affectedPaths: safeAffectedPaths, signature };
  }

  function syncPackageComponents(targetRoot: any, options: any = {}): any  {
    const packageManifest = readPackageManifest();
    const checkOnly = options.checkOnly === true;
    const onlyId = options.onlyId || null;
    if (checkOnly) return planPackageComponentsSync(targetRoot, options);
    const changed: any[] = [];
    const findings: any[] = [];
    const registry = readComponentsManifestForWrite(targetRoot);
    const preparedPlans: any = new Map((options.plans || []).map((item: any) => [item.id, item]));
    const preparedFindings: any = new Map((options.preparedFindings || []).map((item: any) => [item.id, item]));
    for (const entry of packageManifest.components) {
      if (onlyId && entry.id !== onlyId) continue;
      const installed = registry.components.find((item: any) => item.id === entry.id);
      if (installed && (installed.enabled === false || installed.state === 'uninstalled') && !options.restore) {
        findings.push({ id: entry.id, status: 'uninstalled', required: entry.required === true });
        continue;
      }
      if (!installed && entry.defaultEnabled !== true && !options.restore) {
        findings.push({ id: entry.id, status: 'available', required: entry.required === true });
        continue;
      }
      if (options.strictPreparedPlans === true && !preparedPlans.has(entry.id)) {
        const preparedFinding = preparedFindings.get(entry.id);
        findings.push(preparedFinding || { id: entry.id, status: 'blocked', required: entry.required === true, error: 'Component was not independently ready in the locked sync plan.' });
        continue;
      }
      try {
        const prepared = preparedPlans.get(entry.id);
        const record = prepared?.record || packageComponentDefinition(entry);
        const result = applyPackageComponent(targetRoot, packageManifest, record, prepared?.plan || null);
        changed.push(...result.changed);
        findings.push({ id: entry.id, status: 'installed', required: entry.required === true });
      } catch (error: any) {
        findings.push({ id: entry.id, status: 'blocked', required: entry.required === true, error: error.message });
      }
    }
    return { targetRoot, changed: [...new Set(changed)], findings, errors: findings.filter((item: any) => item.status === 'blocked') };
  }

  function assertWorkspaceComponentScope(args: any): any  {
    const scope = optionValue(args, '--scope', '.');
    if (scope !== '.') throw new Error(`Components currently support only workspace scope "."; Project and Service Components are not supported: ${scope}`);
  }

  function componentListOrCheck(args: any, checkOnlyOne: any = false): any  {
    const allowedFlags: any = new Set(['--target', '--json', '--scope']);
    assertNoUnknownOptions(args, allowedFlags, new Set(['--json']));
    assertWorkspaceComponentScope(args);
    const [id] = positionalArgs(args);
    if (!checkOnlyOne && id) throw new Error('component list does not accept a Component id.');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);
    const result = packageComponentsStatus(targetRoot);
    if (id) result.components = result.components.filter((item: any) => item.id === id);
    if (id && result.components.length === 0) throw new Error(`Component not found: ${id}`);
    result.ok = result.findings.length === 0 && result.components.every((item: any) => !['invalid', 'modified', 'missing', 'blocked'].includes(item.status));
    if (hasFlag(args, '--json')) {
      const schema = checkOnlyOne ? PUBLIC_JSON_SCHEMAS.componentCheck : PUBLIC_JSON_SCHEMAS.componentList;
      console.log(JSON.stringify(withJsonSchema(schema, { ...result, ownership: undefined }), null, 2));
    }
    else {
      console.log(`Buildr Components for ${targetRoot}`);
      for (const item of result.components) console.log(`[${item.status}] ${item.id} source=${item.source} expected=${item.expectedState} installed=${item.installedVersion || '-'} available=${item.availableVersion || '-'}`);
      for (const finding of result.findings) console.log(`[${finding.status}] ${finding.code} ${finding.member || finding.message || ''}`);
    }
    process.exitCode = result.ok ? 0 : 1;
  }

  function installWorkspaceComponent(targetRoot: any, id: any): any  {
    const registry = readComponentsManifestForWrite(targetRoot);
    const index = registry.components.findIndex((entry: any) => entry.id === id);
    if (index === -1 || registry.components[index].source !== 'workspace') return null;
    const entry = registry.components[index];
    const definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), id);
    if (definition.source !== 'workspace') throw new Error(`Workspace Component definition source must be workspace: ${id}`);
    const inventory = componentInventory(targetRoot, { includeUninstalled: true });
    const integrity = componentIntegrityMap(definition);
    const issues: any[] = [];
    for (const member of componentMemberPaths(definition)) {
      const owner = inventory.ownership.get(member);
      if (owner && owner !== id) issues.push(`Member is owned by Component ${owner}: ${member}.`);
      const actual = assetIntegrity(path.join(targetRoot, member));
      if (!actual) issues.push(`Workspace Component member is missing: ${member}.`);
      else if (actual !== integrity.get(member)) issues.push(`Workspace Component member integrity differs: ${member}.`);
    }
    if (issues.length) throw new Error(`Component ${id} cannot be installed:\n- ${issues.join('\n- ')}`);
    registry.components[index] = { ...entry, enabled: true, state: 'installed' };
    delete registry.components[index].reason;
    return { id, status: 'installed', changed: [toPosixRelative(targetRoot, writeComponentsManifest(targetRoot, registry))] };
  }

  function declaredRuntimeSkillPaths(targetRoot: any, agent: any): any  {
    const declared: any = new Set(['buildr']);
    const scopeRoots: any[] = [targetRoot, ...listManagedDirectories(path.join(targetRoot, 'projects')).map((project: any) => path.join(targetRoot, 'projects', project))];
    for (const scopeRoot of scopeRoots) {
      let skills;
      try {
        skills = readSkillsManifestForWrite(scopeRoot);
      } catch {
        continue;
      }
      for (const skill of skills) {
        if (skill.enabled === false || skill.state === 'uninstalled' || skill.install?.mode === 'agent') continue;
        if (Array.isArray(skill.runtimes) && !skill.runtimes.includes(agent)) continue;
        declared.add(skill.runtimePath || skill.id);
      }
    }
    return declared;
  }

  function declaredRuntimeInstallPlanIds(targetRoot: any, agent: any): any  {
    const declared: any = new Set();
    const scopeRoots: any[] = [targetRoot, ...listManagedDirectories(path.join(targetRoot, 'projects')).map((project: any) => path.join(targetRoot, 'projects', project))];
    for (const scopeRoot of scopeRoots) {
      let skills;
      try {
        skills = readSkillsManifestForWrite(scopeRoot);
      } catch {
        continue;
      }
      for (const skill of skills) {
        if (skill.enabled === false || skill.state === 'uninstalled' || skill.install?.mode !== 'agent') continue;
        if (Array.isArray(skill.runtimes) && !skill.runtimes.includes(agent)) continue;
        declared.add(skill.id);
      }
    }
    return declared;
  }

  function managedRuntimeSkillOrphans(targetRoot: any, agent: any, options: any = {}): any  {
    const runtimeRoot = getRuntimeAdapter(agent).traits.skills.root;
    const skillsRoot = path.join(targetRoot, runtimeRoot, 'skills');
    const declared = declaredRuntimeSkillPaths(targetRoot, agent);
    const orphans: any[] = [];
    const receiptRuntimePaths: any = new Set();
    const receiptsByRuntimePath: any = new Map();
    const receiptRoots: any[] = [
      { root: skillProjectionOwnershipReceiptRoot(targetRoot, 'workspace', agent), target: (runtimePath: any) => skillProjectionOwnershipReceiptTarget(targetRoot, 'workspace', agent, runtimePath) },
      { root: legacySkillProjectionOwnershipReceiptRoot(targetRoot, runtimeRoot, agent), target: (runtimePath: any) => legacySkillProjectionOwnershipReceiptTarget(targetRoot, runtimeRoot, agent, runtimePath) },
    ];
    for (const location of receiptRoots) {
      for (const receiptFile of existsDirectory(location.root) ? collectFiles(location.root) : []) {
        if (!receiptFile.endsWith('.json')) continue;
        const receipt = readSkillProjectionReceipt(receiptFile, { adapterId: agent, destination: 'workspace' });
        const expectedReceipt = location.target(receipt.runtimePath);
        if (path.resolve(expectedReceipt) !== path.resolve(receiptFile)) throw new Error(`Runtime Skill projection ownership receipt target mismatch: ${receiptFile}`);
        const existing = receiptsByRuntimePath.get(receipt.runtimePath);
        if (existing && !skillProjectionOwnershipReceiptsEquivalent(existing.receipt, receipt)) {
          throw new Error(`Skill projection ownership receipt conflict; canonical and legacy receipts differ, so no files were changed: ${receipt.runtimePath}`);
        }
        receiptsByRuntimePath.set(receipt.runtimePath, { receipt, receiptFiles: [...(existing?.receiptFiles || []), receiptFile] });
      }
    }
    for (const [runtimePath, receiptEntry] of receiptsByRuntimePath) {
      receiptRuntimePaths.add(runtimePath);
      if (declared.has(runtimePath) && options.runtimePath !== runtimePath) continue;
      const targetDir = path.join(skillsRoot, ...runtimePath.split('/'));
      orphans.push({ runtimePath, path: toPosixRelative(targetRoot, targetDir), targetDir, ...receiptEntry });
    }
    for (const runtimePath of listManagedDirectories(skillsRoot)) {
      if (receiptRuntimePaths.has(runtimePath)) continue;
      if (declared.has(runtimePath) && options.runtimePath !== runtimePath) continue;
      const targetDir = path.join(skillsRoot, runtimePath);
      if (fs.lstatSync(targetDir).isSymbolicLink()) continue;
      const skillFile = path.join(targetDir, 'SKILL.md');
      if (!existsFile(skillFile) || !hasManagedSkillMarker(fs.readFileSync(skillFile, 'utf8'))) continue;
      orphans.push({ runtimePath, path: toPosixRelative(targetRoot, targetDir), targetDir });
    }
    return orphans;
  }

  function buildRuntimeOrphanRemovalPlan(targetRoot: any, agent: any, scope: any = '.', options: any = {}): any  {
    if (scope !== '.') return [];
    const removals: any[] = [];
    const conflicts: any[] = [];
    for (const orphan of managedRuntimeSkillOrphans(targetRoot, agent, options)) {
      if (options.runtimePath && orphan.runtimePath !== options.runtimePath) continue;
      if (orphan.receipt) {
        const actualFiles = existsDirectory(orphan.targetDir) ? collectFiles(orphan.targetDir) : [];
        const expectedByPath: any = new Map(orphan.receipt.files.map((file: any) => [file.path, file]));
        const unknown = actualFiles.filter((file: any) => !expectedByPath.has(toPosixRelative(orphan.targetDir, file)));
        const modified = actualFiles.filter((file: any) => {
          const expected = expectedByPath.get(toPosixRelative(orphan.targetDir, file));
          return expected && !runtimeFileMatches(file, expected.integrity, expected.executable);
        });
        if (unknown.length || modified.length) {
          conflicts.push(`${orphan.path}: ${unknown.length ? `包含非 Buildr 管理的额外文件 ${unknown.map((file: any) => toPosixRelative(orphan.targetDir, file)).join(', ')}` : ''}${unknown.length && modified.length ? '；' : ''}${modified.length ? `受管文件已修改 ${modified.map((file: any) => toPosixRelative(orphan.targetDir, file)).join(', ')}` : ''}`);
          continue;
        }
        for (const [relative, expected] of expectedByPath) {
          const file = path.join(orphan.targetDir, ...relative.split('/'));
          if (!existsFile(file)) continue;
          removals.push({
            type: 'file',
            path: file,
            expectedIntegrity: expected.integrity,
            expectedExecutable: expected.executable,
            pruneEmptyRoot: orphan.targetDir,
            source: `runtime Skill ${orphan.runtimePath}`,
          });
        }
        for (const receiptFile of orphan.receiptFiles) {
          removals.push({
            type: 'file',
            path: receiptFile,
            expectedIntegrity: sha256Integrity(fs.readFileSync(receiptFile)),
            pruneEmptyRoot: path.dirname(receiptFile),
            source: `Skill projection ownership receipt ${orphan.runtimePath}`,
          });
        }
        continue;
      }
      const files = collectFiles(orphan.targetDir);
      if (files.length !== 1 || files[0] !== path.join(orphan.targetDir, 'SKILL.md')) {
        conflicts.push(`${orphan.path}: 包含非 Buildr 管理的额外文件`);
      } else {
        removals.push({ type: 'directory', path: orphan.targetDir });
      }
    }
    const runtimeRoot = getRuntimeAdapter(agent).traits.skills.root;
    const plansRoot = path.join(targetRoot, runtimeRoot, 'buildr', 'skill-install-plans');
    const declaredPlans = declaredRuntimeInstallPlanIds(targetRoot, agent);
    if (!options.runtimePath && existsDirectory(plansRoot)) {
      for (const name of fs.readdirSync(plansRoot).sort()) {
        if (!name.endsWith('.md') || declaredPlans.has(name.slice(0, -3))) continue;
        const file = path.join(plansRoot, name);
        if (!existsFile(file)) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (!content.includes('<!-- Generated by Buildr. Agent action required.')) continue;
        removals.push({ type: 'file', path: file });
      }
    }
    if (conflicts.length) throw new Error(`无法清理旧运行时文件：\n- ${conflicts.join('\n- ')}`);
    return removals.sort((left: any, right: any) => left.path.localeCompare(right.path));
  }

  function reconcileComponentRuntime(targetRoot: any, agent: any): any  {
    let rendered;
    try {
      rendered = renderRuntime(agent, ['--target', targetRoot, '--scope', '.']);
    } catch (error: any) {
      throw new Error(`Component 源资产已提交，但 ${agent} runtime reconcile 失败：${error.message}\n修复后运行：buildr sync ${agent} --target ${targetRoot}`);
    }
    const finalDoctor = (runFinalDoctor as any)({
      invocation: runtime.currentProductInvocation(),
      agent,
      targetRoot,
      cwd: productRoot(),
    });
    if (finalDoctor.classification.status !== 'passed') {
      const detail = finalDoctor.classification.diagnostic ? `\n${finalDoctor.classification.diagnostic}` : '';
      throw new Error(`Component 源资产和 runtime 已 reconcile，但 ${finalDoctor.classification.message}${detail}\n修复后运行：buildr doctor --agent ${agent} --target ${targetRoot} --json`);
    }
    return rendered;
  }

  function componentInstall(args: any): any  {
    const allowedFlags: any = new Set(['--target', '--agent', '--scope']);
    assertNoUnknownOptions(args, allowedFlags);
    assertWorkspaceComponentScope(args);
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing Component id.');
    const agent = optionValue(args, '--agent', null);
    if (!agent) throw new Error('Missing required option: --agent');
    assertAgentId(agent);
    if (!isSupportedAgent(agent)) throw new Error(`Unsupported Agent runtime: ${agent}`);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);
    const packageManifest = readPackageManifest();
    const entry = packageComponentEntry(packageManifest, id);
    let synced;
    if (entry) {
      synced = syncPackageComponents(targetRoot, { onlyId: id, restore: true });
      if (synced.errors.length) throw new Error(synced.errors[0].error);
    } else {
      synced = installWorkspaceComponent(targetRoot, id);
      if (!synced) throw new Error(`Component not found in package or workspace registry: ${id}`);
    }
    const rendered = reconcileComponentRuntime(targetRoot, agent);
    console.log(`已安装 Component：${id}`);
    for (const file of synced.changed) console.log(`  ${file}`);
    for (const file of rendered.files) console.log(`  ${toPosixRelative(targetRoot, file)}`);
    console.log('doctor 通过。');
  }

  function componentUninstall(args: any): any  {
    const allowedFlags: any = new Set(['--target', '--agent', '--reason', '--scope']);
    assertNoUnknownOptions(args, allowedFlags);
    assertWorkspaceComponentScope(args);
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing Component id.');
    const agent = optionValue(args, '--agent', null);
    if (!agent) throw new Error('Missing required option: --agent');
    assertAgentId(agent);
    if (!isSupportedAgent(agent)) throw new Error(`Unsupported Agent runtime: ${agent}`);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);
    const registry = readComponentsManifestForWrite(targetRoot);
    const index = registry.components.findIndex((entry: any) => entry.id === id);
    if (index === -1) throw new Error(`Installed Component not found: ${id}`);
    const entry = registry.components[index];
    if (entry.required === true) throw new Error(`Required Component cannot be uninstalled: ${id}`);
    if (entry.enabled === false || entry.state === 'uninstalled') throw new Error(`Component is already uninstalled: ${id}`);
    const definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), id);
    const integrity = componentIntegrityMap(definition);
    const modified = componentMemberPaths(definition).filter((member: any) => assetIntegrity(path.join(targetRoot, member)) !== integrity.get(member));
    if (modified.length) throw new Error(`Component ${id} has modified or missing members and cannot be uninstalled:\n- ${modified.join('\n- ')}`);
    const commandReferenceIssues = commandCollectionReferenceIssues(targetRoot, componentMemberPaths(definition).filter((member: any) => member.startsWith('commands/')));
    if (commandReferenceIssues.length) throw new Error(`Component ${id} cannot be uninstalled while Command definitions are referenced:\n- ${commandReferenceIssues.join('\n- ')}`);
    const packageManifest = readPackageManifest();
    const reason = optionValue(args, '--reason', null);
    const affected: any[] = [
      ...componentMemberPaths(definition).map((member: any) => path.join(targetRoot, member)),
      rulesManifestPath(targetRoot),
      skillsManifestPath(targetRoot),
      componentRegistryPath(targetRoot),
    ];
    const { changed } = withWorkspaceMutation(targetRoot, `component.uninstall:${id}`, affected, () => {
      const changed: any[] = [];
      const rulesManifest = readRulesManifestForWrite(targetRoot);
      const skillsManifest = readSkillsManifestForWrite(targetRoot);
      for (const member of componentMemberPaths(definition)) removeComponentMember(targetRoot, packageManifest, definition, member, rulesManifest, skillsManifest, changed);
      if (definition.members.rules.length) changed.push(toPosixRelative(targetRoot, writeRulesManifest(targetRoot, rulesManifest)));
      if (definition.members.skills.length) changed.push(toPosixRelative(targetRoot, writeSkillsManifest(targetRoot, skillsManifest)));
      registry.components[index] = { ...entry, enabled: false, state: 'uninstalled' };
      if (reason) registry.components[index].reason = reason;
      changed.push(toPosixRelative(targetRoot, writeComponentsManifest(targetRoot, registry)));
      return { changed };
    });
    const rendered = reconcileComponentRuntime(targetRoot, agent);
    console.log(`已卸载 Component：${id}`);
    for (const file of [...new Set(changed)]) console.log(`  ${file}`);
    for (const file of rendered.files) console.log(`  ${toPosixRelative(targetRoot, file)}`);
    console.log('doctor 通过。');
  }

  Object.assign(runtime, { componentRegistryPath, parseComponentsManifestYaml, validateComponentsManifest, renderComponentsManifestYaml, readComponentsManifestForWrite, writeComponentsManifest, parseComponentDefinitionYaml, renderComponentDefinitionYaml, componentIntegrityMap, componentMemberPaths, parseSkillContributionDeclaration, parseSkillDependencyContribution, validateComponentDefinition, assetIntegrity, readComponentDefinition, componentDefinitionFile, workspaceSymlinkSegment, componentInventory, componentOwnerForMember, packageComponentEntry, packageComponentDefinition, componentMemberKind, componentBuiltinForMember, packageComponentSourcePath, validatePackageComponentMembers, legacyComponentMemberDecision, isAdoptableLegacyComponentMember, buildComponentReconcilePlan, commandCollectionReferenceIssues, removeEmptyCommandCollectionParents, removeComponentMember, installComponentMember, componentReconcileAffectedPaths, applyPackageComponent, packageComponentsStatus, planPackageComponentsSync, syncPackageComponents, assertWorkspaceComponentScope, componentListOrCheck, installWorkspaceComponent, declaredRuntimeSkillPaths, declaredRuntimeInstallPlanIds, managedRuntimeSkillOrphans, buildRuntimeOrphanRemovalPlan, reconcileComponentRuntime, componentInstall, componentUninstall });
  return runtime;
}
