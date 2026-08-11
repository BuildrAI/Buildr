import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';
import {
  SKILLS_SCHEMA_V3,
  PROJECT_CAPABILITIES_SCHEMA,
  capabilityKey,
  migrateSkillsManifestDocument,
  parseSkillsManifestDocument,
  validateCapabilityIdentity,
  validateSkillsManifestDocument,
  validateProjectCapabilitiesDocument,
} from '../../infrastructure/runtime/skills/manifests.mjs';
import { selectedProviderImpacts } from '../../infrastructure/runtime/skills/capabilities.mjs';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.mjs';

export function registerDomainsSkills(runtime) {
  const doctor = (...args) => runtime.doctor(...args);
  const isPlainObject = (...args) => runtime.isPlainObject(...args);
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const positionalArgs = (...args) => runtime.positionalArgs(...args);
  const componentOwnerForMember = (...args) => runtime.componentOwnerForMember(...args);
  const readPackageManifest = (...args) => runtime.readPackageManifest(...args);
  const isValidAssetId = (...args) => runtime.isValidAssetId(...args);
  const assertName = (...args) => runtime.assertName(...args);
  const quoteYaml = (...args) => runtime.quoteYaml(...args);
  const parseYamlValue = (...args) => runtime.parseYamlValue(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const ensureDirectory = (...args) => runtime.ensureDirectory(...args);
  const atomicWriteFile = (...args) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args) => runtime.parseYamlDocument(...args);
  const assertSafeAssetTarget = (...args) => runtime.assertSafeAssetTarget(...args);
  const withWorkspaceMutation = (...args) => runtime.withWorkspaceMutation(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const assertInitializedBuildrWorkspace = (...args) => runtime.assertInitializedBuildrWorkspace(...args);

  function runMutationDoctor(targetRoot, scope, options = {}) {
    const previousExitCode = process.exitCode;
    doctor(scope ? ['--target', targetRoot, '--scope', scope, '--json'] : ['--target', targetRoot, '--json'], options);
    process.exitCode = previousExitCode;
  }

  function manifestDocumentFor(skills) {
    return skills?.__buildrManifestDocument || { schemaVersion: SKILLS_SCHEMA_V3, skills: skills || [] };
  }

  function attachManifestDocument(document) {
    const skills = Array.isArray(document.skills) ? document.skills : [];
    Object.defineProperty(skills, '__buildrManifestDocument', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: document,
    });
    return skills;
  }

  function readSkillManifestDocument(file, options = {}) {
    return parseSkillsManifestDocument(file, { migrate: options.migrate !== false, validateContracts: options.validateContracts !== false });
  }

  function readSkillManifest(file) {
    return attachManifestDocument(readSkillManifestDocument(file));
  }

  function readSkillManifestSchemaVersion(file) {
    if (!existsFile(file)) return null;
    return parseYamlDocument(fs.readFileSync(file, 'utf8'), toPosixRelative(process.cwd(), file)).schemaVersion || null;
  }

  function renderYamlObject(lines, indent, key, value) {
    if (value === undefined) return;
    if (isPlainObject(value)) {
      lines.push(`${indent}${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (nestedValue !== undefined) lines.push(`${indent}  ${nestedKey}: ${quoteYaml(nestedValue)}`);
      }
    } else {
      lines.push(`${indent}${key}: ${quoteYaml(value)}`);
    }
  }

  function renderSkillsManifestYaml(skills, options = {}) {
    const source = Array.isArray(skills) ? manifestDocumentFor(skills) : skills;
    const document = migrateSkillsManifestDocument({ ...source, skills: Array.isArray(skills) ? skills : (source.skills || []) }, options);
    return YAML.stringify(document, { lineWidth: 0 });
  }

  function validateSkillManifestEntries(skills, manifestPath) {
    const ids = new Set();
    for (const [index, skill] of skills.entries()) {
      const label = `skills[${index}]`;
      if (!isValidAssetId(skill.id)) {
        throw new Error(`${label}.id must contain only letters, digits, dots, underscores, or dashes in ${manifestPath}`);
      }
      if (ids.has(skill.id)) {
        throw new Error(`Duplicate skill id in ${manifestPath}: ${skill.id}`);
      }
      ids.add(skill.id);
      const hasPath = skill.path !== undefined;
      const hasSource = skill.source !== undefined;
      const hasResolved = skill.resolved !== undefined;
      const hasSourceLabel = hasPath && typeof skill.source === 'string' && isManifestSourceLabel(skill.source);
      if (hasPath && ((hasSource && !hasSourceLabel) || hasResolved)) {
        throw new Error(`${label} must not combine path with source or resolved in ${manifestPath}`);
      }
      if (!hasPath && !hasSource && !hasResolved) {
        throw new Error(`${label} must include path, source, or resolved in ${manifestPath}`);
      }
      if (hasPath) {
        if (!skill.path || typeof skill.path !== 'string') {
          throw new Error(`${label}.path must be a string in ${manifestPath}`);
        }
        normalizeRelativePathForBuildr(skill.path, `Skill path must stay inside skills root: ${skill.path}`);
      }
      if (hasSource && !hasSourceLabel) {
        if (typeof skill.source === 'string') {
          parseSkillSourceRef(skill.source);
        } else if (isPlainObject(skill.source)) {
          validateSkillUrlObject(skill.source, `${label}.source`, manifestPath);
        } else {
          throw new Error(`${label}.source must be a string or object in ${manifestPath}`);
        }
      }
      if (hasResolved) {
        if (!isPlainObject(skill.resolved)) {
          throw new Error(`${label}.resolved must be an object in ${manifestPath}`);
        }
        validateResolvedSkillSource(skill.resolved, `${label}.resolved`, manifestPath);
      }
      if (skill.install !== undefined) {
        if (!isPlainObject(skill.install)) {
          throw new Error(`${label}.install must be an object in ${manifestPath}`);
        }
        if (skill.install.mode !== undefined && !['agent', 'buildr'].includes(skill.install.mode)) {
          throw new Error(`${label}.install.mode must be agent or buildr in ${manifestPath}`);
        }
      }
      if (skill.description !== undefined && typeof skill.description !== 'string') {
        throw new Error(`${label}.description must be a string in ${manifestPath}`);
      }
      if (skill.enabled !== undefined && typeof skill.enabled !== 'boolean') {
        throw new Error(`${label}.enabled must be a boolean in ${manifestPath}`);
      }
      if (skill.required !== undefined && typeof skill.required !== 'boolean') {
        throw new Error(`${label}.required must be a boolean in ${manifestPath}`);
      }
      if (skill.state !== undefined && !['installed', 'modified', 'uninstalled', 'missing'].includes(skill.state)) {
        throw new Error(`${label}.state must be installed, modified, uninstalled, or missing in ${manifestPath}`);
      }
      if (skill.runtimes !== undefined && (!Array.isArray(skill.runtimes) || !skill.runtimes.every((runtime) => typeof runtime === 'string'))) {
        throw new Error(`${label}.runtimes must be an array of strings in ${manifestPath}`);
      }
    }
  }

  function isManifestSourceLabel(value) {
    return ['buildr', 'openspec', 'workspace', 'project', 'service'].includes(value);
  }

  function validateSkillUrlObject(value, label, manifestPath) {
    if (!value.kind || typeof value.kind !== 'string') {
      throw new Error(`${label}.kind must be a string in ${manifestPath}`);
    }
    if (!value.url || typeof value.url !== 'string') {
      throw new Error(`${label}.url must be a string in ${manifestPath}`);
    }
  }

  function validateResolvedSkillSource(value, label, manifestPath) {
    validateSkillUrlObject(value, label, manifestPath);
    if (value.kind !== 'skill-url') {
      throw new Error(`${label}.kind is not supported by this CLI: ${value.kind}`);
    }
    if (value.version !== undefined && typeof value.version !== 'string') {
      throw new Error(`${label}.version must be a string in ${manifestPath}`);
    }
    if (value.integrity !== undefined && typeof value.integrity !== 'string') {
      throw new Error(`${label}.integrity must be a string in ${manifestPath}`);
    }
  }

  function normalizeRelativePathForBuildr(input, message) {
    const normalized = path.normalize(input).replace(/^\.[\\/]/, '');
    if (!normalized || path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
      throw new Error(message);
    }
    return normalized.split(path.sep).join('/');
  }

  function parseSkillSourceRef(sourceRef) {
    if (!sourceRef || typeof sourceRef !== 'string') {
      throw new Error(`Skill source reference must be a string: ${sourceRef || ''}`);
    }
    const match = sourceRef.match(/^package:([A-Za-z0-9._-]+)$/);
    if (!match) {
      throw new Error(`Unsupported Skill source reference: ${sourceRef}. Supported format: package:<source-id>`);
    }
    return { type: 'package', id: match[1] };
  }

  function assertHttpUrl(value, label) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${label} must be a valid URL: ${value}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`${label} must use http or https: ${value}`);
    }
  }

  function resolvePackageSkillSourceRef(sourceRef, options = {}) {
    const parsed = parseSkillSourceRef(sourceRef);
    const manifest = readPackageManifest();
    const source = manifest.skillSources.find((entry) => entry.id === parsed.id);
    if (!source) {
      throw new Error(`Package Skill source not found: ${sourceRef}`);
    }
    if (!source.path || typeof source.path !== 'string') {
      throw new Error(`Package Skill source must include path: ${source.id}`);
    }
    if (!Array.isArray(source.runtimes) || source.runtimes.length === 0) {
      throw new Error(`Package Skill source must declare at least one runtime: ${source.id}`);
    }
    if (options.runtime && !source.runtimes.includes(options.runtime)) {
      throw new Error(`Package Skill source ${sourceRef} does not support runtime: ${options.runtime}`);
    }
    if (path.isAbsolute(source.path) || source.path.startsWith('..')) {
      throw new Error(`Package Skill source path must stay inside product root: ${source.path}`);
    }
    if (source.runtimePath !== undefined) {
      normalizeRelativePathForBuildr(source.runtimePath, `Package Skill source runtimePath must stay relative: ${source.runtimePath}`);
    }
    const sourceDir = path.resolve(productRoot(), source.path);
    const skillFile = path.join(sourceDir, 'SKILL.md');
    if (!existsFile(skillFile)) {
      throw new Error(`Package Skill source SKILL.md does not exist: ${source.path}/SKILL.md`);
    }
    const metadata = parseSkillFrontmatter(skillFile);
    return { ...parsed, entry: source, sourceDir, skillFile, metadata };
  }

  function scopeRootForSkills(targetRoot, scope) {
    if (scope === undefined || scope === null || scope === '.' || scope === 'workspace') return { scope: '.', scopeRoot: targetRoot, deprecatedScope: scope === '.' };
    const normalizedScope = normalizeRelativePathForBuildr(scope, `Unsupported skills scope: ${scope}`);
    if (/^projects\/[^/]+$/.test(normalizedScope)) {
      const error = new Error(`Legacy Project Skill source scope is no longer supported: ${normalizedScope}. Project is a capability/applicability context, not an Agent Skill installation boundary. This Buildr version does not migrate Project Skill sources; review and move the source to workspace skills/ before upgrading.`);
      error.code = 'skills.project_scope_unsupported';
      error.reason = 'project_scope_removed';
      error.nextActions = ['Review the legacy Project Skill source without modifying it.', 'Move the Skill source to workspace skills/ and reference it from projects/<project>/capabilities.yml, or use an older Buildr version before upgrading.'];
      throw error;
    }
    throw new Error(`Unsupported skills scope. Skills source authority is workspace: ${scope}`);
  }

  function skillsManifestPath(scopeRoot) {
    return path.join(scopeRoot, 'skills', 'manifest.yml');
  }

  function readSkillsManifestForWrite(scopeRoot) {
    const manifestPath = skillsManifestPath(scopeRoot);
    if (!existsFile(manifestPath)) return attachManifestDocument(migrateSkillsManifestDocument({ skills: [] }, { manifestPath }));
    const skills = readSkillManifest(manifestPath);
    validateSkillManifestEntries(skills, manifestPath);
    validateSkillsManifestDocument(manifestDocumentFor(skills), manifestPath);
    return skills;
  }

  function writeSkillsManifest(scopeRoot, skills) {
    const manifestPath = skillsManifestPath(scopeRoot);
    const document = manifestDocumentFor(skills);
    document.skills = skills;
    const migrated = migrateSkillsManifestDocument(document, { manifestPath });
    validateSkillsManifestDocument(migrated, manifestPath);
    atomicWriteFile(manifestPath, YAML.stringify(migrated, { lineWidth: 0 }));
    Object.defineProperty(skills, '__buildrManifestDocument', { configurable: true, enumerable: false, writable: true, value: migrated });
    return manifestPath;
  }

  function parseSkillFrontmatter(skillFile) {
    const content = fs.readFileSync(skillFile, 'utf8');
    const lines = content.split(/\r?\n/);
    if (lines[0] !== '---') {
      throw new Error(`SKILL.md must start with YAML frontmatter: ${skillFile}`);
    }
    const endIndex = lines.findIndex((line, index) => index > 0 && line === '---');
    if (endIndex === -1) {
      throw new Error(`SKILL.md frontmatter is not closed: ${skillFile}`);
    }
    const metadata = parseYamlDocument(lines.slice(1, endIndex).join('\n'), `SKILL.md frontmatter: ${skillFile}`);
    if (!metadata.name || typeof metadata.name !== 'string') {
      throw new Error(`SKILL.md frontmatter must declare name: ${skillFile}`);
    }
    assertName(metadata.name, 'Skill name');
    if (metadata.description !== undefined && typeof metadata.description !== 'string') {
      throw new Error(`SKILL.md frontmatter description must be a string: ${skillFile}`);
    }
    return metadata;
  }

  function supportedSkillSourceEntries() {
    return new Set(['SKILL.md', 'agents', 'scripts', 'templates', 'assets', 'examples', 'references']);
  }

  function inspectSkillSource(sourceDir) {
    if (!existsDirectory(sourceDir)) throw new Error(`Skill source directory does not exist: ${sourceDir}`);
    const skillFile = path.join(sourceDir, 'SKILL.md');
    if (!existsFile(skillFile)) throw new Error(`Skill source must contain SKILL.md: ${sourceDir}`);
    const metadata = parseSkillFrontmatter(skillFile);
    const supported = supportedSkillSourceEntries();
    const entries = fs.readdirSync(sourceDir).sort();
    const unknownEntries = entries.filter((entry) => !supported.has(entry));
    return { skillFile, metadata, entries, unknownEntries };
  }

  function samePath(left, right) {
    return sameFilesystemPath(left, right);
  }

  function copySupportedSkillSource(sourceDir, targetDir, entries, options = {}) {
    if (samePath(sourceDir, targetDir)) return;
    if (existsDirectory(targetDir)) {
      if (!options.replace) {
        throw new Error(`Skill target directory already exists: ${targetDir}. Use --replace to replace the whole directory.`);
      }
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    ensureDirectory(targetDir);
    const supported = supportedSkillSourceEntries();
    for (const entry of entries) {
      if (!supported.has(entry)) continue;
      const sourcePath = path.join(sourceDir, entry);
      const targetPath = path.join(targetDir, entry);
      if (existsDirectory(sourcePath)) {
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      } else if (existsFile(sourcePath)) {
        ensureDirectory(path.dirname(targetPath));
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  function printSkillsMutationReceipt(action, targetRoot, id, updatedPaths, skippedEntries, nextAction, assetLabel = 'Skill 源资产') {
    console.log(`已${action} ${assetLabel}：${id}`);
    console.log('已更新 Buildr 源资产：');
    for (const file of updatedPaths) console.log(`  ${toPosixRelative(targetRoot, file)}`);
    if (skippedEntries.length > 0) {
      console.log('未装载的顶层内容：');
      for (const entry of skippedEntries) console.log(`  ${entry}`);
    }
    console.log('下一步：');
    console.log(`  ${nextAction}`);
  }

  function optionValues(args, name) {
    const values = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] !== name) continue;
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
      values.push(value);
    }
    return values;
  }

  function parseCapabilityArgument(value, label, withMode = false) {
    const match = withMode
      ? value.match(/^(.+)@(\d+):(required|optional)$/)
      : value.match(/^(.+)@(\d+)$/);
    if (!match) throw new Error(`${label} must use ${withMode ? '<capability>@<version>:<required|optional>' : '<capability>@<version>'}: ${value}`);
    const result = { capability: match[1], version: Number(match[2]) };
    validateCapabilityIdentity(result.capability, result.version, label);
    if (withMode) result.mode = match[3];
    return result;
  }

  function capabilityDeclarations(args) {
    const provides = optionValues(args, '--provides').map((value) => parseCapabilityArgument(value, '--provides'));
    const requires = optionValues(args, '--requires').map((value) => parseCapabilityArgument(value, '--requires', true));
    for (const [label, entries] of [['--provides', provides], ['--requires', requires]]) {
      const seen = new Set();
      for (const entry of entries) {
        const key = capabilityKey(entry.capability, entry.version);
        if (seen.has(key)) throw new Error(`Duplicate ${label} declaration: ${key}`);
        seen.add(key);
      }
    }
    return { provides, requires };
  }

  function applyCapabilityDeclarations(entry, existing, declarations) {
    if (declarations.provides.length) entry.provides = declarations.provides;
    else if (existing?.provides) entry.provides = existing.provides;
    if (declarations.requires.length) entry.requires = declarations.requires;
    else if (existing?.requires) entry.requires = existing.requires;
    return entry;
  }

  function validateDeclaredCapabilities(targetRoot, scopeRoot, declarations) {
    const layers = visibleSkillManifestDocuments(targetRoot, scopeRoot);
    for (const declaration of [...declarations.provides, ...declarations.requires]) {
      const definitions = layers.flatMap((layer) => (layer.document.contracts || []).filter((contract) => contract.id === declaration.capability && contract.version === declaration.version));
      const identity = capabilityKey(declaration.capability, declaration.version);
      if (definitions.length === 0) throw new Error(`Capability contract is not visible in this scope: ${identity}`);
      if (definitions.length > 1) throw new Error(`Capability contract identity conflict in this scope: ${identity}`);
    }
  }

  function discloseReplacedProviderDeclarations(targetRoot, scope, existing, declarations) {
    if (!existing || declarations.provides.length === 0) return;
    const next = new Set(declarations.provides.map((item) => capabilityKey(item.capability, item.version)));
    for (const previous of existing.provides || []) {
      if (!next.has(capabilityKey(previous.capability, previous.version))) {
        discloseSelectedProviderImpact(targetRoot, scope, existing.id, previous, '替换 provider 声明，影响');
      }
    }
  }

  function skillsAddUnsafe(args) {
    const allowedFlags = new Set([
      '--target',
      '--scope',
      '--source',
      '--remote-source',
      '--source-kind',
      '--resolved-source',
      '--resolved-kind',
      '--version',
      '--integrity',
      '--description',
      '--replace',
      '--ignore-unsupported',
      '--provides',
      '--requires',
    ]);
    assertNoUnknownOptions(args, allowedFlags, new Set(['--replace', '--ignore-unsupported']));
    const [explicitId] = positionalArgs(args);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', null);
    const sourceInput = optionValue(args, '--source', null);
    const remoteSourceInput = optionValue(args, '--remote-source', null);
    const sourceKindInput = optionValue(args, '--source-kind', 'url');
    const resolvedSourceInput = optionValue(args, '--resolved-source', null);
    const resolvedKindInput = optionValue(args, '--resolved-kind', 'skill-url');
    const versionInput = optionValue(args, '--version', null);
    const integrityInput = optionValue(args, '--integrity', null);
    const descriptionInput = optionValue(args, '--description', null);
    const declarations = capabilityDeclarations(args);
    if (sourceInput && (remoteSourceInput || resolvedSourceInput)) {
      throw new Error('--source cannot be combined with --remote-source or --resolved-source.');
    }
    if (!sourceInput && !remoteSourceInput && !resolvedSourceInput) {
      throw new Error('Specify one of --source, --remote-source, or --resolved-source.');
    }
    assertInitializedBuildrWorkspace(targetRoot);

    const { scope, scopeRoot, deprecatedScope } = scopeRootForSkills(targetRoot, scopeInput);
    if (deprecatedScope) console.error('Warning: --scope . is deprecated for skills add; workspace is now the only source authority. Omit --scope.');
    const manifest = readSkillsManifestForWrite(scopeRoot);
    const replace = hasFlag(args, '--replace');
    const ignoreUnsupported = hasFlag(args, '--ignore-unsupported');
    validateDeclaredCapabilities(targetRoot, scopeRoot, declarations);

    if (remoteSourceInput || resolvedSourceInput) {
      if (!explicitId) throw new Error('Missing skill id for remote Skill registration.');
      assertName(explicitId, 'Skill id');
      if (ignoreUnsupported) throw new Error('--ignore-unsupported can only be used with --source.');
      if (resolvedSourceInput && resolvedKindInput !== 'skill-url') {
        throw new Error(`Unsupported resolved kind: ${resolvedKindInput}. Supported kind: skill-url`);
      }
      if (remoteSourceInput) assertHttpUrl(remoteSourceInput, '--remote-source');
      if (resolvedSourceInput) assertHttpUrl(resolvedSourceInput, '--resolved-source');
      const existingIndex = manifest.findIndex((skill) => skill.id === explicitId);
      if (existingIndex !== -1 && !replace) {
        throw new Error(`Skill already exists in skills/manifest.yml: ${explicitId}. Use --replace to replace the whole entry.`);
      }
      const existing = existingIndex === -1 ? null : manifest[existingIndex];
      discloseReplacedProviderDeclarations(targetRoot, scope, existing, declarations);
      const manifestEntry = { id: explicitId };
      if (remoteSourceInput) {
        manifestEntry.source = { kind: sourceKindInput, url: remoteSourceInput };
      }
      if (resolvedSourceInput) {
        manifestEntry.resolved = { kind: resolvedKindInput, url: resolvedSourceInput };
        if (versionInput) manifestEntry.resolved.version = versionInput;
        if (integrityInput) manifestEntry.resolved.integrity = integrityInput;
        manifestEntry.install = { mode: 'buildr' };
      } else {
        manifestEntry.install = { mode: 'agent' };
      }
      if (descriptionInput) manifestEntry.description = descriptionInput;
      applyCapabilityDeclarations(manifestEntry, existing, declarations);
      if (existingIndex === -1) {
        manifest.push(manifestEntry);
      } else {
        manifest[existingIndex] = manifestEntry;
      }
      const manifestPath = writeSkillsManifest(scopeRoot, manifest);
      printSkillsMutationReceipt(
        existingIndex === -1 ? '添加' : '替换',
        targetRoot,
        explicitId,
        [manifestPath],
        [],
        '如果当前 Agent 需要 Skills runtime 渲染，按当前 Agent runtime 能力执行 Skills render、runtime check 或 doctor。',
        resolvedSourceInput ? 'Skill 已解析远端资产' : 'Skill 远端信息源'
      );
      return;
    }

    if (sourceKindInput !== 'url' || resolvedKindInput !== 'skill-url' || versionInput || integrityInput || descriptionInput) {
      throw new Error('--source-kind, --resolved-kind, --version, --integrity, and --description for remote registration cannot be used with --source.');
    }
    const sourceDir = path.resolve(sourceInput);
    const source = inspectSkillSource(sourceDir);
    const skillId = source.metadata.name;
    if (explicitId && explicitId !== skillId) {
      throw new Error(`Explicit skill id does not match SKILL.md frontmatter name: ${explicitId} != ${skillId}`);
    }
    if (source.unknownEntries.length > 0 && !ignoreUnsupported) {
      throw new Error(`Skill source contains unsupported top-level entries: ${source.unknownEntries.join(', ')}. Use --ignore-unsupported to skip them.`);
    }

    const skillsRoot = path.join(scopeRoot, 'skills');
    const targetDir = path.join(skillsRoot, skillId);
    const existingIndex = manifest.findIndex((skill) => skill.id === skillId);
    if (existingIndex !== -1 && !replace) {
      throw new Error(`Skill already exists in skills/manifest.yml: ${skillId}. Use --replace to replace the whole entry.`);
    }

    const existing = existingIndex === -1 ? null : manifest[existingIndex];
    discloseReplacedProviderDeclarations(targetRoot, scope, existing, declarations);
    copySupportedSkillSource(sourceDir, targetDir, source.entries, { replace });
    const manifestEntry = { id: skillId, path: skillId };
    if (source.metadata.description) manifestEntry.description = source.metadata.description;
    applyCapabilityDeclarations(manifestEntry, existing, declarations);
    if (existingIndex === -1) {
      manifest.push(manifestEntry);
    } else {
      manifest[existingIndex] = manifestEntry;
    }
    const manifestPath = writeSkillsManifest(scopeRoot, manifest);
    const updatedPaths = samePath(sourceDir, targetDir) ? [manifestPath] : [manifestPath, targetDir];
    printSkillsMutationReceipt(
      existingIndex === -1 ? '添加' : '替换',
      targetRoot,
      skillId,
      updatedPaths,
      ignoreUnsupported ? source.unknownEntries : [],
      '如果当前 Agent 需要 Skills runtime 渲染，按当前 Agent runtime 能力执行 Skills render、runtime check 或 doctor。'
    );
  }

  function skillsAdd(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', null);
    const { scopeRoot } = scopeRootForSkills(targetRoot, scopeInput);
    const result = withWorkspaceMutation(targetRoot, 'skills.add', [path.join(scopeRoot, 'skills')], () => skillsAddUnsafe(args));
    runMutationDoctor(targetRoot, scopeInput, { skipRuntime: Boolean(optionValue(args, '--resolved-source', null)) });
    return result;
  }

  function discloseSelectedProviderImpact(targetRoot, scope, providerId, capability = null, action = '移除') {
    const impacts = selectedProviderImpacts(targetRoot, providerId, { scope, capability });
    if (impacts.length === 0) return;
    console.log(`Capability dependency impact（写入前）：${action} selected provider ${providerId}`);
    for (const impact of impacts) {
      const next = impact.mode === 'required' ? 'blocked' : 'degraded';
      console.log(`  [${impact.mode}] ${impact.scope}:${impact.consumer} -> ${impact.capability}@${impact.version}; 写入后可能 ${next}`);
    }
  }

  function safeSkillSourceDir(scopeRoot, skillPath) {
    const normalized = normalizeRelativePathForBuildr(skillPath, `Skill path must stay inside skills root: ${skillPath}`);
    const skillsRoot = path.join(scopeRoot, 'skills');
    const sourceDir = path.resolve(skillsRoot, normalized);
    const relative = path.relative(skillsRoot, sourceDir);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Refusing to delete unsafe Skill path: ${skillPath}`);
    }
    return assertSafeAssetTarget(scopeRoot, sourceDir, skillsRoot, 'Skill delete target');
  }

  function skillsRemoveUnsafe(args) {
    const allowedFlags = new Set(['--target', '--scope']);
    assertNoUnknownOptions(args, allowedFlags);
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing skill id');
    assertName(id, 'Skill id');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', null);
    assertInitializedBuildrWorkspace(targetRoot);

    const { scope, scopeRoot, deprecatedScope } = scopeRootForSkills(targetRoot, scopeInput);
    if (deprecatedScope) console.error('Warning: --scope . is deprecated for skills remove; workspace is now the only source authority. Omit --scope.');
    const manifest = readSkillsManifestForWrite(scopeRoot);
    const existingIndex = manifest.findIndex((skill) => skill.id === id);
    if (existingIndex === -1) {
      throw new Error(`Skill not found in skills/manifest.yml: ${id}`);
    }
    const removed = manifest[existingIndex];
    if ((removed.provides || []).length > 0) discloseSelectedProviderImpact(targetRoot, scope, id);
    if (scopeRoot === targetRoot && removed.path) {
      const owner = componentOwnerForMember(targetRoot, `skills/${removed.path}`);
      if (owner) throw new Error(`Skill is managed by Component ${owner}: skills/${removed.path}. Use buildr component lifecycle commands.`);
    }
    manifest.splice(existingIndex, 1);
    const updatedPaths = [];
    let assetLabel = 'Skill 源资产';
    if (removed.path) {
      const sharedReference = manifest.find((skill) => skill.path === removed.path);
      if (sharedReference) {
        throw new Error(`Refusing to remove Skill source shared by another manifest entry: ${removed.path}`);
      }
      const sourceDir = safeSkillSourceDir(scopeRoot, removed.path);
      const manifestPath = writeSkillsManifest(scopeRoot, manifest);
      updatedPaths.push(manifestPath);
      if (existsDirectory(sourceDir)) fs.rmSync(sourceDir, { recursive: true, force: true });
      updatedPaths.push(sourceDir);
    } else {
      const manifestPath = writeSkillsManifest(scopeRoot, manifest);
      updatedPaths.push(manifestPath);
      assetLabel = 'Skill 远端资产';
    }
    printSkillsMutationReceipt(
      '删除',
      targetRoot,
      id,
      updatedPaths,
      [],
      '如果当前 Agent runtime 已渲染该 Skill，按当前 Agent runtime 能力执行 Skills render、runtime check 或 doctor。',
      assetLabel
    );
  }

  function skillsRemove(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', null);
    const { scopeRoot } = scopeRootForSkills(targetRoot, scopeInput);
    const result = withWorkspaceMutation(targetRoot, 'skills.remove', [path.join(scopeRoot, 'skills')], () => skillsRemoveUnsafe(args));
    runMutationDoctor(targetRoot, scopeInput);
    return result;
  }

  function visibleSkillManifestDocuments(targetRoot, scopeRoot) {
    const roots = [targetRoot];
    return roots.map((root) => {
      const file = skillsManifestPath(root);
      return existsFile(file) ? { root, file, document: readSkillManifestDocument(file) } : { root, file, document: migrateSkillsManifestDocument({ skills: [] }, { manifestPath: file }) };
    });
  }

  function capabilityContextForScope(targetRoot, scopeInput) {
    if (!scopeInput || scopeInput === '.' || scopeInput === 'workspace') return { scope: '.', scopeRoot: targetRoot, file: skillsManifestPath(targetRoot), kind: 'workspace' };
    const scope = normalizeRelativePathForBuildr(scopeInput, `Unsupported capability context: ${scopeInput}`);
    if (!/^projects\/[^/]+$/.test(scope)) throw new Error(`Unsupported capability context: ${scopeInput}`);
    const scopeRoot = path.join(targetRoot, scope);
    if (!existsDirectory(scopeRoot)) throw new Error(`Project context does not exist: ${scope}`);
    return { scope, scopeRoot, file: path.join(scopeRoot, 'capabilities.yml'), kind: 'project' };
  }

  function skillsBindUnsafe(args, remove = false) {
    const allowedFlags = remove ? new Set(['--target', '--scope']) : new Set(['--target', '--scope', '--provider']);
    assertNoUnknownOptions(args, allowedFlags);
    const [rawCapability] = positionalArgs(args);
    if (!rawCapability) throw new Error('Missing capability identity.');
    const requested = parseCapabilityArgument(rawCapability, 'capability');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', null);
    assertInitializedBuildrWorkspace(targetRoot);
    const { scope, scopeRoot, file: contextFile, kind } = capabilityContextForScope(targetRoot, scopeInput);
    const provider = remove ? null : optionValue(args, '--provider', null);
    if (!remove && !provider) throw new Error('Missing required option: --provider');
    if (provider) assertName(provider, 'Provider Skill id');

    const layers = visibleSkillManifestDocuments(targetRoot, scopeRoot);
    const definitions = layers.flatMap((layer) => (layer.document.contracts || []).filter((contract) => contract.id === requested.capability && contract.version === requested.version));
    if (definitions.length !== 1) {
      throw new Error(definitions.length === 0
        ? `Capability contract is not visible in scope ${scope}: ${rawCapability}`
        : `Capability contract identity conflict in scope ${scope}: ${rawCapability}`);
    }
    if (!remove) {
      const candidates = layers.flatMap((layer) => (layer.document.skills || []).filter((skill) => skill.id === provider && skill.enabled !== false && skill.state !== 'uninstalled' && (skill.provides || []).some((item) => item.capability === requested.capability && item.version === requested.version)));
      if (candidates.length === 0) throw new Error(`Provider is not visible or does not provide ${rawCapability}: ${provider}`);
    }

    const localFile = skillsManifestPath(targetRoot);
    const skills = existsFile(localFile) ? readSkillManifest(localFile) : attachManifestDocument(migrateSkillsManifestDocument({ skills: [] }, { manifestPath: localFile }));
    const document = kind === 'workspace'
      ? manifestDocumentFor(skills)
      : (existsFile(contextFile) ? validateProjectCapabilitiesDocument(parseYamlDocument(fs.readFileSync(contextFile, 'utf8'), contextFile), contextFile) : { schemaVersion: PROJECT_CAPABILITIES_SCHEMA, requires: [], bindings: [], skills: [] });
    const bindings = [...(document.bindings || [])];
    const index = bindings.findIndex((binding) => binding.capability === requested.capability && binding.version === requested.version);
    const previousProvider = index === -1 ? null : bindings[index].provider;
    if (previousProvider && (remove || previousProvider !== provider)) {
      discloseSelectedProviderImpact(targetRoot, scope, previousProvider, requested, remove ? '取消 binding，影响' : `改绑到 ${provider}，影响`);
    }
    if (remove) {
      if (index === -1) throw new Error(`Capability binding not found in scope ${scope}: ${rawCapability}`);
      bindings.splice(index, 1);
    } else {
      const binding = { capability: requested.capability, version: requested.version, provider };
      if (index === -1) bindings.push(binding);
      else bindings[index] = binding;
    }
    if (bindings.length) document.bindings = bindings;
    else delete document.bindings;
    if (kind === 'workspace') {
      document.skills = skills;
      writeSkillsManifest(targetRoot, skills);
    } else {
      validateProjectCapabilitiesDocument(document, contextFile);
      atomicWriteFile(contextFile, YAML.stringify(document, { lineWidth: 0 }));
    }
    console.log(`${remove ? '已删除' : '已写入'} capability binding：${rawCapability}${remove ? '' : ` -> ${provider}`} (${scope})`);
    return { targetRoot, scope };
  }

  function skillsBind(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', '.');
    const context = capabilityContextForScope(targetRoot, scopeInput);
    const result = withWorkspaceMutation(targetRoot, 'skills.bind', [context.file], () => skillsBindUnsafe(args, false));
    runMutationDoctor(result.targetRoot, result.scope);
    return result;
  }

  function skillsUnbind(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const scopeInput = optionValue(args, '--scope', '.');
    const context = capabilityContextForScope(targetRoot, scopeInput);
    const result = withWorkspaceMutation(targetRoot, 'skills.unbind', [context.file], () => skillsBindUnsafe(args, true));
    runMutationDoctor(result.targetRoot, result.scope);
    return result;
  }

  Object.assign(runtime, { manifestDocumentFor, attachManifestDocument, readSkillManifestDocument, readSkillManifest, readSkillManifestSchemaVersion, renderYamlObject, renderSkillsManifestYaml, validateSkillManifestEntries, isManifestSourceLabel, validateSkillUrlObject, validateResolvedSkillSource, normalizeRelativePathForBuildr, parseSkillSourceRef, assertHttpUrl, resolvePackageSkillSourceRef, scopeRootForSkills, capabilityContextForScope, skillsManifestPath, readSkillsManifestForWrite, writeSkillsManifest, parseSkillFrontmatter, supportedSkillSourceEntries, inspectSkillSource, samePath, copySupportedSkillSource, printSkillsMutationReceipt, skillsAddUnsafe, skillsAdd, safeSkillSourceDir, skillsRemoveUnsafe, skillsRemove, skillsBindUnsafe, skillsBind, skillsUnbind });
  return runtime;
}
