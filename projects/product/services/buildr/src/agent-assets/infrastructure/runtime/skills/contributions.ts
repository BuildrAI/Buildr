import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { capabilityKey, parseBooleanScalar, validateCapabilityIdentity } from './manifests.ts';
import { ensureFile, normalizeRelativePath, unquoteYamlScalar } from './primitives.ts';

function parseInstalledComponentsManifest(manifestPath: any): any  {
  if (!fs.existsSync(manifestPath)) return [];
  const entries: any[] = [];
  let inComponents = false;
  let current: any = null;
  for (const rawLine of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'components:') {
      inComponents = true;
      continue;
    }
    if (!inComponents || trimmed === 'components: []') continue;
    const idMatch = trimmed.match(/^-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (current) entries.push(current);
      current = { id: unquoteYamlScalar(idMatch[1]) };
      continue;
    }
    const fieldMatch = trimmed.match(/^(path|enabled|state):\s*(.+)$/);
    if (fieldMatch && current) {
      current[fieldMatch[1]] = fieldMatch[1] === 'enabled'
        ? parseBooleanScalar(unquoteYamlScalar(fieldMatch[2]))
        : unquoteYamlScalar(fieldMatch[2]);
    }
  }
  if (current) entries.push(current);
  return entries.filter((entry: any) => entry.enabled !== false && entry.state !== 'uninstalled');
}

function parseComponentContributions(definitionPath: any): any  {
  const definition = YAML.parse(fs.readFileSync(definitionPath, 'utf8')) || {};
  const allowedTop: any = new Set(['schemaVersion', 'id', 'kind', 'version', 'source', 'upstream', 'members', 'contributions', 'integrity']);
  for (const key of Object.keys(definition)) {
    if (!allowedTop.has(key)) throw new Error(`Component field is not supported and cannot extend runtime adapters: ${key}`);
  }
  definition.members ||= {};
  definition.contributions ||= {};
  for (const key of Object.keys(definition.members)) {
    if (!['rules', 'skills', 'commandCollections', 'skillContributions'].includes(key)) throw new Error(`Component member type is not supported and cannot extend runtime adapters: ${key}`);
  }
  for (const key of Object.keys(definition.contributions)) {
    if (!['skillFragments', 'skillDependencies'].includes(key)) throw new Error(`Component contribution type is not supported and cannot extend runtime adapters: ${key}`);
  }
  for (const key of ['rules', 'skills', 'commandCollections', 'skillContributions']) {
    definition.members[key] ||= [];
    if (!Array.isArray(definition.members[key]) || !definition.members[key].every((item: any) => typeof item === 'string')) throw new Error(`Component members.${key} must be an array of strings.`);
  }
  definition.contributions.skillFragments ||= [];
  if (!Array.isArray(definition.contributions.skillFragments) || !definition.contributions.skillFragments.every((item: any) => typeof item === 'string')) throw new Error('Component contributions.skillFragments must be an array of strings.');
  definition.contributions.skillDependencies ||= [];
  if (!Array.isArray(definition.contributions.skillDependencies)) throw new Error('Component contributions.skillDependencies must be an array.');
  if (!Array.isArray(definition.integrity) || !definition.integrity.every((item: any) => typeof item === 'string')) throw new Error('Component integrity must be an array of strings.');
  return definition;
}

function parseSkillDependencyContribution(value: any, label: any): any  {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const allowed: any = new Set(['skill', 'capability', 'version', 'mode']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not supported.`);
  if (typeof value.skill !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value.skill)) throw new Error(`${label}.skill must be a valid Skill id.`);
  validateCapabilityIdentity(value.capability, value.version, label);
  if (!['required', 'optional'].includes(value.mode)) throw new Error(`${label}.mode must be required or optional.`);
  return { skillId: value.skill, capability: value.capability, version: value.version, mode: value.mode };
}

function parseSkillContributionDeclaration(value: any): any  {
  const slotMatch = String(value).match(/^([A-Za-z0-9._-]+)#([a-z][a-z0-9-]*)=(.+)$/);
  if (slotMatch) return { skillId: slotMatch[1], placement: 'slot', slot: slotMatch[2], fragment: normalizeRelativePath(slotMatch[3]).split(path.sep).join('/') };
  const boundaryMatch = String(value).match(/^([A-Za-z0-9._-]+)@(prepend|append)=(.+)$/);
  if (boundaryMatch) return { skillId: boundaryMatch[1], placement: boundaryMatch[2], slot: null, fragment: normalizeRelativePath(boundaryMatch[3]).split(path.sep).join('/') };
  throw new Error(`Invalid Skill contribution declaration: ${value}. Expected <skill-id>#<slot>=<fragment-path> or <skill-id>@<prepend|append>=<fragment-path>.`);
}

function safeWorkspaceFile(organizationRoot: any, relativePath: any, label: any): any  {
  if (!relativePath || relativePath === '.') throw new Error(`${label} path is empty.`);
  const normalized = normalizeRelativePath(relativePath);
  const absolute = path.resolve(organizationRoot, normalized);
  const relative = path.relative(organizationRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside workspace: ${relativePath}`);
  let current = organizationRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} crosses a symbolic link: ${current}`);
  }
  ensureFile(absolute, `${label} not found: ${absolute}`);
  return absolute;
}

function workspaceAssetIntegrity(organizationRoot: any, relativePath: any, label: any): any  {
  const normalized = normalizeRelativePath(relativePath);
  const absolute = path.resolve(organizationRoot, normalized);
  const relative = path.relative(organizationRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside workspace: ${relativePath}`);
  let current = organizationRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} crosses a symbolic link: ${current}`);
  }
  if (!fs.existsSync(absolute)) throw new Error(`${label} not found: ${absolute}`);
  const hash = crypto.createHash('sha256');
  if (fs.statSync(absolute).isFile()) hash.update(fs.readFileSync(absolute));
  else if (fs.statSync(absolute).isDirectory()) {
    const files: any[] = [];
    const visit = (directory: any) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left: any, right: any) => left.name.localeCompare(right.name))) {
        const item = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`${label} contains a symbolic link: ${item}`);
        if (entry.isDirectory()) visit(item);
        else if (entry.isFile()) files.push(item);
      }
    };
    visit(absolute);
    for (const file of files) {
      hash.update(path.relative(absolute, file).split(path.sep).join('/'));
      hash.update('\0');
      hash.update(fs.readFileSync(file));
      hash.update('\0');
    }
  } else throw new Error(`${label} must be a file or directory: ${absolute}`);
  return `sha256-${hash.digest('hex')}`;
}

export function resolveComponentContributions(organizationRoot: any): any  {
  const manifestPath = path.join(organizationRoot, 'components', 'manifest.yml');
  const fragments: any[] = [];
  const dependencies: any[] = [];
  const ownership: any = new Map();
  for (const entry of parseInstalledComponentsManifest(manifestPath)) {
    if (!entry.path) throw new Error(`Installed Component path is missing: ${entry.id}`);
    const definitionPath = safeWorkspaceFile(organizationRoot, `${entry.path}/component.yml`, `Component ${entry.id} definition`);
    const definition = parseComponentContributions(definitionPath);
    if (definition.id !== entry.id) throw new Error(`Component id differs from registry: ${definition.id} != ${entry.id}`);
    if (definition.schemaVersion !== 'buildr.component/v1') throw new Error(`Component schemaVersion is invalid: ${entry.id}`);
    if (!definition.source || entry.path !== `components/${definition.source}/${definition.id}`) throw new Error(`Component path or source differs from definition: ${entry.id}`);
    const allMembers = Object.values(definition.members).flat();
    if (new Set(allMembers).size !== allMembers.length) throw new Error(`Component contains duplicate members: ${entry.id}`);
    const members: any = new Set(definition.members.skillContributions);
    const integrity: any = new Map(definition.integrity.map((item: any) => {
      const index = item.lastIndexOf('=');
      if (index === -1) throw new Error(`Component integrity entry is invalid: ${item}`);
      return [item.slice(0, index), item.slice(index + 1)];
    }));
    if (integrity.size !== definition.integrity.length) throw new Error(`Component integrity contains duplicate members: ${entry.id}`);
    for (const member of allMembers) {
      if (ownership.has(member)) throw new Error(`Component ownership conflict: ${member} (${ownership.get(member)}, ${entry.id})`);
      ownership.set(member, entry.id);
      const expected = integrity.get(member);
      if (!expected || !/^sha256-[a-f0-9]{64}$/.test(expected)) throw new Error(`Component member integrity is missing or invalid: ${member}`);
      const actual = workspaceAssetIntegrity(organizationRoot, member, `Component ${entry.id} member`);
      if (expected !== actual) throw new Error(`Component member integrity mismatch: ${member}`);
    }
    for (const member of integrity.keys()) if (!allMembers.includes(member)) throw new Error(`Component integrity references unknown member: ${member}`);
    const seenDeclarations: any = new Set();
    const seenFragments: any = new Set();
    for (const [index, rawDeclaration] of definition.contributions.skillFragments.entries()) {
      if (seenDeclarations.has(rawDeclaration)) throw new Error(`Duplicate Skill contribution declaration: ${rawDeclaration}`);
      seenDeclarations.add(rawDeclaration);
      const declaration = parseSkillContributionDeclaration(rawDeclaration);
      if (!members.has(declaration.fragment)) throw new Error(`Skill contribution is not a Component member: ${declaration.fragment}`);
      if (seenFragments.has(declaration.fragment)) throw new Error(`Skill contribution fragment is referenced more than once: ${declaration.fragment}`);
      seenFragments.add(declaration.fragment);
      const fragmentFile = safeWorkspaceFile(organizationRoot, declaration.fragment, `Component ${entry.id} Skill contribution`);
      const content = fs.readFileSync(fragmentFile, 'utf8').trim();
      if (!content) throw new Error(`Skill contribution fragment is empty: ${declaration.fragment}`);
      fragments.push({
        ...declaration,
        componentId: entry.id,
        order: index,
        content,
      });
    }
    for (const member of members) if (!seenFragments.has(member)) throw new Error(`Skill contribution member has no declaration: ${member}`);
    const fragmentTargets: any = new Set(fragments.filter((item: any) => item.componentId === entry.id).map((item: any) => item.skillId));
    const seenDependencies: any = new Set();
    for (const [index, rawDependency] of definition.contributions.skillDependencies.entries()) {
      const dependency = parseSkillDependencyContribution(rawDependency, `Component ${entry.id} contributions.skillDependencies[${index}]`);
      if (!fragmentTargets.has(dependency.skillId)) throw new Error(`Component Skill dependency target must also receive a Skill fragment: ${dependency.skillId}`);
      const key = `${dependency.skillId}:${capabilityKey(dependency.capability, dependency.version)}`;
      if (seenDependencies.has(key)) throw new Error(`Duplicate Component Skill dependency contribution: ${key}`);
      seenDependencies.add(key);
      dependencies.push({ ...dependency, componentId: entry.id, order: index });
    }
  }
  const order = (left: any, right: any) => left.componentId.localeCompare(right.componentId) || left.order - right.order;
  return { fragments: fragments.sort(order), dependencies: dependencies.sort(order) };
}

export function resolveSkillContributions(organizationRoot: any): any  {
  return resolveComponentContributions(organizationRoot).fragments;
}
