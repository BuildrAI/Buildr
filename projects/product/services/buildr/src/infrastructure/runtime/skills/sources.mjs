import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fetchRemoteText } from '../../network/fetch-remote-text.mjs';
import { resolveComponentContributions } from './contributions.mjs';
import { capabilityKey, isSourceLabel, parseSkillsManifestDocument } from './manifests.mjs';
import { ensureFile, normalizeRelativePath, parseSkillFrontmatterName, parseSkillFrontmatterNameFromContent, productRoot, resourcesRoot, unquoteYamlScalar } from './primitives.mjs';

function readPackageSkillEntries(section, runtime) {
  const manifestPath = path.join(resourcesRoot(), 'manifest.yml');
  if (!fs.existsSync(manifestPath)) return [];

  const skills = [];
  let inSection = false;
  let current = null;
  let inRuntimes = false;

  for (const rawLine of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const topLevel = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/);
    if (topLevel) {
      if (current) skills.push(current);
      current = null;
      inRuntimes = false;
      inSection = topLevel[1] === section;
      continue;
    }
    if (!inSection) continue;

    const idMatch = trimmed.match(/^-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (current) skills.push(current);
      current = { id: unquoteYamlScalar(idMatch[1]), runtimes: [] };
      inRuntimes = false;
      continue;
    }
    if (!current) {
      throw new Error(`Invalid ${section} entry in ${manifestPath}: ${rawLine}`);
    }

    const pathMatch = trimmed.match(/^path:\s*(.+)$/);
    if (pathMatch) {
      current.path = unquoteYamlScalar(pathMatch[1]);
      inRuntimes = false;
      continue;
    }
    const runtimePathMatch = trimmed.match(/^runtimePath:\s*(.+)$/);
    if (runtimePathMatch && section === 'skillSources') {
      current.runtimePath = unquoteYamlScalar(runtimePathMatch[1]);
      inRuntimes = false;
      continue;
    }
    if (trimmed === 'runtimes:') {
      inRuntimes = true;
      continue;
    }
    const runtimeMatch = trimmed.match(/^-\s+(.+)$/);
    if (runtimeMatch && inRuntimes) {
      current.runtimes.push(unquoteYamlScalar(runtimeMatch[1]));
      continue;
    }
    throw new Error(`Unsupported ${section} syntax in ${manifestPath}: ${rawLine}`);
  }
  if (current) skills.push(current);

  return skills
    .filter((skill) => skill.runtimes.includes(runtime))
    .map((skill) => {
      if (!skill.id || !skill.path) {
        throw new Error(`${section} entries must include id and path in ${manifestPath}`);
      }
      const skillPath = normalizeRelativePath(skill.path);
      const sourceDir = path.join(productRoot(), skillPath);
      const sourceFile = path.join(sourceDir, 'SKILL.md');
      ensureFile(sourceFile, `Package Skill SKILL.md not found: ${sourceFile}`);
      const result = {
        id: skill.id,
        sourceDir,
        sourceFile,
        origin: section === 'agentSkills' ? 'product' : 'package',
        runtime,
        displaySource: `${skillPath}/SKILL.md`,
      };
      if (section === 'agentSkills') result.workspaceId = 'buildr-product';
      if (section === 'skillSources') {
        if (skill.runtimePath !== undefined) result.runtimePath = normalizeRelativePath(skill.runtimePath).split(path.sep).join('/');
        result.sourceKind = 'source';
      }
      return result;
    });
}

function readPackageAgentSkills(runtime) {
  return readPackageSkillEntries('agentSkills', runtime);
}

function readPackageSkillSources(runtime) {
  return readPackageSkillEntries('skillSources', runtime);
}

export function resolvePackageAgentSkill(runtime, skillId = 'buildr') {
  const skill = readPackageAgentSkills(runtime).find((entry) => entry.id === skillId);
  if (!skill) {
    throw new Error(`Product Agent Skill not found for ${runtime}: ${skillId}`);
  }
  return skill;
}

function parseSkillSourceRef(sourceRef) {
  const match = sourceRef.match(/^package:([A-Za-z0-9._-]+)$/);
  if (!match) {
    throw new Error(`Unsupported Skill source reference: ${sourceRef}. Supported format: package:<source-id>`);
  }
  return { type: 'package', id: match[1] };
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verifyIntegrity(content, integrity, label) {
  if (!integrity) return;
  const match = integrity.match(/^sha256-([A-Fa-f0-9]{64})$/);
  if (!match) {
    throw new Error(`Unsupported integrity format for ${label}: ${integrity}. Use sha256-<hex>.`);
  }
  const actual = hashContent(content);
  if (actual !== match[1].toLowerCase()) {
    throw new Error(`Integrity mismatch for ${label}: expected ${integrity}, actual sha256-${actual}`);
  }
}

function resolveSkillUrl(skill, layerOrigin) {
  const content = fetchRemoteText(skill.resolved.url, { label: `workspace Skill ${skill.id}` });
  verifyIntegrity(content, skill.resolved.integrity, skill.id);
  const sourceName = parseSkillFrontmatterNameFromContent(content, skill.resolved.url);
  if (sourceName !== skill.id) {
    throw new Error(`Skill id does not match resolved SKILL.md frontmatter name: ${skill.id} != ${sourceName}`);
  }
  return {
    id: skill.id,
    origin: layerOrigin,
    sourceKind: 'resolved',
    resolved: skill.resolved,
    source: skill.source,
    sourceContent: content,
    displaySource: skill.resolved.url,
    runtimePath: skill.id,
  };
}

function describeSkillUrl(skill, layerOrigin) {
  return {
    id: skill.id,
    origin: layerOrigin,
    sourceKind: 'resolved',
    resolved: skill.resolved,
    source: skill.source,
    displaySource: skill.resolved.url,
    runtimePath: skill.id,
  };
}

function resolveAgentInstallSkill(skill, layerOrigin, manifestPath) {
  return {
    id: skill.id,
    origin: layerOrigin,
    sourceKind: 'agent-install',
    source: skill.source,
    resolved: skill.resolved,
    installMode: 'agent',
    displaySource: manifestPath,
    runtimePath: skill.id,
  };
}

function resolveReferencedSkill(skill, packageSourcesById, runtime) {
  const parsed = parseSkillSourceRef(skill.source);
  const packageSource = packageSourcesById.get(parsed.id);
  if (!packageSource) {
    throw new Error(`Package Skill source not found for ${runtime}: ${skill.source}`);
  }
  const sourceName = parseSkillFrontmatterName(packageSource.sourceFile);
  if (sourceName !== skill.id) {
    throw new Error(`Skill id does not match referenced SKILL.md frontmatter name: ${skill.id} != ${sourceName}`);
  }
  return {
    ...packageSource,
    id: skill.id,
    sourceRef: skill.source,
    runtimePath: packageSource.runtimePath ?? normalizeRelativePath(skill.runtimePath ?? skill.id).split(path.sep).join('/'),
  };
}

function loadLayer(manifestPath, options = {}) {
  const manifestDir = path.dirname(manifestPath);
  const runtime = options.runtime ?? 'claude-code';
  const layerOrigin = options.origin ?? 'workspace';
  const packageSourcesById = options.packageSourcesById ?? new Map();
  const seen = new Set();
  const document = parseSkillsManifestDocument(manifestPath);
  return document.skills.map((skill) => {
    if (seen.has(skill.id)) {
      throw new Error(`Duplicate skill id in same manifest: ${skill.id} (${manifestPath})`);
    }
    seen.add(skill.id);
    if (skill.enabled === false || skill.state === 'uninstalled') {
      return null;
    }
    if (Array.isArray(skill.runtimes) && !skill.runtimes.includes(runtime)) {
      return null;
    }
    if (typeof skill.source === 'string') {
      if (skill.path !== undefined && isSourceLabel(skill.source)) {
        // source is an ownership label; resolve the local path below.
      } else {
      return decorateResolvedSkill(resolveReferencedSkill(skill, packageSourcesById, runtime), skill, manifestPath, options.scope, document.workspaceId);
      }
    }
    const hasLocalSourceLabel = skill.path !== undefined && typeof skill.source === 'string' && isSourceLabel(skill.source);
    if (skill.install?.mode === 'agent' || (skill.source !== undefined && skill.resolved === undefined && !hasLocalSourceLabel)) {
      return decorateResolvedSkill(resolveAgentInstallSkill(skill, layerOrigin, manifestPath), skill, manifestPath, options.scope, document.workspaceId);
    }
    if (skill.resolved !== undefined) {
      const resolved = options.resolveRemote === false
        ? describeSkillUrl(skill, layerOrigin)
        : resolveSkillUrl(skill, layerOrigin);
      return decorateResolvedSkill(resolved, skill, manifestPath, options.scope, document.workspaceId);
    }
    const skillPath = normalizeRelativePath(skill.path);
    const sourceDir = path.join(manifestDir, skillPath);
    const sourceFile = path.join(sourceDir, 'SKILL.md');
    ensureFile(sourceFile, `Skill SKILL.md not found: ${sourceFile}`);
    const sourceName = parseSkillFrontmatterName(sourceFile);
    if (sourceName !== skill.id) {
      throw new Error(`Skill id does not match SKILL.md frontmatter name: ${skill.id} != ${sourceName}`);
    }
    const runtimePath = skill.runtimePath !== undefined ? normalizeRelativePath(skill.runtimePath) : skillPath;
    return decorateResolvedSkill({
      id: skill.id,
      sourceDir,
      sourceFile,
      origin: isSourceLabel(skill.source) ? skill.source : layerOrigin,
      sourceKind: 'path',
      runtimePath: runtimePath.split(path.sep).join('/'),
    }, skill, manifestPath, options.scope, document.workspaceId);
  }).filter(Boolean);
}

function decorateResolvedSkill(resolved, manifestEntry, manifestPath, declaredScope, workspaceId) {
  return {
    ...resolved,
    assetIdentity: manifestEntry.assetIdentity,
    sourceIdentity: manifestEntry.sourceIdentity,
    workspaceId,
    provides: manifestEntry.provides || [],
    requires: manifestEntry.requires || [],
    manifestPath,
    declaredScope: declaredScope || (path.dirname(path.dirname(manifestPath)).endsWith(`${path.sep}skills`) ? '.' : undefined),
  };
}

export function resolveSkills(organizationRoot, projectRoot, options = {}) {
  const runtime = options.runtime ?? 'claude-code';
  const layers = [];
  const organizationManifest = path.join(organizationRoot, 'skills', 'manifest.yml');
  if (options.includeWorkspace !== false && fs.existsSync(organizationManifest)) {
    layers.push(organizationManifest);
  }
  // Project is a business/capability context. Legacy Project Skill manifests
  // are intentionally excluded until the explicit migration command moves them.

  const productSkillsById = new Map(readPackageAgentSkills(runtime).map((skill) => [skill.id, skill]));
  const packageSourcesById = new Map(readPackageSkillSources(runtime).map((skill) => [skill.id, skill]));
  const resolved = new Map();
  for (const manifestPath of layers) {
    const layerOrigin = 'workspace';
    const scope = '.';
    for (const skill of loadLayer(manifestPath, {
      runtime,
      layerOrigin,
      packageSourcesById,
      scope,
      resolveRemote: options.resolveRemote,
    })) {
      const productSkill = productSkillsById.get(skill.id);
      if (productSkill) {
        const displaySource = skill.sourceFile ?? skill.displaySource ?? skill.resolved?.url ?? skill.source?.url ?? 'skills/manifest.yml';
        throw new Error(`Skill id conflict: ${skill.id} is provided by product Agent Skill (${productSkill.displaySource}) and workspace Skill (${displaySource}). Rename the workspace Skill.`);
      }
      resolved.set(skill.id, skill);
    }
  }
  const componentContributions = options.includeContributions === false
    ? { fragments: [], dependencies: [] }
    : resolveComponentContributions(organizationRoot);
  for (const contribution of componentContributions.fragments) {
    const target = resolved.get(contribution.skillId);
    if (!target) continue;
    if (contribution.placement === 'slot') {
      const source = target.sourceContent ?? fs.readFileSync(target.sourceFile, 'utf8');
      const marker = `<!-- buildr:skill-contributions ${contribution.slot} -->`;
      const markerCount = source.split(marker).length - 1;
      if (markerCount !== 1) {
        throw new Error(`Skill contribution slot must appear exactly once: ${contribution.skillId}#${contribution.slot} (${contribution.componentId}); found ${markerCount}`);
      }
    }
    if (!target.skillContributions) target.skillContributions = [];
    target.skillContributions.push(contribution);
  }
  for (const contribution of componentContributions.dependencies) {
    const target = resolved.get(contribution.skillId);
    if (!target) continue;
    const key = capabilityKey(contribution.capability, contribution.version);
    const existing = target.requires.find((item) => capabilityKey(item.capability, item.version) === key);
    if (!existing) target.requires.push({ capability: contribution.capability, version: contribution.version, mode: contribution.mode });
    else if (contribution.mode === 'required') existing.mode = 'required';
    if (!target.skillDependencyContributions) target.skillDependencyContributions = [];
    target.skillDependencyContributions.push(contribution);
  }
  return [...resolved.values()];
}
