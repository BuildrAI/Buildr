import { capabilityKey, parseCapabilityContract, validateCapabilityIdentity } from '../../infrastructure/runtime/skills/manifests.mjs';

export function createPackageStaticValidator(deps) {
  const {
    LEGACY_PACKAGE_PATHS,
    PACKAGE_RUNTIME_TARGET,
    PACKAGE_WORKSPACE_TARGET,
    SUPPORTED_AGENT_IDS,
    collectFiles,
    componentMemberPaths,
    existsDirectory,
    existsFile,
    fs,
    isManifestSourceLabel,
    isPlainObject,
    normalizeRelativePathForBuildr,
    packageComponentDefinition,
    packageComponentSourcePath,
    packageWorkspaceTargetRoot,
    parseCommandsManifestYaml,
    parseManifestFileEntry,
    parseProjectsYaml,
    parseSkillFrontmatter,
    parseSkillSourceRef,
    path,
    readPackageManifest,
    readSkillManifest,
    toPosixRelative,
    validateBootstrapContract,
    validateCommandsManifest,
    validatePackageComponentMembers,
    validateProjectsRegistry,
    validateSkillManifestEntries,
    getRuntimeAdapter,
    validateSkillPublication,
  } = deps;

  function validateAdapterPublications(skill, skillDir, problems) {
    for (const runtime of skill.runtimes || []) {
      try {
        const adapter = getRuntimeAdapter(runtime);
        problems.push(...validateSkillPublication(adapter, { skillId: skill.id, skillDir }));
      } catch (error) {
        problems.push(error.message);
      }
    }
  }

  function validateWorkspaceSkillsBaseline(root, problems) {
    const workspaceSkillsRoot = path.join(root, 'skills');
    const workspaceManifest = path.join(workspaceSkillsRoot, 'manifest.yml');
    const baselineSkillsRoot = path.join(packageWorkspaceTargetRoot(), 'skills');
    const baselineManifest = path.join(baselineSkillsRoot, 'manifest.yml');
    const packageSkillSourceIds = new Set(readPackageManifest().skillSources.map((source) => source.id));

    if (!existsFile(workspaceManifest) || !existsFile(baselineManifest)) return;

    const workspaceSkills = new Map(readSkillManifest(workspaceManifest).map((skill) => [skill.id, skill]));
    for (const baselineSkill of readSkillManifest(baselineManifest)) {
      if (!baselineSkill.id || (baselineSkill.path === undefined && baselineSkill.source === undefined && baselineSkill.resolved === undefined)) {
        problems.push('Workspace skills baseline manifest entries must include id and path, source, or resolved.');
        continue;
      }

      const workspaceSkill = workspaceSkills.get(baselineSkill.id);
      if (!workspaceSkill) {
        problems.push(`Workspace skills baseline ${baselineSkill.id} is missing from root skills/manifest.yml.`);
        continue;
      }
      if (baselineSkill.path !== undefined && workspaceSkill.path !== baselineSkill.path) {
        problems.push(`Workspace skills baseline ${baselineSkill.id} path differs from root skills manifest: ${baselineSkill.path} != ${workspaceSkill.path}`);
        continue;
      }
      if (baselineSkill.source !== undefined && JSON.stringify(workspaceSkill.source) !== JSON.stringify(baselineSkill.source)) {
        problems.push(`Workspace skills baseline ${baselineSkill.id} source differs from root skills manifest.`);
        continue;
      }
      if (baselineSkill.resolved !== undefined && JSON.stringify(workspaceSkill.resolved) !== JSON.stringify(baselineSkill.resolved)) {
        problems.push(`Workspace skills baseline ${baselineSkill.id} resolved differs from root skills manifest.`);
        continue;
      }

      if ((baselineSkill.source !== undefined && !(baselineSkill.path !== undefined && isManifestSourceLabel(baselineSkill.source))) || baselineSkill.resolved !== undefined) {
        try {
          if (typeof baselineSkill.source === 'string' && !isManifestSourceLabel(baselineSkill.source)) {
            const parsed = parseSkillSourceRef(baselineSkill.source);
            if (parsed.type === 'package' && !packageSkillSourceIds.has(parsed.id)) {
              problems.push(`Workspace skills baseline ${baselineSkill.id} references unknown package Skill source: ${baselineSkill.source}`);
            }
          }
        } catch (error) {
          problems.push(error.message);
        }
        continue;
      }

      const baselineSkillFile = path.join(baselineSkillsRoot, baselineSkill.path, 'SKILL.md');
      const workspaceSkillFile = path.join(workspaceSkillsRoot, workspaceSkill.path, 'SKILL.md');
      if (!existsFile(baselineSkillFile)) {
        problems.push(`Workspace skills baseline SKILL.md does not exist: ${PACKAGE_WORKSPACE_TARGET}/skills/${baselineSkill.path}/SKILL.md`);
        continue;
      }
      if (!existsFile(workspaceSkillFile)) {
        problems.push(`Root workspace skill SKILL.md does not exist: skills/${workspaceSkill.path}/SKILL.md`);
        continue;
      }

      const baselineContent = fs.readFileSync(baselineSkillFile, 'utf8');
      const workspaceContent = fs.readFileSync(workspaceSkillFile, 'utf8');
      if (baselineContent !== workspaceContent) {
        problems.push(`Workspace skills baseline ${baselineSkill.id} differs from root skills/${workspaceSkill.path}/SKILL.md.`);
      }
    }
  }

  function validateWorkspaceRulesBaseline(root, problems) {
    const baselinePairs = [
      ['AGENTS.md', 'AGENTS.md'],
      ['rules/manifest.yml', 'rules/manifest.yml'],
      ['rules/buildr/core.md', 'rules/buildr/core.md'],
    ];

    for (const [rootRelative, packageRelative] of baselinePairs) {
      const rootFile = path.join(root, rootRelative);
      const packageFile = path.join(packageWorkspaceTargetRoot(), packageRelative);
      if (existsFile(rootFile) && existsFile(packageFile)) {
        const rootContent = fs.readFileSync(rootFile, 'utf8');
        const packageContent = fs.readFileSync(packageFile, 'utf8');
        if (rootContent !== packageContent) {
          problems.push(`Root ${rootRelative} differs from ${PACKAGE_WORKSPACE_TARGET}/${packageRelative}.`);
        }
      }
    }

    for (const legacyRule of ['rules/AGENTS.workspace.md', 'rules/AGENTS.project.md']) {
      if (existsFile(path.join(root, legacyRule))) {
        problems.push(`Legacy workspace rule source must not remain in root: ${legacyRule}`);
      }
    }
  }

  function validatePackageMetadata(context) {
    const { root, problems } = context;
    const packageMetadataPath = path.join(root, 'package.json');
    if (!existsFile(packageMetadataPath)) {
      problems.push('Public npm package metadata is missing: package.json');
    } else {
      let packageMetadata;
      try { packageMetadata = JSON.parse(fs.readFileSync(packageMetadataPath, 'utf8')); } catch (error) { problems.push(`package.json is invalid JSON: ${error.message}`); }
      if (packageMetadata) {
        if (packageMetadata.name !== '@buildr-ai/buildr') problems.push('package.json must declare the official @buildr-ai/buildr package identity.');
        if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(packageMetadata.version || '') || packageMetadata.version === '0.0.0') problems.push('package.json must declare a non-placeholder semantic version.');
        if (packageMetadata.private === true) problems.push('package.json must not block public packaging with private: true.');
        if (packageMetadata.license !== 'MIT') problems.push('package.json must declare the MIT license.');
        if (packageMetadata.repository?.url !== 'git+https://github.com/elevenching/Buildr.git' || packageMetadata.repository?.directory !== 'projects/product/services/buildr') problems.push('package.json repository must identify the canonical GitHub Buildr Service directory.');
        if (packageMetadata.homepage !== 'https://github.com/elevenching/Buildr#readme') problems.push('package.json homepage must identify the canonical GitHub README.');
        if (packageMetadata.bugs?.url !== 'https://github.com/elevenching/Buildr/issues') problems.push('package.json bugs URL must identify canonical GitHub Issues.');
        if (packageMetadata.publishConfig?.access !== 'public') problems.push('package.json publishConfig.access must be public.');
        for (const keyword of ['agent', 'agentic-coding', 'cli', 'developer-tools', 'workspace']) {
          if (!packageMetadata.keywords?.includes(keyword)) problems.push(`package.json keywords must include ${keyword}.`);
        }
        const packagedFiles = new Set(packageMetadata.files || []);
        for (const required of ['LICENSE', 'bin/buildr.mjs', 'src/', 'docs/cli-reference.md', 'docs/cli-architecture.md', 'docs/known-limitations.md', 'package/']) {
          if (!packagedFiles.has(required)) problems.push(`package.json files must include ${required}.`);
        }
        for (const forbiddenPrefix of ['test/', 'scripts/', ['to', 'ols/'].join('')]) {
          if ([...packagedFiles].some((entry) => entry === forbiddenPrefix || entry.startsWith(forbiddenPrefix))) {
            problems.push(`package.json files must not publish checkout-only path: ${forbiddenPrefix}.`);
          }
        }
      }
    }
    for (const required of ['LICENSE', 'docs/cli-reference.md', 'docs/cli-architecture.md', 'docs/known-limitations.md']) {
      if (!fs.existsSync(path.join(root, required))) problems.push(`Open-source product baseline is missing: ${required}`);
    }
    if (existsFile(path.join(root, 'scripts', 'install-buildr-cli'))) {
      for (const required of ['test/verification/onboarding/repository.mjs', 'test/verification/onboarding/init.mjs', 'test/verification/onboarding/service-branch.mjs', 'test/verification/network/remote-text.mjs', 'test/verification/cli/architecture.mjs', 'test/verification/cli/compatibility.mjs', 'test/verification/cli/package-parity.mjs', 'test/verification/release/open-source-candidate.mjs', 'scripts/release/release-contract.mjs']) {
        if (!existsFile(path.join(root, required))) problems.push(`Development checkout verification is missing: ${required}`);
      }
    }

    for (const legacyPath of LEGACY_PACKAGE_PATHS) {
      if (fs.existsSync(path.join(root, legacyPath))) {
        problems.push(`Legacy package path must not remain: ${legacyPath}`);
      }
    }
  }

  function parseJsonOutput(label, output) {
    try {
      return JSON.parse(output);
    } catch (error) {
      const match = error.message.match(/position (\d+)/);
      const position = match ? Number(match[1]) : 0;
      const excerpt = output.slice(Math.max(0, position - 240), position + 240);
      throw new Error(`${label} returned invalid JSON: ${error.message}\n${excerpt}`);
    }
  }

  function validateMappedEntries(context) {
    const { root, manifest, files, problems, mappedEntries } = context;
    for (const includePath of manifest.include) {
      const absolutePath = path.resolve(root, includePath);
      if (!fs.existsSync(absolutePath)) {
        problems.push(`Manifest include does not exist: ${includePath}`);
        continue;
      }
      files.push(...collectFiles(absolutePath));
    }

    for (const section of ['workspaceFiles', 'projectFiles']) {
      for (const rawEntry of manifest[section]) {
        let entry;
        try {
          entry = parseManifestFileEntry(rawEntry, section);
        } catch (error) {
          problems.push(error.message);
          continue;
        }
        mappedEntries.push(entry);
        if (LEGACY_PACKAGE_PATHS.some((legacyPath) => entry.source === legacyPath || entry.source.startsWith(`${legacyPath}/`))) {
          problems.push(`Package manifest must not reference legacy package source: ${entry.raw}`);
        }
        if (!entry.source.startsWith(`${PACKAGE_WORKSPACE_TARGET}/`)) {
          problems.push(`Package manifest ${section} source must be under ${PACKAGE_WORKSPACE_TARGET}/: ${entry.raw}`);
        }
        if (entry.source.includes('AGENTS.private')) {
          problems.push(`Package manifest must not publish private business rule: ${entry.raw}`);
        }
        if (entry.source.includes('package/workspace-rules/') || entry.source.includes('package/workspace-skills/') || entry.source.includes('package/baseline/')) {
          problems.push(`Package manifest must use ${PACKAGE_WORKSPACE_TARGET}/ as the source for workspace baseline assets: ${entry.raw}`);
        }
        if (entry.source.startsWith('rules/')) {
          problems.push(`Package manifest must use ${PACKAGE_WORKSPACE_TARGET}/rules/ as the source for published rule modules: ${entry.raw}`);
        }
        if (entry.target.startsWith('rules/') && !entry.source.startsWith(`${PACKAGE_WORKSPACE_TARGET}/rules/`)) {
          problems.push(`Package manifest rule targets must source from ${PACKAGE_WORKSPACE_TARGET}/rules/: ${entry.raw}`);
        }
        if (entry.source.startsWith('product/')) {
          problems.push(`Package manifest source must be relative to the product root, not product/ prefixed: ${entry.raw}`);
        }
        if (path.isAbsolute(entry.source) || entry.source.startsWith('..')) {
          problems.push(`Package manifest source must stay inside product root: ${entry.raw}`);
          continue;
        }
        if (path.isAbsolute(entry.target) || entry.target.startsWith('..')) {
          problems.push(`Package manifest target must stay inside generated workspace: ${entry.raw}`);
        }
        const sourceFile = path.resolve(root, entry.source);
        if (!existsFile(sourceFile)) {
          problems.push(`Package manifest source does not exist: ${entry.source}`);
          continue;
        }
        files.push(sourceFile);
      }
    }
  }

  function validatePackageComponents(context) {
    const { root, manifest, files, problems, mappedEntries } = context;
    const componentIds = new Set();
    const componentOwnedWorkspaceFiles = new Set();
    const componentMemberOwners = new Map();
    for (const entry of manifest.components) {
      const label = `components.${entry.id || '<missing>'}`;
      for (const key of Object.keys(entry)) if (!['id', 'path', 'defaultEnabled', 'required'].includes(key)) problems.push(`${label}.${key} is not supported.`);
      if (!entry.id || !entry.path || typeof entry.defaultEnabled !== 'boolean' || typeof entry.required !== 'boolean') {
        problems.push(`${label} must include id, path, defaultEnabled, and required.`);
        continue;
      }
      if (componentIds.has(entry.id)) problems.push(`Duplicate package Component id: ${entry.id}`);
      componentIds.add(entry.id);
      const expectedSuffix = `/components/`;
      const componentPathParts = entry.path.split('/');
      const exactComponentPath = entry.path.startsWith(`${PACKAGE_WORKSPACE_TARGET}${expectedSuffix}`)
        && componentPathParts.at(-1) === 'component.yml'
        && componentPathParts.at(-2) === entry.id
        && componentPathParts.length === PACKAGE_WORKSPACE_TARGET.split('/').length + 4;
      if (!exactComponentPath || path.isAbsolute(entry.path) || entry.path.startsWith('..')) {
        problems.push(`${label}.path must be ${PACKAGE_WORKSPACE_TARGET}/components/<source>/${entry.id}/component.yml.`);
        continue;
      }
      try {
        const record = packageComponentDefinition(entry);
        files.push(record.file);
        componentOwnedWorkspaceFiles.add(toPosixRelative(root, record.file));
        for (const message of validatePackageComponentMembers(manifest, record)) problems.push(message);
        if (entry.id === 'openspec') {
          const proposeSidebar = packageComponentSourcePath('components/buildr/openspec/contributions/openspec-propose-sidebar.md');
          const content = fs.readFileSync(proposeSidebar, 'utf8');
          for (const requiredText of [
            '执行 `openspec new change` 或写入任何 change artifacts 前',
            '代码修改、构建、测试或需要长期开发上下文',
            '先使用 `task-worktree` 声明完整 repository set',
            '无法判断是否会进入实现时，先澄清执行范围',
            '不修改外部 `openspec-propose` Skill 的上游正文',
          ]) {
            if (!content.includes(requiredText)) problems.push(`OpenSpec propose sidebar must include ${JSON.stringify(requiredText)}.`);
          }
          const updateSidebar = packageComponentSourcePath('components/buildr/openspec/contributions/openspec-update-sidebar.md');
          const updateContent = fs.readFileSync(updateSidebar, 'utf8');
          for (const requiredText of [
            '只修订既有 planning artifacts',
            '不授予实现、同步或归档权限',
            '重新执行 `task-worktree` 决策',
            '`openspec-apply-change`',
          ]) {
            if (!updateContent.includes(requiredText)) problems.push(`OpenSpec update sidebar must include ${JSON.stringify(requiredText)}.`);
          }
          const members = new Set(componentMemberPaths(record.definition));
          if (!members.has('skills/openspec/openspec-update-change')) problems.push('OpenSpec Component must include the upstream update workflow Skill.');
          for (const legacySidebar of ['openspec-explore-sidebar.md', 'openspec-sync-sidebar.md', 'openspec-archive-sidebar.md']) {
            if ([...(record.definition.members.skillContributions || [])].some((member) => member.endsWith(legacySidebar))) {
              problems.push(`OpenSpec Component must not retain the duplicated ${legacySidebar} sidebar.`);
            }
          }
        }
        for (const member of componentMemberPaths(record.definition)) {
          const previousOwner = componentMemberOwners.get(member);
          if (previousOwner && previousOwner !== entry.id) problems.push(`Package Component ownership conflict for ${member}: ${previousOwner}, ${entry.id}.`);
          componentMemberOwners.set(member, entry.id);
          const source = packageComponentSourcePath(member);
          for (const file of existsDirectory(source) ? collectFiles(source) : existsFile(source) ? [source] : []) {
            files.push(file);
            componentOwnedWorkspaceFiles.add(toPosixRelative(root, file));
          }
          if (member.endsWith('/manifest.yml') && member.startsWith('commands/')) {
            const commandManifest = parseCommandsManifestYaml(fs.readFileSync(source, 'utf8'));
            for (const message of validateCommandsManifest(commandManifest)) problems.push(`Package Component ${entry.id} command collection: ${message}`);
          }
          if (member.startsWith('skills/')) {
            const skillFile = path.join(source, 'SKILL.md');
            const content = fs.readFileSync(skillFile, 'utf8');
            if (member === 'skills/buildr/openspec-contract-guard') {
              if (!content.includes('author: buildr')) problems.push('OpenSpec contract guard Skill must declare Buildr as its author.');
              if (!content.includes(`supportedOpenSpec: "${record.definition.upstream.version}"`)) {
                problems.push(`OpenSpec contract guard Skill must declare supportedOpenSpec ${record.definition.upstream.version}.`);
              }
            } else {
              const expected = `generatedBy: "${record.definition.upstream.version}"`;
              if (!content.includes(expected)) problems.push(`Package Component ${entry.id} Skill generatedBy must match upstream version ${record.definition.upstream.version}: ${member}.`);
            }
          }
        }
      } catch (error) {
        problems.push(`${label} is invalid: ${error.message}`);
      }
    }

    const mappedSources = new Set(mappedEntries.map((entry) => entry.source));
    for (const entry of mappedEntries) {
      for (const member of componentMemberOwners.keys()) {
        if (entry.target === member || entry.target.startsWith(`${member}/`)) {
          problems.push(`Component member must not also be installed through workspaceFiles: ${entry.raw}`);
        }
      }
    }
    const workspaceSourceRoot = packageWorkspaceTargetRoot();
    for (const workspaceFile of collectFiles(workspaceSourceRoot)) {
      const relativeFile = toPosixRelative(root, workspaceFile);
      if (!mappedSources.has(relativeFile) && !componentOwnedWorkspaceFiles.has(relativeFile)) {
        problems.push(`Package workspace source file must be explicitly mapped in package/manifest.yml: ${relativeFile}`);
      }
    }
  }

  function validatePackageSkills(context) {
    const { root, manifest, files, problems } = context;
    const agentSkillIds = new Set();
    for (const skill of manifest.agentSkills) {
      if (!skill.id || !skill.path) {
        problems.push('Package manifest agentSkills entries must include id and path.');
        continue;
      }
      if (!skill.path.startsWith(`${PACKAGE_RUNTIME_TARGET}/skills/`)) {
        problems.push(`Package agentSkill path must be under ${PACKAGE_RUNTIME_TARGET}/skills/: ${skill.path}`);
      }
      if (agentSkillIds.has(skill.id)) {
        problems.push(`Duplicate package agentSkill id: ${skill.id}`);
      }
      agentSkillIds.add(skill.id);
      if (!Array.isArray(skill.runtimes) || skill.runtimes.length === 0) {
        problems.push(`Package agentSkill must declare at least one runtime: ${skill.id}`);
      }
      if (path.isAbsolute(skill.path) || skill.path.startsWith('..')) {
        problems.push(`Package agentSkill path must stay inside product root: ${skill.path}`);
        continue;
      }
      const skillDir = path.resolve(root, skill.path);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!existsFile(skillFile)) {
        problems.push(`Package agentSkill SKILL.md does not exist: ${skill.path}/SKILL.md`);
        continue;
      }
      const skillContent = fs.readFileSync(skillFile, 'utf8');
      if (skill.id === 'buildr') {
        for (const requiredText of [
          'buildr.git-single-operation/v1',
          'buildr.git-workspace-update/v1',
          'Buildr Capability Bindings',
          'capabilities` graph',
          'Agent 是 Buildr 功能的默认操作入口',
          '询问用户是否由 Agent 立即同步',
          '准确手动命令作为备选',
          '当前 session 是否重新发现新资产由 Agent runtime 决定',
          '用户要求“更新 Buildr”或“同步 Buildr”时',
          'buildr skill install <agent> --target <dir>',
          '用户要求“更新 workspace”或“同步 workspace”时',
          '用户明确要求“只更新 CLI”时',
          '解析 `buildr.git-workspace-update/v1`',
          '不自动 stash、rebase、覆盖，也不继续 sync',
          '不重复询问 sync',
          '不是 Git workspace，直接运行 sync',
          '先加载 `capability-adaptation` 判断是否触达或产生跨 Skill 稳定依赖边界',
          '产品入口 Buildr Skill 只对自身已命中的 Buildr 管理意图执行内部能力路由',
          '顶层 capability 的 binding 只选择 provider，不自动产生 Agent 意图命中',
          '单项 capability blocked 不得阻塞',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`Buildr Agent Skill must include ${JSON.stringify(requiredText)}.`);
        }
        for (const [relativePath, requiredTexts] of [
          ['package/bootstrap/guide.md', ['解析 `buildr.git-workspace-update/v1` binding', '不自动 stash、rebase、覆盖，也不继续 sync', '不重复询问 sync', '非 Git workspace 跳过 Git provider', '不是 `buildr sync` 的隐式 Git 行为']],
          ['docs/cli-reference.md', ['解析 `buildr.git-workspace-update/v1` binding', 'Agent 不自动 stash、rebase 或覆盖', '不重复询问 sync', '非 Git workspace 直接 sync', '不隐式执行 Git 更新']],
          ['src/infrastructure/runtime/skills/render-plan.mjs', ['解析 `buildr.git-workspace-update/v1` selected provider', '非 Git workspace 直接运行 sync']],
        ]) {
          const contractPath = path.join(root, relativePath);
          if (!existsFile(contractPath)) {
            problems.push(`Workspace update intent contract file is missing: ${relativePath}`);
            continue;
          }
          const contractContent = fs.readFileSync(contractPath, 'utf8');
          for (const requiredText of requiredTexts) {
            if (!contractContent.includes(requiredText)) problems.push(`${relativePath} must include ${JSON.stringify(requiredText)}.`);
          }
        }
      }
      validateAdapterPublications(skill, skillDir, problems);
      files.push(skillFile);
    }

    const skillSourceIds = new Set();
    for (const skill of manifest.skillSources) {
      if (!skill.id || !skill.path) {
        problems.push('Package manifest skillSources entries must include id and path.');
        continue;
      }
      if (skillSourceIds.has(skill.id)) {
        problems.push(`Duplicate package skillSource id: ${skill.id}`);
      }
      skillSourceIds.add(skill.id);
      if (!Array.isArray(skill.runtimes) || skill.runtimes.length === 0) {
        problems.push(`Package skillSource must declare at least one runtime: ${skill.id}`);
      }
      if (path.isAbsolute(skill.path) || skill.path.startsWith('..')) {
        problems.push(`Package skillSource path must stay inside product root: ${skill.path}`);
        continue;
      }
      if (skill.runtimePath !== undefined) {
        try {
          normalizeRelativePathForBuildr(skill.runtimePath, `Package skillSource runtimePath must stay relative: ${skill.runtimePath}`);
        } catch (error) {
          problems.push(error.message);
        }
      }
      const skillDir = path.resolve(root, skill.path);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!existsFile(skillFile)) {
        problems.push(`Package skillSource SKILL.md does not exist: ${skill.path}/SKILL.md`);
        continue;
      }
      try {
        const metadata = parseSkillFrontmatter(skillFile);
        if (metadata.name !== skill.id) {
          problems.push(`Package skillSource id must match SKILL.md frontmatter name: ${skill.id} != ${metadata.name}`);
        }
      } catch (error) {
        problems.push(error.message);
      }
      files.push(...collectFiles(skillDir));
    }
    return skillSourceIds;
  }

  function validatePackageBuiltins(context, skillSourceIds) {
    const { root, workspaceRoot, manifest, files, problems } = context;
    const builtinIds = new Set();
    const contractIds = new Set();
    for (const [index, contract] of (manifest.capabilityContracts || []).entries()) {
      const label = `capabilityContracts[${index}]`;
      try {
        validateCapabilityIdentity(contract.id, contract.version, label);
        if (!contract.path || !contract.target || !contract.description) throw new Error(`${label} must include path, target, and description`);
        const key = capabilityKey(contract.id, contract.version);
        if (contractIds.has(key)) throw new Error(`Duplicate package capability contract: ${key}`);
        contractIds.add(key);
        const sourceFile = path.resolve(root, contract.path);
        parseCapabilityContract(sourceFile, contract);
        files.push(sourceFile);
      } catch (error) {
        problems.push(error.message);
      }
    }
    const bindingIds = new Set();
    for (const [index, binding] of (manifest.initialSkillBindings || []).entries()) {
      const label = `initialSkillBindings[${index}]`;
      try {
        validateCapabilityIdentity(binding.capability, binding.version, label);
        const key = capabilityKey(binding.capability, binding.version);
        if (!contractIds.has(key)) throw new Error(`${label} references undeclared contract: ${key}`);
        if (!binding.provider) throw new Error(`${label}.provider is required`);
        if (bindingIds.has(key)) throw new Error(`Duplicate initial Skill binding: ${key}`);
        bindingIds.add(key);
      } catch (error) {
        problems.push(error.message);
      }
    }
    function validateLegacyIntegrities(builtin, label) {
      if (builtin.legacyIntegrities === undefined) return;
      if (!Array.isArray(builtin.legacyIntegrities)) {
        problems.push(`${label}.legacyIntegrities must be an array.`);
        return;
      }
      const seen = new Set();
      for (const integrity of builtin.legacyIntegrities) {
        if (!/^sha256-[a-f0-9]{64}$/.test(integrity || '')) problems.push(`${label}.legacyIntegrities contains an invalid SHA-256 integrity.`);
        if (seen.has(integrity)) problems.push(`${label}.legacyIntegrities contains a duplicate integrity: ${integrity}`);
        seen.add(integrity);
      }
    }
    for (const rule of manifest.builtins.rules) {
      const label = `builtins.rules.${rule.id || '<missing>'}`;
      validateLegacyIntegrities(rule, label);
      if (!rule.id || !rule.path || !rule.target || !rule.description || typeof rule.required !== 'boolean') {
        problems.push(`${label} must include id, path, target, description, and required.`);
        continue;
      }
      if (builtinIds.has(`rule:${rule.id}`)) problems.push(`Duplicate builtin rule id: ${rule.id}`);
      builtinIds.add(`rule:${rule.id}`);
      if (!rule.target.startsWith('rules/buildr/') || !rule.target.endsWith('.md')) {
        problems.push(`${label}.target must be rules/buildr/*.md.`);
      }
      if (!rule.path.startsWith(`${PACKAGE_WORKSPACE_TARGET}/rules/`)) {
        problems.push(`${label}.path must be under ${PACKAGE_WORKSPACE_TARGET}/rules/.`);
      }
      if (path.isAbsolute(rule.path) || rule.path.startsWith('..') || path.isAbsolute(rule.target) || rule.target.startsWith('..')) {
        problems.push(`${label} paths must stay relative.`);
        continue;
      }
      const sourceFile = path.resolve(root, rule.path);
      if (!existsFile(sourceFile)) {
        problems.push(`${label}.path does not exist: ${rule.path}`);
      } else {
        if (rule.id === 'buildr-core') {
          const coreContent = fs.readFileSync(sourceFile, 'utf8');
          for (const requiredText of [
            'Agent 是默认操作入口',
            '取得所需授权后直接执行',
            '不把命令或操作步骤作为默认结果要求用户代为执行',
            '才提供准确的手动操作作为兜底',
            '创建、修改、替换或卸载 Skill 前必须检查相关 `provides`、`requires`',
            '不得绕过已知依赖直接激活',
          ]) {
            if (!coreContent.includes(requiredText)) problems.push(`Buildr Core must include ${JSON.stringify(requiredText)}.`);
          }
        }
        files.push(sourceFile);
      }
    }
    if (!manifest.builtins.rules.some((rule) => rule.id === 'buildr-core' && rule.required === true && rule.target === 'rules/buildr/core.md')) {
      problems.push('builtins.rules must declare required buildr-core at rules/buildr/core.md.');
    }

    const currentSkillIds = new Set(manifest.builtins.skills.map((skill) => skill.id).filter(Boolean));
    const currentSkillTargets = new Set(manifest.builtins.skills.map((skill) => skill.target).filter(Boolean));
    const currentSkillRuntimePaths = new Set(manifest.builtins.skills.map((skill) => skill.runtimePath || skill.id).filter(Boolean));
    const replacementPredecessors = new Set();
    const replacementTargets = new Set();
    const replacementRuntimePaths = new Set();
    for (const skill of manifest.builtins.skills) {
      const label = `builtins.skills.${skill.id || '<missing>'}`;
      for (const [field, entries] of [['provides', skill.provides || []], ['requires', skill.requires || []]]) {
        for (const [index, declaration] of entries.entries()) {
          try {
            validateCapabilityIdentity(declaration.capability, declaration.version, `${label}.${field}[${index}]`);
            if (!contractIds.has(capabilityKey(declaration.capability, declaration.version))) throw new Error(`${label}.${field}[${index}] references undeclared contract`);
            if (field === 'requires' && !['required', 'optional'].includes(declaration.mode)) throw new Error(`${label}.${field}[${index}].mode must be required or optional`);
          } catch (error) {
            problems.push(error.message);
          }
        }
      }
      validateLegacyIntegrities(skill, label);
      if (!skill.id || !skill.path || !skill.target || !skill.description || typeof skill.required !== 'boolean') {
        problems.push(`${label} must include id, path, target, description, and required.`);
        continue;
      }
      if (skill.replaces !== undefined) {
        const replacement = skill.replaces;
        if (!isPlainObject(replacement) || typeof replacement.id !== 'string' || typeof replacement.target !== 'string' || typeof replacement.runtimePath !== 'string') {
          problems.push(`${label}.replaces must include id, target, and runtimePath.`);
        } else {
          if (!/^[A-Za-z0-9._-]+$/.test(replacement.id) || replacement.id === skill.id) problems.push(`${label}.replaces.id must be a distinct valid asset id.`);
          if (!replacement.target.startsWith('skills/buildr/') || path.isAbsolute(replacement.target) || replacement.target.split('/').includes('..') || replacement.target === skill.target) problems.push(`${label}.replaces.target must be a distinct relative skills/buildr/ path.`);
          if (!/^[A-Za-z0-9._-]+$/.test(replacement.runtimePath)) problems.push(`${label}.replaces.runtimePath must be a valid runtime Skill path.`);
          if (currentSkillIds.has(replacement.id)) problems.push(`${label}.replaces.id must not also be a current builtin identity: ${replacement.id}`);
          if (currentSkillTargets.has(replacement.target)) problems.push(`${label}.replaces.target must not also be a current builtin target: ${replacement.target}`);
          if (currentSkillRuntimePaths.has(replacement.runtimePath)) problems.push(`${label}.replaces.runtimePath must not also be a current builtin runtime path: ${replacement.runtimePath}`);
          if (replacementPredecessors.has(replacement.id)) problems.push(`Duplicate builtin Skill replacement predecessor: ${replacement.id}`);
          if (replacementTargets.has(replacement.target)) problems.push(`Duplicate builtin Skill replacement target: ${replacement.target}`);
          if (replacementRuntimePaths.has(replacement.runtimePath)) problems.push(`Duplicate builtin Skill replacement runtime path: ${replacement.runtimePath}`);
          replacementPredecessors.add(replacement.id);
          replacementTargets.add(replacement.target);
          replacementRuntimePaths.add(replacement.runtimePath);
        }
      }
      if (builtinIds.has(`skill:${skill.id}`)) problems.push(`Duplicate builtin skill id: ${skill.id}`);
      builtinIds.add(`skill:${skill.id}`);
      const isOpenSpecUpstreamSkill = skill.component === 'openspec' && skill.id.startsWith('openspec-') && skill.id !== 'openspec-contract-guard';
      const expectedSkillRoot = isOpenSpecUpstreamSkill ? 'skills/openspec/' : 'skills/buildr/';
      if (!skill.target.startsWith(expectedSkillRoot)) {
        problems.push(`${label}.target must be under ${expectedSkillRoot}.`);
      }
      if (!skill.path.startsWith(`${PACKAGE_WORKSPACE_TARGET}/skills/`)) {
        problems.push(`${label}.path must be under ${PACKAGE_WORKSPACE_TARGET}/skills/.`);
      }
      const missingRuntimes = SUPPORTED_AGENT_IDS.filter((runtime) => !skill.runtimes?.includes(runtime));
      if (!Array.isArray(skill.runtimes) || missingRuntimes.length > 0) {
        problems.push(`${label}.runtimes must include all supported adapters: ${SUPPORTED_AGENT_IDS.join(', ')}.`);
      }
      if (path.isAbsolute(skill.path) || skill.path.startsWith('..') || path.isAbsolute(skill.target) || skill.target.startsWith('..')) {
        problems.push(`${label} paths must stay relative.`);
        continue;
      }
      const skillDir = path.resolve(root, skill.path);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!existsFile(skillFile)) {
        problems.push(`${label}.path must contain SKILL.md: ${skill.path}`);
        continue;
      }
      try {
        const metadata = parseSkillFrontmatter(skillFile);
        if (metadata.name !== skill.id) problems.push(`${label}.id must match SKILL.md frontmatter name: ${skill.id} != ${metadata.name}`);
        if (['task-triage', 'task-worktree', 'task-board', 'task-finish'].includes(skill.id) && metadata.description !== skill.description) {
          problems.push(`${label}.description must exactly match SKILL.md frontmatter description.`);
        }
      } catch (error) {
        problems.push(error.message);
      }
      const skillContent = fs.readFileSync(skillFile, 'utf8');
      validateAdapterPublications(skill, skillDir, problems);
      if (skill.id === 'capability-adaptation') {
        for (const requiredText of [
          'Agent 工作能力适配',
          '用户无需知道这些资产名称',
          '判断的是稳定协作边界，不是用户是否说出 capability 名字',
          '先开发候选，再改变当前实现',
          '候选不满足 contract、组合验证失败',
          '在新 binding ready 之前不卸载旧 provider',
          '使用记录的旧 binding 恢复选择',
          '不让产品入口的某项 route blocked 扩大为整个 Buildr Skill blocked',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`capability-adaptation Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if ((skill.provides || []).length > 0 || (skill.requires || []).length > 0) {
          problems.push('capability-adaptation is a management Skill and must not declare provides/requires.');
        }
      }
      if (skill.id === 'task-worktree') {
        for (const requiredText of [
          'description: 用户要求创建、定位、复用、保留或清理 task worktree/change-id/本地任务分支',
          '## 1. 职责边界',
          '## 2. 决策',
          '## 3. 生命周期',
          '## 4. 协作交接',
          '## 5. 授权与停止条件',
          '| `create` |',
          '| `reuse` |',
          '| `none` |',
          '| `blocked` |',
          'Project/Service 规则优先于本表',
          '<workspace-root>/.worktrees/<task-id>',
          '不得静默回退到 `/tmp`',
          'propose 和创建 change artifacts 前',
          '核对已有 artifacts 的 ownership、内容和唯一目标',
          '无法证明时停止删除或覆盖',
          '`buildr worktree create <task-id>',
          '产品入口统一预检 root 与 nested checkouts',
          '部分失败保留现场和 receipt',
          '只跳过 create-time doctor/sync',
          '仍执行 context 和本次动作需要的状态检查',
          '`allowedExecutionRoots`',
          '同一 environment 同时只有一个 owner Agent 写入',
          '不从未合并 task checkout 更新主自举 workspace',
          '<workspace-root>/.worktrees/',
          '发布 environment 在远端 ref 匹配候选',
          '不得据此删除远端分支',
          'environment identity',
          'repository state',
          'lifecycle result',
          '`treeChanged`',
          '不监控普通编辑',
          'selected `buildr.task-verification/v2` provider',
          '删除远端分支、丢弃工作或清理外部资源始终需要当前轮次单独明确授权',
          'required Core workspace-transition invariant',
          '不依赖 `git-ops`',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-worktree Skill must include ${JSON.stringify(requiredText)}.`);
        }
        for (const uniqueText of ['## 1. 职责边界', '## 2. 决策', '## 3. 生命周期', '## 4. 协作交接', '## 5. 授权与停止条件']) {
          const count = skillContent.split(uniqueText).length - 1;
          if (count !== 1) problems.push(`task-worktree Skill must include ${JSON.stringify(uniqueText)} exactly once, found ${count}.`);
        }
        if (skillContent.includes('## Guardrails')) problems.push('task-worktree Skill must integrate guardrails into lifecycle and stop conditions.');
        const body = skillContent.slice(skillContent.indexOf('# Task Worktree Skill'));
        const nonWhitespaceCharacters = body.replace(/\s/g, '').length;
        if (nonWhitespaceCharacters > 3400) problems.push(`task-worktree Skill body must stay concise: ${nonWhitespaceCharacters} non-whitespace characters > 3400.`);
        try {
          const { description = '' } = parseSkillFrontmatter(skillFile);
          const sentenceStops = description.match(/[。！？]/g)?.length || 0;
          if (sentenceStops !== 1) problems.push(`task-worktree Skill description must be one sentence, found ${sentenceStops}.`);
        } catch {
          // Frontmatter errors are reported by the shared validation above.
        }
        for (const forbiddenText of [
          '复用既有 worktree且没有发生 tree 转换时不重复检查',
          '把已有 artifacts 收敛到该唯一位置并清除原工作区重复副本',
          'canonical environment root、receipt、完整 repository set、每仓 checkout/branch/HEAD/clean 状态',
          '改变候选内容时必须返回 `treeChanged: true`，旧 evidence 随即失效',
          '不因 checkout 或 commit hash 改变而机械重复验证',
          '候选 tree 已改变时沿用旧验证结果',
        ]) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-worktree Skill must not own verification decision ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'task-verification') {
        for (const requiredText of [
          '本 Skill 是 `buildr.task-verification/v2` 的默认 provider',
          'Rules/AGENTS',
          'minimal',
          'affected',
          'candidate',
          'requiredAssurance',
          'verifier-reported',
          'wrapper-measured',
          '单调时钟',
          '不得把各检查 `durationMs` 相加推算 `totalDurationMs`',
          'wait、poll 或 resume 同一进程',
          'candidateIdentity',
          'totalDurationMs',
          'timingSource',
          'slowestCheck',
          'failedChecks',
          'skippedChecks',
          'evidenceReference',
          'evidenceRetention',
          'cleanupAfter',
          'cleanupStatus',
          'cleanupReference',
          'operation: inspect | execute | cleanup',
          'taskVerificationExecuteCalls',
          'candidateExecutorCalls',
          '用户无需主动点名本 Skill',
          'task-worktree` 不负责这项清理',
          '完整候选验证尚未执行',
          '不依赖 `task-worktree`、`git-ops`',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-verification Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!skill.provides?.some((entry) => entry.capability === 'buildr.task-verification' && entry.version === 2)) {
          problems.push('task-verification must provide buildr.task-verification/v2.');
        }
        for (const forbiddenText of ['npm run test:candidate` 作为所有项目', '必须使用 Git worktree', 'provider: task-worktree']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-verification Skill must not include ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'git-ops') {
        for (const requiredText of [
          '不执行项目 Candidate 验证',
          '输入与最终 candidate content identity',
          'tree 等价性信号',
          '由 selected task-verification provider 或其 consumer',
          'Workspace tree transition result',
          '`treeChanged` 结果证据',
          '`fetch`、`push` 和普通 `commit`',
          'required Core workspace-transition invariant',
          '本 provider 不拥有或复制该 Buildr 操作手册',
          '默认 push 只面向已集成的目标分支',
          '才可推送任务分支',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`git-ops Skill must include ${JSON.stringify(requiredText)}.`);
        }
        for (const forbiddenText of [
          '改变已验证 tree 时，原验证结果失效',
          '集成前重新运行受影响的验证',
          '复用已有验证结果',
          '不因 checkout、commit hash 或分支名称改变而重复运行相同验证',
        ]) {
          if (skillContent.includes(forbiddenText)) problems.push(`git-ops Skill must not own Candidate verification decision ${JSON.stringify(forbiddenText)}.`);
        }
        for (const routedIntent of ['pull', 'checkout', 'switch', 'reset', 'cherry-pick', 'revert', 'stash']) {
          if (!skill.description.includes(routedIntent)) problems.push(`git-ops builtin description must route ${routedIntent}.`);
        }
        if (skill.description.includes('收尾')) {
          problems.push('git-ops builtin description must not claim the complete task closeout intent.');
        }
        try {
          const metadata = parseSkillFrontmatter(skillFile);
          if (String(metadata.description || '').includes('收尾')) {
            problems.push('git-ops Skill description must not claim the complete task closeout intent.');
          }
          for (const routedIntent of ['pull', 'checkout', 'switch', 'reset', 'cherry-pick', 'revert', 'stash']) {
            if (!String(metadata.description || '').includes(routedIntent)) problems.push(`git-ops Skill description must route ${routedIntent}.`);
          }
        } catch {
          // Frontmatter errors are already reported above.
        }
      }
      if (skill.id === 'task-finish') {
        for (const requiredText of [
          '一次性授权',
          'buildr task finish inspect|advance|resume|renew',
          'fingerprint',
          'effects',
          'evidence',
          '只重跑 blocked/stale 及其下游',
          'Workspace 全局锁',
          'selected providers',
          '<!-- buildr:skill-contributions pre-spec-sync -->',
          '<!-- buildr:skill-contributions post-spec-sync -->',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-finish Skill must include ${JSON.stringify(requiredText)}.`);
        }
        const lineCount = skillContent.trimEnd().split(/\r?\n/).length;
        const characterCount = [...skillContent].length;
        if (lineCount < 30 || lineCount > 50) problems.push(`task-finish Skill must remain thin: expected 30-50 lines, received ${lineCount}.`);
        if (characterCount < 1500 || characterCount > 2500) problems.push(`task-finish Skill must remain thin: expected 1500-2500 Unicode characters, received ${characterCount}.`);
        for (const forbiddenPolicy of ['fast-forward-only', '默认 rebase 到最新目标分支', '不创建 merge commit']) {
          if (skillContent.includes(forbiddenPolicy)) problems.push(`task-finish must not copy Git provider policy: ${forbiddenPolicy}`);
        }
        if (skillContent.includes('buildr openspec')) problems.push('task-finish source must not hard-code OpenSpec contract guard commands; installed Components contribute them at render time.');
      }
      if (skill.id === 'task-asset-review') {
        for (const requiredText of [
          '本 Skill 是 `buildr.task-asset-review/v3` 的默认 provider',
          '探索、设计、诊断、实现或验证',
          'Workspace-local untracked inbox',
          '/.buildr/asset-review/',
          'legacy inbox',
          'root Agent 是单一写者',
          'owner mismatch',
          '原子替换',
          '完整原始对话',
          '完整工具日志',
          '模型隐藏推理',
          '高信息量转折点',
          '核验候选目标源资产',
          '完整覆盖',
          '部分覆盖',
          '存在冲突',
          '尚无资产',
          '`capability-contract`',
          '`product-followup`',
          'Command、Component 和普通 docs 不作为直接候选',
          '重新进入 `task-triage`',
          'asset-maintenance/',
          '不要创建 `asset.yml`',
          '--outcome asset-integrated',
          '--outcome product-absorbed',
          '--outcome no-change',
          'discard',
          'source.task',
          'identity 不同',
          '--completion',
          '`no-observation`',
          '`discarded`',
          '`awaiting-human`',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-asset-review Skill must include ${JSON.stringify(requiredText)}.`);
        }
        for (const companion of [
          'scripts/observation.mjs',
          'templates/observation.md',
          'templates/asset-maintenance-record.md',
        ]) {
          if (!existsFile(path.join(skillDir, companion))) problems.push(`task-asset-review Skill must include ${companion}.`);
        }
        for (const forbiddenText of ['安装 runtime Hook', '启动 daemon', '启动 watcher', '接入事件总线']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-asset-review Skill must not instruct Agents to ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'task-triage') {
        for (const requiredText of ['## 2. 三轴决策', '`code-only`', '`spec-maintenance`', '`change-flow`', '`blocked`', 'Repository set', '`implementation`', '`metadata-only`', '`unknown`', '`buildr.current-knowledge-maintenance/v2`', '`buildr.task-worktree-lifecycle/v2`', '`buildr.task-board-maintenance/v1`', '`maintain`', '`change-required`', 'provider 不 ready', 'selected `buildr.task-verification/v2` provider', '## 4. 输出契约', '<!-- buildr:skill-contributions change-ready -->']) {
          if (!skillContent.includes(requiredText)) problems.push(`task-triage Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (skillContent.includes('buildr openspec')) problems.push('task-triage source must not hard-code OpenSpec contract guard commands; installed Components contribute them at render time.');
      }
      if (skill.id === 'task-board') {
        for (const requiredText of [
          'openspec/knowledge/task-boards/yyyy-MM-dd-<task-id>.html',
          'Agent 单向维护',
          '不是 OpenSpec change 的翻译',
          '任务看板',
          '既有 `task-cockpits/` 页面保持原路径和原内容',
          '`buildr.task-board-maintenance/v1`',
          '`changes` 可以为空',
          'OpenSpec changes 是 `0..N`',
          'status: created | updated | aligned | blocked',
          '`dependencyPool`',
          '首页',
          '推进',
          '方案',
          '技术细节',
          '不猜测百分比',
          '可点击入口',
          'assets/task-board-template.html',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-board Skill must include ${JSON.stringify(requiredText)}.`);
        }
        const templatePath = path.join(skillDir, 'assets', 'task-board-template.html');
        if (!existsFile(templatePath)) {
          problems.push('task-board Skill must include assets/task-board-template.html.');
        } else {
          const templateContent = fs.readFileSync(templatePath, 'utf8');
          for (const requiredText of ['id="board-data"', 'data-tab="overview"', 'data-tab="progress"', 'data-tab="solution"', 'data-tab="technical"', '由 Agent 单向维护 · 页面只读', '"changes"', '"batches"', '"dependencyPool"', '"businessPlan"', '"technicalPlan"', '"details"']) {
            if (!templateContent.includes(requiredText)) problems.push(`task-board template must include ${JSON.stringify(requiredText)}.`);
          }
          if (/https?:\/\//.test(templateContent)) problems.push('task-board template must not depend on external HTTP resources.');
        }
      }
      if (skill.id === 'openspec-contract-guard') {
        for (const requiredText of ['openspec validate <change> --strict', 'buildr openspec converge', 'passed|blocked|recovery-unprovable', 'archive --skip-specs', '不重复实现这些解析或 archive 安全规则', '不修改外部 `openspec-*` Skills']) {
          if (!skillContent.includes(requiredText)) problems.push(`openspec-contract-guard Skill must include ${JSON.stringify(requiredText)}.`);
        }
      }
      if (skill.id.startsWith('openspec-') && skill.id !== 'openspec-contract-guard' && skillContent.includes('buildr openspec')) {
        problems.push(`${label} must not embed Buildr contract guard commands; the sidebar Skill owns that workflow.`);
      }
      if (isOpenSpecUpstreamSkill && skill.target.startsWith('skills/buildr/')) problems.push(`${label} must preserve upstream ownership outside skills/buildr/.`);
      files.push(...collectFiles(skillDir));
    }
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-finish' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-finish.');
    }
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-verification' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-verification.');
    }
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-board' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-board.');
    }
    if (manifest.builtins.skills.some((skill) => skill.id.includes('openspec-store'))) {
      problems.push('OpenSpec Stores are beta and must not be registered as a Buildr builtin Skill.');
    }
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-asset-review' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-asset-review.');
    }

    for (const command of manifest.builtins.commands) {
      validateLegacyIntegrities(command, `builtins.commands.${command.id || '<missing>'}`);
      if (!command.id || typeof command.required !== 'boolean' || !isPlainObject(command.manifestEntry)) {
        problems.push(`builtins.commands entries must include id, required, and manifestEntry.`);
      }
    }

    const canonicalProjectAgentsPath = path.resolve(root, '../..', 'AGENTS.md');
    const productAgentsPath = existsFile(canonicalProjectAgentsPath)
      ? canonicalProjectAgentsPath
      : workspaceRoot
        ? path.join(workspaceRoot, 'projects', 'product', 'AGENTS.md')
        : path.join(root, 'AGENTS.md');
    if (existsFile(productAgentsPath)) {
      const productAgents = fs.readFileSync(productAgentsPath, 'utf8');
      files.push(productAgentsPath);
      for (const requiredText of [
        '合并前候选验证使用临时 workspace 或 task worktree 自身',
        '最终候选 Git tree',
        '不在主开发分支重复 E2E',
        '候选 tree 改变时',
        '单任务最小反馈、任务组受影响范围验证、最终候选完整验证',
        '不得在每个普通任务后运行产品总验证或临时 workspace E2E',
        '继续等待同一进程，不重复启动相同命令',
        '修复循环优先重跑失败项和受影响检查',
        'selected `buildr.task-verification/v2` provider',
        '测量验证自身 wall-clock 并向用户报告',
        '不作为相同 tree 后续 Git 动作的重复产品验证门禁',
        '使用 `task-finish` 编排',
        '不授权 force push、merge commit、远端任务分支删除',
        'Buildr 功能默认由 Agent 操作',
        '取得所需授权后直接执行',
        '不得把命令或操作步骤作为默认交付结果要求用户代为执行',
        '才提供准确的手动操作作为兜底',
      ]) {
        if (!productAgents.includes(requiredText)) problems.push(`Product AGENTS.md must include ${JSON.stringify(requiredText)}.`);
      }
    }

    const baselineSkillsManifest = path.join(packageWorkspaceTargetRoot(), 'skills', 'manifest.yml');
    if (existsFile(baselineSkillsManifest)) {
      try {
        const baselineSkills = readSkillManifest(baselineSkillsManifest);
        validateSkillManifestEntries(baselineSkills, baselineSkillsManifest);
        for (const id of ['task-triage', 'task-worktree', 'task-board', 'task-finish']) {
          const packaged = manifest.builtins.skills.find((entry) => entry.id === id);
          const baseline = baselineSkills.find((entry) => entry.id === id);
          if (packaged && baseline?.description !== packaged.description) {
            problems.push(`Workspace skills baseline ${id} description must exactly match package manifest.`);
          }
        }
        const taskFinish = baselineSkills.find((entry) => entry.id === 'task-finish');
        if (!taskFinish || taskFinish.source !== 'buildr' || taskFinish.state !== 'installed' || taskFinish.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-finish.');
        }
        const taskVerification = baselineSkills.find((entry) => entry.id === 'task-verification');
        if (!taskVerification || taskVerification.source !== 'buildr' || taskVerification.state !== 'installed' || taskVerification.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-verification.');
        }
        const taskBoard = baselineSkills.find((entry) => entry.id === 'task-board');
        if (!taskBoard || taskBoard.source !== 'buildr' || taskBoard.state !== 'installed' || taskBoard.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-board.');
        }
        const taskAssetReview = baselineSkills.find((entry) => entry.id === 'task-asset-review');
        if (!taskAssetReview || taskAssetReview.source !== 'buildr' || taskAssetReview.state !== 'installed' || taskAssetReview.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-asset-review.');
        }
        const gitOps = baselineSkills.find((entry) => entry.id === 'git-ops');
        for (const routedIntent of ['pull', 'checkout', 'switch', 'reset', 'cherry-pick', 'revert', 'stash']) {
          if (!gitOps?.description?.includes(routedIntent)) problems.push(`Workspace git-ops description must route ${routedIntent}.`);
        }
        for (const skill of baselineSkills.filter((entry) => entry.source !== undefined)) {
          if (typeof skill.source === 'string' && !isManifestSourceLabel(skill.source)) {
            const parsed = parseSkillSourceRef(skill.source);
            if (parsed.type === 'package' && !skillSourceIds.has(parsed.id)) {
              problems.push(`Workspace skills baseline references unknown package skillSource: ${skill.source}`);
            }
          }
        }
      } catch (error) {
        problems.push(error.message);
      }
    }

    const baselineProjectsRegistry = path.join(packageWorkspaceTargetRoot(), 'projects', 'manifest.yml');
    if (existsFile(baselineProjectsRegistry)) {
      try {
        const registry = parseProjectsYaml(fs.readFileSync(baselineProjectsRegistry, 'utf8'));
        const errors = validateProjectsRegistry(registry);
        if (errors.length > 0) {
          problems.push(`Workspace projects/manifest.yml baseline is invalid:\n- ${errors.join('\n- ')}`);
        }
      } catch (error) {
        problems.push(`Workspace projects/manifest.yml baseline is invalid: ${error.message}`);
      }
    }
  }

  function validatePackageAssets(context) {
    const { root, workspaceRoot, manifestPath, manifest, allowedVariables, files, problems } = context;
    const bootstrapContract = validateBootstrapContract(root, files, problems);
    if (workspaceRoot) {
      validateWorkspaceSkillsBaseline(workspaceRoot, problems);
      validateWorkspaceRulesBaseline(workspaceRoot, problems);
    }

    for (const file of [...new Set(files)]) {
      const relativeFile = toPosixRelative(root, file);
      const content = fs.readFileSync(file, 'utf8');
      if (path.basename(file) === '.gitkeep') {
        problems.push(`Package assets must not use .gitkeep placeholders: ${relativeFile}`);
      }

      const contentForForbiddenScan = path.resolve(file) === manifestPath
        ? content.replace(/\nforbiddenPatterns:\n(?:\s+-\s+.+\n?)*/m, '\nforbiddenPatterns:\n')
        : content;

      for (const pattern of manifest.forbiddenPatterns) {
        if (pattern && contentForForbiddenScan.includes(pattern)) {
          problems.push(`Forbidden pattern ${JSON.stringify(pattern)} found in ${relativeFile}`);
        }
      }

      for (const match of content.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
        if (!allowedVariables.has(match[1])) {
          problems.push(`Template variable ${match[1]} is not declared in manifest: ${relativeFile}`);
        }
      }
    }
    return bootstrapContract;
  }

  function validatePackageStatic(context) {
    validatePackageMetadata(context);
    validateMappedEntries(context);
    validatePackageComponents(context);
    const skillSourceIds = validatePackageSkills(context);
    validatePackageBuiltins(context, skillSourceIds);
    const bootstrapContract = validatePackageAssets(context);
    return { bootstrapContract, parseJsonOutput };
  }

  return {
    validateWorkspaceSkillsBaseline,
    validateWorkspaceRulesBaseline,
    validatePackageStatic,
  };
}
