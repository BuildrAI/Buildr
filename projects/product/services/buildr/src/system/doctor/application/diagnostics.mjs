import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from '../../../infrastructure/process.mjs';
import { createRuntimeDiagnostics } from './runtime-diagnostics.mjs';
import { createScopeDiagnostics } from './scope-diagnostics.mjs';
import { createServiceDiagnostics } from './service-diagnostics.mjs';
import { createCapabilityDiagnostics } from './capability-diagnostics.mjs';
import { finalizeDoctorResult } from './result-model.mjs';
import { printProductInstallationReport } from './product-installation-report.mjs';

export function registerApplicationDoctor(runtime) {
  const { RUNTIME_CHECKERS, SUPPORTED_AGENT_IDS, UNSUPPORTED_AGENT_GUIDANCE, assembleRuntimeProjection, getRuntimeAdapter, isSupportedAgent } = runtime;
  const { resolveSkillCapabilityGraph, createProjectVerificationDiagnostics } = runtime;
  const runCommandsCheck = (...args) => runtime.runCommandsCheck(...args);
  const componentRegistryPath = (...args) => runtime.componentRegistryPath(...args);
  const packageComponentsStatus = (...args) => runtime.packageComponentsStatus(...args);
  const managedRuntimeSkillOrphans = (...args) => runtime.managedRuntimeSkillOrphans(...args);
  const listManagedDirectories = (...args) => runtime.listManagedDirectories(...args);
  const runtimeImplementation = (...args) => runtime.runtimeImplementation(...args);
  const readSkillManifestSchemaVersion = (...args) => runtime.readSkillManifestSchemaVersion(...args);
  const skillsManifestPath = (...args) => runtime.skillsManifestPath(...args);
  const parseYamlValue = (...args) => runtime.parseYamlValue(...args);
  const parseServicesManifestYaml = (...args) => runtime.parseServicesManifestYaml(...args);
  const parseServicesManifest = (...args) => runtime.parseServicesManifest(...args);
  const parseProjectsYaml = (...args) => runtime.parseProjectsYaml(...args);
  const validateProjectsRegistry = (...args) => runtime.validateProjectsRegistry(...args);
  const validateServicesManifest = (...args) => runtime.validateServicesManifest(...args);
  const projectsManifestPath = (...args) => runtime.projectsManifestPath(...args);
  const servicesManifestPath = (...args) => runtime.servicesManifestPath(...args);
  const gitOutput = (...args) => runtime.gitOutput(...args);
  const gitCurrentBranch = (...args) => runtime.gitCurrentBranch(...args);
  const gitBoundaryFor = (...args) => runtime.gitBoundaryFor(...args);
  const gitBoundaryIgnored = (...args) => runtime.gitBoundaryIgnored(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const addDoctorFinding = (...args) => runtime.addDoctorFinding(...args);
  const buildrWorkspaceIdentity = (...args) => runtime.buildrWorkspaceIdentity(...args);
  const observeProjectGit = (...args) => runtime.observeProjectGit(...args);
  const sameGitIdentity = (...args) => runtime.sameGitIdentity(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const resolveSourceRoot = (...args) => runtime.resolveSourceRoot(...args);

  const {
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
  } = createScopeDiagnostics({
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
  });
  const {
    diagnoseServicesMetadata,
    diagnoseServices,
  } = createServiceDiagnostics({
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
    resolveSourceRoot,
  });
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
  const { diagnoseSkillCapabilities, printCapabilityReport } = createCapabilityDiagnostics({ addDoctorFinding, isSupportedAgent, path, resolveSkillCapabilityGraph });
  const { diagnoseProjectVerification } = createProjectVerificationDiagnostics({ addDoctorFinding, resolveSourceRoot });

  function diagnoseSkillsManifestSchemas(result, targetRoot, scopes) {
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

  function printDoctorReport(result) {
    console.log(`Buildr doctor for ${result.targetRoot}`);
    console.log(`Status: ok=${result.summary.ok} info=${result.summary.info} warning=${result.summary.warning} error=${result.summary.error}`);
    console.log(`Health: workspaceValid=${result.health.workspaceValid} ready=${result.health.ready} actionRequired=${result.health.actionRequired} actionable=${result.health.actionableCount}`);
    console.log('');

    if (result.findings.length === 0) {
      console.log('[ok] 未发现问题。');
    } else {
      for (const finding of result.findings) {
        const location = finding.path ? ` (${finding.path})` : '';
        console.log(`[${finding.status}] ${finding.code}${location} - ${finding.message}`);
      }
    }

    printProductInstallationReport(result);

    if (result.notices?.length) {
      console.log('\n版本发布提示：');
      for (const notice of result.notices) console.log(`  ${notice.message}${notice.command ? `\n  命令：${notice.command}` : ''}`);
    }

    if (result.repairPlan.length > 0) {
      console.log('');
      console.log('Repair plan:');
      for (const step of result.repairPlan) {
        console.log(`${step.id} [${step.priority}] ${step.codes.join(', ')}`);
        if (step.suggestion) console.log(`  建议：${step.suggestion}`);
        for (const command of step.commands || []) console.log(`  命令：${command}`);
      }
    }

    printCapabilityReport(result);
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
    printDoctorReport,
  });
  return runtime;
}
