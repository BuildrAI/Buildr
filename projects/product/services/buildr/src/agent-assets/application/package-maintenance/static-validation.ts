import { capabilityKey, parseCapabilityContract, validateCapabilityIdentity } from '../../infrastructure/runtime/skills/manifests.ts';

// Validate the advertised command contract, not prose or placeholder spelling.
export function validateTaskRecordSkillCommands(content: any): any  {
  const problems: any[] = [];
  for (const action of ['create', 'inspect', 'update', 'activate', 'complete', 'abandon']) {
    if (!new RegExp(`\\bbuildr\\s+task\\s+${action}\\b`).test(content)) {
      problems.push(`task-manager Skill must document "buildr task ${action}".`);
    }
  }
  for (const action of ['update', 'activate', 'complete', 'abandon']) {
    if (!new RegExp(`\\bbuildr\\s+task\\s+${action}\\b[^\\n]*--expected-record`).test(content)) {
      problems.push(`task-manager Skill must document --expected-record on "buildr task ${action}".`);
    }
  }
  return problems;
}

export function createPackageStaticValidator(deps: any): any  {
  const {
    GENERATED_USER_REGISTRY_RESOURCE_SOURCES,
    LEGACY_PACKAGE_PATHS,
    PACKAGE_RUNTIME_TARGET,
    RESOURCE_WORKSPACE_ROOT,
    SUPPORTED_AGENT_IDS,
    collectFiles,
    builtinRuleEntry,
    builtinSkillEntry,
    componentMemberPaths,
    existsDirectory,
    existsFile,
    fs,
    isManifestSourceLabel,
    isPlainObject,
    normalizeRelativePathForBuildr,
    packageComponentDefinition,
    packageComponentSourcePath,
    resourceWorkspaceRoot,
    parseCommandsManifestYaml,
    parseManifestFileEntry,
    parseProjectsYaml,
    parseRulesManifestYaml,
    parseSkillFrontmatter,
    parseSkillSourceRef,
    path,
    readPackageManifest,
    readSkillManifest,
    sourcePathFromBuiltin,
    toPosixRelative,
    validateBootstrapContract,
    validateCommandsManifest,
    validatePackageComponentMembers,
    validateProjectsRegistry,
    validateSkillManifestEntries,
    getRuntimeAdapter,
    validateSkillPublication,
  } = deps;

  function validateAdapterPublications(skill: any, skillDir: any, problems: any): any  {
    for (const runtime of skill.runtimes || []) {
      try {
        const adapter = getRuntimeAdapter(runtime);
        problems.push(...validateSkillPublication(adapter, { skillId: skill.id, skillDir }));
      } catch (error: any) {
        problems.push(error.message);
      }
    }
  }

  function validateWorkspaceSkillsBaseline(root: any, problems: any): any  {
    const workspaceSkillsRoot = path.join(root, 'skills');
    const workspaceManifest = path.join(workspaceSkillsRoot, 'manifest.yml');
    const manifest = readPackageManifest();
    const packageSkillSourceIds: any = new Set(manifest.skillSources.map((source: any) => source.id));

    if (!existsFile(workspaceManifest)) return;

    const workspaceSkills: any = new Map(readSkillManifest(workspaceManifest).map((skill: any) => [skill.id, skill]));
    for (const builtin of manifest.builtins.skills.filter((skill: any) => !skill.component)) {
      const baselineSkill = builtinSkillEntry(builtin);
      if (!baselineSkill.id || (baselineSkill.path === undefined && baselineSkill.source === undefined && baselineSkill.resolved === undefined)) {
        problems.push('Package builtin Skill entries must produce id and path, source, or resolved.');
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
        } catch (error: any) {
          problems.push(error.message);
        }
        continue;
      }

      const baselineSkillFile = path.join(sourcePathFromBuiltin(builtin), 'SKILL.md');
      const workspaceSkillFile = path.join(workspaceSkillsRoot, workspaceSkill.path, 'SKILL.md');
      if (!existsFile(baselineSkillFile)) {
        problems.push(`Package builtin Skill SKILL.md does not exist: ${builtin.path}/SKILL.md`);
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

  function validateWorkspaceRulesBaseline(root: any, problems: any): any  {
    const baselinePairs: any[] = [
      ['AGENTS.md', 'AGENTS.md'],
    ];

    for (const [rootRelative, packageRelative] of baselinePairs) {
      const rootFile = path.join(root, rootRelative);
      const packageFile = path.join(resourceWorkspaceRoot(), packageRelative);
      if (existsFile(rootFile) && existsFile(packageFile)) {
        const rootContent = fs.readFileSync(rootFile, 'utf8');
        const packageContent = fs.readFileSync(packageFile, 'utf8');
        const block = (content: any) => content.match(/<!-- buildr:required begin -->[\s\S]*?<!-- buildr:required end -->/)?.[0];
        if (!block(rootContent) || block(rootContent) !== block(packageContent)) {
          problems.push(`Root ${rootRelative} differs from ${RESOURCE_WORKSPACE_ROOT}/${packageRelative}.`);
        }
      }
    }

    const rulesManifestFile = path.join(root, 'rules', 'manifest.yml');
    if (existsFile(rulesManifestFile)) {
      const rootRules = parseRulesManifestYaml(fs.readFileSync(rulesManifestFile, 'utf8')).rules || [];
      for (const builtin of readPackageManifest().builtins.rules.filter((rule: any) => !rule.component)) {
        const desired = builtinRuleEntry(builtin);
        const actual = rootRules.find((rule: any) => rule.id === desired.id);
        if (!actual) {
          problems.push(`Workspace rules baseline ${desired.id} is missing from root rules/manifest.yml.`);
          continue;
        }
        if (JSON.stringify(actual) !== JSON.stringify(desired)) {
          problems.push(`Workspace rules baseline ${desired.id} differs from the package builtin declaration.`);
        }
      }
    }

    for (const legacyRule of ['rules/AGENTS.workspace.md', 'rules/AGENTS.project.md']) {
      if (existsFile(path.join(root, legacyRule))) {
        problems.push(`Legacy workspace rule source must not remain in root: ${legacyRule}`);
      }
    }
  }

  function validatePackageMetadata(context: any): any  {
    const { root, problems } = context;
    const packageMetadataPath = path.join(root, 'package.json');
    if (!existsFile(packageMetadataPath)) {
      problems.push('Public npm package metadata is missing: package.json');
    } else {
      let packageMetadata;
      try { packageMetadata = JSON.parse(fs.readFileSync(packageMetadataPath, 'utf8')); } catch (error: any) { problems.push(`package.json is invalid JSON: ${error.message}`); }
      if (packageMetadata) {
        if (packageMetadata.name !== '@buildr-ai/buildr') problems.push('package.json must declare the official @buildr-ai/buildr package identity.');
        if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(packageMetadata.version || '') || packageMetadata.version === '0.0.0') problems.push('package.json must declare a non-placeholder semantic version.');
        if (packageMetadata.private === true) problems.push('package.json must not block public packaging with private: true.');
        if (packageMetadata.license !== 'MIT') problems.push('package.json must declare the MIT license.');
        if (packageMetadata.repository?.url !== 'git+https://github.com/BuildrAI/Buildr.git' || packageMetadata.repository?.directory !== 'projects/product/services/buildr') problems.push('package.json repository must identify the canonical GitHub Buildr Service directory.');
        if (packageMetadata.homepage !== 'https://github.com/BuildrAI/Buildr#readme') problems.push('package.json homepage must identify the canonical GitHub README.');
        if (packageMetadata.bugs?.url !== 'https://github.com/BuildrAI/Buildr/issues') problems.push('package.json bugs URL must identify canonical GitHub Issues.');
        if (packageMetadata.publishConfig?.access !== 'public') problems.push('package.json publishConfig.access must be public.');
        for (const keyword of ['agent', 'agentic-coding', 'cli', 'developer-tools', 'workspace']) {
          if (!packageMetadata.keywords?.includes(keyword)) problems.push(`package.json keywords must include ${keyword}.`);
        }
        const packagedFiles: any = new Set(packageMetadata.files || []);
        for (const required of [
          'LICENSE',
          'bin/buildr.mjs',
          'src/',
          'docs/cli-reference.md',
          'docs/cli-architecture.md',
          'docs/known-limitations.md',
          'docs/bootstrap-guide.md',
          'docs/resources.md',
          'resources/',
          'web-dist/',
          'package/targets/runtime/',
        ]) {
          if (!packagedFiles.has(required)) problems.push(`package.json files must include ${required}.`);
        }
        if (packagedFiles.has('package/')) problems.push('package.json files must not publish package/ wholesale because it contains development-only Launcher assets.');
        for (const forbiddenPrefix of ['test/', 'scripts/', 'tools/']) {
          if ([...packagedFiles].some((entry: any) => entry === forbiddenPrefix || entry.startsWith(forbiddenPrefix))) {
            problems.push(`package.json files must not publish checkout-only path: ${forbiddenPrefix}.`);
          }
        }
      }
    }
    for (const required of ['LICENSE', 'docs/cli-reference.md', 'docs/cli-architecture.md', 'docs/known-limitations.md']) {
      if (!fs.existsSync(path.join(root, required))) problems.push(`Open-source product baseline is missing: ${required}`);
    }
    const migrationDirectory = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations');
    if (existsDirectory(migrationDirectory)) {
      const names = fs.readdirSync(migrationDirectory).sort();
      for (const [index, name] of names.entries()) {
        const match = name.match(/^(\d{4})_[a-z0-9_]+\.sql$/u);
        if (!match || Number(match[1]) !== index) problems.push(`Workspace SQLite migrations must be contiguous from 0000: ${names.join(', ') || '<none>'}.`);
        const file = path.join(migrationDirectory, name);
        if (!existsFile(file) || !fs.readFileSync(file, 'utf8').trim()) problems.push(`Workspace SQLite migration asset is missing or empty: ${name}`);
      }
      for (const historical of ['0000_create_migration_ledger.sql', '0006_create_task_lifecycle_current.sql', '0008_create_task_environment_current.sql', '0009_retire_task_lifecycle_current.sql']) {
        if (!names.includes(historical)) problems.push(`Workspace SQLite migration history is missing: ${historical}`);
      }
    }
    const parentColumnMigration = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations', '0003_inline_parent_task_column.sql');
    if (existsFile(parentColumnMigration)) {
      const sql = fs.readFileSync(parentColumnMigration, 'utf8');
      for (const required of ['ADD COLUMN parent_task_id', 'DROP TABLE task_parent_relations', 'CREATE INDEX tasks_parent_task_idx ON tasks(parent_task_id, task_id)']) {
        if (!sql.includes(required)) problems.push(`Workspace SQLite parent column migration must include: ${required}`);
      }
    }
    const taskCurrentMigration = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations', '0004_create_task_current_records.sql');
    if (existsFile(taskCurrentMigration)) {
      const sql = fs.readFileSync(taskCurrentMigration, 'utf8');
      for (const required of ['CREATE TABLE task_verification_current', 'CREATE TABLE task_review_current', 'REFERENCES tasks(task_id) ON DELETE CASCADE', "review_type IN ('planning', 'completion')", 'PRIMARY KEY (task_id, review_type)']) {
        if (!sql.includes(required)) problems.push(`Workspace SQLite Task current-record migration must include: ${required}`);
      }
      for (const forbidden of ['history', 'event_log', 'revision', 'lease', 'scheduler', 'sync_state']) {
        if (sql.includes(forbidden)) problems.push(`Workspace SQLite Task current-record migration must stay current-only: ${forbidden}`);
      }
    }
    const taskWorkflowRetirementMigration = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations', '0028_drop_task_development_and_finish_current.sql');
    if (!existsFile(taskWorkflowRetirementMigration)) problems.push('Workspace SQLite Task workflow retirement migration is missing.');
    else {
      const sql = fs.readFileSync(taskWorkflowRetirementMigration, 'utf8');
      for (const required of ['DROP TABLE task_development_current', 'DROP TABLE task_finish_current']) {
        if (!sql.includes(required)) problems.push(`Workspace SQLite Task workflow retirement migration must include: ${required}`);
      }
      for (const forbidden of ['history', 'backup', 'CREATE TABLE']) {
        if (sql.includes(forbidden)) problems.push(`Workspace SQLite Task workflow retirement migration must not preserve duplicate data: ${forbidden}`);
      }
    }
    const taskEnvironmentRetirementMigration = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations', '0029_drop_task_environment_current.sql');
    if (!existsFile(taskEnvironmentRetirementMigration)) problems.push('Workspace SQLite Task Environment retirement migration is missing.');
    else {
      const sql = fs.readFileSync(taskEnvironmentRetirementMigration, 'utf8');
      for (const required of ['DROP INDEX IF EXISTS task_environment_current_status_idx', 'DROP TABLE IF EXISTS task_environment_current']) {
        if (!sql.includes(required)) problems.push(`Workspace SQLite Task Environment retirement migration must include: ${required}`);
      }
      for (const forbidden of ['history', 'backup', 'CREATE TABLE', 'INSERT INTO']) {
        if (sql.includes(forbidden)) problems.push(`Workspace SQLite Task Environment retirement migration must delete without preserving data: ${forbidden}`);
      }
    }
    const taskRecordFinalizationMigration = path.join(root, 'src', 'infrastructure', 'sqlite', 'migrations', '0031_finalize_task_record.sql');
    if (!existsFile(taskRecordFinalizationMigration)) problems.push('Workspace SQLite Task Record finalization migration is missing.');
    else {
      const sql = fs.readFileSync(taskRecordFinalizationMigration, 'utf8');
      for (const required of ['ALTER TABLE tasks RENAME TO tasks_v3', 'DROP TABLE terminal_contribution_reconciliations', 'DROP TABLE tasks_v3']) {
        if (!sql.includes(required)) problems.push(`Workspace SQLite Task Record finalization migration must include: ${required}`);
      }
      for (const forbidden of ['schema_version TEXT', 'result_no_change INTEGER', 'CREATE TABLE terminal_contribution_reconciliations']) {
        if (sql.includes(forbidden)) problems.push(`Workspace SQLite Task Record finalization migration must remove retired state: ${forbidden}`);
      }
    }
    for (const legacyRepository of ['task-verification-repository.mjs', 'task-review-repository.ts']) {
      if (existsFile(path.join(root, 'src', 'infrastructure', 'filesystem', legacyRepository))) problems.push(`Task current-record filesystem repository must not remain: ${legacyRepository}`);
    }
    for (const required of ['test/verification/onboarding/repository.mjs', 'test/verification/onboarding/init.mjs', 'test/verification/onboarding/service-branch.mjs', 'test/verification/network/remote-text.mjs', 'test/verification/cli/architecture.mjs', 'test/verification/cli/compatibility.mjs', 'test/verification/cli/package-parity.mjs', 'test/verification/release/open-source-candidate.mjs', 'tools/release/release-contract.mjs']) {
      if (!existsFile(path.join(root, required))) problems.push(`Development checkout verification is missing: ${required}`);
    }

    for (const legacyPath of LEGACY_PACKAGE_PATHS) {
      if (fs.existsSync(path.join(root, legacyPath))) {
        problems.push(`Legacy package path must not remain: ${legacyPath}`);
      }
    }
  }

  function validateTaskEnvironmentAuthorityResidue(context: any): any  {
    const { root, problems } = context;
    for (const relative of [
      'src/task/domain/task-environment.mjs',
      'src/task/domain/task-environment-plan.mjs',
      'src/task/persistence/task-environment-repository.mjs',
      'src/task/interfaces/cli/task-environment.mjs',
      'resources/workspace/skills/buildr/task-environment/SKILL.md',
      'resources/workspace/skills/contracts/buildr/task-environment/v1.md',
      'resources/workspace/skills/contracts/buildr/task-worktree-lifecycle/v2.md',
    ]) {
      if (existsFile(path.join(root, relative))) problems.push(`Retired Task Environment file must be removed: ${relative}`);
    }
    const publicJson = fs.readFileSync(path.join(root, 'src/infrastructure/contracts/public-json.ts'), 'utf8');
    for (const forbidden of ['taskEnvironmentResult', 'taskEnvironmentPlanResult']) if (publicJson.includes(forbidden)) problems.push(`Public JSON registry must remove Task Environment schema: ${forbidden}`);
    const taskModule = fs.readFileSync(path.join(root, 'src/task/module.ts'), 'utf8');
    for (const forbidden of ['TASK_ENVIRONMENT_', 'createTaskEnvironmentModule', 'task environment prepare']) if (taskModule.includes(forbidden)) problems.push(`Task module must remove Task Environment surface: ${forbidden}`);
  }

  function validateTaskLifecycleRetirement(context: any): any  {
    const { root, problems } = context;
    for (const relative of [
      'src/infrastructure/sqlite/task-lifecycle-repository.mjs',
      'src/application/task-lifecycle-read-model/task-lifecycle-read-model-application.mjs',
      'src/task/application/task-overview-application.ts',
      'src/task/persistence/task-overview-repository.ts',
    ]) {
      if (existsFile(path.join(root, relative))) problems.push(`Retired Task Lifecycle runtime path must not remain: ${relative}`);
    }
    for (const relative of ['src/task/module.ts', 'src/task/interfaces/http/task-lifecycle-core.ts', 'src/task/interfaces/http/task-professional-http-contracts.ts', '../buildr-web/src/api/task-professional.ts']) {
      const file = path.join(root, relative);
      if (existsFile(file) && /task-overview|inspectTaskOverview|\/overview/.test(fs.readFileSync(file, 'utf8'))) problems.push(`Retired Task Overview surface remains in ${relative}.`);
    }
    for (const relative of [
      'src/bootstrap/runtime.mjs',
      'src/task/application/task-review-application.ts',
      'src/task/application/task-verification-application.ts',
      'src/task/application/task-environment-application.mjs',
      'src/task/application/task-record-application.ts',
      'src/task/application/finish/task-finish-product-executor.mjs',
      'src/task/application/task-terminal-delivery-application.ts',
    ]) {
      const file = path.join(root, relative);
      if (!existsFile(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const forbidden of ['registerTaskLifecycleRepository', 'registerTaskLifecycleReadModelApplication', 'readTaskLifecyclePersistence', 'updateTaskLifecyclePersistence', 'inspectTaskLifecycleReadModel', 'projectTaskLifecycle', 'projectTaskRecord', 'projectTaskDevelopment', 'projectTaskReview', 'projectTaskVerification', 'projectTaskEnvironment', 'projectTaskFinish', 'refreshTaskLifecycleReadModelRuntime']) {
        if (content.includes(forbidden)) problems.push(`Retired Task Lifecycle symbol ${forbidden} remains in ${relative}.`);
      }
    }
  }

  function validateTaskCurrentContractResidue(context: any): any  {
    const { root, problems } = context;
    const productRoot = path.resolve(root, '../..');
    const activeChangesRoot = path.join(productRoot, 'openspec', 'changes');
    const activeChangeDirectories = existsDirectory(activeChangesRoot)
      ? fs.readdirSync(activeChangesRoot, { withFileTypes: true }).filter((entry: any) => entry.isDirectory() && entry.name !== 'archive').map((entry: any) => entry.name)
      : [];
    const capabilityHasActiveDelta = (capability: any) => activeChangeDirectories.some((change: any) => existsFile(path.join(activeChangesRoot, change, 'specs', capability, 'spec.md')));
    const currentRoots: any[] = [
      path.join(productRoot, 'openspec', 'specs'),
      path.join(productRoot, 'openspec', 'knowledge'),
      path.join(productRoot, 'docs'),
    ];
    const positiveResidues: any[] = [
      ['CREATE TABLE task_execution_records', 'Task Execution Record schema creation'],
      ['buildr task execution-record', 'Task Execution Record CLI'],
      ['Task internal workflow catalog/router 位于', 'Task internal workflow router'],
      ['Task专属Environment Plan', 'Task Environment Plan'],
      ['task environment cleanup', 'Task Environment cleanup'],
      ['task-terminal-delivery-application.mjs', 'retired terminal delivery implementation'],
      ['task-environment-application.mjs', 'retired Task Environment implementation'],
      ['task-record-repository.mjs', 'stale Task Record implementation path'],
      ['parent-coordination-application.mjs', 'stale Parent Coordination implementation path'],
      ['buildr.task-verification/v3', 'retired Task Verification v3 contract'],
      ['buildr.project-verification/v3', 'retired Project Verification v3 declaration'],
      ['Execution Record reconciliation', 'retired Execution Record reconciliation'],
    ];
    for (const currentRoot of currentRoots) {
      if (!existsDirectory(currentRoot)) continue;
      for (const file of collectFiles(currentRoot)) {
        const relative = toPosixRelative(productRoot, file);
        if (!/\.md$/u.test(relative) || relative.startsWith('docs/archive/')) continue;
        const capability = relative.match(/^openspec\/specs\/([^/]+)\/spec\.md$/u)?.[1] || null;
        if (capability && capabilityHasActiveDelta(capability)) continue;
        const content = fs.readFileSync(file, 'utf8');
        for (const [pattern, label] of positiveResidues) {
          if (content.includes(pattern)) problems.push(`Current Task contract must not require ${label}: ${relative}`);
        }
      }
    }

    const taskSource = path.join(root, 'src', 'task');
    for (const file of collectFiles(taskSource)) {
      if (!file.endsWith('.ts')) continue;
      const relative = toPosixRelative(root, file);
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('@ts-nocheck')) problems.push(`Current Task TypeScript must not disable checking: ${relative}`);
      if (/\bany\b/u.test(content)) problems.push(`Current Task TypeScript public boundary must not use any: ${relative}`);
    }

    const ownershipFiles: any[] = [path.join(root, 'test', 'verification'), path.resolve(productRoot, 'verification.yml')];
    const staleTaskPath = /src\/task\/(?:module|(?:domain|application|persistence|interfaces\/cli|interfaces\/http)\/(?:task-record|task-review|task-verification|parent-coordination)(?:-[a-z-]+)?)\.mjs/gu;
    for (const entry of ownershipFiles) {
      const files = existsDirectory(entry) ? collectFiles(entry) : existsFile(entry) ? [entry] : [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const matches = [...content.matchAll(staleTaskPath)].map((match: any) => match[0]);
        for (const match of matches) problems.push(`Task verification ownership must use the current TypeScript path ${match.replace(/\.mjs$/u, '.ts')}: ${toPosixRelative(productRoot, file)}`);
      }
    }
  }

  function validateTaskVerificationPromptRetirement(context: any): any  {
    const { root, problems } = context;
    const files: any[] = [
      'src/task/application/task-verification-application.ts',
      'src/task/interfaces/http/task-lifecycle-core.ts',
      'src/task/interfaces/http/task-professional-http-contracts.ts',
      'src/task/interfaces/http/task-professional-http-mapping.ts',
      'src/task/module.ts',
      '../buildr-web/src/api/task-professional.ts',
      '../buildr-web/src/api/generated/task-professional-http-dto.ts',
    ];
    for (const relative of files) {
      const file = path.join(root, relative);
      if (!existsFile(file)) { problems.push(`Task Verification prompt retirement asset is missing: ${relative}.`); continue; }
      const content = fs.readFileSync(file, 'utf8');
      for (const forbidden of ['generateTaskVerificationPrompt', 'task-verification.prompt', '/prompts/task-verification', 'mapTaskVerificationPromptRequest', 'VerificationPromptRequest', 'VerificationPromptResponse']) {
        if (content.includes(forbidden)) problems.push(`${relative} must not retain Task Verification prompt symbol ${JSON.stringify(forbidden)}.`);
      }
    }
  }

  function validateTaskReviewAuthority(context: any): any  {
    const { root, manifest, problems } = context;
    const taskReviewContracts = (manifest.capabilityContracts || []).filter((entry: any) => entry.id === 'buildr.task-review' && entry.version === 2);
    if (taskReviewContracts.length !== 1) problems.push('Package must declare exactly one buildr.task-review@2 capability contract.');
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

    const writerCallers: any[] = [];
    const sourceRoot = path.join(root, 'src');
    if (existsDirectory(sourceRoot)) {
      for (const file of collectFiles(sourceRoot)) {
        if (!/\.(?:mjs|js|ts)$/.test(file)) continue;
        if (path.resolve(file) === path.resolve(root, 'src/agent-assets/application/package-maintenance/static-validation.ts')) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('.writeTaskReviewResultPersistence(')) writerCallers.push(toPosixRelative(root, file));
      }
    }
    if (JSON.stringify(writerCallers) !== JSON.stringify(['src/task/application/task-review-application.ts'])) {
      problems.push(`Task Review Result writer must have exactly one Application caller: ${writerCallers.join(', ') || '<none>'}.`);
    }

    for (const relative of [
      'src/task/domain/task-record.ts',
      'src/task/application/task-record-application.ts',
      'src/task/persistence/task-record-repository.ts',
      'src/task/domain/task-environment.mjs',
      'src/task/application/task-environment-application.mjs',
      'src/task/persistence/task-environment-repository.mjs',
    ]) {
      const file = path.join(root, relative);
      if (!existsFile(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of ['TaskReviewResult', 'taskReview', 'reviewType', 'reviews/planning.yml', 'reviews/completion.yml']) {
        if (content.includes(pattern)) problems.push(`${relative} must not own Task Review field ${JSON.stringify(pattern)}.`);
      }
    }

    const cli = path.join(root, 'src', 'task', 'interfaces', 'cli', 'task-review.ts');
    if (!existsFile(cli)) problems.push('Task Review CLI adapter is missing.');
    else {
      const content = fs.readFileSync(cli, 'utf8');
      for (const pattern of ['node:fs', "from 'yaml'", 'YAML.parse', 'YAML.stringify', 'writeFileSync', 'renameSync']) {
        if (content.includes(pattern)) problems.push(`Task Review CLI must not bypass the shared Application with ${JSON.stringify(pattern)}.`);
      }
    }

    const localServer = path.join(root, 'src', 'web', 'http', 'router.mjs');
    if (!existsFile(localServer)) problems.push('Task Review Buildr Web interface is missing.');
    else {
      const content = fs.readFileSync(localServer, 'utf8');
      const readWorker = path.join(root, 'src', 'web', 'http', 'read-worker.mjs');
      const readWorkerContent = existsFile(readWorker) ? fs.readFileSync(readWorker, 'utf8') : '';
      const taskReviewHttp = path.join(root, 'src', 'task', 'interfaces', 'http', 'task-review-http.ts');
      const taskReviewHttpContent = existsFile(taskReviewHttp) ? fs.readFileSync(taskReviewHttp, 'utf8') : '';
      const taskModule = path.join(root, 'src', 'task', 'module.ts');
      const taskModuleContent = existsFile(taskModule) ? fs.readFileSync(taskModule, 'utf8') : '';
      for (const [owner, required] of [
        [taskReviewHttpContent, "submitTaskRead('reviews', reviews[1])"],
        [readWorkerContent, "reviews: 'inspectTaskReview'"],
        [content, 'for (const contribution of httpContributions)'],
        [taskModuleContent, "id: 'task-review.http'"],
      ]) {
        if (!owner.includes(required)) problems.push(`Task Review Buildr Web interface must include ${JSON.stringify(required)}.`);
      }
      for (const forbidden of ['/prompts/task-review', 'generateTaskReviewPrompt']) if (taskReviewHttpContent.includes(forbidden)) problems.push(`Task Review HTTP must not include ${JSON.stringify(forbidden)}.`);
      if (content.includes('runtime.recordTaskReview(')) problems.push('Buildr Web must not expose a direct Task Review Result writer.');
    }

    const changeDetail = path.join(root, 'src', 'interfaces', 'local-app', 'web', 'features', 'change-detail.js');
    if (existsFile(changeDetail)) {
      const content = fs.readFileSync(changeDetail, 'utf8');
      if (content.includes('openAgentAction(')) problems.push('Task-scoped Change must remain read-only and must not expose Agent actions.');
    }
  }

  function parseJsonOutput(label: any, output: any): any  {
    try {
      return JSON.parse(output);
    } catch (error: any) {
      const match = error.message.match(/position (\d+)/);
      const position = match ? Number(match[1]) : 0;
      const excerpt = output.slice(Math.max(0, position - 240), position + 240);
      throw new Error(`${label} returned invalid JSON: ${error.message}\n${excerpt}`);
    }
  }

  function validateMappedEntries(context: any): any  {
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
        } catch (error: any) {
          problems.push(error.message);
          continue;
        }
        mappedEntries.push(entry);
        if (GENERATED_USER_REGISTRY_RESOURCE_SOURCES.includes(entry.source)) {
          problems.push(`Package manifest must not map generated user registry source: ${entry.raw}`);
        }
        if (LEGACY_PACKAGE_PATHS.some((legacyPath: any) => entry.source === legacyPath || entry.source.startsWith(`${legacyPath}/`))) {
          problems.push(`Package manifest must not reference legacy package source: ${entry.raw}`);
        }
        if (!entry.source.startsWith(`${RESOURCE_WORKSPACE_ROOT}/`)) {
          problems.push(`Package manifest ${section} source must be under ${RESOURCE_WORKSPACE_ROOT}/: ${entry.raw}`);
        }
        if (entry.source.includes('AGENTS.private')) {
          problems.push(`Package manifest must not publish private business rule: ${entry.raw}`);
        }
        if (entry.source.includes('package/workspace-rules/') || entry.source.includes('package/workspace-skills/') || entry.source.includes('package/baseline/')) {
          problems.push(`Package manifest must use ${RESOURCE_WORKSPACE_ROOT}/ as the source for workspace baseline assets: ${entry.raw}`);
        }
        if (entry.source.startsWith('rules/')) {
          problems.push(`Package manifest must use ${RESOURCE_WORKSPACE_ROOT}/rules/ as the source for published rule modules: ${entry.raw}`);
        }
        if (entry.target.startsWith('rules/') && !entry.source.startsWith(`${RESOURCE_WORKSPACE_ROOT}/rules/`)) {
          problems.push(`Package manifest rule targets must source from ${RESOURCE_WORKSPACE_ROOT}/rules/: ${entry.raw}`);
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

  function validatePackageComponents(context: any): any  {
    const { root, manifest, files, problems, mappedEntries } = context;
    const componentIds: any = new Set();
    const componentOwnedWorkspaceFiles: any = new Set();
    const componentMemberOwners: any = new Map();
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
      const exactComponentPath = entry.path.startsWith(`${RESOURCE_WORKSPACE_ROOT}${expectedSuffix}`)
        && componentPathParts.at(-1) === 'component.yml'
        && componentPathParts.at(-2) === entry.id
        && componentPathParts.length === RESOURCE_WORKSPACE_ROOT.split('/').length + 4;
      if (!exactComponentPath || path.isAbsolute(entry.path) || entry.path.startsWith('..')) {
        problems.push(`${label}.path must be ${RESOURCE_WORKSPACE_ROOT}/components/<source>/${entry.id}/component.yml.`);
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
            '先取得正式Task Record并核对实际工作位置',
            '当前Workspace直接工作',
            '需要隔离时显式创建并检查matching Worktree',
            '`openspec new change`、`task update --add-change`',
            'Application不额外保存规划快照',
          ]) {
            if (!content.includes(requiredText)) problems.push(`OpenSpec propose sidebar must include ${JSON.stringify(requiredText)}.`);
          }
          const updateSidebar = packageComponentSourcePath('components/buildr/openspec/contributions/openspec-update-sidebar.md');
          const updateContent = fs.readFileSync(updateSidebar, 'utf8');
          for (const requiredText of [
            '只修订既有planning artifacts',
            '不授予实现、同步或归档权限',
            '纯规划修订直接使用当前Change现场',
            '必要时创建matching Worktree',
            '`openspec-apply-change`',
          ]) {
            if (!updateContent.includes(requiredText)) problems.push(`OpenSpec update sidebar must include ${JSON.stringify(requiredText)}.`);
          }
          const members: any = new Set(componentMemberPaths(record.definition));
          if (!members.has('skills/openspec/openspec-update-change')) problems.push('OpenSpec Component must include the upstream update workflow Skill.');
          const fragments = record.definition.contributions?.skillFragments || [];
          if (fragments.some((item: any) => item.startsWith('task-triage#change-ready='))) problems.push('OpenSpec Component must attach apply-ready gates to openspec-apply-change, not task-triage.');
          for (const target of ['openspec-apply-change@prepend=', 'openspec-sync-specs@prepend=', 'openspec-archive-change@prepend=']) {
            if (!fragments.some((item: any) => item.startsWith(target))) problems.push(`OpenSpec Component must declare ${target} contribution.`);
          }
          for (const legacySidebar of ['openspec-explore-sidebar.md', 'openspec-sync-sidebar.md', 'openspec-archive-sidebar.md']) {
            if ([...(record.definition.members.skillContributions || [])].some((member: any) => member.endsWith(legacySidebar))) {
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
      } catch (error: any) {
        problems.push(`${label} is invalid: ${error.message}`);
      }
    }

    const mappedSources: any = new Set(mappedEntries.map((entry: any) => entry.source));
    for (const entry of mappedEntries) {
      for (const member of componentMemberOwners.keys()) {
        if (entry.target === member || entry.target.startsWith(`${member}/`)) {
          problems.push(`Component member must not also be installed through workspaceFiles: ${entry.raw}`);
        }
      }
    }
    const workspaceSourceRoot = resourceWorkspaceRoot();
    for (const workspaceFile of collectFiles(workspaceSourceRoot)) {
      const relativeFile = toPosixRelative(root, workspaceFile);
      if (!mappedSources.has(relativeFile) && !componentOwnedWorkspaceFiles.has(relativeFile)) {
        problems.push(`Package workspace source file must be explicitly mapped in resources/manifest.yml: ${relativeFile}`);
      }
    }
  }

  function validatePackageSkills(context: any): any  {
    const { root, manifest, files, problems } = context;
    const agentSkillIds: any = new Set();
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
          'Doctor 的 full detail',
          '`capabilities` graph',
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
          ['docs/bootstrap-guide.md', ['解析 `buildr.git-operations/v1` binding', '提供明确 workspace、upstream 和 update operation', '不自动 stash、reset、rebase、merge、覆盖，也不继续 sync', '不重复询问 sync', '非 Git workspace 跳过 Git provider', '不是 `buildr sync` 的隐式 Git 行为']],
          ['docs/cli-reference.md', ['解析 `buildr.git-operations/v1` binding', '提供明确 workspace、upstream 和 update operation', 'Agent 不自动 stash、reset、rebase、merge 或覆盖', '不重复询问 sync', '非 Git workspace 直接 sync', '不隐式执行 Git 更新']],
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

    const skillSourceIds: any = new Set();
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
        } catch (error: any) {
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
      } catch (error: any) {
        problems.push(error.message);
      }
      files.push(...collectFiles(skillDir));
    }
    return skillSourceIds;
  }

  function validatePackageBuiltins(context: any, skillSourceIds: any): any  {
    const { root, workspaceRoot, manifest, files, problems } = context;
    const builtinIds: any = new Set();
    const contractIds: any = new Set();
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
      } catch (error: any) {
        problems.push(error.message);
      }
    }
    const retirementIds: any = new Set();
    for (const [contractIndex, contract] of (manifest.capabilityContracts || []).entries()) {
      for (const [index, retirement] of (contract.replaces || []).entries()) {
        const label = `capabilityContracts[${contractIndex}].replaces[${index}]`;
        try {
          validateCapabilityIdentity(retirement.id, retirement.version, label);
          const key = capabilityKey(retirement.id, retirement.version);
          if (contractIds.has(key)) throw new Error(`${label} cannot retire a currently declared contract: ${key}`);
          if (retirementIds.has(key)) throw new Error(`Duplicate package capability retirement: ${key}`);
          if (!retirement.target?.startsWith('skills/contracts/') || !retirement.description || !retirement.provider || !/^sha256-[a-f0-9]{64}$/.test(retirement.integrity || '')) throw new Error(`${label} must include a safe target, description, provider, and SHA-256 integrity`);
          if (retirement.legacyIntegrities !== undefined) {
            if (!Array.isArray(retirement.legacyIntegrities)) throw new Error(`${label}.legacyIntegrities must be an array.`);
            const seen: any = new Set([retirement.integrity]);
            for (const integrity of retirement.legacyIntegrities) {
              if (!/^sha256-[a-f0-9]{64}$/.test(integrity || '')) throw new Error(`${label}.legacyIntegrities contains an invalid SHA-256 integrity.`);
              if (seen.has(integrity)) throw new Error(`${label}.legacyIntegrities contains a duplicate integrity: ${integrity}`);
              seen.add(integrity);
            }
          }
          retirementIds.add(key);
        } catch (error: any) {
          problems.push(error.message);
        }
      }
    }
    const bindingIds: any = new Set();
    for (const [index, binding] of (manifest.initialSkillBindings || []).entries()) {
      const label = `initialSkillBindings[${index}]`;
      try {
        validateCapabilityIdentity(binding.capability, binding.version, label);
        const key = capabilityKey(binding.capability, binding.version);
        if (!contractIds.has(key)) throw new Error(`${label} references undeclared contract: ${key}`);
        if (!binding.provider) throw new Error(`${label}.provider is required`);
        if (bindingIds.has(key)) throw new Error(`Duplicate initial Skill binding: ${key}`);
        bindingIds.add(key);
      } catch (error: any) {
        problems.push(error.message);
      }
    }
    function validateLegacyIntegrities(builtin: any, label: any): any  {
      if (builtin.legacyIntegrities === undefined) return;
      if (!Array.isArray(builtin.legacyIntegrities)) {
        problems.push(`${label}.legacyIntegrities must be an array.`);
        return;
      }
      const seen: any = new Set();
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
      if (!rule.path.startsWith(`${RESOURCE_WORKSPACE_ROOT}/rules/`)) {
        problems.push(`${label}.path must be under ${RESOURCE_WORKSPACE_ROOT}/rules/.`);
      }
      if (path.isAbsolute(rule.path) || rule.path.startsWith('..') || path.isAbsolute(rule.target) || rule.target.startsWith('..')) {
        problems.push(`${label} paths must stay relative.`);
        continue;
      }
      const sourceFile = path.resolve(root, rule.path);
      if (!existsFile(sourceFile)) {
        problems.push(`${label}.path does not exist: ${rule.path}`);
      } else files.push(sourceFile);
    }
    if (manifest.builtins.rules.some((rule: any) => rule.id === 'buildr-core')) {
      problems.push('Independent buildr-core is retired; use the inline AGENTS.md managed block.');
    }

    const currentSkillIds: any = new Set(manifest.builtins.skills.map((skill: any) => skill.id).filter(Boolean));
    const currentSkillTargets: any = new Set(manifest.builtins.skills.map((skill: any) => skill.target).filter(Boolean));
    const currentSkillRuntimePaths: any = new Set(manifest.builtins.skills.map((skill: any) => skill.runtimePath || skill.id).filter(Boolean));
    const replacementPredecessors: any = new Set();
    const replacementTargets: any = new Set();
    const replacementRuntimePaths: any = new Set();
    for (const skill of manifest.builtins.skills) {
      const label = `builtins.skills.${skill.id || '<missing>'}`;
      for (const [field, entries] of [['provides', skill.provides || []], ['requires', skill.requires || []]]) {
        for (const [index, declaration] of entries.entries()) {
          try {
            validateCapabilityIdentity(declaration.capability, declaration.version, `${label}.${field}[${index}]`);
            if (!contractIds.has(capabilityKey(declaration.capability, declaration.version))) throw new Error(`${label}.${field}[${index}] references undeclared contract`);
            if (field === 'requires' && !['required', 'optional'].includes(declaration.mode)) throw new Error(`${label}.${field}[${index}].mode must be required or optional`);
          } catch (error: any) {
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
      if (!skill.path.startsWith(`${RESOURCE_WORKSPACE_ROOT}/skills/`)) {
        problems.push(`${label}.path must be under ${RESOURCE_WORKSPACE_ROOT}/skills/.`);
      }
      const missingRuntimes = SUPPORTED_AGENT_IDS.filter((runtime: any) => !skill.runtimes?.includes(runtime));
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
        if (['task-triage', 'task-manager', 'task-review', 'task-worktree', 'task-finish'].includes(skill.id) && metadata.description !== skill.description) {
          problems.push(`${label}.description must exactly match SKILL.md frontmatter description.`);
        }
      } catch (error: any) {
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
        if (!skill.provides?.some((entry: any) => entry.capability === 'buildr.git-worktree-provider' && entry.version === 1)) {
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
        problems.push(...validateTaskRecordSkillCommands(skillContent));
        for (const forbiddenText of ['buildr worktree create', 'buildr verification run', 'buildr task finish run', 'git commit', 'git push']) {
          if (skillContent.includes(forbiddenText)) problems.push(`task-manager Skill must not execute professional action ${JSON.stringify(forbiddenText)}.`);
        }
        const provided = (skill.provides || []).some((item: any) => item.capability === 'buildr.task-record' && item.version === 3);
        if (!provided) problems.push('task-manager must provide buildr.task-record@3.');
        try {
          const { description = '' } = parseSkillFrontmatter(skillFile);
          const sentenceStops = description.match(/[。！？]/g)?.length || 0;
          if (sentenceStops !== 1) problems.push(`task-manager Skill description must be one sentence, found ${sentenceStops}.`);
        } catch {
          // Shared frontmatter validation reports the original error.
        }
        for (const relative of ['../buildr-web/src/pages/TasksPage.tsx', '../buildr-web/src/pages/TaskDetailPage.tsx']) {
          const webFile = path.join(root, relative);
          if (!existsFile(webFile)) {
            problems.push(`Task Manager Buildr Web asset is missing: ${relative}.`);
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
          '本 Skill 是 `buildr.task-review/v2` 的默认 provider',
          'Agent 完成判断，Task Review Application 只保存两份可选结果',
          'buildr task review inspect <task-id>',
          'buildr task review record <task-id>',
          '动态审查',
          '从真实工作现场取得本次对象',
          '同一 Agent 自审使用 `self`',
          '中断时不要调用 record',
          '--expected-current',
          'Task Retrospective',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-review Skill must include ${JSON.stringify(requiredText)}.`);
        }
        const provided = (skill.provides || []).some((item: any) => item.capability === 'buildr.task-review' && item.version === 2);
        if (!provided) problems.push('task-review must provide buildr.task-review@2.');
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
          '公共行为',
          '正常、失败、边界和必要状态转换案例',
          '目标错误存在时失败',
          '不复制被测算法后验证自身',
          '必要幂等、失败后清理和重复运行',
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
          '`buildr.task-verification/v4`',
          'buildr.project-verification/v4',
          'buildr project verification inspect <project>',
          'buildr project verification validate <project>',
          'buildr project verification update <project>',
          'buildr task verification record <task-id>',
          'buildr task verification inspect <task-id>',
          '--expected-report',
          'reportDigest',
          '不列举每个测试文件',
          'Maven、Gradle、npm、Playwright、Browser、HTTP',
          'Buildr 不生成计划或统一运行测试',
          '只有一句“测试通过”不构成有意义报告',
          '原子整值替换',
          '`current`',
          '`stale`',
          '`unknown`',
          '不等于业务验收、任务完成、提交、推送、部署或发布',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-verification Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!skill.provides?.some((entry: any) => entry.capability === 'buildr.task-verification' && entry.version === 4)) {
          problems.push('task-verification must provide buildr.task-verification/v4.');
        }
        for (const forbiddenText of ['buildr verification plan', 'buildr verification run', 'task verification reconcile', 'Candidate lease', 'provider: task-worktree']) {
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
          '产品入口 Buildr Skill 的 workspace transition 约束',
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
        if (!skill.provides?.some((entry: any) => entry.capability === 'buildr.git-operations' && entry.version === 1) || skill.provides.length !== 1) {
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
      if (skill.id === 'task-retrospective') {
        for (const requiredText of [
          '.buildr/local/task-retrospectives/<task-id>.md',
          'Agent 执行时间、token 消耗、重复尝试、人机协作或 Buildr workflow/harness 效率',
          'Task 必须是 `completed` 或 `abandoned`',
          '自由Markdown',
          '不可得时直接标记缺失',
          '隐藏推理、完整对话、完整工具日志或后台事件',
          'pending-decision',
          'decided',
          '普通Task',
          '不参与Task完成、交付、cleanup或OpenSpec门禁',
        ]) {
          if (!skillContent.includes(requiredText)) problems.push(`task-retrospective Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if ((skill.provides || []).some((item: any) => item.capability === 'buildr.task-retrospective')) problems.push('task-retrospective must remain a pure Skill without a dedicated capability provider.');
        if (!(skill.requires || []).some((item: any) => item.capability === 'buildr.task-record' && item.version === 3 && item.mode === 'required')) problems.push('task-retrospective must require buildr.task-record@3.');
      }
      if (skill.id === 'task-triage') {
        for (const requiredText of ['## 2. 两轴决策', '`code-only`', '`spec-maintenance`', '`change-flow`', '`blocked`', 'Repository set', '`implementation`', '`metadata-only`', '`unknown`', '`buildr.task-record/v3`', '待办意向', 'todo create', 'Formal Task Record本身不是编辑、构建或有界测试的通用工作许可', '不需要Worktree的直接工作不补造位置、Plan或Receipt', '`buildr.git-operations/v1`', '新正式 Task 创建前收敛逐 repository 权威基线', '`fetch` operation', '`rebase` operation', '`rebase --abort`', 'Git 基线：converged / none / blocked', '`buildr.current-knowledge-maintenance/v2`', '`buildr.git-worktree-provider/v1`', '`maintain`', '`change-required`', 'provider不ready', 'selected `buildr.task-verification/v4` provider', '## 4. 输出契约']) {
          if (!skillContent.includes(requiredText)) problems.push(`task-triage Skill must include ${JSON.stringify(requiredText)}.`);
        }
        if (!(skill.requires || []).some((item: any) => item.capability === 'buildr.task-record' && item.version === 3 && item.mode === 'optional')) problems.push('task-triage must optionally require buildr.task-record@3.');
        if (!(skill.requires || []).some((item: any) => item.capability === 'buildr.git-operations' && item.version === 1 && item.mode === 'optional')) problems.push('task-triage must optionally require buildr.git-operations@1.');
        for (const retiredText of ['`create-board`', '`continue-board`', '`buildr.task-board-maintenance/v1`']) {
          if (skillContent.includes(retiredText)) problems.push(`task-triage Skill must not route retired Task Board behavior: ${JSON.stringify(retiredText)}.`);
        }
        if (skillContent.includes('buildr openspec')) problems.push('task-triage source must not hard-code OpenSpec contract guard commands; installed Components contribute them at render time.');
      }
      if (skill.id === 'openspec-contract-guard') {
        for (const requiredText of ['openspec validate <change> --strict', 'buildr openspec convergence preflight', '`ready|blocked`', '`scenario-omission`', '最终`buildr openspec converge`永远重新读取最新事实', 'buildr openspec converge', 'buildr openspec convergence inspect', 'passed|blocked|recovery-unprovable', '`not-applicable`', 'archive --skip-specs', '正常archive成功后释放本次Receipt', '任务收尾和资源清理不调用Inspect', '不重复实现这些解析或 archive 安全规则', '不修改外部 `openspec-*` Skills']) {
          if (!skillContent.includes(requiredText)) problems.push(`openspec-contract-guard Skill must include ${JSON.stringify(requiredText)}.`);
        }
      }
      if (skill.id.startsWith('openspec-') && skill.id !== 'openspec-contract-guard' && skillContent.includes('buildr openspec')) {
        problems.push(`${label} must not embed Buildr contract guard commands; the sidebar Skill owns that workflow.`);
      }
      if (isOpenSpecUpstreamSkill && skill.target.startsWith('skills/buildr/')) problems.push(`${label} must preserve upstream ownership outside skills/buildr/.`);
      files.push(...collectFiles(skillDir));
    }
    if (!manifest.builtins.skills.some((skill: any) => skill.id === 'task-finish' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-finish.');
    }
    if (!manifest.builtins.skills.some((skill: any) => skill.id === 'task-verification' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-verification.');
    }
    if (manifest.builtins.skills.some((skill: any) => skill.id.includes('openspec-store'))) {
      problems.push('OpenSpec Stores are beta and must not be registered as a Buildr builtin Skill.');
    }
    if (!manifest.builtins.skills.some((skill: any) => skill.id === 'task-retrospective' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-retrospective.');
    }
    if (manifest.builtins.skills.some((skill: any) => skill.id === 'task-asset-review')
      || (manifest.capabilityContracts || []).some((contract: any) => contract.id === 'buildr.task-asset-review')
      || (manifest.initialSkillBindings || []).some((binding: any) => binding.capability === 'buildr.task-asset-review')
      || manifest.builtins.skills.some((skill: any) => (skill.requires || []).some((dependency: any) => dependency.capability === 'buildr.task-asset-review'))) {
      problems.push('Task Asset Review must not remain in active package skills, contracts, bindings, or consumer requirements.');
    }
    if (!manifest.builtins.skills.some((skill: any) => skill.id === 'task-review' && skill.required === false)) {
      problems.push('builtins.skills must declare optional task-review.');
    }
    if (manifest.builtins.skills.some((skill: any) => skill.id === 'task-metadata-publication')
      || (manifest.capabilityContracts || []).some((contract: any) => contract.id === 'buildr.task-metadata-publication')
      || (manifest.initialSkillBindings || []).some((binding: any) => binding.capability === 'buildr.task-metadata-publication')) {
      problems.push('Task Metadata Publication must not remain in package skills, contracts, or initial bindings.');
    }
    if (manifest.builtins.skills.some((skill: any) => skill.id === 'task-board')
      || (manifest.capabilityContracts || []).some((contract: any) => contract.id === 'buildr.task-board-maintenance')
      || (manifest.initialSkillBindings || []).some((binding: any) => binding.capability === 'buildr.task-board-maintenance')
      || manifest.builtins.skills.some((skill: any) => (skill.requires || []).some((dependency: any) => dependency.capability === 'buildr.task-board-maintenance'))) {
      problems.push('Retired Task Board must not remain in package skills, contracts, bindings, or consumer edges.');
    }

    for (const command of manifest.builtins.commands) {
      validateLegacyIntegrities(command, `builtins.commands.${command.id || '<missing>'}`);
      if (!command.id || typeof command.required !== 'boolean' || !isPlainObject(command.manifestEntry)) {
        problems.push(`builtins.commands entries must include id, required, and manifestEntry.`);
      }
    }

    const baselineSkillsManifest = path.join(resourceWorkspaceRoot(), 'skills', 'manifest.yml');
    if (existsFile(baselineSkillsManifest)) {
      try {
        const baselineSkills = readSkillManifest(baselineSkillsManifest);
        validateSkillManifestEntries(baselineSkills, baselineSkillsManifest);
        for (const id of ['task-triage', 'task-manager', 'task-worktree', 'task-finish', 'git-operations']) {
          const packaged = manifest.builtins.skills.find((entry: any) => entry.id === id);
          const baseline = baselineSkills.find((entry: any) => entry.id === id);
          if (packaged && baseline?.description !== packaged.description) {
            problems.push(`Workspace skills baseline ${id} description must exactly match package manifest.`);
          }
        }
        const taskFinish = baselineSkills.find((entry: any) => entry.id === 'task-finish');
        if (!taskFinish || taskFinish.source !== 'buildr' || taskFinish.state !== 'installed' || taskFinish.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-finish.');
        }
        const taskVerification = baselineSkills.find((entry: any) => entry.id === 'task-verification');
        if (!taskVerification || taskVerification.source !== 'buildr' || taskVerification.state !== 'installed' || taskVerification.enabled !== true) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-verification.');
        }
        const taskManager = baselineSkills.find((entry: any) => entry.id === 'task-manager');
        if (!taskManager || taskManager.source !== 'buildr' || taskManager.state !== 'installed' || taskManager.enabled !== true || !(taskManager.provides || []).some((item: any) => item.capability === 'buildr.task-record' && item.version === 3)) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-manager providing buildr.task-record@3.');
        }
        const taskReview = baselineSkills.find((entry: any) => entry.id === 'task-review');
        if (!taskReview || taskReview.source !== 'buildr' || taskReview.state !== 'installed' || taskReview.enabled !== true || !(taskReview.provides || []).some((item: any) => item.capability === 'buildr.task-review' && item.version === 2)) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr task-review providing buildr.task-review@2.');
        }
        const taskRetrospective = baselineSkills.find((entry: any) => entry.id === 'task-retrospective');
        if (!taskRetrospective || taskRetrospective.source !== 'buildr' || taskRetrospective.state !== 'installed' || taskRetrospective.enabled !== true || (taskRetrospective.provides || []).some((item: any) => item.capability === 'buildr.task-retrospective') || !(taskRetrospective.requires || []).some((item: any) => item.capability === 'buildr.task-record' && item.version === 3)) {
          problems.push('Workspace skills baseline must declare enabled installed pure task-retrospective requiring buildr.task-record@3.');
        }
        if (baselineSkills.some((entry: any) => entry.id === 'task-asset-review' || (entry.provides || []).some((item: any) => item.capability === 'buildr.task-asset-review') || (entry.requires || []).some((item: any) => item.capability === 'buildr.task-asset-review'))) {
          problems.push('Workspace skills baseline must not retain Task Asset Review provider or consumer declarations.');
        }
        const gitOperations = baselineSkills.find((entry: any) => entry.id === 'git-operations');
        if (!gitOperations || gitOperations.source !== 'buildr' || gitOperations.state !== 'installed' || gitOperations.enabled !== true || !(gitOperations.provides || []).some((item: any) => item.capability === 'buildr.git-operations' && item.version === 1)) {
          problems.push('Workspace skills baseline must declare enabled installed Buildr git-operations providing buildr.git-operations@1.');
        }
        if (baselineSkills.some((entry: any) => entry.id === 'task-metadata-publication' || (entry.provides || []).some((item: any) => item.capability === 'buildr.task-metadata-publication') || (entry.requires || []).some((item: any) => item.capability === 'buildr.task-metadata-publication'))) {
          problems.push('Workspace skills baseline must not retain Task Metadata Publication provider or consumer declarations.');
        }
        if (baselineSkills.some((entry: any) => entry.id === 'git-ops')) {
          problems.push('Workspace skills baseline must not retain legacy git-ops entry.');
        }
        for (const skill of baselineSkills.filter((entry: any) => entry.source !== undefined)) {
          if (typeof skill.source === 'string' && !isManifestSourceLabel(skill.source)) {
            const parsed = parseSkillSourceRef(skill.source);
            if (parsed.type === 'package' && !skillSourceIds.has(parsed.id)) {
              problems.push(`Workspace skills baseline references unknown package skillSource: ${skill.source}`);
            }
          }
        }
      } catch (error: any) {
        problems.push(error.message);
      }
    }

    const baselineProjectsRegistry = path.join(resourceWorkspaceRoot(), 'projects', 'manifest.yml');
    if (existsFile(baselineProjectsRegistry)) {
      try {
        const registry = parseProjectsYaml(fs.readFileSync(baselineProjectsRegistry, 'utf8'));
        const errors = validateProjectsRegistry(registry);
        if (errors.length > 0) {
          problems.push(`Workspace projects/manifest.yml baseline is invalid:\n- ${errors.join('\n- ')}`);
        }
      } catch (error: any) {
        problems.push(`Workspace projects/manifest.yml baseline is invalid: ${error.message}`);
      }
    }
  }

  function validatePackageAssets(context: any): any  {
    const { root, workspaceRoot, manifestPath, manifest, allowedVariables, files, problems } = context;
    const bootstrapContract = validateBootstrapContract(root, files, problems);
    for (const relativePath of GENERATED_USER_REGISTRY_RESOURCE_SOURCES) {
      if (existsFile(path.resolve(root, relativePath))) {
        problems.push(`Generated user registry must not exist as a package source: ${relativePath}`);
      }
    }
    for (const file of collectFiles(resourceWorkspaceRoot())) {
      const relativePath = toPosixRelative(resourceWorkspaceRoot(), file);
      if (!/\.ya?ml$/u.test(relativePath)) continue;
      if (relativePath.startsWith('skills/') || relativePath.startsWith('commands/buildr/') || relativePath.startsWith('components/buildr/')) continue;
      problems.push(`Workspace-target YAML must be product content, not a user registry source: ${RESOURCE_WORKSPACE_ROOT}/${relativePath}`);
    }
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

  function validateProjectVerificationTransition(context: any): any  {
    const { root, problems } = context;
    const productDeclaration = fs.readFileSync(path.resolve(root, '../..', 'verification.yml'), 'utf8');
    if (!productDeclaration.startsWith('schemaVersion: buildr.project-verification/v4\n')) {
      problems.push('Product live verification.yml must use the v4 testing-map contract.');
    }
    const reader = fs.readFileSync(path.join(root, 'src/verification/domain/project-verification.ts'), 'utf8');
    for (const requiredText of ['buildr.project-verification/v4', 'sourcePaths', 'testRoots', 'selection', 'requirements']) if (!reader.includes(requiredText)) problems.push(`Project verification v4 reader must include ${JSON.stringify(requiredText)}.`);

    for (const relative of [
      'resources/workspace/skills/buildr/task-verification/SKILL.md',
      'resources/workspace/skills/buildr/task-verification/templates/project-verification.yml',
      'resources/workspace/skills/buildr/task-verification/references/project-verification-v4.md',
    ]) {
      const content = fs.readFileSync(path.join(root, relative), 'utf8');
      if (!content.includes('buildr.project-verification/v4')) problems.push(`${relative} must retain the v4 testing-map contract.`);
    }
  }

  function validatePackageStatic(context: any): any  {
    validatePackageMetadata(context);
    validateTaskEnvironmentAuthorityResidue(context);
    validateTaskLifecycleRetirement(context);
    validateTaskCurrentContractResidue(context);
    validateTaskVerificationPromptRetirement(context);
    validateTaskReviewAuthority(context);
    validateMappedEntries(context);
    validatePackageComponents(context);
    validateProjectVerificationTransition(context);
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
