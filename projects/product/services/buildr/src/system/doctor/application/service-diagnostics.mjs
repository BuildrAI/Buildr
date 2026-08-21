export function createServiceDiagnostics(deps) {
  const {
    addDoctorFinding,
    existsDirectory,
    existsFile,
    fs,
    gitBoundaryFor,
    gitBoundaryIgnored,
    gitCurrentBranch,
    gitignoreLines,
    listManagedDirectories,
    parseServicesManifestYaml,
    parseServicesManifest,
    path,
    projectDoctorContextFor,
    readGitRemote,
    toPosixRelative,
    validateServicesManifest,
  } = deps;

  function diagnoseServicesMetadata(result, targetRoot, owner, metadataPath, baseRoot, serviceLabel, ignoreLines) {
    if (!existsFile(metadataPath)) {
      if (existsDirectory(baseRoot)) {
        addDoctorFinding(result, 'warning', 'services.manifest_missing', `Service manifest 缺失：${serviceLabel}`, {
          path: toPosixRelative(targetRoot, metadataPath),
          suggestion: '运行 buildr update 或 buildr sync 创建 services/manifest.yml。',
        });
      }
      return;
    }

    let manifest;
    try {
      manifest = parseServicesManifestYaml(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      addDoctorFinding(result, 'warning', 'services.manifest_invalid', `Service manifest 不可解析：${error.message}`, {
        path: toPosixRelative(targetRoot, metadataPath),
        suggestion: '修复 services/manifest.yml 语法后重新运行 doctor。',
      });
      return;
    }

    const validationErrors = validateServicesManifest(manifest, owner.project);
    for (const message of validationErrors) {
      addDoctorFinding(result, 'warning', 'services.manifest_invalid', message, {
        path: toPosixRelative(targetRoot, metadataPath),
        suggestion: '运行 buildr update 或 buildr sync 修复低风险默认值并清理未知字段；project 字段冲突需要人工确认。',
      });
    }

    if (manifest.schemaVersion === 'buildr.services/v1') {
      addDoctorFinding(result, 'warning', 'services.migration_required', `Service registry 等待显式迁移：${serviceLabel}`, {
        path: toPosixRelative(targetRoot, metadataPath),
        suggestion: '运行 canonical buildr sync <agent> 迁移到 buildr.services/v2。',
      });
    } else if (manifest.schemaVersion === 'buildr.services/v2') {
      try {
        const domain = parseServicesManifest(fs.readFileSync(metadataPath, 'utf8'), { projectCode: owner.project });
        manifest = {
          ...manifest,
          services: Object.fromEntries(Object.entries(domain.entities).map(([code, service]) => [code, {
            title: service.name,
            description: service.description,
            type: service.type,
            path: `services/${code}`,
            repo: service.source.type === 'git'
              ? { kind: 'git', url: service.source.git.url, remote: service.source.git.remote, branch: service.source.git.integrationBranch }
              : { kind: 'workspace' },
          }])),
        };
      } catch {
        return;
      }
    }

    if (existsFile(path.join(baseRoot, 'services.yml'))) {
      addDoctorFinding(result, 'warning', 'services.legacy_manifest_present', `旧 Service registry 文件仍存在：${serviceLabel}`, {
        path: toPosixRelative(targetRoot, path.join(baseRoot, 'services.yml')),
        suggestion: '运行 buildr update 或 buildr sync 转换或删除旧 services.yml。',
      });
    }

    const registered = new Set(Object.keys(manifest.services || {}));
    const servicesRoot = path.join(baseRoot, 'services');
    for (const serviceName of listManagedDirectories(servicesRoot)) {
      if (!registered.has(serviceName)) {
        addDoctorFinding(result, 'warning', 'services.unregistered', `Service 目录未登记：${serviceLabel}/${serviceName}`, {
          path: toPosixRelative(targetRoot, path.join(servicesRoot, serviceName)),
          suggestion: '运行 buildr update 或 buildr sync 将既有 Service 目录补登记到 services/manifest.yml。',
        });
      }
    }

    for (const [serviceName, metadata] of Object.entries(manifest.services || {})) {
      if (owner.servicePath && owner.servicePath.split('/')[0] !== serviceName) continue;
      const repo = metadata.repo || {};
      const repoPath = path.join(baseRoot, metadata.path || `services/${serviceName}`);
      const service = {
        org: owner.org,
        project: owner.project || null,
        name: serviceName,
        title: metadata.title || null,
        description: metadata.description || null,
        type: metadata.type || null,
        repo: repo,
        path: toPosixRelative(targetRoot, repoPath),
        exists: repoPath ? existsDirectory(repoPath) : false,
        isGitRepository: repoPath ? fs.existsSync(path.join(repoPath, '.git')) : false,
      };
      result.services.push(service);

      if (!metadata.description || String(metadata.description).startsWith('TODO:')) {
        addDoctorFinding(result, 'warning', 'services.description_todo', `Service 缺少有效 description：${serviceLabel}/${serviceName}`, {
          path: toPosixRelative(targetRoot, metadataPath),
          suggestion: '补充 Service description，说明该 Service 的适用场景和用途。',
        });
      }

      if (!repo.kind) {
        addDoctorFinding(result, 'warning', 'service.repo_kind_missing', `Service 缺少 repo kind：${serviceLabel}/${serviceName}`, {
          path: toPosixRelative(targetRoot, metadataPath),
          suggestion: '运行 buildr update 或 buildr sync 补齐 repo.kind。',
        });
        continue;
      }

      if (!service.exists) {
        const suggestion = repo.kind === 'git' && repo.url
          ? '询问用户是否根据 metadata 自动 clone 该 service repo。'
          : '确认 service repo 路径是否变更。';
        const command = repo.kind === 'git' && repo.url
          ? `buildr service create ${owner.project}/${serviceName} ${repo.url}${repo.branch ? ` --branch ${repo.branch}` : ''} --target ${targetRoot}`
          : undefined;
        addDoctorFinding(result, repo.kind === 'git' ? 'warning' : 'error', `service.${repo.kind}.missing`, `Service repo 缺失：${serviceLabel}/${serviceName}`, {
          path: service.path,
          suggestion,
          command,
        });
        continue;
      }

      if (repo.kind === 'git' && !service.isGitRepository) {
        addDoctorFinding(result, 'error', 'service.not_git_repository', `Service 路径不是 Git repo：${serviceLabel}/${serviceName}`, {
          path: service.path,
          suggestion: '确认路径是否指向正确的 service repo。',
        });
        continue;
      }

      if (repo.kind === 'git' && !repo.url) {
        addDoctorFinding(result, 'warning', 'service.git_url_missing', `Git Service 缺少 repo.url：${serviceLabel}/${serviceName}`, {
          path: toPosixRelative(targetRoot, metadataPath),
          suggestion: '补充 Git remote URL，或确认该 Service 只作为本地 Git 资产管理。',
        });
      }

      if (repo.kind === 'git' && repo.url) {
        const remoteName = repo.remote || 'origin';
        const actualRemote = readGitRemote(repoPath, remoteName);
        service.actualRemote = actualRemote;
        if (actualRemote !== repo.url) {
          addDoctorFinding(result, 'warning', 'service.remote_mismatch', `Service remote 与 metadata 不一致：${serviceLabel}/${serviceName}`, {
            path: service.path,
            expected: repo.url,
            actual: actualRemote,
            suggestion: '确认 repo 来源，必要时更新 metadata 或 Git remote。',
          });
        }
      }

      if (repo.kind === 'git') {
        service.currentBranch = gitCurrentBranch(repoPath);
        if (repo.branch && service.currentBranch !== repo.branch) {
          addDoctorFinding(result, 'warning', 'service.branch_mismatch', `Service 当前分支与 metadata branch intent 不一致：${serviceLabel}/${serviceName}`, {
            path: service.path,
            expected: repo.branch,
            actual: service.currentBranch,
            suggestion: `切换到 ${repo.branch}，或显式更新 Service branch intent。`,
          });
        }
      }

      const boundary = gitBoundaryFor(targetRoot, { type: 'service', project: owner.project, service: serviceName, assetRoot: repoPath });
      service.ignoredByWorkspace = gitBoundaryIgnored(boundary);
      if (!service.ignoredByWorkspace) {
        addDoctorFinding(result, 'warning', 'gitignore.service_repo_not_ignored', `嵌套 service repo 未被上级 .gitignore 忽略：${serviceLabel}/${serviceName}`, {
          path: service.path,
          suggestion: '运行 buildr update 或 buildr sync 补齐最近上级 Git repo 的 .gitignore 边界。',
          pattern: boundary?.pattern,
        });
      }
    }
  }

  function diagnoseServices(result, targetRoot, scopes, registry = null) {
    result.services = [];
    const ignoreLines = gitignoreLines(targetRoot);

    for (const item of scopes) {
      if (!item.project) continue;
      if (!registry?.projects?.[item.project]) continue;
      const { projectRoot, metadataPath } = projectDoctorContextFor(targetRoot, item);
      diagnoseServicesMetadata(result, targetRoot, item, metadataPath, projectRoot, item.project, ignoreLines);
    }
  }

  return {
    diagnoseServicesMetadata,
    diagnoseServices,
  };
}
