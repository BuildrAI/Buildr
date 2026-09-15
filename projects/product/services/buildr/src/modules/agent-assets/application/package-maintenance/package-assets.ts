import { createPackageManifestRepository } from '../../persistence/package-manifest-repository.ts';
import fs from 'node:fs';
import path from 'node:path';
import { collectFiles } from '../../../../infrastructure/filesystem/tree-files.ts';
import { BOOTSTRAP_CONTRACT_RESOURCE } from '../../../../infrastructure/product-layout.ts';
import { SUPPORTED_AGENT_IDS } from '../../infrastructure/runtime/adapter-contract.ts';

export interface PackageAssetsDependencies {
  readSkillManifest: ReturnType<typeof import('../skills.ts').registerDomainsSkills>['readSkillManifest'];
  readSkillManifestSchemaVersion: ReturnType<typeof import('../skills.ts').registerDomainsSkills>['readSkillManifestSchemaVersion'];
  renderSkillsManifestYaml: ReturnType<typeof import('../skills.ts').registerDomainsSkills>['renderSkillsManifestYaml'];
  renderProjectCapabilitiesYaml: ReturnType<typeof import('../skills.ts').registerDomainsSkills>['renderProjectCapabilitiesYaml'];
  renderProjectCommandsYaml: ReturnType<typeof import('../commands.ts').registerDomainsCommands>['renderProjectCommandsYaml'];
  skillsManifestPath: ReturnType<typeof import('../skills.ts').registerDomainsSkills>['skillsManifestPath'];
  parseYamlValue: typeof import('../../../../infrastructure/filesystem/yaml.ts').parseYamlValue;
  projectsManifestPath: import('../../../workspace/module.ts').WorkspaceAssetSupport['projectsManifestPath'];
  servicesManifestPath: import('../../../workspace/module.ts').WorkspaceAssetSupport['servicesManifestPath'];
  gitBoundaryFor: import('../../../workspace/module.ts').WorkspaceAssetSupport['gitBoundaryFor'];
  ensureDirectory: (...args: any[]) => any;
  atomicWriteFile: typeof import('../../../../infrastructure/filesystem/atomic-files.ts').atomicWriteFile;
  parseYamlDocument: typeof import('../../../../infrastructure/filesystem/yaml.ts').parseYamlDocument;
  productRoot: () => string;
  resourcesRoot: () => string;
  bootstrapContractPath: () => string;
  writeMappedFileIfMissing: (...args: any[]) => any;
  toPosixRelative: (...args: any[]) => any;
  existsDirectory: (file: string) => boolean;
  existsFile: (file: string) => boolean;
  convergeRegistryManifests: import('../../../workspace/module.ts').WorkspaceAssetSupport['convergeRegistryManifests'];
}

export function registerAgentAssetsPackageAssets(dependencies: PackageAssetsDependencies) {
  const {
    readSkillManifest,
    readSkillManifestSchemaVersion,
    renderSkillsManifestYaml,
    renderProjectCapabilitiesYaml,
    renderProjectCommandsYaml,
    skillsManifestPath,
    parseYamlValue,
    projectsManifestPath,
    servicesManifestPath,
    gitBoundaryFor,
    ensureDirectory,
    atomicWriteFile,
    parseYamlDocument,
    productRoot,
    resourcesRoot,
    bootstrapContractPath,
    writeMappedFileIfMissing,
    toPosixRelative,
    existsDirectory,
    existsFile,
  } = dependencies;

  const { readPackageManifest, parseManifestFileEntry } = createPackageManifestRepository({ resourcesRoot, existsFile, parseYamlDocument });

  function readSimpleYaml(file: any, listKeys: any, scalarKeys: any = []): any  {
    const result: any = {
      ...Object.fromEntries(listKeys.map((key: any) => [key, []])),
      ...Object.fromEntries(scalarKeys.map((key: any) => [key, null])),
    };
    const allowedKeys: any = new Set([...listKeys, ...scalarKeys]);
    let currentKey: any = null;
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

  function validateBootstrapContract(root: any, files: any, problems: any): any  {
    const contractPath = bootstrapContractPath();
    if (!existsFile(contractPath)) {
      problems.push(`Bootstrap contract is missing: ${BOOTSTRAP_CONTRACT_RESOURCE}`);
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

    function readArtifact(artifact: any, label: any): any  {
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

    function validateRequiredText(content: any, artifact: any, requiredText: any): any  {
      if (!content) return;
      for (const required of requiredText) {
        if (!content.includes(required)) {
          problems.push(`Bootstrap contract required text ${JSON.stringify(required)} missing from ${artifact}`);
        }
      }
    }

    function validateForbiddenText(content: any, artifact: any, forbiddenText: any): any  {
      if (!content) return;
      for (const forbidden of forbiddenText) {
        if (forbidden && content.includes(forbidden)) {
          problems.push(`Bootstrap contract forbidden text ${JSON.stringify(forbidden)} found in ${artifact}`);
        }
      }
    }

    function validateMaxLines(content: any, artifact: any, maxLines: any): any  {
      if (!content || !maxLines) return;
      const lineCount = content.split(/\r?\n/).length;
      if (lineCount > Number(maxLines)) {
        problems.push(`Bootstrap contract max lines exceeded in ${artifact}: ${lineCount} > ${maxLines}`);
      }
    }

    function validateSections(content: any, artifact: any, sections: any): any  {
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

  function builtinRuleEntry(builtin: any): any  {
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

  function builtinSkillEntry(builtin: any): any  {
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

  function builtinCommandEntry(builtin: any): any  {
    return {
      id: builtin.id,
      source: 'buildr',
      enabled: true,
      required: builtin.required === true,
      state: 'installed',
      ...(builtin.manifestEntry || {}),
    };
  }

  function sourcePathFromBuiltin(builtin: any): any  {
    return path.resolve(productRoot(), builtin.path);
  }

  function targetPathFromBuiltin(targetRoot: any, builtin: any): any  {
    return path.join(targetRoot, builtin.target);
  }



  function isValidAssetId(value: any): any  {
    return typeof value === 'string' && value !== '.' && value !== '..' && !/[\x00-\x1f\x7f]/.test(value) && /^[A-Za-z0-9._-]+$/.test(value);
  }

  function listManagedDirectories(parent: any): any  {
    if (!existsDirectory(parent)) return [];
    return fs.readdirSync(parent)
      .filter((entry: any) => isValidAssetId(entry) && existsDirectory(path.join(parent, entry)))
      .sort();
  }

  function repairProjectBaseline(targetRoot: any, projectName: any, changed: any): any  {
    const manifest = readPackageManifest();
    const projectRoot = path.join(targetRoot, 'projects', projectName);
    ensureDirectory(projectRoot);
    for (const relativeDir of manifest.projectDirectories) ensureDirectory(path.join(projectRoot, relativeDir));
    const variables: any = { project: projectName };
    for (const rawEntry of manifest.projectFiles) {
      const entry = parseManifestFileEntry(rawEntry, 'projectFiles');
      const before = changed.length;
      writeMappedFileIfMissing(targetRoot, projectRoot, entry, variables, changed);
      if (changed.length > before) changed[changed.length - 1] = `projects/${projectName}/${entry.target}`;
    }
    for (const [relativePath, content] of [
      ['capabilities.yml', renderProjectCapabilitiesYaml()],
      ['commands.yml', renderProjectCommandsYaml()],
    ]) {
      const file = path.join(projectRoot, relativePath);
      if (!existsFile(file)) {
        atomicWriteFile(file, content);
        changed.push(toPosixRelative(targetRoot, file));
      }
    }
    // Unsupported projects/<project>/skills is preserved verbatim. Current
    // repair/sync never creates, rewrites, merges, migrates, or deletes it.
  }

  function convergeSkillsManifestSchema(targetRoot: any, scopeRoot: any, changed: any): any  {
    const file = skillsManifestPath(scopeRoot);
    if (!existsFile(file)) return;
    const schemaVersion = readSkillManifestSchemaVersion(file);
    if (schemaVersion === 'buildr.skills/v3') return;
    const skills = readSkillManifest(file);
    atomicWriteFile(file, renderSkillsManifestYaml(skills));
    changed.push(toPosixRelative(targetRoot, file));
  }

  function missingAncestorForMutation(targetRoot: any, target: any): any  {
    const root = path.resolve(targetRoot);
    let current = path.resolve(target);
    let missing: any = null;
    while (current !== root) {
      if (existsDirectory(current) || existsFile(current)) break;
      missing = current;
      current = path.dirname(current);
    }
    return missing;
  }

  function packageRegistryMutationPaths(targetRoot: any): any  {
    const manifest = readPackageManifest();
    const projectsRoot = path.join(targetRoot, 'projects');
    const affected: any = new Set([
      path.join(targetRoot, 'projects.yml'),
      projectsManifestPath(targetRoot),
      skillsManifestPath(targetRoot),
      path.join(targetRoot, '.gitignore'),
    ]);
    const projectsMissing = missingAncestorForMutation(targetRoot, projectsRoot);
    if (projectsMissing) affected.add(projectsMissing);

    const boundaryItems: any[] = [];
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
      affected.add(path.join(projectRoot, 'capabilities.yml'));
      affected.add(path.join(projectRoot, 'commands.yml'));
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
    return [...affected].map((item: any) => path.resolve(item)).sort();
  }

  function assertSafeSyncMutationPaths(targetRoot: any, affectedPaths: any): any  {
    const root = path.resolve(targetRoot);
    const protectedRoots: any = new Set([root]);
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
    return [...new Set(affectedPaths.map((item: any) => path.resolve(item)))].sort();
  }

  function convergeRegistryManifests(targetRoot: string) {
    return dependencies.convergeRegistryManifests(targetRoot, { repairProjectBaseline, convergeSkillsManifestSchema });
  }

  return Object.freeze({
    readPackageManifest,
    parseManifestFileEntry,
    collectFiles,
    validateBootstrapContract,
    builtinRuleEntry,
    builtinSkillEntry,
    builtinCommandEntry,
    sourcePathFromBuiltin,
    targetPathFromBuiltin,
    isValidAssetId,
    listManagedDirectories,
    missingAncestorForMutation,
    packageRegistryMutationPaths,
    assertSafeSyncMutationPaths,
    convergeRegistryManifests,
  });
}
