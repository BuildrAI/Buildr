import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from '../../../infrastructure/process.ts';
import { createRuntimeDiagnostics } from './runtime-diagnostics.ts';
import { createCapabilityDiagnostics } from './capability-diagnostics.ts';
import { finalizeDoctorResult } from './result-model.ts';

export function registerApplicationDoctor(runtime: any) {
  const { RUNTIME_CHECKERS, SUPPORTED_AGENT_IDS, UNSUPPORTED_AGENT_GUIDANCE, assembleRuntimeProjection, getRuntimeAdapter, isSupportedAgent } = runtime;
  const { resolveSkillCapabilityGraph, createProjectVerificationDiagnostics } = runtime;
  const runCommandsCheck = (...args: any[]) => runtime.runCommandsCheck(...args);
  const componentRegistryPath = (...args: any[]) => runtime.componentRegistryPath(...args);
  const packageComponentsStatus = (...args: any[]) => runtime.packageComponentsStatus(...args);
  const managedRuntimeSkillOrphans = (...args: any[]) => runtime.managedRuntimeSkillOrphans(...args);
  const runtimeImplementation = (...args: any[]) => runtime.runtimeImplementation(...args);
  const readSkillManifestSchemaVersion = (...args: any[]) => runtime.readSkillManifestSchemaVersion(...args);
  const skillsManifestPath = (...args: any[]) => runtime.skillsManifestPath(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);
  const addDoctorFinding = (...args: any[]) => runtime.addDoctorFinding(...args);
  const resolveSourceRoot = (...args: any[]) => runtime.resolveSourceRoot(...args);
  const {
    scopeParts, workspaceName, readProjectsRegistryIfExists, discoverDoctorScopes,
    resolveRepoPath, readGitRemote, gitignoreLines, isIgnoredByWorkspace,
    projectDoctorContextFor, projectBaselineStatus, missingProjectBaselineAssets,
    diagnoseProjectRegistry, diagnoseWorkspace, diagnoseLegacyPractices, diagnoseHierarchy,
    diagnoseServicesMetadata, diagnoseServices,
  } = runtime;

  const {
    runtimeFindingsForDoctor,
    summarizeRuntimeFindings,
    addUnsupportedAgentFinding,
    detectManagedRuntimeAgents,
    diagnoseRuntime,
    diagnoseCommands,
    diagnoseComponents,
  } = createRuntimeDiagnostics({
    RUNTIME_CHECKERS,
    SUPPORTED_AGENT_IDS,
    UNSUPPORTED_AGENT_GUIDANCE,
    addDoctorFinding,
    assembleRuntimeProjection,
    componentRegistryPath,
    existsFile,
    fs,
    getRuntimeAdapter,
    isSupportedAgent,
    managedRuntimeSkillOrphans,
    packageComponentsStatus,
    path,
    runCommandsCheck,
    runtimeImplementation,
    toPosixRelative,
  });
  const { diagnoseSkillCapabilities } = createCapabilityDiagnostics({ addDoctorFinding, isSupportedAgent, path, resolveSkillCapabilityGraph });
  const { diagnoseProjectVerification } = createProjectVerificationDiagnostics({ addDoctorFinding, resolveSourceRoot });

  function diagnoseSkillsManifestSchemas(result: any, targetRoot: any, scopes: any) {
    const checked = new Set();
    const scopeRoots = [targetRoot];
    for (const scope of scopes) {
      if (scope.project) scopeRoots.push(path.join(targetRoot, 'projects', scope.project));
    }
    for (const scopeRoot of scopeRoots) {
      const manifestPath = skillsManifestPath(scopeRoot);
      const relative = toPosixRelative(targetRoot, manifestPath);
      if (checked.has(relative) || !existsFile(manifestPath)) continue;
      checked.add(relative);
      const schemaVersion = readSkillManifestSchemaVersion(manifestPath);
      const isWorkspace = scopeRoot === targetRoot;
      if (isWorkspace && schemaVersion === 'buildr.skills/v3') continue;
      const manifestText = fs.readFileSync(manifestPath, 'utf8');
      const hasV2OnlyKeys = /^(?:contracts|bindings):/m.test(manifestText);
      const supportedLegacy = ['buildr.skills/v1', 'buildr.skills/v2'].includes(schemaVersion) || (schemaVersion === null && !hasV2OnlyKeys);
      const projectLegacy = !isWorkspace && supportedLegacy;
      addDoctorFinding(result, projectLegacy ? 'error' : supportedLegacy ? 'warning' : 'error', projectLegacy ? 'skills.project_assets_unsupported' : supportedLegacy ? 'skills.schema_version_legacy' : 'skills.schema_version_invalid', `${projectLegacy ? 'Legacy Project Skill source 已不受支持' : supportedLegacy ? 'Skills manifest 等待事务化升级' : 'Skills manifest schemaVersion 不支持'}：${relative}`, {
          path: relative,
          supportedVersions: ['buildr.skills/v1', 'buildr.skills/v2', 'buildr.skills/v3'],
          suggestion: projectLegacy ? '当前 Buildr 不提供自动迁移；升级前使用旧版本完成迁移，或人工审阅后把 source 整理到 workspace skills/。' : supportedLegacy ? '运行 buildr update 或 buildr sync 迁移 workspace manifest 到 schemaVersion: buildr.skills/v3。' : '先更新 Buildr CLI；不要用当前版本重写该 manifest。',
          userActionRequired: true,
        });
    }
  }


  Object.assign(runtime, {
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
    diagnoseServicesMetadata,
    diagnoseServices,
    runtimeFindingsForDoctor,
    summarizeRuntimeFindings,
    addUnsupportedAgentFinding,
    detectManagedRuntimeAgents,
    diagnoseRuntime,
    diagnoseCommands,
    diagnoseComponents,
    diagnoseSkillsManifestSchemas,
    diagnoseSkillCapabilities,
    diagnoseProjectVerification,
    finalizeDoctorResult,
  });
  return runtime;
}
