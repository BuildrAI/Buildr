import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_BOOTSTRAP_CONTRACT } from '../../infrastructure/product-layout.mjs';
import { SUPPORTED_AGENT_IDS } from '../../infrastructure/runtime/adapter-contract.mjs';
import { createProject as createProjectEntity } from '../../domain/project/project.mjs';
import { createService as createServiceEntity } from '../../domain/service/service.mjs';

export function registerDomainsPackageAssets(runtime) {
  const readGitRemote = (...args) => runtime.readGitRemote(...args);
  const isPlainObject = (...args) => runtime.isPlainObject(...args);
  const readSkillManifest = (...args) => runtime.readSkillManifest(...args);
  const readSkillManifestSchemaVersion = (...args) => runtime.readSkillManifestSchemaVersion(...args);
  const renderSkillsManifestYaml = (...args) => runtime.renderSkillsManifestYaml(...args);
  const skillsManifestPath = (...args) => runtime.skillsManifestPath(...args);
  const parseYamlValue = (...args) => runtime.parseYamlValue(...args);
  const parseServicesYaml = (...args) => runtime.parseServicesYaml(...args);
  const parseServicesManifestYaml = (...args) => runtime.parseServicesManifestYaml(...args);
  const parseProjectsYaml = (...args) => runtime.parseProjectsYaml(...args);
  const renderProjectsYaml = (...args) => runtime.renderProjectsYaml(...args);
  const renderServicesManifestYaml = (...args) => runtime.renderServicesManifestYaml(...args);
  const writeProjectsRegistry = (...args) => runtime.writeProjectsRegistry(...args);
  const projectsManifestPath = (...args) => runtime.projectsManifestPath(...args);
  const servicesManifestPath = (...args) => runtime.servicesManifestPath(...args);
  const writeServicesManifest = (...args) => runtime.writeServicesManifest(...args);
  const gitDefaultBranch = (...args) => runtime.gitDefaultBranch(...args);
  const defaultAssetDescription = (...args) => runtime.defaultAssetDescription(...args);
  const inferRepoKind = (...args) => runtime.inferRepoKind(...args);
  const gitBoundaryFor = (...args) => runtime.gitBoundaryFor(...args);
  const ensureGitBoundaries = (...args) => runtime.ensureGitBoundaries(...args);
  const ensureDirectory = (...args) => runtime.ensureDirectory(...args);
  const atomicWriteFile = (...args) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args) => runtime.parseYamlDocument(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const packageRoot = (...args) => runtime.packageRoot(...args);
  const packageBootstrapContractPath = (...args) => runtime.packageBootstrapContractPath(...args);
  const writeMappedFileIfMissing = (...args) => runtime.writeMappedFileIfMissing(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const writeFileIfChanged = (...args) => runtime.writeFileIfChanged(...args);

  function readPackageManifest() {
    const manifestPath = path.join(packageRoot(), 'manifest.yml');
    if (!existsFile(manifestPath)) {
      throw new Error(`Package manifest not found: ${manifestPath}`);
    }

    {
      const parsed = parseYamlDocument(fs.readFileSync(manifestPath, 'utf8'), 'package/manifest.yml');
      return {
        include: [],
        agentSkills: [],
        skillSources: [],
        builtins: { rules: [], skills: [], commands: [] },
        components: [],
        workspaceDirectories: [],
        workspaceFiles: [],
        projectDirectories: [],
        projectFiles: [],
        templateVariables: [],
        forbiddenPatterns: [],
        ...parsed,
        builtins: {
          rules: parsed.builtins?.rules || [],
          skills: parsed.builtins?.skills || [],
          commands: parsed.builtins?.commands || [],
        },
      };
    }

    const manifest = {
      include: [],
      agentSkills: [],
      skillSources: [],
      builtins: { rules: [], skills: [], commands: [] },
      components: [],
      workspaceDirectories: [],
      workspaceFiles: [],
      projectDirectories: [],
      projectFiles: [],
      templateVariables: [],
      forbiddenPatterns: [],
    };
    let currentList = null;
    let currentPackageSkill = null;
    let currentPackageSkillList = null;
    let inPackageSkillRuntimes = false;

    function finishPackageSkill() {
      if (!currentPackageSkill) return;
      manifest[currentPackageSkillList].push(currentPackageSkill);
      currentPackageSkill = null;
      currentPackageSkillList = null;
      inPackageSkillRuntimes = false;
    }

    for (const rawLine of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line.trim() || line.trim().startsWith('#')) continue;

      const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/);
      if (keyMatch) {
        finishPackageSkill();
        currentList = keyMatch[1] !== 'components' && Object.hasOwn(manifest, keyMatch[1]) && Array.isArray(manifest[keyMatch[1]]) ? keyMatch[1] : null;
        continue;
      }

      if (currentList === 'agentSkills' || currentList === 'skillSources') {
        const idMatch = line.trim().match(/^-\s+id:\s*(.+)$/);
        if (idMatch) {
          finishPackageSkill();
          currentPackageSkill = { id: parseYamlValue(idMatch[1].trim()), runtimes: [] };
          currentPackageSkillList = currentList;
          continue;
        }
        if (!currentPackageSkill) {
          throw new Error(`Invalid ${currentList} entry in package manifest: ${rawLine}`);
        }
        const pathMatch = line.trim().match(/^path:\s*(.+)$/);
        if (pathMatch) {
          currentPackageSkill.path = parseYamlValue(pathMatch[1].trim());
          inPackageSkillRuntimes = false;
          continue;
        }
        const runtimePathMatch = line.trim().match(/^runtimePath:\s*(.+)$/);
        if (runtimePathMatch && currentList === 'skillSources') {
          currentPackageSkill.runtimePath = parseYamlValue(runtimePathMatch[1].trim());
          inPackageSkillRuntimes = false;
          continue;
        }
        if (line.trim() === 'runtimes:') {
          inPackageSkillRuntimes = true;
          continue;
        }
        const runtimeMatch = line.trim().match(/^-\s+(.+)$/);
        if (runtimeMatch && inPackageSkillRuntimes) {
          currentPackageSkill.runtimes.push(parseYamlValue(runtimeMatch[1].trim()));
          continue;
        }
        throw new Error(`Unsupported ${currentList} syntax in package manifest: ${rawLine}`);
      }

      const itemMatch = line.match(/^\s*-\s+(.+)$/);
      if (itemMatch && currentList) {
        manifest[currentList].push(parseYamlValue(itemMatch[1].trim()));
      }
    }
    finishPackageSkill();
    manifest.builtins = readPackageBuiltinsManifest(manifestPath);
    manifest.components = readPackageComponentsManifest(manifestPath);
    return manifest;
  }

  function readPackageComponentsManifest(manifestPath) {
    const components = [];
    let inComponents = false;
    let current = null;
    function finish() {
      if (current) components.push(current);
      current = null;
    }
    for (const rawLine of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (/^[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(line)) {
        finish();
        inComponents = line === 'components:';
        continue;
      }
      if (!inComponents) continue;
      const idMatch = line.match(/^  - id:\s*(.+)$/);
      if (idMatch) {
        finish();
        current = { id: parseYamlValue(idMatch[1].trim()) };
        continue;
      }
      const fieldMatch = line.match(/^    ([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
      if (fieldMatch && current) {
        current[fieldMatch[1]] = parseYamlValue(fieldMatch[2].trim());
        continue;
      }
    }
    finish();
    return components;
  }

  function readPackageBuiltinsManifest(manifestPath) {
    const builtins = { rules: [], skills: [], commands: [] };
    let inBuiltins = false;
    let currentKind = null;
    let currentEntry = null;
    let currentObject = null;

    function finishEntry() {
      if (!currentEntry || !currentKind) return;
      builtins[currentKind].push(currentEntry);
      currentEntry = null;
      currentObject = null;
    }

    for (const rawLine of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (/^[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(line)) {
        finishEntry();
        inBuiltins = trimmed === 'builtins:';
        currentKind = null;
        continue;
      }
      if (!inBuiltins) continue;

      const kindMatch = line.match(/^  (rules|skills|commands):\s*(?:\[\s*\])?$/);
      if (kindMatch) {
        finishEntry();
        currentKind = kindMatch[1];
        continue;
      }

      const idMatch = line.match(/^    - id:\s*(.+)$/);
      if (idMatch && currentKind) {
        finishEntry();
        currentEntry = { id: parseYamlValue(idMatch[1].trim()) };
        continue;
      }

      const objectStartMatch = line.match(/^      ([A-Za-z][A-Za-z0-9_-]*):\s*$/);
      if (objectStartMatch && currentEntry) {
        currentObject = objectStartMatch[1];
        currentEntry[currentObject] = {};
        continue;
      }

      const nestedMatch = line.match(/^        ([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
      if (nestedMatch && currentEntry && currentObject) {
        currentEntry[currentObject][nestedMatch[1]] = parseYamlValue(nestedMatch[2].trim());
        continue;
      }

      const fieldMatch = line.match(/^      ([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
      if (fieldMatch && currentEntry) {
        currentObject = null;
        currentEntry[fieldMatch[1]] = parseYamlValue(fieldMatch[2].trim());
        continue;
      }
    }
    finishEntry();

    return builtins;
  }

  function parseManifestFileEntry(entry, section) {
    const match = entry.match(/^(.+?)\s*=>\s*(.+?)(?:\s+(copy|render))?$/);
    if (!match) {
      throw new Error(`Invalid ${section} entry: ${entry}`);
    }
    return {
      source: match[1].trim(),
      target: match[2].trim(),
      mode: match[3] ?? 'copy',
      raw: entry,
    };
  }

  function collectFiles(entryPath) {
    if (existsFile(entryPath)) return [entryPath];
    if (!existsDirectory(entryPath)) return [];
    const files = [];
    for (const entry of fs.readdirSync(entryPath).sort()) {
      // Agent runtime projection may materialize ignored dirs inside package workspace targets;
      // they are not package deliverables and must not require manifest mapping.
      if (['.cursor', '.agents', '.claude', '.trae', '.qoder', '.codebuddy', 'node_modules'].includes(entry)) continue;
      files.push(...collectFiles(path.join(entryPath, entry)));
    }
    return files;
  }

  function readSimpleYaml(file, listKeys, scalarKeys = []) {
    const result = {
      ...Object.fromEntries(listKeys.map((key) => [key, []])),
      ...Object.fromEntries(scalarKeys.map((key) => [key, null])),
    };
    const allowedKeys = new Set([...listKeys, ...scalarKeys]);
    let currentKey = null;
    for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const scalarMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s+(.+)$/);
      if (scalarMatch && allowedKeys.has(scalarMatch[1])) {
        currentKey = null;
        result[scalarMatch[1]] = parseYamlValue(scalarMatch[2].trim());
        continue;
      }

      const keyMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/);
      if (keyMatch) {
        currentKey = listKeys.includes(keyMatch[1]) ? keyMatch[1] : null;
        continue;
      }

      const itemMatch = trimmed.match(/^-\s+(.+)$/);
      if (itemMatch && currentKey) {
        result[currentKey].push(parseYamlValue(itemMatch[1].trim()));
      }
    }
    return result;
  }

  function validateBootstrapContract(root, files, problems) {
    const contractPath = packageBootstrapContractPath();
    if (!existsFile(contractPath)) {
      problems.push(`Bootstrap contract is missing: ${PACKAGE_BOOTSTRAP_CONTRACT}`);
      return;
    }
    files.push(contractPath);

    const contract = readSimpleYaml(
      contractPath,
      [
        'bootstrapGuideRequiredText',
        'bootstrapGuideForbiddenText',
        'buildrSkillRequiredSections',
        'buildrSkillRequiredText',
        'buildrSkillForbiddenText',
        'globalForbiddenText',
        'generatedSkillRequiredText',
        'generatedSkillForbiddenText',
      ],
      ['bootstrapGuidePath', 'bootstrapGuideMaxLines', 'buildrSkillPath', 'buildrSkillMaxLines'],
    );

    function readArtifact(artifact, label) {
      if (!artifact) {
        problems.push(`Bootstrap contract must declare ${label}.`);
        return null;
      }
      if (path.isAbsolute(artifact) || artifact.startsWith('..')) {
        problems.push(`Bootstrap contract artifact must stay inside product root: ${artifact}`);
        return null;
      }

      const artifactPath = path.resolve(root, artifact);
      if (!existsFile(artifactPath)) {
        problems.push(`Bootstrap contract artifact does not exist: ${artifact}`);
        return null;
      }
      files.push(artifactPath);
      return fs.readFileSync(artifactPath, 'utf8');
    }

    function validateRequiredText(content, artifact, requiredText) {
      if (!content) return;
      for (const required of requiredText) {
        if (!content.includes(required)) {
          problems.push(`Bootstrap contract required text ${JSON.stringify(required)} missing from ${artifact}`);
        }
      }
    }

    function validateForbiddenText(content, artifact, forbiddenText) {
      if (!content) return;
      for (const forbidden of forbiddenText) {
        if (forbidden && content.includes(forbidden)) {
          problems.push(`Bootstrap contract forbidden text ${JSON.stringify(forbidden)} found in ${artifact}`);
        }
      }
    }

    function validateMaxLines(content, artifact, maxLines) {
      if (!content || !maxLines) return;
      const lineCount = content.split(/\r?\n/).length;
      if (lineCount > Number(maxLines)) {
        problems.push(`Bootstrap contract max lines exceeded in ${artifact}: ${lineCount} > ${maxLines}`);
      }
    }

    function validateSections(content, artifact, sections) {
      if (!content) return;
      for (const section of sections) {
        if (!content.includes(`## ${section}`)) {
          problems.push(`Bootstrap contract required section ${JSON.stringify(section)} missing from ${artifact}`);
        }
      }
    }

    const guideContent = readArtifact(contract.bootstrapGuidePath, 'bootstrapGuidePath');
    const skillContent = readArtifact(contract.buildrSkillPath, 'buildrSkillPath');

    validateMaxLines(guideContent, contract.bootstrapGuidePath, contract.bootstrapGuideMaxLines);
    validateRequiredText(guideContent, contract.bootstrapGuidePath, contract.bootstrapGuideRequiredText);
    validateForbiddenText(guideContent, contract.bootstrapGuidePath, [
      ...contract.globalForbiddenText,
      ...contract.bootstrapGuideForbiddenText,
    ]);

    validateMaxLines(skillContent, contract.buildrSkillPath, contract.buildrSkillMaxLines);
    validateSections(skillContent, contract.buildrSkillPath, contract.buildrSkillRequiredSections);
    validateRequiredText(skillContent, contract.buildrSkillPath, contract.buildrSkillRequiredText);
    validateForbiddenText(skillContent, contract.buildrSkillPath, [
      ...contract.globalForbiddenText,
      ...contract.buildrSkillForbiddenText,
    ]);

    return contract;
  }

  function builtinRuleEntry(builtin) {
    return {
      id: builtin.id,
      source: 'buildr',
      path: builtin.target,
      description: builtin.description,
      enabled: true,
      required: builtin.required === true,
      state: 'installed',
    };
  }

  function builtinSkillEntry(builtin) {
    return {
      id: builtin.id,
      assetIdentity: `buildr:skill:${builtin.id}`,
      sourceIdentity: `package:${builtin.target}`,
      source: builtin.target.startsWith('skills/openspec/') ? 'openspec' : 'buildr',
      path: builtin.target.replace(/^skills\//, ''),
      description: builtin.description,
      enabled: true,
      required: builtin.required === true,
      state: 'installed',
      runtimes: builtin.runtimes || [...SUPPORTED_AGENT_IDS],
      runtimePath: builtin.id,
      ...(builtin.provides ? { provides: builtin.provides } : {}),
      ...(builtin.requires ? { requires: builtin.requires } : {}),
    };
  }

  function builtinCommandEntry(builtin) {
    return {
      id: builtin.id,
      source: 'buildr',
      enabled: true,
      required: builtin.required === true,
      state: 'installed',
      ...(builtin.manifestEntry || {}),
    };
  }

  function sourcePathFromBuiltin(builtin) {
    return path.resolve(productRoot(), builtin.path);
  }

  function targetPathFromBuiltin(targetRoot, builtin) {
    return path.join(targetRoot, builtin.target);
  }

  function fileDiffStatus(sourceFile, targetFile) {
    if (!existsFile(targetFile)) return 'missing';
    return fs.readFileSync(sourceFile, 'utf8') === fs.readFileSync(targetFile, 'utf8') ? 'installed' : 'modified';
  }

  function directoryDiffStatus(sourceDir, targetDir) {
    if (!existsDirectory(targetDir)) return 'missing';
    for (const sourceFile of collectFiles(sourceDir)) {
      const relative = path.relative(sourceDir, sourceFile);
      const targetFile = path.join(targetDir, relative);
      if (!existsFile(targetFile) || fs.readFileSync(sourceFile, 'utf8') !== fs.readFileSync(targetFile, 'utf8')) {
        return 'modified';
      }
    }
    return 'installed';
  }

  function isValidAssetId(value) {
    return typeof value === 'string' && value !== '.' && value !== '..' && !/[\x00-\x1f\x7f]/.test(value) && /^[A-Za-z0-9._-]+$/.test(value);
  }

  function listManagedDirectories(parent) {
    if (!existsDirectory(parent)) return [];
    return fs.readdirSync(parent)
      .filter((entry) => isValidAssetId(entry) && existsDirectory(path.join(parent, entry)))
      .sort();
  }

  function normalizeProjectEntry(projectName, entry = {}, projectRoot = null) {
    const rawRepo = isPlainObject(entry.repo) ? entry.repo : {};
    const kind = rawRepo.kind === 'git' || rawRepo.kind === 'local'
      ? (rawRepo.url || (projectRoot && inferRepoKind(projectRoot) === 'git') ? 'git' : 'workspace')
      : ['workspace', 'git'].includes(rawRepo.kind) ? rawRepo.kind : projectRoot ? inferRepoKind(projectRoot) : 'workspace';
    const repo = { kind };
    if (kind === 'git') {
      if (rawRepo.url) repo.url = rawRepo.url;
      if (rawRepo.remote) repo.remote = rawRepo.remote;
      if (rawRepo.defaultBranch) repo.defaultBranch = rawRepo.defaultBranch;
      if (!repo.remote && projectRoot && existsDirectory(path.join(projectRoot, '.git'))) repo.remote = 'origin';
      if (!repo.defaultBranch && projectRoot && existsDirectory(path.join(projectRoot, '.git'))) repo.defaultBranch = gitDefaultBranch(projectRoot);
    }
    return {
      title: typeof entry.title === 'string' && entry.title ? entry.title : projectName,
      description: typeof entry.description === 'string' && entry.description ? entry.description : defaultAssetDescription('Project', projectName),
      path: `projects/${projectName}`,
      repo,
    };
  }

  function normalizeServiceEntry(serviceName, entry = {}, serviceRoot = null) {
    const rawRepo = isPlainObject(entry.repo) ? entry.repo : {};
    const kind = rawRepo.kind === 'git' || rawRepo.kind === 'local'
      ? (rawRepo.url || (serviceRoot && inferRepoKind(serviceRoot) === 'git') ? 'git' : 'workspace')
      : ['workspace', 'git'].includes(rawRepo.kind) ? rawRepo.kind : serviceRoot ? inferRepoKind(serviceRoot) : 'workspace';
    const repo = { kind };
    if (kind === 'git') {
      if (rawRepo.url) repo.url = rawRepo.url;
      if (rawRepo.remote) repo.remote = rawRepo.remote;
      if (rawRepo.defaultBranch) repo.defaultBranch = rawRepo.defaultBranch;
      if (rawRepo.branch) repo.branch = rawRepo.branch;
      if (!repo.remote && serviceRoot && existsDirectory(path.join(serviceRoot, '.git'))) repo.remote = 'origin';
      if (!repo.defaultBranch && serviceRoot && existsDirectory(path.join(serviceRoot, '.git'))) repo.defaultBranch = gitDefaultBranch(serviceRoot);
      if (!repo.url && serviceRoot && existsDirectory(path.join(serviceRoot, '.git'))) {
        const url = readGitRemote(serviceRoot, repo.remote || 'origin');
        if (url) repo.url = url;
      }
    }
    return {
      title: typeof entry.title === 'string' && entry.title ? entry.title : serviceName,
      description: typeof entry.description === 'string' && entry.description ? entry.description : defaultAssetDescription('Service', serviceName),
      type: typeof entry.type === 'string' && entry.type ? entry.type : 'service',
      path: `services/${serviceName}`,
      repo,
    };
  }

  function repairProjectBaseline(targetRoot, projectName, projectEntity, changed) {
    const manifest = readPackageManifest();
    const projectRoot = path.join(targetRoot, 'projects', projectName);
    ensureDirectory(projectRoot);
    for (const relativeDir of manifest.projectDirectories) ensureDirectory(path.join(projectRoot, relativeDir));
    const variables = { project: projectName };
    for (const rawEntry of manifest.projectFiles) {
      const entry = parseManifestFileEntry(rawEntry, 'projectFiles');
      if (entry.target === 'services/manifest.yml') continue;
      if (entry.target === 'services/manifest.yml' && existsFile(path.join(projectRoot, 'services.yml'))) {
        continue;
      }
      const before = changed.length;
      writeMappedFileIfMissing(targetRoot, projectRoot, entry, variables, changed);
      if (changed.length > before) changed[changed.length - 1] = `projects/${projectName}/${entry.target}`;
    }
    // Unsupported projects/<project>/skills is preserved verbatim. Current
    // repair/sync never creates, rewrites, merges, migrates, or deletes it.
    const servicesFile = servicesManifestPath(projectRoot);
    if (!existsFile(servicesFile) && !existsFile(path.join(projectRoot, 'services.yml'))) {
      runtime.writeServiceRegistry(servicesFile, projectEntity.id, {});
      changed.push(toPosixRelative(targetRoot, servicesFile));
    }
  }

  function convergeSkillsManifestSchema(targetRoot, scopeRoot, changed) {
    const file = skillsManifestPath(scopeRoot);
    if (!existsFile(file)) return;
    const schemaVersion = readSkillManifestSchemaVersion(file);
    if (schemaVersion === 'buildr.skills/v3') return;
    const skills = readSkillManifest(file);
    atomicWriteFile(file, renderSkillsManifestYaml(skills));
    changed.push(toPosixRelative(targetRoot, file));
  }

  function convergeServiceManifest(targetRoot, project, workspaceId, changed) {
    const projectName = project.code;
    const projectRoot = path.join(targetRoot, 'projects', projectName);
    const servicesRoot = path.join(projectRoot, 'services');
    const manifestFile = servicesManifestPath(projectRoot);
    const legacyFile = path.join(projectRoot, 'services.yml');
    let legacy = null;
    let entities = {};

    ensureDirectory(servicesRoot);
    if (!existsFile(manifestFile) && existsFile(legacyFile)) {
      const legacyServices = parseServicesYaml(fs.readFileSync(legacyFile, 'utf8'));
      legacy = { schemaVersion: 'buildr.services/v1', project: projectName, services: {} };
      for (const [serviceName, service] of Object.entries(legacyServices)) {
        legacy.services[serviceName] = normalizeServiceEntry(serviceName, service, path.join(servicesRoot, serviceName));
      }
    } else if (existsFile(manifestFile)) {
      const content = fs.readFileSync(manifestFile, 'utf8');
      const raw = parseServicesManifestYaml(content);
      if (raw.schemaVersion === 'buildr.services/v2') {
        entities = Object.fromEntries(Object.entries(runtime.parseServicesManifest(content, { projectCode: projectName }).entities).map(([code, service]) => [code, createServiceEntity({ ...service, workspaceId, projectId: project.id, projectCode: projectName })]));
      } else legacy = raw;
    } else {
      legacy = { schemaVersion: 'buildr.services/v1', project: projectName, services: {} };
    }

    if (legacy) {
      for (const [serviceName, service] of Object.entries(legacy.services || {})) {
        const normalized = normalizeServiceEntry(serviceName, service, path.join(servicesRoot, serviceName));
        const sourcePath = `projects/${projectName}/services/${serviceName}`;
        const source = normalized.repo.kind === 'git'
          ? { type: 'git', path: sourcePath, git: { url: normalized.repo.url || '', remote: normalized.repo.remote || 'origin', integrationBranch: normalized.repo.branch || normalized.repo.defaultBranch || '' } }
          : { type: 'workspace', path: sourcePath };
        entities[serviceName] = createServiceEntity({ id: runtime.crypto.randomUUID(), workspaceId, projectId: project.id, projectCode: projectName, code: serviceName, name: normalized.title, description: normalized.description, type: normalized.type, source });
      }
    }

    for (const serviceName of listManagedDirectories(servicesRoot)) {
      if (entities[serviceName]) continue;
      const serviceRoot = path.join(servicesRoot, serviceName);
      const git = runtime.observeProjectGit(serviceRoot, 'origin');
      const source = git.repository
        ? { type: 'git', path: `projects/${projectName}/services/${serviceName}`, git: { url: git.remoteUrl || '', remote: 'origin', integrationBranch: git.currentBranch || '' } }
        : { type: 'workspace', path: `projects/${projectName}/services/${serviceName}` };
      entities[serviceName] = createServiceEntity({ id: runtime.crypto.randomUUID(), workspaceId, projectId: project.id, projectCode: projectName, code: serviceName, name: serviceName, description: defaultAssetDescription('Service', serviceName), type: 'service', source });
    }

    const nextContent = runtime.renderServicesDomainManifest(project.id, entities);
    if (!existsFile(manifestFile) || fs.readFileSync(manifestFile, 'utf8') !== nextContent) {
      runtime.writeServiceRegistry(manifestFile, project.id, entities);
      changed.push(toPosixRelative(targetRoot, manifestFile));
    }
    if (existsFile(legacyFile)) {
      fs.rmSync(legacyFile, { force: true });
      changed.push(toPosixRelative(targetRoot, legacyFile));
    }
    return { schemaVersion: 'buildr.services/v2', projectId: project.id, services: entities };
  }

  function missingAncestorForMutation(targetRoot, target) {
    const root = path.resolve(targetRoot);
    let current = path.resolve(target);
    let missing = null;
    while (current !== root) {
      if (existsDirectory(current) || existsFile(current)) break;
      missing = current;
      current = path.dirname(current);
    }
    return missing;
  }

  function packageRegistryMutationPaths(targetRoot) {
    const manifest = readPackageManifest();
    const projectsRoot = path.join(targetRoot, 'projects');
    const affected = new Set([
      path.join(targetRoot, 'projects.yml'),
      projectsManifestPath(targetRoot),
      skillsManifestPath(targetRoot),
      path.join(targetRoot, '.gitignore'),
    ]);
    const projectsMissing = missingAncestorForMutation(targetRoot, projectsRoot);
    if (projectsMissing) affected.add(projectsMissing);

    const boundaryItems = [];
    for (const projectName of listManagedDirectories(projectsRoot)) {
      const projectRoot = path.join(projectsRoot, projectName);
      boundaryItems.push({ type: 'project', project: projectName, assetRoot: projectRoot });
      for (const relativeDir of manifest.projectDirectories) {
        const missing = missingAncestorForMutation(targetRoot, path.join(projectRoot, relativeDir));
        if (missing) affected.add(missing);
      }
      for (const rawEntry of manifest.projectFiles) {
        const entry = parseManifestFileEntry(rawEntry, 'projectFiles');
        affected.add(path.join(projectRoot, entry.target));
      }
      affected.add(path.join(projectRoot, 'services.yml'));
      affected.add(skillsManifestPath(projectRoot));
      affected.add(servicesManifestPath(projectRoot));

      const servicesRoot = path.join(projectRoot, 'services');
      for (const serviceName of listManagedDirectories(servicesRoot)) {
        boundaryItems.push({ type: 'service', project: projectName, service: serviceName, assetRoot: path.join(servicesRoot, serviceName) });
      }
    }
    for (const item of boundaryItems) {
      const boundary = gitBoundaryFor(targetRoot, item);
      if (boundary) affected.add(path.join(boundary.repoRoot, '.gitignore'));
    }
    return [...affected].map((item) => path.resolve(item)).sort();
  }

  function assertSafeSyncMutationPaths(targetRoot, affectedPaths) {
    const root = path.resolve(targetRoot);
    const protectedRoots = new Set([root]);
    for (const collection of ['projects', 'rules', 'skills', 'commands', 'components']) {
      const collectionRoot = path.join(root, collection);
      if (existsDirectory(collectionRoot)) protectedRoots.add(collectionRoot);
    }
    const projectsRoot = path.join(root, 'projects');
    for (const projectName of listManagedDirectories(projectsRoot)) {
      const projectRoot = path.join(projectsRoot, projectName);
      protectedRoots.add(projectRoot);
      const servicesRoot = path.join(projectRoot, 'services');
      if (existsDirectory(servicesRoot)) protectedRoots.add(servicesRoot);
      if (existsDirectory(path.join(projectRoot, '.git'))) protectedRoots.add(projectRoot);
      for (const serviceName of listManagedDirectories(servicesRoot)) {
        const serviceRoot = path.join(servicesRoot, serviceName);
        if (existsDirectory(path.join(serviceRoot, '.git'))) protectedRoots.add(serviceRoot);
      }
    }
    for (const affectedPath of affectedPaths) {
      const resolved = path.resolve(affectedPath);
      if (protectedRoots.has(resolved)) throw new Error(`Unsafe sync mutation path must be a precise managed member: ${toPosixRelative(root, resolved)}`);
    }
    return [...new Set(affectedPaths.map((item) => path.resolve(item)))].sort();
  }

  function convergeRegistryManifests(targetRoot) {
    const changed = [];
    const legacyProjectsFile = path.join(targetRoot, 'projects.yml');
    if (existsFile(legacyProjectsFile)) {
      fs.rmSync(legacyProjectsFile, { force: true });
      changed.push('projects.yml');
    }

    ensureDirectory(path.join(targetRoot, 'projects'));
    const record = runtime.readProjectRegistryRecord(targetRoot);
    if (record.registry.migrationRequired) throw new Error('Project registry migration must complete before registry convergence.');
    const projects = { ...record.projects };

    const projectNames = listManagedDirectories(path.join(targetRoot, 'projects'));
    for (const projectName of projectNames) {
      const projectRoot = path.join(targetRoot, 'projects', projectName);
      if (!projects[projectName]) {
        const git = runtime.observeProjectGit(projectRoot, 'origin');
        const source = git.repository
          ? {
            type: 'git',
            path: `projects/${projectName}`,
            git: {
              url: git.remoteUrl,
              remote: 'origin',
              integrationBranch: git.currentBranch,
            },
          }
          : { type: 'workspace', path: `projects/${projectName}` };
        projects[projectName] = createProjectEntity({
          id: runtime.crypto.randomUUID(),
          workspaceId: record.workspace.workspace.id,
          code: projectName,
          name: projectName,
          description: defaultAssetDescription('Project', projectName),
          source,
        });
      }
    }
    const nextContent = runtime.renderProjectsManifest(projects);
    const registryFile = projectsManifestPath(targetRoot);
    if (!existsFile(registryFile) || fs.readFileSync(registryFile, 'utf8') !== nextContent) {
      runtime.writeProjectRegistry(registryFile, projects);
      changed.push(toPosixRelative(targetRoot, registryFile));
    }

    for (const projectName of projectNames) {
      repairProjectBaseline(targetRoot, projectName, projects[projectName], changed);
      convergeServiceManifest(targetRoot, projects[projectName], record.workspace.workspace.id, changed);
    }

    convergeSkillsManifestSchema(targetRoot, targetRoot, changed);

    const boundaryItems = [];
    for (const projectName of Object.keys(projects)) {
      const projectRoot = path.join(targetRoot, 'projects', projectName);
      boundaryItems.push({ type: 'project', project: projectName, assetRoot: projectRoot });
      const servicesRoot = path.join(projectRoot, 'services');
      for (const serviceName of listManagedDirectories(servicesRoot)) {
        boundaryItems.push({ type: 'service', project: projectName, service: serviceName, assetRoot: path.join(servicesRoot, serviceName) });
      }
    }
    changed.push(...ensureGitBoundaries(targetRoot, boundaryItems));
    return [...new Set(changed)];
  }

  Object.assign(runtime, { readPackageManifest, readPackageComponentsManifest, readPackageBuiltinsManifest, parseManifestFileEntry, collectFiles, readSimpleYaml, validateBootstrapContract, builtinRuleEntry, builtinSkillEntry, builtinCommandEntry, sourcePathFromBuiltin, targetPathFromBuiltin, fileDiffStatus, directoryDiffStatus, isValidAssetId, listManagedDirectories, normalizeProjectEntry, normalizeServiceEntry, repairProjectBaseline, convergeSkillsManifestSchema, convergeServiceManifest, missingAncestorForMutation, packageRegistryMutationPaths, assertSafeSyncMutationPaths, convergeRegistryManifests });
  return runtime;
}
