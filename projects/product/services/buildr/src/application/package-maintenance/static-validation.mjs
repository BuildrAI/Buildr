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
    const sqliteMigrations = [
      'src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'src/infrastructure/sqlite/migrations/0001_create_task_store.sql',
      'src/infrastructure/sqlite/migrations/0002_create_parent_task_relations.sql',
      'src/infrastructure/sqlite/migrations/0003_inline_parent_task_column.sql',
    ];
    for (const relative of sqliteMigrations) {
      const file = path.join(root, relative);
      if (!existsFile(file)) problems.push(`Workspace SQLite migration asset is missing: ${relative}`);
      else if (!fs.readFileSync(file, 'utf8').trim()) problems.push(`Workspace SQLite migration asset is empty: ${relative}`);
    }
    const migrationDirectory = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations');
    if (existsDirectory(migrationDirectory)) {
      const names = fs.readdirSync(migrationDirectory).sort();
      if (JSON.stringify(names) !== JSON.stringify(sqliteMigrations.map((relative) => path.basename(relative)))) {
        problems.push(`Workspace SQLite migrations must be the contiguous reviewed set: ${names.join(', ') || '<none>'}.`);
      }
    }
    const parentColumnMigration = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations', '0003_inline_parent_task_column.sql');
    if (existsFile(parentColumnMigration)) {
      const sql = fs.readFileSync(parentColumnMigration, 'utf8');
      for (const required of ['ADD COLUMN parent_task_id', 'DROP TABLE task_parent_relations', 'CREATE INDEX tasks_parent_task_idx ON tasks(parent_task_id, task_id)']) {
        if (!sql.includes(required)) problems.push(`Workspace SQLite parent column migration must include: ${required}`);
      }
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

  function validateTaskEnvironmentAuthorityResidue(context) {
    const { root, problems } = context;
    const allowedLegacyFiles = new Set([
      path.join(root, 'src', 'application', 'task-environment', 'legacy-migration.mjs'),
      path.join(root, 'src', 'application', 'package-maintenance', 'static-validation.mjs'),
      path.join(root, 'package', 'manifest.yml'),
    ].map((file) => path.resolve(file)));
    const forbidden = [
      'buildr.task-worktree-lifecycle',
      'buildr.task-environment-receipt/v1',
      'buildr.task-environment-adoption',
      'buildr.task-environment-context',
      'buildr.worktree-create/',
      'buildr.worktree-cleanup/',
      'resolveTaskEnvironmentContext',
      'createTaskWorktree',
      'adoptTaskEnvironment',
      'taskEnvironmentContext',
      'worktree context',
      'worktree adopt',
      'executionReady',
    ];
    for (const directory of ['bin', 'src', 'package', 'docs'].map((relative) => path.join(root, relative)).filter(existsDirectory)) {
      for (const file of collectFiles(directory)) {
        if (allowedLegacyFiles.has(path.resolve(file))) continue;
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of forbidden) {
          if (content.includes(pattern)) problems.push(`Legacy Task Environment authority residue ${JSON.stringify(pattern)} found in ${toPosixRelative(root, file)}.`);
        }
      }
    }
    for (const relative of [
      'src/application/worktree/worktree-application.mjs',
      'package/targets/workspace/skills/contracts/buildr/task-worktree-lifecycle/v2.md',
    ]) {
      if (existsFile(path.join(root, relative))) problems.push(`Legacy Task Environment authority file must be removed: ${relative}`);
    }
  }

  function validateTaskReviewAuthority(context) {
    const { root, manifest, problems } = context;
    const taskReviewContracts = (manifest.capabilityContracts || []).filter((entry) => entry.id === 'buildr.task-review' && entry.version === 1);
    if (taskReviewContracts.length !== 1) problems.push('Package must declare exactly one buildr.task-review@1 capability contract.');
    for (const contract of manifest.capabilityContracts || []) {
      if (contract.id !== 'buildr.task-review' && /(?:planning|completion)[.-]review|task-review-(?:planning|completion)/i.test(contract.id || '')) {
        problems.push(`Task Review must not declare a type-specific capability: ${contract.id}.`);
      }
    }
    for (const skill of manifest.builtins?.skills || []) {
      if (skill.id !== 'task-review' && /(?:planning|completion)[.-]review|task-review-(?:planning|completion)/i.test(skill.id || '')) {
        problems.push(`Task Review must not declare a type-specific provider: ${skill.id}.`);
      }
    }

    const writerCallers = [];
    const sourceRoot = path.join(root, 'src');
    if (existsDirectory(sourceRoot)) {
      for (const file of collectFiles(sourceRoot)) {
        if (!/\.(?:mjs|js)$/.test(file)) continue;
        if (path.resolve(file) === path.resolve(root, 'src/application/package-maintenance/static-validation.mjs')) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('.writeTaskReviewResultPersistence(')) writerCallers.push(toPosixRelative(root, file));
      }
    }
    if (JSON.stringify(writerCallers) !== JSON.stringify(['src/application/task-review/task-review-application.mjs'])) {
      problems.push(`Task Review Result writer must have exactly one Application caller: ${writerCallers.join(', ') || '<none>'}.`);
    }

    for (const relative of [
      'src/domain/task-record/task-record.mjs',
      'src/application/task-record/task-record-application.mjs',
      'src/infrastructure/sqlite/task-record-repository.mjs',
      'src/domain/task-environment/task-environment.mjs',
      'src/application/task-environment/task-environment-application.mjs',
      'src/infrastructure/filesystem/task-environment-repository.mjs',
    ]) {
      const file = path.join(root, relative);
      if (!existsFile(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of ['TaskReviewResult', 'taskReview', 'reviewType', 'reviews/planning.yml', 'reviews/completion.yml']) {
        if (content.includes(pattern)) problems.push(`${relative} must not own Task Review field ${JSON.stringify(pattern)}.`);
      }
    }

    const cli = path.join(root, 'src', 'interfaces', 'cli', 'task-review.mjs');
    if (!existsFile(cli)) problems.push('Task Review CLI adapter is missing.');
    else {
      const content = fs.readFileSync(cli, 'utf8');
      for (const pattern of ['node:fs', "from 'yaml'", 'YAML.parse', 'YAML.stringify', 'writeFileSync', 'renameSync']) {
        if (content.includes(pattern)) problems.push(`Task Review CLI must not bypass the shared Application with ${JSON.stringify(pattern)}.`);
      }
    }

    const localServer = path.join(root, 'src', 'interfaces', 'local-app', 'http', 'server.mjs');
    if (!existsFile(localServer)) problems.push('Task Review Local App interface is missing.');
    else {
      const content = fs.readFileSync(localServer, 'utf8');
      for (const required of ['runtime.inspectTaskReview(root, taskReviewsMatch[1])', "suffix === '/prompts/task-review'", 'runtime.generateTaskReviewPrompt(root, input)']) {
        if (!content.includes(required)) problems.push(`Task Review Local App interface must include ${JSON.stringify(required)}.`);
      }
      if (content.includes('runtime.recordTaskReview(')) problems.push('Local App must not expose a direct Task Review Result writer.');
    }

    const changeDetail = path.join(root, 'src', 'interfaces', 'local-app', 'web', 'features', 'change-detail.js');
    if (existsFile(changeDetail)) {
      const content = fs.readFileSync(changeDetail, 'utf8');
      if (!content.includes("openAgentAction('task-review', { taskId, reviewType: 'planning', projectCode, change: change.code })")) problems.push('Task-scoped Change review must route to Planning Task Review.');
      if (!content.includes("openAgentAction('change', { projectCode, ref: changeRef, action: 'review' })")) problems.push('Global retained Change review route must remain available.');
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
            '使用 `task-environment` 按 Task ID 准备完整 repository set',
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
            '重新运行 Task Environment `prepare`',
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
          'buildr.git-operations/v1',
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
          '解析 `buildr.git-operations/v1`',
          '不自动 stash、reset、rebase、merge、覆盖，也不继续 sync',
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
          ['package/bootstrap/guide.md', ['解析 `buildr.git-operations/v1` binding', '提供明确 workspace、upstream 和 update operation', '不自动 stash、reset、rebase、merge、覆盖，也不继续 sync', '不重复询问 sync', '非 Git workspace 跳过 Git provider', '不是 `buildr sync` 的隐式 Git 行为']],
          ['docs/cli-reference.md', ['解析 `buildr.git-operations/v1` binding', '提供明确 workspace、upstream 和 update operation', 'Agent 不自动 stash、reset、rebase、merge 或覆盖', '不重复询问 sync', '非 Git workspace 直接 sync', '不隐式执行 Git 更新']],
          ['src/infrastructure/runtime/skills/render-plan.mjs', ['解析 `buildr.git-operations/v1` selected provider', '提供明确 workspace、upstream 和 update operation', '非 Git workspace 直接运行 sync']],
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
    const retirementIds = new Set();
    for (const [contractIndex, contract] of (manifest.capabilityContracts || []).entries()) {
      for (const [index, retirement] of (contract.replaces || []).entries()) {
        const label = `capabilityContracts[${contractIndex}].replaces[${index}]`;
        try {
          validateCapabilityIdentity(retirement.id, retirement.version, label);
          const key = capabilityKey(retirement.id, retirement.version);
          if (contractIds.has(key)) throw new Error(`${label} cannot retire a currently declared contract: ${key}`);
          if (retirementIds.has(key)) throw new Error(`Duplicate package capability retirement: ${key}`);
          if (!retirement.target?.startsWith('skills/contracts/') || !retirement.description || !retirement.provider || !/^sha256-[a-f0-9]{64}$/.test(retirement.integrity || '')) throw new Error(`${label} must include a safe target, description, provider, and SHA-256 integrity`);
          retirementIds.add(key);
        } catch (error) {
          problems.push(error.message);
        }
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
        if (['task-triage', 'task-manager', 'task-review', 'task-environment', 'task-worktree', 'task-board', 'task-finish'].includes(skill.id) && metadata.description !== skill.description) {
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
      if (skill.id === 'task-environment') {
        for (const requiredText of [
          '本 Skill 是 `buildr.task-environment/v1` 的默认 provider',
          'buildr task environment prepare <task-id>',
          'buildr task environment inspect <task-id>',
          'buildr task environment cleanup <task-id>',
          '`prepare` 同时承担首次准备和幂等恢复',
          'Environment Receipt 独占 Runtime、CLI、依赖、projection、动态资源、ready、恢复和总 cleanup',
          '真实 Agent session 是否采用候选 runtime 属于 Task Verification',
          '不要从 cwd、分支、同一 HEAD 或旧 worktree receipt 猜 ownership',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-environment Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!skill.provides?.some((entry) => entry.capability === 'buildr.task-environment' && entry.version === 1)) {
          problems.push('task-environment must provide buildr.task-environment@1.');
        }
        for (const forbiddenText of ['resource register', 'resource release', 'worktree context', 'worktree adopt', 'Task Record 中保存']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-environment Skill must not expose ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'task-worktree') {
        for (const requiredText of [
          '本 Skill 是 `buildr.git-worktree-provider/v1` 的默认 provider',
          'buildr worktree create <task-id>',
          'buildr worktree inspect <task-id>',
          'buildr worktree cleanup <task-id>',
          '<workspace-root>/.worktrees/<task-id>',
          '只包含 repository selector',
          '只保留 Git provider evidence',
          '不判断 Task 是否 ready',
          '不准备 Runtime、CLI、依赖或 projection',
          '不记录 Agent session',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-worktree Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!skill.provides?.some((entry) => entry.capability === 'buildr.git-worktree-provider' && entry.version === 1)) {
          problems.push('task-worktree must provide buildr.git-worktree-provider@1.');
        }
        try {
          const { description = '' } = parseSkillFrontmatter(skillFile);
          const sentenceStops = description.match(/[。！？]/g)?.length || 0;
          if (sentenceStops !== 1) problems.push(`task-worktree Skill description must be one sentence, found ${sentenceStops}.`);
        } catch {
          // Frontmatter errors are reported by the shared validation above.
        }
        for (const forbiddenText of ['executionReady', 'runtime projection identity 与 Workspace Node', 'worktree adopt', 'Environment Receipt 的默认 provider']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-worktree Skill must not own Environment authority ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'task-manager') {
        for (const requiredText of [
          '本 Skill 是 `buildr.task-record/v1` 的默认 provider',
          '不是全局任务 dispatcher',
          '不要仅因用户说“任务”就触发',
          '不读取 environment receipt',
          '不从 worktree 推断 retained root',
          'Local App 是调用同一 Task Record Application 的独立人类客户端',
          '不直接读写Workspace SQLite或旧 `.buildr/tasks/<task-id>/task.yml`',
          '不自动 commit、push、publication、Finish 或 cleanup',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-manager Skill must include ${JSON.stringify(requiredText)}.`);
        }
        for (const forbiddenText of ['buildr worktree create', 'buildr verification run', 'buildr task finish run', 'git commit', 'git push']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-manager Skill must not execute professional action ${JSON.stringify(forbiddenText)}.`);
        }
        const provided = (skill.provides || []).some((item) => item.capability === 'buildr.task-record' && item.version === 1);
        if (!provided) problems.push('task-manager must provide buildr.task-record@1.');
        try {
          const { description = '' } = parseSkillFrontmatter(skillFile);
          const sentenceStops = description.match(/[。！？]/g)?.length || 0;
          if (sentenceStops !== 1) problems.push(`task-manager Skill description must be one sentence, found ${sentenceStops}.`);
        } catch {
          // Shared frontmatter validation reports the original error.
        }
        for (const relative of ['src/interfaces/local-app/web/features/tasks.js', 'src/interfaces/local-app/web/features/task-detail.js']) {
          const webFile = path.join(root, relative);
          if (!existsFile(webFile)) {
            problems.push(`Task Manager Local App asset is missing: ${relative}.`);
            continue;
          }
          const content = fs.readFileSync(webFile, 'utf8');
          for (const forbiddenText of ['node:fs', "from 'yaml'", 'YAML.parse', 'YAML.stringify', '.buildr/tasks/']) {
            if (content.includes(forbiddenText)) problems.push(`${relative} must not copy Task Record filesystem/YAML logic: ${forbiddenText}.`);
          }
        }
      }
      if (skill.id === 'task-review') {
        for (const requiredText of [
          '本 Skill 是 `buildr.task-review/v1` 的默认 provider',
          '用一个参数化能力完成 Planning Review 或 Completion Review',
          'buildr task review inspect <task-id>',
          'buildr task review record <task-id>',
          '动态执行语义审查',
          '不要把 OpenSpec artifacts、代码目录、测试命令或 checklist 固定为每个 Task 的必选范围',
          '同一 Agent 自审使用 `self`',
          '没有明确 Candidate identity 就停止',
          '中断时不要调用 record',
          '不生成总 receipt',
          '不取代 `task-asset-review`',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-review Skill must include ${JSON.stringify(requiredText)}.`);
        }
        const provided = (skill.provides || []).some((item) => item.capability === 'buildr.task-review' && item.version === 1);
        if (!provided) problems.push('task-review must provide buildr.task-review@1.');
        for (const forbiddenText of ['buildr verification run', 'buildr task finish run', 'git commit', 'git push', 'revision:']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-review Skill must not execute or persist ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'project-testing') {
        for (const requiredText of [
          'references/testing-model-v1.md',
          '没有 Result、Receipt、Application、provider contract',
          'Development、Acceptance、Static Conformance、Delivery / Release',
          'Static、Unit、Component、Integration、System',
          'Quick、affected/full、Candidate/Release 不是同一层级',
          '`System` 不等于 Acceptance',
          '`focus` 只用于失败诊断',
          'primaryEvidenceOwner',
          '最低充分边界',
          '不写 `verification.yml`',
          '交给 `task-verification`',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`project-testing Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if ((skill.provides || []).length > 0 || (skill.requires || []).length > 0) {
          problems.push('project-testing must not provide or require a capability contract.');
        }
        for (const forbiddenText of ['buildr task verification record', 'buildr verification run --project', 'schemaVersion: buildr.task-verification']) {
          if (skillContent.includes(forbiddenText)) problems.push(`project-testing Skill must not include ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'task-verification') {
        for (const requiredText of [
          '本 Skill 是 `buildr.task-verification/v3` 的默认 provider',
          'references/project-verification-v2.md',
          'buildr.project-verification/v2',
          'buildr task verification inspect <task-id>',
          'buildr task verification record <task-id>',
          'buildr verification run --project <code>',
          'buildr.verification-execution/v1',
          'coverage gap',
          '不自动创建测试、脚本、CI 或框架',
          'Task Verification Application',
          '原子替换',
          '中断',
          '不得覆盖原 current',
          'target identity',
          'declaration identities',
          '`current`',
          '`stale`',
          '`unknown`',
          '不要复制 stdout/stderr、耗时、临时 evidence path、Environment Receipt',
          '不要把测试通过等同于业务验收、风险接受、开发完成、Task 完成',
          '不启动重复 verifier',
          '不相加并行检查耗时',
          'buildr verification cleanup --summary <file>',
          '不用于设计测试框架、开发测试、生成 Candidate 或 Finish',
          '入口命名、成本或分层不合理时报告测试建设 gap',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-verification Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!skill.provides?.some((entry) => entry.capability === 'buildr.task-verification' && entry.version === 3)) {
          problems.push('task-verification must provide buildr.task-verification/v3.');
        }
        for (const forbiddenText of ['buildr.task-verification/v2', 'buildr.project-verification/v1', 'buildr.verification-run/v1', 'requiredAssurance:', 'mode: augment', 'mode: authoritative', 'provider: task-worktree']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-verification Skill must not include ${JSON.stringify(forbiddenText)}.`);
        }
      }
      if (skill.id === 'git-operations') {
        for (const requiredText of [
          '`commit`：只创建或安全 amend local commit，不 push',
          '`push`：只发布已有 commit，不把 dirty 自动 commit',
          '`commit+push`：caller 依次执行一次 commit 和一次 push',
          '禁止使用 `git add -A`',
          '保留全部无关 dirty',
          '完整 commit range',
          'scope 外 unpublished commit',
          '普通 push 被拒绝时停止',
          'push 或其他共享会冻结 commit',
          'local history 已改变、remote 未改变',
          '不创建 Git Operations Receipt',
          '不自动 stash、reset、rebase、merge、force push',
          'required Core workspace-transition invariant',
          '不判断 Review 或 Verification 是否仍有效',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`git-operations Skill must include ${JSON.stringify(requiredText)}.`);
        }
        for (const forbiddenText of [
          '改变已验证 tree 时，原验证结果失效',
          '集成前重新运行受影响的验证',
          '复用已有验证结果',
          '不因 checkout、commit hash 或分支名称改变而重复运行相同验证',
          '默认 rebase 到最新目标分支',
        ]) {
          if (skillContent.includes(forbiddenText)) problems.push(`git-operations Skill must not own workflow or Candidate decision ${JSON.stringify(forbiddenText)}.`);
        }
        if (!skill.provides?.some((entry) => entry.capability === 'buildr.git-operations' && entry.version === 1) || skill.provides.length !== 1) {
          problems.push('git-operations must provide only buildr.git-operations/v1.');
        }
        for (const broadIntent of ['pull', 'checkout', 'switch', 'reset', 'cherry-pick', 'revert', 'stash', '删除分支']) {
          if (skill.description.includes(broadIntent)) problems.push(`git-operations builtin description must not pre-expand ${broadIntent}.`);
        }
        try {
          const metadata = parseSkillFrontmatter(skillFile);
          if (String(metadata.description || '') !== skill.description) {
            problems.push('git-operations Skill frontmatter description must exactly match package manifest.');
          }
          for (const broadIntent of ['pull', 'checkout', 'switch', 'reset', 'cherry-pick', 'revert', 'stash', '删除分支']) {
            if (String(metadata.description || '').includes(broadIntent)) problems.push(`git-operations Skill description must not pre-expand ${broadIntent}.`);
          }
        } catch {
          // Frontmatter errors are already reported above.
        }
      }
      if (skill.id === 'task-metadata-publication') {
        for (const requiredText of [
          '`buildr.task-metadata-publication/v1`',
          'required消费selected `buildr.git-operations/v1`',
          'Task Record的SQLite数据',
          '.buildr/tasks/<task-id>/development.yml',
          '.buildr/tasks/<task-id>/verification.yml',
          '.buildr/tasks/<task-id>/reviews/planning.yml',
          '.buildr/tasks/<task-id>/reviews/completion.yml',
          '不得扫描Task目录',
          '不写Receipt/history',
          '只有`verified`才可push',
          '完整range',
          'local history已改变、remote未改变',
          '不新增公共CLI/Application',
          '不恢复`git-workspace-update`、`git-task-integration`、`git-single-operation`',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-metadata-publication Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (skill.provides?.length !== 1 || !skill.provides.some((entry) => entry.capability === 'buildr.task-metadata-publication' && entry.version === 1)) {
          problems.push('task-metadata-publication must provide only buildr.task-metadata-publication/v1.');
        }
        if (skill.requires?.length !== 1 || !skill.requires.some((entry) => entry.capability === 'buildr.git-operations' && entry.version === 1 && entry.mode === 'required')) {
          problems.push('task-metadata-publication must require only buildr.git-operations/v1 in required mode.');
        }
        const helper = path.join(skillDir, 'scripts', 'publication.mjs');
        if (!existsFile(helper)) {
          problems.push('task-metadata-publication must include scripts/publication.mjs.');
        } else {
          const helperContent = fs.readFileSync(helper, 'utf8');
          for (const declaration of [
            ['buildr.task-development/v2', '.buildr/tasks/<task-id>/development.yml'],
            ['buildr.task-verification/v3', '.buildr/tasks/<task-id>/verification.yml'],
            ['buildr.task-review/v1', '.buildr/tasks/<task-id>/reviews/planning.yml'],
            ['buildr.task-review/v1', '.buildr/tasks/<task-id>/reviews/completion.yml'],
          ]) {
            if (!declaration.every((text) => helperContent.includes(text))) problems.push(`task-metadata-publication helper must declare ${declaration.join(' -> ')}.`);
          }
          for (const forbiddenMutation of ["['add'", "['commit'", "['push'", "['reset'", "['rebase'", "['merge'"]) {
            if (helperContent.includes(forbiddenMutation)) problems.push(`task-metadata-publication helper must remain Git read-only: ${forbiddenMutation}`);
          }
        }
        try {
          const metadata = parseSkillFrontmatter(skillFile);
          if (String(metadata.description || '') !== skill.description) problems.push('task-metadata-publication Skill frontmatter description must exactly match package manifest.');
        } catch {
          // Frontmatter errors are already reported above.
        }
      }
      if (skill.id === 'task-finish') {
        for (const requiredText of [
          'buildr.task-finish/v1',
          'current formal Development handoff',
          'preflight → prepare → verify → deliver → cleanup',
          'nextWorkflow: task-development',
          '交付适配（Delivery Adaptation）',
          'deterministic-reuse',
          'agent-reviewed-delivery-adaptation',
          '不得手写token',
          'agentProviderCompletions = 0',
          'formalVerificationExecutions = 0',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-finish Skill must include ${JSON.stringify(requiredText)}.`);
        }
        const lineCount = skillContent.trimEnd().split(/\r?\n/).length;
        const characterCount = [...skillContent].length;
        if (lineCount < 40 || lineCount > 80) problems.push(`task-finish Skill must remain thin: expected 40-80 lines, received ${lineCount}.`);
        if (characterCount < 1500 || characterCount > 4000) problems.push(`task-finish Skill must remain thin: expected 1500-4000 Unicode characters, received ${characterCount}.`);
        for (const forbiddenPolicy of ['fast-forward-only', '默认 rebase 到最新目标分支', '不创建 merge commit']) {
          if (skillContent.includes(forbiddenPolicy)) problems.push(`task-finish must not copy Git provider policy: ${forbiddenPolicy}`);
        }
        for (const forbiddenAuthority of ['current Verification Result', 'requiredForDelivery', 'formalVerificationExecutions <= 1']) {
          if (skillContent.includes(forbiddenAuthority)) problems.push(`task-finish must not retain Verification authority: ${forbiddenAuthority}`);
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
        for (const requiredText of ['## 2. 三轴决策', '`code-only`', '`spec-maintenance`', '`change-flow`', '`blocked`', 'Repository set', '`implementation`', '`metadata-only`', '`unknown`', '`buildr.task-record/v1`', '首次持久交付写入前', '`buildr.current-knowledge-maintenance/v2`', '`buildr.task-environment/v1`', '`buildr.task-board-maintenance/v1`', '`maintain`', '`change-required`', 'provider 不 ready', 'selected `buildr.task-development/v2` provider', 'selected `buildr.task-verification/v3` provider', '不预设 minimal/affected/candidate 层级', '## 4. 输出契约', '<!-- buildr:skill-contributions change-ready -->']) {
          if (!skillContent.includes(requiredText)) problems.push(`task-triage Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!(skill.requires || []).some((item) => item.capability === 'buildr.task-record' && item.version === 1 && item.mode === 'optional')) problems.push('task-triage must optionally require buildr.task-record@1.');
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
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-environment' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-environment.');
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
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-review' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-review.');
    }
    if (!manifest.builtins.skills.some((skill) => skill.id === 'task-metadata-publication' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-metadata-publication.');
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
        '冻结明确 target identity',
        '相同内容集成、push 和 worktree 清理不改变 target 时可以复用',
        'tree 或 declaration bytes 发生任何变化后 Result 直接派生为 stale',
        '按当前目标选择直接相关的已有 capability',
        '`requiredForDelivery`',
        '不得在每个普通任务后运行产品总验证或临时 workspace E2E',
        '继续等待同一进程，不重复启动相同命令',
        '修复循环优先重跑失败项和受影响检查',
        'selected `buildr.task-verification/v3` provider',
        'Task-scoped current Result',
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
        for (const id of ['task-triage', 'task-manager', 'task-worktree', 'task-board', 'task-finish', 'git-operations', 'task-metadata-publication']) {
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
        const taskManager = baselineSkills.find((entry) => entry.id === 'task-manager');
        if (!taskManager || taskManager.source !== 'buildr' || taskManager.state !== 'installed' || taskManager.enabled !== true || !(taskManager.provides || []).some((item) => item.capability === 'buildr.task-record' && item.version === 1)) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-manager providing buildr.task-record@1.');
        }
        const taskReview = baselineSkills.find((entry) => entry.id === 'task-review');
        if (!taskReview || taskReview.source !== 'buildr' || taskReview.state !== 'installed' || taskReview.enabled !== true || !(taskReview.provides || []).some((item) => item.capability === 'buildr.task-review' && item.version === 1)) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-review providing buildr.task-review@1.');
        }
        const taskAssetReview = baselineSkills.find((entry) => entry.id === 'task-asset-review');
        if (!taskAssetReview || taskAssetReview.source !== 'buildr' || taskAssetReview.state !== 'installed' || taskAssetReview.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-asset-review.');
        }
        const gitOperations = baselineSkills.find((entry) => entry.id === 'git-operations');
        if (!gitOperations || gitOperations.source !== 'buildr' || gitOperations.state !== 'installed' || gitOperations.enabled !== true || !(gitOperations.provides || []).some((item) => item.capability === 'buildr.git-operations' && item.version === 1)) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr git-operations providing buildr.git-operations@1.');
        }
        const taskMetadataPublication = baselineSkills.find((entry) => entry.id === 'task-metadata-publication');
        if (!taskMetadataPublication || taskMetadataPublication.source !== 'buildr' || taskMetadataPublication.state !== 'installed' || taskMetadataPublication.enabled !== true || !(taskMetadataPublication.provides || []).some((item) => item.capability === 'buildr.task-metadata-publication' && item.version === 1) || !(taskMetadataPublication.requires || []).some((item) => item.capability === 'buildr.git-operations' && item.version === 1 && item.mode === 'required')) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-metadata-publication providing buildr.task-metadata-publication@1 and requiring buildr.git-operations@1.');
        }
        if (baselineSkills.some((entry) => entry.id === 'git-ops')) {
          problems.push('Workspace skills baseline must not retain legacy git-ops entry.');
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
    validateTaskEnvironmentAuthorityResidue(context);
    validateTaskReviewAuthority(context);
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
    parseJsonOutput,
  };
}
