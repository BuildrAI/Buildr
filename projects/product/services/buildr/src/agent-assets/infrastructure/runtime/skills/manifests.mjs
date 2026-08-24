import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ensureFile } from './primitives.mjs';

export const SKILLS_SCHEMA_V1 = 'buildr.skills/v1';
export const SKILLS_SCHEMA_V2 = 'buildr.skills/v2';
export const SKILLS_SCHEMA_V3 = 'buildr.skills/v3';
export const PROJECT_CAPABILITIES_SCHEMA = 'buildr.project-capabilities/v1';
export const CAPABILITY_CONTRACT_SCHEMA = 'buildr.capability-contract/v1';
export const CAPABILITY_REASONS = Object.freeze([
  'missing_provider',
  'ambiguous_provider',
  'version_mismatch',
  'runtime_unavailable',
  'invalid_binding',
  'provider_not_ready',
  'dependency_cycle',
]);
export const CONTRACT_SECTIONS = Object.freeze([
  'Purpose',
  'Consumer Obligations',
  'Minimum Guarantees',
  'Effects and Authorization',
  'Result Evidence',
  'Decision Points',
  'Allowed Variations',
]);

const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const IDENTITY = /^[a-z][a-z0-9+._:-]*$/;

function stableUuid(value) {
  const hex = crypto.createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export function sourceIdentityForSkill(skill, workspaceId) {
  if (skill.sourceIdentity) return skill.sourceIdentity;
  if (skill.resolved?.url) return `resolved:${skill.resolved.kind || 'skill-url'}:${skill.resolved.url}`;
  if (typeof skill.source === 'string' && !isSourceLabel(skill.source)) return `package:${skill.source.replace(/^package:/, '')}`;
  if (skill.source?.url) return `remote:${skill.source.kind || 'url'}:${skill.source.url}`;
  return `workspace:${workspaceId}:${skill.path || skill.id}`;
}

export function assetIdentityForSkill(skill, workspaceId) {
  return skill.assetIdentity || `workspace:${workspaceId}:skill:${skill.id}`;
}

export function capabilityKey(capability, version) {
  return `${capability}@${version}`;
}

export function validateCapabilityIdentity(capability, version, label) {
  if (typeof capability !== 'string' || !CAPABILITY_ID.test(capability)) {
    throw new Error(`${label}.capability must be a lowercase namespaced id`);
  }
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`${label}.version must be a positive integer`);
  }
}

function parseYaml(content, label) {
  try {
    const parsed = YAML.parse(content);
    if (!isPlainObject(parsed)) throw new Error('document must be a mapping');
    return parsed;
  } catch (error) {
    throw new Error(`Invalid YAML in ${label}: ${error.message}`);
  }
}

export function parseCapabilityContract(contractPath, assertion = null) {
  ensureFile(contractPath, `Capability contract not found: ${contractPath}`);
  const content = fs.readFileSync(contractPath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Capability contract must start with closed YAML frontmatter: ${contractPath}`);
  const metadata = parseYaml(match[1], contractPath);
  if (metadata.schemaVersion !== CAPABILITY_CONTRACT_SCHEMA) {
    throw new Error(`Unsupported capability contract schemaVersion in ${contractPath}: ${metadata.schemaVersion || '<missing>'}`);
  }
  validateCapabilityIdentity(metadata.id, metadata.version, `Capability contract ${contractPath}`);
  if (assertion && (metadata.id !== assertion.id || metadata.version !== assertion.version)) {
    throw new Error(`Capability contract identity mismatch in ${contractPath}: manifest=${capabilityKey(assertion.id, assertion.version)} frontmatter=${capabilityKey(metadata.id, metadata.version)}`);
  }
  const body = content.slice(match[0].length);
  for (const section of CONTRACT_SECTIONS) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'm').test(body)) {
      throw new Error(`Capability contract is missing required section "${section}": ${contractPath}`);
    }
  }
  return {
    schemaVersion: metadata.schemaVersion,
    id: metadata.id,
    version: metadata.version,
    content,
    digest: crypto.createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex'),
  };
}

function validateDeclarations(items, label, modeRequired = false) {
  if (items === undefined) return;
  if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
  const seen = new Set();
  items.forEach((item, index) => {
    if (!isPlainObject(item)) throw new Error(`${label}[${index}] must be an object`);
    validateCapabilityIdentity(item.capability, item.version, `${label}[${index}]`);
    if (modeRequired && !['required', 'optional'].includes(item.mode)) {
      throw new Error(`${label}[${index}].mode must be required or optional`);
    }
    const key = capabilityKey(item.capability, item.version);
    if (seen.has(key)) throw new Error(`Duplicate capability declaration in ${label}: ${key}`);
    seen.add(key);
  });
}

export function validateSkillsManifestDocument(document, manifestPath, options = {}) {
  const schemaVersion = document.schemaVersion ?? null;
  if (schemaVersion !== null && ![SKILLS_SCHEMA_V1, SKILLS_SCHEMA_V2, SKILLS_SCHEMA_V3].includes(schemaVersion)) {
    throw new Error(`Unsupported Skills manifest schemaVersion in ${manifestPath}: ${schemaVersion}`);
  }
  for (const field of ['skills', 'contracts', 'bindings']) {
    if (document[field] !== undefined && !Array.isArray(document[field])) throw new Error(`${field} must be an array in ${manifestPath}`);
  }
  if (![SKILLS_SCHEMA_V2, SKILLS_SCHEMA_V3].includes(schemaVersion) && ((document.contracts?.length ?? 0) || (document.bindings?.length ?? 0))) {
    throw new Error(`Capability contracts and bindings require ${SKILLS_SCHEMA_V2} or ${SKILLS_SCHEMA_V3} in ${manifestPath}`);
  }
  if (schemaVersion === SKILLS_SCHEMA_V3 && (typeof document.workspaceId !== 'string' || !document.workspaceId)) throw new Error(`workspaceId is required for ${SKILLS_SCHEMA_V3} in ${manifestPath}`);
  const skillIds = new Set();
  for (const [index, skill] of (document.skills || []).entries()) {
    if (!isPlainObject(skill) || typeof skill.id !== 'string' || !skill.id) throw new Error(`skills[${index}].id is required in ${manifestPath}`);
    if (skillIds.has(skill.id)) throw new Error(`Duplicate skill id in ${manifestPath}: ${skill.id}`);
    skillIds.add(skill.id);
    const hasPath = skill.path !== undefined;
    const hasSource = skill.source !== undefined;
    const hasResolved = skill.resolved !== undefined;
    const hasSourceLabel = hasPath && typeof skill.source === 'string' && isSourceLabel(skill.source);
    if (!hasPath && !hasSource && !hasResolved) throw new Error(`skills[${index}] must include path, source, or resolved in ${manifestPath}`);
    if (hasPath && ((hasSource && !hasSourceLabel) || hasResolved)) throw new Error(`skills[${index}] must not combine path with source or resolved in ${manifestPath}`);
    if (skill.enabled !== undefined && typeof skill.enabled !== 'boolean') throw new Error(`skills[${index}].enabled must be boolean in ${manifestPath}`);
    if (skill.required !== undefined && typeof skill.required !== 'boolean') throw new Error(`skills[${index}].required must be boolean in ${manifestPath}`);
    if (skill.runtimes !== undefined && (!Array.isArray(skill.runtimes) || !skill.runtimes.every((item) => typeof item === 'string'))) throw new Error(`skills[${index}].runtimes must be an array of strings in ${manifestPath}`);
    if (schemaVersion === SKILLS_SCHEMA_V3) {
      if (typeof skill.assetIdentity !== 'string' || !IDENTITY.test(skill.assetIdentity)) throw new Error(`skills[${index}].assetIdentity is required and must be a stable identity in ${manifestPath}`);
      if (typeof skill.sourceIdentity !== 'string' || !skill.sourceIdentity) throw new Error(`skills[${index}].sourceIdentity is required in ${manifestPath}`);
    }
    validateDeclarations(skill.provides, `skills[${index}].provides`);
    validateDeclarations(skill.requires, `skills[${index}].requires`, true);
  }
  const contracts = new Set();
  for (const [index, contract] of (document.contracts || []).entries()) {
    if (!isPlainObject(contract)) throw new Error(`contracts[${index}] must be an object in ${manifestPath}`);
    validateCapabilityIdentity(contract.id, contract.version, `contracts[${index}]`);
    if (typeof contract.path !== 'string' || !contract.path || typeof contract.description !== 'string' || !contract.description) {
      throw new Error(`contracts[${index}] must include path and description in ${manifestPath}`);
    }
    const key = capabilityKey(contract.id, contract.version);
    if (contracts.has(key)) throw new Error(`Duplicate capability contract in ${manifestPath}: ${key}`);
    contracts.add(key);
    if (options.validateContracts !== false) {
      const contractPath = path.resolve(path.dirname(manifestPath), contract.path);
      const relative = path.relative(path.dirname(manifestPath), contractPath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Capability contract path must stay inside skills root: ${contract.path}`);
      parseCapabilityContract(contractPath, contract);
    }
  }
  const bindings = new Set();
  for (const [index, binding] of (document.bindings || []).entries()) {
    if (!isPlainObject(binding)) throw new Error(`bindings[${index}] must be an object in ${manifestPath}`);
    validateCapabilityIdentity(binding.capability, binding.version, `bindings[${index}]`);
    if (typeof binding.provider !== 'string' || !binding.provider) throw new Error(`bindings[${index}].provider is required in ${manifestPath}`);
    const key = capabilityKey(binding.capability, binding.version);
    if (bindings.has(key)) throw new Error(`Duplicate capability binding in ${manifestPath}: ${key}`);
    bindings.add(key);
  }
  return document;
}

export function migrateSkillsManifestDocument(document, options = {}) {
  const workspaceId = document.workspaceId || stableUuid(path.resolve(options.manifestPath || 'skills/manifest.yml'));
  return {
    ...document,
    schemaVersion: SKILLS_SCHEMA_V3,
    workspaceId,
    skills: (Array.isArray(document.skills) ? document.skills : []).map((skill) => ({
      ...skill,
      assetIdentity: assetIdentityForSkill(skill, workspaceId),
      sourceIdentity: sourceIdentityForSkill(skill, workspaceId),
    })),
  };
}

export function parseSkillsManifestDocument(manifestPath, options = {}) {
  ensureFile(manifestPath, `Manifest not found: ${manifestPath}`);
  const original = parseYaml(fs.readFileSync(manifestPath, 'utf8'), manifestPath);
  validateSkillsManifestDocument(original, manifestPath, options);
  return options.migrate === false ? original : migrateSkillsManifestDocument(original, { manifestPath });
}

export function validateProjectCapabilitiesDocument(document, file = 'capabilities.yml') {
  if (!isPlainObject(document) || document.schemaVersion !== PROJECT_CAPABILITIES_SCHEMA) throw new Error(`Unsupported Project capabilities schemaVersion in ${file}: ${document?.schemaVersion || '<missing>'}`);
  for (const field of ['requires', 'bindings', 'skills']) if (document[field] !== undefined && !Array.isArray(document[field])) throw new Error(`${field} must be an array in ${file}`);
  validateDeclarations(document.requires, 'requires', true);
  const bindings = new Set();
  for (const [index, binding] of (document.bindings || []).entries()) {
    validateCapabilityIdentity(binding.capability, binding.version, `bindings[${index}]`);
    if (typeof binding.provider !== 'string' || !binding.provider) throw new Error(`bindings[${index}].provider is required in ${file}`);
    const key = capabilityKey(binding.capability, binding.version);
    if (bindings.has(key)) throw new Error(`Duplicate capability binding in ${file}: ${key}`);
    bindings.add(key);
  }
  const skills = new Set();
  for (const [index, skill] of (document.skills || []).entries()) {
    const id = typeof skill === 'string' ? skill : skill?.id;
    if (typeof id !== 'string' || !id) throw new Error(`skills[${index}] must reference a workspace Skill id in ${file}`);
    if (skills.has(id)) throw new Error(`Duplicate Skill applicability in ${file}: ${id}`);
    skills.add(id);
  }
  return document;
}

export function parseProjectCapabilities(file) {
  ensureFile(file, `Project capabilities not found: ${file}`);
  return validateProjectCapabilitiesDocument(parseYaml(fs.readFileSync(file, 'utf8'), file), file);
}

export function parseSkillsManifest(manifestPath, options = {}) {
  return parseSkillsManifestDocument(manifestPath, options).skills;
}

export function parseBooleanScalar(value) {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw new Error(`Expected boolean scalar, got: ${value}`);
}

export function isSourceLabel(value) {
  return ['buildr', 'openspec', 'workspace', 'project', 'service'].includes(value);
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
