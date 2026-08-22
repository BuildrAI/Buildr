export function createScopeDiagnostics(deps) {
  const {
    addDoctorFinding,
    execFileSync,
    existsDirectory,
    existsFile,
    fs,
    gitBoundaryFor,
    gitBoundaryIgnored,
    gitOutput,
    parseProjectsYaml,
    parseYamlValue,
    path,
    projectsManifestPath,
    servicesManifestPath,
    toPosixRelative,
    validateProjectsRegistry,
    buildrWorkspaceIdentity,
    observeProjectGit,
    sameGitIdentity,
    resolveSourceRoot,
  } = deps;

  function projectView(code, project) {
    if (project?.source) return project;
    return {
      id: null,
      workspaceId: null,
      code,
      name: project?.title || null,
      description: project?.description || null,
      source: project?.repo?.kind === 'git'
        ? { type: 'git', path: project.path || `projects/${code}`, git: { url: project.repo.url || '', remote: project.repo.remote || 'origin', integrationBranch: project.repo.defaultBranch || '' } }
        : { type: 'workspace', path: project?.path || `projects/${code}` },
    };
  }

  function scopeParts(scope) {
    const parts = scope === '.' ? ['.'] : scope.split('/').filter(Boolean);
    const isRootScope = parts.length === 1 && parts[0] === '.';
    const isRootProjectScope = parts[0] === 'projects';
    if (parts[0] === 'organizations') {
      throw new Error(`organizations/<org>/ scopes are not supported. Use root-relative scopes such as projects/<project>: ${scope}`);
    }
    if (parts[0] === 'shared') {
      throw new Error(`shared scopes are not supported. Put shared or foundation services under a project, for example projects/foundation/services/<service>: ${scope}`);
    }
    if (!isRootScope && !isRootProjectScope) {
      throw new Error(`Unsupported doctor scope: ${scope}`);
    }
    if (isRootProjectScope && parts.length < 2) {
      throw new Error(`Doctor project scope must be projects/<project>[/services/<service>[/path...]]: ${scope}`);
    }
    return parts;
  }

  function workspaceName(targetRoot) {
    const metadataPath = path.join(targetRoot, '.buildr', 'workspace.yml');
    if (!existsFile(metadataPath)) return path.basename(targetRoot);
    const content = fs.readFileSync(metadataPath, 'utf8');
    const match = content.match(/^name:\s*(.+)$/m);
    return match ? parseYamlValue(match[1].trim()) : path.basename(targetRoot);
  }

  function readProjectsRegistryIfExists(targetRoot) {
    const file = projectsManifestPath(targetRoot);
    if (!existsFile(file)) return null;
    return parseProjectsYaml(fs.readFileSync(file, 'utf8'));
  }

  function discoverDoctorScopes(targetRoot, requestedScope, registry = null) {
    if (requestedScope) {
      const parts = scopeParts(requestedScope);
      if (parts[0] === '.') {
        return [{ org: workspaceName(targetRoot), project: null, servicePath: null, scope: '.' }];
      }
      if (parts[0] === 'projects') {
        return [{
          org: workspaceName(targetRoot),
          project: parts[1],
          servicePath: parts[2] === 'services' && parts.length > 3
            ? parts.slice(3).join('/')
            : parts.length > 2 ? parts.slice(2).join('/') : null,
          scope: requestedScope,
        }];
      }
    }

    const scopes = [];
    if (existsDirectory(path.join(targetRoot, 'projects')) || existsFile(path.join(targetRoot, '.buildr', 'workspace.yml'))) {
      scopes.push({ org: workspaceName(targetRoot), project: null, servicePath: null, scope: '.' });
      const projectNames = new Set();
      if (registry?.projects) {
        for (const project of Object.keys(registry.projects)) projectNames.add(project);
      }
      const projectsRoot = path.join(targetRoot, 'projects');
      if (existsDirectory(projectsRoot)) {
        const projects = fs.readdirSync(projectsRoot).filter((project) => existsDirectory(path.join(projectsRoot, project))).sort();
        for (const project of projects) projectNames.add(project);
      }
      for (const project of [...projectNames].sort()) {
        scopes.push({ org: workspaceName(targetRoot), project, servicePath: null, scope: `projects/${project}` });
      }
    }
    return scopes;
  }

  function resolveRepoPath(projectRoot, repoPath) {
    if (!repoPath) return null;
    return path.isAbsolute(repoPath) ? repoPath : path.resolve(projectRoot, repoPath);
  }

  function readGitRemote(repoPath, remoteName) {
    try {
      return gitOutput(['remote', 'get-url', remoteName], repoPath);
    } catch {
      return null;
    }
  }

  function gitignoreLines(targetRoot) {
    const gitignore = path.join(targetRoot, '.gitignore');
    if (!existsFile(gitignore)) return [];
    return fs.readFileSync(gitignore, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function isIgnoredByWorkspace(targetRoot, serviceRepoPath, lines) {
    const relative = toPosixRelative(targetRoot, serviceRepoPath);
    try {
      execFileSync('git', ['check-ignore', '--quiet', relative], { cwd: targetRoot, stdio: 'ignore' });
      return true;
    } catch {
      // Fall through to the text-only check for non-Git workspaces or unusual Git setups.
    }

    const withSlash = relative.endsWith('/') ? relative : `${relative}/`;
    const parentPattern = `${path.posix.dirname(relative) || '.'}/*/`;
    if (lines.includes(withSlash) || lines.includes(parentPattern)) return true;

    const segments = relative.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      const ancestor = `${segments.slice(0, index).join('/')}/`;
      if (lines.includes(ancestor)) return true;
    }
    return false;
  }

  function projectDoctorContextFor(targetRoot, item, project = null) {
    const orgRoot = targetRoot;
    const projectRoot = item.project ? (project ? resolveSourceRoot(orgRoot, project.source) : path.join(orgRoot, 'projects', item.project)) : null;
    return {
      orgRoot,
      projectRoot,
      metadataPath: projectRoot ? servicesManifestPath(projectRoot) : null,
      servicesRoot: projectRoot ? path.join(projectRoot, 'services') : null,
    };
  }

  function projectBaselineStatus(projectRoot) {
    return {
      agentsFile: existsFile(path.join(projectRoot, 'AGENTS.md')),
      openspecSpecs: existsDirectory(path.join(projectRoot, 'openspec', 'specs')),
      openspecKnowledge: existsDirectory(path.join(projectRoot, 'openspec', 'knowledge')),
      openspecChanges: existsDirectory(path.join(projectRoot, 'openspec', 'changes')),
      capabilities: existsFile(path.join(projectRoot, 'capabilities.yml')),
      commandsContext: existsFile(path.join(projectRoot, 'commands.yml')),
      servicesMetadata: existsFile(servicesManifestPath(projectRoot)),
      servicesDirectory: existsDirectory(path.join(projectRoot, 'services')),
    };
  }

  function missingProjectBaselineAssets(status) {
    const labels = {
      agentsFile: 'AGENTS.md',
      openspecSpecs: 'openspec/specs',
      openspecKnowledge: 'openspec/knowledge',
      openspecChanges: 'openspec/changes',
      capabilities: 'capabilities.yml',
      servicesMetadata: 'services/manifest.yml',
      servicesDirectory: 'services',
    };
    return Object.entries(status)
      .filter(([key]) => key !== 'commandsContext')
      .filter(([, exists]) => !exists)
      .map(([key]) => labels[key]);
  }

  function diagnoseProjectRegistry(result, targetRoot) {
    const registryPath = projectsManifestPath(targetRoot);
    const registryResult = {
      path: 'projects/manifest.yml',
      exists: existsFile(registryPath),
      valid: false,
      schemaVersion: null,
      projects: [],
    };
    result.projectRegistry = registryResult;

    if (existsFile(path.join(targetRoot, 'projects.yml'))) {
      addDoctorFinding(result, 'warning', 'projects.legacy_registry_present', '旧 Project registry 文件仍存在：projects.yml', {
        path: 'projects.yml',
        suggestion: '运行 buildr update 或 buildr sync 删除旧文件；该文件不会作为迁移来源读取。',
      });
    }

    if (!registryResult.exists) {
      if (result.workspace?.initialized) {
        addDoctorFinding(result, 'warning', 'projects.registry_missing', 'Project registry 缺失：projects/manifest.yml', {
          path: registryResult.path,
          suggestion: '运行 buildr update 或 buildr sync 创建 projects/manifest.yml，并补登记既有 Project 目录。',
        });
      }
      return null;
    }

    let registry;
    try {
      registry = readProjectsRegistryIfExists(targetRoot);
    } catch (error) {
      addDoctorFinding(result, 'warning', 'projects.registry_invalid', `Project registry 不可解析：${error.message}`, {
        path: registryResult.path,
        suggestion: '修复 projects/manifest.yml 语法后重新运行 doctor。',
      });
      return null;
    }

    registryResult.schemaVersion = registry.schemaVersion;
    registryResult.migrationRequired = registry.schemaVersion === 'buildr.projects/v1';
    if (registryResult.migrationRequired) {
      addDoctorFinding(result, 'warning', 'projects.registry_migration_required', 'Project registry 需要迁移为 buildr.projects/v2。', {
        path: registryResult.path,
        suggestion: '运行 canonical buildr sync <agent> 完成 Project identity 与 source 的事务迁移。',
        userActionRequired: true,
      });
    }
    const validationErrors = validateProjectsRegistry(registry);
    if (validationErrors.length > 0) {
      for (const message of validationErrors) {
        addDoctorFinding(result, 'warning', 'projects.registry_invalid', message, {
          path: registryResult.path,
          suggestion: '运行 buildr update 或 buildr sync 修复低风险默认值并清理未知字段；路径或 project 字段冲突需要人工确认。',
        });
      }
    }
    registryResult.valid = validationErrors.length === 0;

    for (const [projectName, project] of Object.entries(registry.projects || {}).sort(([left], [right]) => left.localeCompare(right))) {
      const view = projectView(projectName, project);
      registryResult.projects.push({
        id: view.id,
        workspaceId: view.workspaceId,
        code: view.code,
        name: view.name,
        description: view.description,
        source: view.source,
      });
      if (!view.name) {
        addDoctorFinding(result, 'warning', 'projects.name_missing', `Project 缺少 name：${projectName}`, {
          path: registryResult.path,
          suggestion: '运行 buildr sync 补齐默认 name。',
          command: `buildr project create ${projectName} --target ${targetRoot}`,
        });
      }
      if (!view.description || String(view.description).startsWith('TODO:')) {
        addDoctorFinding(result, 'warning', 'projects.description_todo', `Project 缺少有效 description：${projectName}`, {
          path: registryResult.path,
          suggestion: '补充 Project description，说明该 Project 的适用场景和用途。',
        });
      }
      if (view.source.type === 'git' && !view.source.git.url) {
        addDoctorFinding(result, 'warning', 'projects.git_url_missing', `Git Project 缺少 source.git.url：${projectName}`, {
          path: registryResult.path,
          suggestion: '补充 Git remote URL，或确认该 Project 只作为本地 Git 资产管理。',
        });
      }
    }

    const registered = new Set(Object.keys(registry.projects || {}));
    const projectsRoot = path.join(targetRoot, 'projects');
    if (existsDirectory(projectsRoot)) {
      for (const projectName of fs.readdirSync(projectsRoot).filter((project) => existsDirectory(path.join(projectsRoot, project))).sort()) {
        if (!registered.has(projectName)) {
          addDoctorFinding(result, 'warning', 'projects.unregistered', `Project 目录未登记：${projectName}`, {
            path: `projects/${projectName}`,
            suggestion: '通过 buildr project create 补齐 Project registry，或删除该目录。',
            command: `buildr project create ${projectName} --target ${targetRoot}`,
          });
        }
      }
    }

    return registry;
  }

  function diagnoseWorkspace(result, targetRoot) {
    const identity = buildrWorkspaceIdentity(targetRoot);
    const workspace = {
      initialized: identity.state === 'valid',
      agentsFile: identity.agentsFile,
      rootOrganization: identity.rootOrganization,
      metadataFile: identity.metadataFile,
      identity: {
        state: identity.state,
        required: identity.required,
        missing: identity.missing,
      },
    };
    result.workspace = workspace;

    if (identity.state !== 'valid') {
      const selectedAgent = result.agentRuntime?.selected;
      const incomplete = identity.state === 'incomplete';
      addDoctorFinding(result, 'error', incomplete ? 'workspace.identity_incomplete' : 'workspace.not_initialized', incomplete
        ? `Buildr workspace identity 不完整，缺失：${identity.missing.join(', ')}`
        : '当前目录不是完整 Buildr workspace。', {
        path: targetRoot,
        missing: identity.missing,
        suggestion: selectedAgent ? '执行带当前 Agent 的高层 init，一次完成 workspace、runtime 和最终 doctor。' : '先确认 Agent runtime adapter，再执行 buildr init 初始化 workspace。',
        command: `buildr init${selectedAgent ? ` --agent ${selectedAgent}` : ''} --target ${targetRoot} --name ${path.basename(targetRoot)}`,
        userActionRequired: true,
      });
    }

    if (existsDirectory(path.join(targetRoot, 'organizations'))) {
      addDoctorFinding(result, 'error', 'workspace.organizations_unsupported', '当前目录包含不再支持的 organizations/ 布局。', {
        path: 'organizations',
        suggestion: '将需要保留的单个组织资产迁移到 Buildr root，使用 projects/ 作为默认入口。',
      });
    }

    if (existsDirectory(path.join(targetRoot, 'shared'))) {
      addDoctorFinding(result, 'warning', 'workspace.shared_unsupported', '当前目录包含不再作为默认模型支持的 shared/ 入口。', {
        path: 'shared',
        suggestion: '将共享、基础或平台服务迁移到某个 Project，例如 projects/foundation/services/。',
      });
    }
  }

  function diagnoseLegacyPractices(result, targetRoot, scopes, includeInfo = false) {
    if (!includeInfo) return;
    const roots = [{ path: 'practices', root: path.join(targetRoot, 'practices'), scope: 'workspace' }];
    for (const item of scopes) {
      if (!item.project) continue;
      roots.push({
        path: `projects/${item.project}/practices`,
        root: path.join(targetRoot, 'projects', item.project, 'practices'),
        scope: `projects/${item.project}`,
      });
    }
    for (const legacy of roots) {
      if (!existsDirectory(legacy.root)) continue;
      addDoctorFinding(result, 'info', 'practices.legacy_directory_present', `检测到已退出当前资产模型的遗留 Practices 目录：${legacy.path}`, {
        path: legacy.path,
        scope: legacy.scope,
        userActionRequired: false,
        suggestion: '按内容语义人工审阅：约束迁移为 Rule，可复用专业动作迁移为 Skill，产品事实、需求与变更迁移为 OpenSpec，其他说明保留为普通 docs；Buildr 不会自动读取、迁移或删除该目录。',
      });
    }
  }

  function diagnoseHierarchy(result, targetRoot, scopes, registry = null) {
    result.organizations = [];
    result.projects = [];
    const seenOrganizations = new Set();
    const ignoreLines = gitignoreLines(targetRoot);

    for (const item of scopes) {
      const rawRegistryEntry = item.project ? registry?.projects?.[item.project] || null : null;
      const registryEntry = rawRegistryEntry ? projectView(item.project, rawRegistryEntry) : null;
      const { orgRoot, projectRoot, metadataPath, servicesRoot } = projectDoctorContextFor(targetRoot, item, registryEntry);
      const organization = { name: item.org, path: toPosixRelative(targetRoot, orgRoot), exists: existsDirectory(orgRoot) };
      const organizationKey = `${organization.path}|${organization.name}`;
      if (!seenOrganizations.has(organizationKey)) {
        result.organizations.push(organization);
        seenOrganizations.add(organizationKey);
      }
      if (!organization.exists) {
        const selectedAgent = result.agentRuntime?.selected;
        addDoctorFinding(result, 'error', 'organization.missing', `Organization 缺失：${item.org}`, {
          path: organization.path,
          suggestion: selectedAgent ? '执行带当前 Agent 的高层 init，一次完成根组织上下文、runtime 和最终 doctor。' : '先确认 Agent runtime adapter，再执行 buildr init 初始化根组织上下文。',
          command: `buildr init${selectedAgent ? ` --agent ${selectedAgent}` : ''} --target ${targetRoot} --name ${item.org}`,
        });
        continue;
      }

      if (!item.project) continue;

      const project = {
        org: item.org,
        id: registryEntry?.id || null,
        workspaceId: registryEntry?.workspaceId || null,
        code: item.project,
        name: registryEntry?.name || null,
        description: registryEntry?.description || null,
        path: registryEntry?.source?.path || toPosixRelative(targetRoot, projectRoot),
        registered: Boolean(registryEntry),
        source: registryEntry?.source || null,
        exists: existsDirectory(projectRoot),
        servicesMetadata: toPosixRelative(targetRoot, metadataPath),
        servicesDirectory: toPosixRelative(targetRoot, servicesRoot),
        baseline: projectBaselineStatus(projectRoot),
        openspec: existsDirectory(path.join(projectRoot, 'openspec')),
      };
      result.projects.push(project);

      if (!project.exists) {
        const attached = registryEntry?.source?.root === 'attached';
        const command = !attached && registryEntry?.source?.type === 'git' && registryEntry.source.git.url
          ? `buildr project create ${item.project} --repo ${registryEntry.source.git.url} --integration-branch ${registryEntry.source.git.integrationBranch} --target ${targetRoot}`
          : `buildr project create ${item.project} --target ${targetRoot}`;
        addDoctorFinding(result, 'error', 'project.missing', `Project 缺失：${item.project}`, {
          path: project.path,
          suggestion: attached ? '确认当前机器上的Attached Root路径，或经用户明确选择后重新登记该Project location。' : registryEntry?.source?.type === 'git' && registryEntry.source.git.url
            ? '询问用户是否根据 registry 自动 clone 该 Project 资产 repo。'
            : '创建缺失的项目资产。',
          command,
          scope: `projects/${item.project}`,
          affectedActions: ['inspect', 'create', 'update', 'sync'],
          ownershipUnit: `project:${item.project}`,
        });
        continue;
      }

      if (!project.registered) continue;

      const missingBaseline = missingProjectBaselineAssets(project.baseline);
      if (missingBaseline.length > 0) {
        addDoctorFinding(result, 'warning', 'project.baseline_incomplete', `Project baseline 不完整：${item.project}`, {
          path: project.path,
          missing: missingBaseline,
          suggestion: registryEntry.source.root === 'attached' ? 'Attached Root baseline保持外部ownership；需要补齐时先取得该root的明确写入授权。' : '运行 buildr project create 补齐项目骨架。',
          command: registryEntry.source.root === 'attached' ? undefined : `buildr project create ${item.project} --target ${targetRoot}`,
        });
      }

      if (registryEntry?.source?.type === 'git') {
        const observed = observeProjectGit(projectRoot, registryEntry.source.git.remote);
        project.git = { declared: registryEntry.source.git, observed };
        project.isGitRepository = observed.repository;
        if (!project.isGitRepository) {
          addDoctorFinding(result, 'error', 'project.not_git_repository', `Project 资产目录不是 Git repo：${item.project}`, {
            path: project.path,
            suggestion: '确认 Project 资产 repo 是否正确 clone 到 projects/<project>/。',
            command: registryEntry.source.git.url ? `buildr project create ${item.project} --repo ${registryEntry.source.git.url} --integration-branch ${registryEntry.source.git.integrationBranch} --target ${targetRoot}` : undefined,
          });
        } else {
          project.actualRemote = observed.remoteUrl;
          if (!observed.remoteUrl || !sameGitIdentity(registryEntry.source.git.url, observed.remoteUrl)) {
            addDoctorFinding(result, 'error', observed.remoteUrl ? 'project.git_remote_conflict' : 'project.git_remote_missing', `Project remote 与 Domain 声明不一致：${item.project}`, {
              path: project.path,
              expected: registryEntry.source.git.url,
              actual: project.actualRemote,
              suggestion: '确认 Project 资产 repo 来源；Buildr 不会自动 relink remote。',
            });
          }
          if (observed.currentBranch && observed.currentBranch !== registryEntry.source.git.integrationBranch) {
            addDoctorFinding(result, 'warning', 'project.git_branch_drift', `Project 当前分支 ${observed.currentBranch} 不同于 integration branch ${registryEntry.source.git.integrationBranch}：${item.project}`, {
              path: project.path,
              expected: registryEntry.source.git.integrationBranch,
              actual: observed.currentBranch,
              suggestion: '先判断是否处于活跃任务分支；收尾时在 clean、ownership 和集成检查通过后安全返回，不要盲目 checkout 或 stash。',
            });
          }
          if (observed.dirty) addDoctorFinding(result, 'warning', 'project.git_dirty', `Project Git worktree 有未提交变化：${item.project}`, { path: project.path, suggestion: '识别变化所属任务后再决定提交、保留或处理。' });
        }
        const boundary = registryEntry.source.root === 'attached' ? null : gitBoundaryFor(targetRoot, { type: 'project', project: item.project, assetRoot: projectRoot });
        project.ignoredByWorkspace = registryEntry.source.root === 'attached' ? null : gitBoundaryIgnored(boundary);
        if (registryEntry.source.root !== 'attached' && !project.ignoredByWorkspace) {
          addDoctorFinding(result, 'warning', 'gitignore.project_repo_not_ignored', `嵌套 Project repo 未被 workspace .gitignore 忽略：${item.project}`, {
            path: project.path,
            suggestion: '更新 workspace .gitignore，避免外层 Git 误提交 Project 资产 repo 内容。',
            pattern: boundary?.pattern,
          });
        }
      }
    }
  }

  return {
    scopeParts,
    workspaceName,
    readProjectsRegistryIfExists,
    discoverDoctorScopes,
    resolveRepoPath,
    readGitRemote,
    gitignoreLines,
    isIgnoredByWorkspace,
    projectDoctorContextFor,
    projectBaselineStatus,
    missingProjectBaselineAssets,
    diagnoseProjectRegistry,
    diagnoseWorkspace,
    diagnoseLegacyPractices,
    diagnoseHierarchy,
  };
}
