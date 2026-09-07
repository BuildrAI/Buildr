import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../../../infrastructure/process.ts';
import { compareVersions, intersectVersionConstraints, parseVersion, parseVersionConstraint, versionSatisfies } from '../domain/command-version.ts';
import { buildCommandProbeInvocation, findExecutableOnPath, probeCommandVersion } from '../infrastructure/command-version-probe.ts';
import { createCommandManifestRepository } from '../persistence/command-manifest-repository.ts';

export function registerDomainsCommands(runtime: any): any  {
  const workspaceSymlinkSegment = (...args: any[]) => runtime.workspaceSymlinkSegment(...args);
  const componentOwnerForMember = (...args: any[]) => runtime.componentOwnerForMember(...args);
  const isValidAssetId = (...args: any[]) => runtime.isValidAssetId(...args);
  const assertName = (...args: any[]) => runtime.assertName(...args);
  const normalizeRelativePathForBuildr = (...args: any[]) => runtime.normalizeRelativePathForBuildr(...args);
  const quoteYaml = (...args: any[]) => runtime.quoteYaml(...args);
  const parseYamlValue = (...args: any[]) => runtime.parseYamlValue(...args);
  const atomicWriteFile = (...args: any[]) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args: any[]) => runtime.parseYamlDocument(...args);
  const withWorkspaceMutation = (...args: any[]) => runtime.withWorkspaceMutation(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args: any[]) => runtime.existsDirectory(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);
  const assertInitializedBuildrWorkspace = (...args: any[]) => runtime.assertInitializedBuildrWorkspace(...args);
  const parseProjectsYaml = (...args: any[]) => runtime.parseProjectsYaml(...args);
  const projectsManifestPath = (...args: any[]) => runtime.projectsManifestPath(...args);

  const {
    PROJECT_COMMANDS_SCHEMA, normalizeCommandCollection, commandsManifestPath, projectCommandsPath,
    assertSafeCommandCollectionTarget, listCommandsManifestPaths, parseCommandsManifestYaml,
    parseProjectCommandsYaml, validateProjectCommandsDocument, renderProjectCommandsYaml,
    validateCommandsManifest, renderCommandsManifestYaml, readCommandsManifestForWrite, writeCommandsManifest,
  } = createCommandManifestRepository({
    atomicWriteFile, existsDirectory, existsFile, isValidAssetId, normalizeRelativePathForBuildr,
    parseYamlDocument, quoteYaml, toPosixRelative, workspaceSymlinkSegment,
  });


  function isPlainObject(value: any): any  {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }


  function buildCommandEntry(id: any, input: any): any  {
    assertName(id, 'Command id');
    const purpose = input.purpose;
    if (!purpose) throw new Error('Missing required option: --purpose');
    const entry: any = {
      id,
      executable: input.executable || id,
      purpose,
    };
    const { name, description, installHint, versionConstraint, versionArgs } = input;

    if (name) entry.name = name;
    if (description) entry.description = description;
    if (versionConstraint || versionArgs) {
      if (!versionConstraint || !versionArgs) {
        throw new Error('Version declaration requires both --version-constraint and --version-args.');
      }
      entry.version = { constraint: versionConstraint, args: versionArgs };
    }
    if (installHint) entry.installHint = installHint;

    const errors = validateCommandsManifest({ schemaVersion: 'buildr.commands/v1', commands: [entry] });
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return entry;
  }

  function commandsAddUnsafe(input: any): any  {
    const { id, targetRoot, collection = null, replace = false } = input;
    assertInitializedBuildrWorkspace(targetRoot);
    const manifestPath = commandsManifestPath(targetRoot, collection);
    const relativeManifest = toPosixRelative(targetRoot, manifestPath);
    const owner = componentOwnerForMember(targetRoot, relativeManifest);
    if (owner) throw new Error(`Command collection is managed by Component ${owner}: ${relativeManifest}. Use buildr component lifecycle commands.`);

    const manifest = readCommandsManifestForWrite(targetRoot, collection);
    const entry = buildCommandEntry(id, input);
    const existingIndex = manifest.commands.findIndex((command: any) => command.id === id);
    if (existingIndex !== -1 && !replace) {
      throw new Error(`Command already exists in ${relativeManifest}: ${id}. Use --replace to replace the whole entry.`);
    }
    if (existingIndex === -1) {
      manifest.commands.push(entry);
    } else {
      manifest.commands[existingIndex] = entry;
    }

    writeCommandsManifest(targetRoot, manifest, collection);
    return { action: existingIndex === -1 ? '添加' : '替换', targetRoot, id, updatedPaths: [manifestPath], nextAction: '运行命令行工具清单检查或 doctor 查看当前本机与组织清单的差异。' };
  }

  function commandsAdd(input: any): any  {
    return withWorkspaceMutation(input.targetRoot, 'commands.add', [path.join(input.targetRoot, 'commands')], () => commandsAddUnsafe(input));
  }

  function commandsRemoveUnsafe(input: any): any  {
    const { id, targetRoot, collection = null } = input;
    assertName(id, 'Command id');
    assertInitializedBuildrWorkspace(targetRoot);
    const manifestPath = commandsManifestPath(targetRoot, collection);
    const relativeManifest = toPosixRelative(targetRoot, manifestPath);
    const owner = componentOwnerForMember(targetRoot, relativeManifest);
    if (owner) throw new Error(`Command collection is managed by Component ${owner}: ${relativeManifest}. Use buildr component lifecycle commands.`);

    const manifest = readCommandsManifestForWrite(targetRoot, collection);
    const existingIndex = manifest.commands.findIndex((command: any) => command.id === id);
    if (existingIndex === -1) {
      throw new Error(`Command not found in ${relativeManifest}: ${id}`);
    }
    const blockers = commandRemovalBlockers(targetRoot, id, [manifestPath]);
    if (blockers.length) {
      const blockerLabel = (item: any) => {
        if (item.kind === 'project') return `Project ${item.project}`;
        if (item.kind === 'invalid-project-context') return `unverifiable Project context${item.project ? ` ${item.project}` : ''}`;
        return 'workspace default';
      };
      const error: Error & Record<string, any> = new Error(`Command definition ${id} 仍被 requirements 引用或引用关系不可验证，保持零写入：\n${blockers.map((item: any) => `- ${blockerLabel(item)}: ${item.path}`).join('\n')}\n先解除或修复对应 requirement，再重试删除。`);
      error.code = 'command_definition_referenced';
      error.reason = 'command_definition_referenced';
      error.references = blockers;
      throw error;
    }
    manifest.commands.splice(existingIndex, 1);
    writeCommandsManifest(targetRoot, manifest, collection);
    return { action: '删除', targetRoot, id, updatedPaths: [manifestPath], nextAction: '运行命令行工具清单检查或 doctor 确认当前 workspace 状态。' };
  }

  function commandsRemove(input: any): any  {
    return withWorkspaceMutation(input.targetRoot, 'commands.remove', [path.join(input.targetRoot, 'commands')], () => commandsRemoveUnsafe(input));
  }


  function createCommandsCheckResult(targetRoot: any): any  {
    return {
      targetRoot,
      manifest: {
        path: 'commands/manifest.yml',
        exists: false,
        valid: false,
        schemaVersion: null,
      },
      manifests: [],
      ok: true,
      summary: { ok: 0, warning: 0, error: 0 },
      commands: [],
      findings: [],
      nextSteps: [],
    };
  }

  function addCommandsFinding(result: any, status: any, code: any, message: any, extra: any = {}): any  {
    result.findings.push({ status, code, message, ...extra });
  }

  function stableValue(value: any): any  {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isPlainObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key: any) => [key, stableValue(value[key])]));
  }

  function commandDefinitionIdentity(command: any): any  {
    return {
      id: command.id,
      executable: command.executable,
      purpose: command.purpose,
      name: command.name || null,
      description: command.description || null,
      versionArgs: command.version?.args || null,
      installHint: command.installHint || null,
    };
  }

  function normalizedCommandSignature(command: any): any  {
    return JSON.stringify(stableValue(commandDefinitionIdentity(command)));
  }

  function readRegisteredProjects(targetRoot: any): any  {
    const registryPath = projectsManifestPath(targetRoot);
    if (!existsFile(registryPath)) return { path: 'projects/manifest.yml', projects: {} };
    const registry = parseProjectsYaml(fs.readFileSync(registryPath, 'utf8'));
    return { path: toPosixRelative(targetRoot, registryPath), projects: registry.projects || {} };
  }

  function readProjectRequirementRecords(targetRoot: any, result: any): any  {
    const registry = readRegisteredProjects(targetRoot);
    const records: any[] = [];
    for (const project of Object.keys(registry.projects).sort()) {
      const file = projectCommandsPath(targetRoot, project);
      const relative = toPosixRelative(targetRoot, file);
      if (!existsFile(file)) {
        addCommandsFinding(result, 'info', 'commands.project_context_missing', `Project ${project} 尚未创建 commands.yml，按空 requirements 兼容。`, {
          path: relative,
          project,
          suggestion: `运行 buildr project create ${project} --target ${targetRoot} 安全补齐空 Commands context。`,
          userActionRequired: false,
        });
        continue;
      }
      try {
        const document = parseProjectCommandsYaml(fs.readFileSync(file, 'utf8'), relative);
        const errors = validateProjectCommandsDocument(document);
        if (errors.length) {
          for (const message of errors) addCommandsFinding(result, 'error', 'commands.project_requirements_invalid', message, { path: relative, project, reason: 'project_requirements_invalid' });
          continue;
        }
        for (const requirement of document.requirements) records.push({
          id: requirement.id,
          required: requirement.required !== false,
          version: requirement.version || null,
          purpose: requirement.purpose || null,
          project,
          source: relative,
          provenance: { kind: 'project', project, path: relative },
        });
      } catch (error: any) {
        addCommandsFinding(result, 'error', 'commands.project_requirements_invalid', `Project Commands context 不可解析：${error.message}`, { path: relative, project, reason: 'project_requirements_invalid' });
      }
    }
    return { registry, records };
  }

  function commandRemovalBlockers(targetRoot: any, commandId: any, removedManifestPaths: any = []): any  {
    const removed: any = new Set(removedManifestPaths.map((file: any) => path.resolve(file)));
    const remaining = listCommandsManifestPaths(targetRoot).filter((file: any) => !removed.has(path.resolve(file))).some((file: any) => {
      try {
        const manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
        return validateCommandsManifest(manifest).length === 0 && manifest.commands.some((command: any) => command.id === commandId && command.enabled !== false && command.state !== 'uninstalled');
      } catch {
        return false;
      }
    });
    if (remaining) return [];
    const blockers: any[] = [];
    const result = createCommandsCheckResult(targetRoot);
    const { records } = readProjectRequirementRecords(targetRoot, result);
    for (const finding of result.findings.filter((item: any) => item.status === 'error')) {
      blockers.push({ kind: 'invalid-project-context', project: finding.project || null, path: finding.path, reason: finding.reason });
    }
    for (const record of records.filter((item: any) => item.id === commandId)) blockers.push({ kind: 'project', project: record.project, path: record.source });
    for (const file of removed) {
      if (!existsFile(file)) continue;
      try {
        const manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
        for (const command of manifest.commands.filter((item: any) => item.id === commandId && (item.required !== undefined || item.version?.constraint))) {
          blockers.push({ kind: 'workspace-default', path: toPosixRelative(targetRoot, file) });
        }
      } catch {
        // Existing validation will report malformed manifests before mutation.
      }
    }
    return blockers;
  }

  function finalizeCommandsCheckResult(result: any): any  {
    const counts: any = { ok: 0, info: 0, warning: 0, error: 0 };
    if (result.manifest.exists && result.manifest.valid) counts.ok += 1;
    for (const command of result.commands) counts[command.status] += 1;
    for (const finding of result.findings) {
      if (finding.status === 'error' || finding.status === 'warning') counts[finding.status] += 1;
    }
    result.summary = counts;
    result.ok = counts.error === 0;
    result.nextSteps = result.findings
      .filter((finding: any) => finding.suggestion || finding.installHint)
      .map((finding: any) => ({
        code: finding.code,
        suggestion: finding.suggestion,
        installHint: finding.installHint,
        commandId: finding.commandId,
      }))
      .slice(0, 10);
  }

  function runCommandsCheck(targetRoot: any, options: any = {}): any  {
    const result = createCommandsCheckResult(targetRoot);
    result.catalog = { definitions: [], manifests: result.manifests };
    result.requirements = [];
    result.effectiveConstraints = [];
    result.observations = [];
    result.context = { projects: [...(options.projects || [])] };
    const spawn = options.spawn || spawnSync;
    const rootManifestPath = commandsManifestPath(targetRoot);
    const manifestPaths = listCommandsManifestPaths(targetRoot);
    result.manifest.exists = existsFile(rootManifestPath);
    if (!result.manifest.exists) {
      addCommandsFinding(result, 'warning', 'commands.manifest_missing', '命令行工具清单不存在。', {
        path: result.manifest.path,
        suggestion: '创建 commands/manifest.yml；新 workspace 可通过 buildr init 初始化默认空清单。',
      });
    }
    const commandsById: any = new Map();
    for (const manifestPath of manifestPaths) {
      const relative = toPosixRelative(targetRoot, manifestPath);
      const record: any = { path: relative, exists: true, valid: false, schemaVersion: null, commandCount: 0 };
      result.manifests.push(record);
      try {
        const manifest = parseCommandsManifestYaml(fs.readFileSync(manifestPath, 'utf8'));
        record.schemaVersion = manifest.schemaVersion;
        const validationErrors = validateCommandsManifest(manifest);
        if (validationErrors.length) {
          for (const message of validationErrors) addCommandsFinding(result, 'error', 'commands.manifest_invalid', message, { path: relative });
          continue;
        }
        record.valid = true;
        record.commandCount = manifest.commands.length;
        if (manifestPath === rootManifestPath) {
          result.manifest.schemaVersion = manifest.schemaVersion;
          result.manifest.valid = true;
        }
        for (const command of manifest.commands) {
          const signature = normalizedCommandSignature(command);
          const existing = commandsById.get(command.id);
          if (!existing) {
            commandsById.set(command.id, { command, signature, sources: [relative] });
          } else if (existing.signature === signature) {
            existing.sources.push(relative);
          } else {
            addCommandsFinding(result, 'error', 'commands.catalog_identity_conflict', `Command ${command.id} 在多个 catalog collection 中的 definition identity 冲突。`, {
              commandId: command.id,
              sources: [...existing.sources, relative],
              reason: 'command_catalog_identity_conflict',
              suggestion: '统一重复 Command 的有效字段，或删除其中一个声明。',
            });
          }
        }
      } catch (error: any) {
        addCommandsFinding(result, 'error', 'commands.manifest_invalid', `命令行工具清单不可解析：${error.message}`, { path: relative });
      }
    }

    for (const { command, sources } of commandsById.values()) {
      if (command.enabled === false || command.state === 'uninstalled') {
        addCommandsFinding(result, 'info', 'commands.uninstalled', `命令行工具声明已卸载：${command.id}`, {
          path: sources[0],
          sources,
          commandId: command.id,
          suggestion: '如需恢复，运行 buildr builtin restore。',
        });
        continue;
      }
      result.catalog.definitions.push({ ...commandDefinitionIdentity(command), sources, provenance: sources.map((source: any) => ({ kind: 'workspace-catalog', path: source })) });
      if (command.required !== undefined || command.version?.constraint) result.requirements.push({
        id: command.id,
        required: command.required !== false,
        version: command.version?.constraint || null,
        project: null,
        source: sources[0],
        provenance: { kind: 'workspace-default', paths: sources },
        legacyCatalogConstraint: Boolean(command.version?.constraint),
      });
    }

    const selectedProjects = options.projects || [];
    const duplicateProjects = selectedProjects.filter((project: any, index: any) => selectedProjects.indexOf(project) !== index);
    const { registry, records } = readProjectRequirementRecords(targetRoot, result);
    for (const project of duplicateProjects) addCommandsFinding(result, 'error', 'commands.project_context_invalid', `Project context 重复：${project}`, { project, reason: 'duplicate_project_context' });
    for (const project of selectedProjects) {
      if (!isValidAssetId(project) || !registry.projects[project]) addCommandsFinding(result, 'error', 'commands.project_context_invalid', `Project context 未登记或不安全：${project}`, { project, reason: 'invalid_project_context' });
    }
    result.requirements.push(...records.map((record: any) => ({ ...record, applicable: selectedProjects.includes(record.project) })));

    for (const requirement of records) {
      if (!commandsById.has(requirement.id)) addCommandsFinding(result, 'error', 'commands.definition_missing', `Project ${requirement.project} 引用不存在的 Command definition：${requirement.id}`, {
        commandId: requirement.id,
        project: requirement.project,
        path: requirement.source,
        reason: 'command_definition_missing',
        suggestion: `先在 workspace catalog 登记 ${requirement.id}，或从 ${requirement.source} 删除该引用。`,
      });
    }

    const applicable = result.requirements.filter((requirement: any) => requirement.project === null || requirement.applicable === true);
    const grouped: any = new Map();
    for (const requirement of applicable) {
      if (!grouped.has(requirement.id)) grouped.set(requirement.id, []);
      grouped.get(requirement.id).push(requirement);
    }
    for (const [id, requirements] of grouped) {
      const merged = intersectVersionConstraints(requirements.map((requirement: any) => requirement.version).filter(Boolean));
      const effective: any = {
        id,
        required: requirements.some((requirement: any) => requirement.required),
        constraint: merged.constraint,
        constraints: merged.constraints,
        compatible: merged.compatible,
        provenance: requirements.map((requirement: any) => requirement.provenance),
        projects: [...new Set(requirements.map((requirement: any) => requirement.project).filter(Boolean))],
      };
      result.effectiveConstraints.push(effective);
      if (!merged.compatible) addCommandsFinding(result, 'error', 'commands.requirement_conflict', `Command ${id} 的 Project version constraints 不兼容。`, {
        commandId: id,
        projects: effective.projects,
        constraints: effective.constraints,
        provenance: effective.provenance,
        reason: 'command_requirement_conflict',
        suggestion: '调整对应 Project commands.yml，使版本要求存在可证明交集。',
      });
    }

    const sourceErrors = result.findings.some((finding: any) => finding.status === 'error');
    if (!sourceErrors) for (const effective of result.effectiveConstraints) {
      const record = commandsById.get(effective.id);
      if (!record) continue;
      const { command, sources } = record;
      const item: any = {
        id: command.id,
        name: command.name || command.id,
        executable: command.executable,
        purpose: command.purpose,
        description: command.description || null,
        installHint: command.installHint || null,
        status: 'ok',
        executablePath: null,
        version: command.version?.args && effective.constraint ? {
          constraint: effective.constraint,
          constraints: effective.constraints,
          args: command.version.args,
          current: null,
        } : null,
        message: '命令行工具可用。',
        difference: null,
        sources,
        requirements: effective.provenance,
        reason: 'command_available',
      };
      result.commands.push(item);
      result.observations.push(item);

      const executablePath = findExecutableOnPath(command.executable);
      item.executablePath = executablePath;
      if (!executablePath) {
        item.status = 'warning';
        item.reason = 'command_executable_missing';
        item.message = `当前本机找不到 executable：${command.executable}`;
        item.difference = { expected: command.executable, actual: null };
        addCommandsFinding(result, 'warning', 'commands.executable_missing', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          installHint: command.installHint || null,
          reason: item.reason,
          provenance: effective.provenance,
          suggestion: command.installHint || '根据组织约定安装该命令行工具。',
        });
        continue;
      }

      if (!effective.constraint) continue;
      if (!command.version?.args) {
        item.status = 'warning';
        item.reason = 'command_version_probe_missing';
        item.message = `Command ${command.id} 有版本要求但 catalog definition 未声明 version probe args。`;
        addCommandsFinding(result, 'warning', 'commands.version_probe_missing', item.message, { commandId: command.id, sources, expected: effective.constraint, reason: 'command_version_probe_missing' });
        continue;
      }

      const versionCheck = probeCommandVersion(executablePath, command.version.args, { spawn });
      if (versionCheck.status === 'spawn-failed') {
        item.status = 'warning';
        item.reason = 'command_version_probe_spawn_failed';
        item.message = `无法启动 ${command.id} 的版本探测。`;
        item.difference = { expected: command.version.constraint, actual: null };
        addCommandsFinding(result, 'warning', 'commands.version_probe_spawn_failed', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          executablePath,
          versionArgs: command.version.args,
          installHint: command.installHint || null,
          reason: item.reason,
          probeError: versionCheck.error,
          provenance: effective.provenance,
          suggestion: command.installHint || '请确认该命令行工具可执行入口和版本探测参数。',
        });
        continue;
      }
      const output = versionCheck.output;
      const currentVersion = versionCheck.currentVersion;
      if (versionCheck.status === 'unknown') {
        item.status = 'warning';
        item.reason = 'command_version_unknown';
        item.message = `无法从版本输出判断 ${command.id} 的版本。`;
        item.difference = { expected: command.version.constraint, actual: output || null };
        addCommandsFinding(result, 'warning', 'commands.version_unknown', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          executablePath,
          versionArgs: command.version.args,
          installHint: command.installHint || null,
          reason: item.reason,
          provenance: effective.provenance,
          suggestion: command.installHint || '根据组织约定确认或升级该命令行工具。',
        });
        continue;
      }

      if (!currentVersion) throw new Error(`Parsed command version is missing for ${command.id}.`);
      item.version.current = currentVersion.join('.');
      const satisfies = effective.constraints.every((raw: any) => versionSatisfies(currentVersion, parseVersionConstraint(raw)!));
      if (!satisfies) {
        item.status = 'warning';
        item.reason = 'command_version_unsatisfied';
        item.message = `${command.id} 当前版本 ${item.version.current} 不满足 ${effective.constraint}。`;
        item.difference = { expected: effective.constraint, actual: item.version.current };
        addCommandsFinding(result, 'warning', 'commands.version_unsatisfied', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          expected: effective.constraint,
          actual: item.version.current,
          installHint: command.installHint || null,
          reason: item.reason,
          provenance: effective.provenance,
          suggestion: command.installHint || '根据组织约定升级该命令行工具。',
        });
      }
    }

    finalizeCommandsCheckResult(result);
    return result;
  }

  function commandsCheck(input: any): any  {
    return runCommandsCheck(input.targetRoot, { projects: input.projects || [] });
  }

  return Object.freeze({ PROJECT_COMMANDS_SCHEMA, normalizeCommandCollection, commandsManifestPath, projectCommandsPath, assertSafeCommandCollectionTarget, listCommandsManifestPaths, parseCommandsManifestYaml, parseProjectCommandsYaml, validateProjectCommandsDocument, renderProjectCommandsYaml, isPlainObject, validateCommandsManifest, renderCommandsManifestYaml, readCommandsManifestForWrite, writeCommandsManifest, buildCommandEntry, commandsAddUnsafe, commandsAdd, commandsRemoveUnsafe, commandsRemove, parseVersionConstraint, parseVersion, compareVersions, versionSatisfies, intersectVersionConstraints, findExecutableOnPath, buildCommandProbeInvocation, probeCommandVersion, createCommandsCheckResult, addCommandsFinding, stableValue, commandDefinitionIdentity, normalizedCommandSignature, readRegisteredProjects, readProjectRequirementRecords, commandRemovalBlockers, finalizeCommandsCheckResult, runCommandsCheck, commandsCheck });
}
