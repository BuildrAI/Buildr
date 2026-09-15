import { createDoctorCliContributions } from './interfaces/cli/doctor.ts';
import { registerApplicationDoctor } from './application/diagnostics.ts';
import { registerSystemDoctorApplication } from './application/doctor-application.ts';
import { WORKSPACE_DIAGNOSTICS } from '../workspace/module.ts';

export const SYSTEM_DOCTOR_MODULE_ID = 'system-doctor';
export const SYSTEM_DOCTOR_APPLICATION = 'system.doctor.application';

export function createSystemDoctorModule(runtime: any, {
  diagnosticContributions = [],
  agentRuntimeCapability = null,
  agentCapabilityQuery = null,
  agentAssetsInternal = null,
  verificationDeclaration = null,
  workspaceQuery = null,
  installationApplication = null,
  workspaceApplication = null,
}: any = {}) {
  const requiredCapabilities = [WORKSPACE_DIAGNOSTICS, agentRuntimeCapability, agentCapabilityQuery, agentAssetsInternal, verificationDeclaration, workspaceQuery, installationApplication, workspaceApplication].filter(Boolean);
  return Object.freeze({
    id: SYSTEM_DOCTOR_MODULE_ID,
    requires: Object.freeze(requiredCapabilities),
    create(requires: any) {
      const composition = Object.create(runtime);
      Object.assign(composition, requires[WORKSPACE_DIAGNOSTICS]);
      const copy = (capability: string | null, names: readonly string[]) => {
        if (!capability) return;
        for (const name of names) {
          if (!(name in requires[capability])) throw new TypeError(`Diagnostics dependency is missing: ${capability}.${name}`);
          composition[name] = requires[capability][name];
        }
      };
      copy(agentRuntimeCapability, ['RUNTIME_ADAPTERS', 'RUNTIME_CHECKERS', 'SUPPORTED_AGENT_IDS', 'UNSUPPORTED_AGENT_GUIDANCE', 'assembleRuntimeProjection', 'getRuntimeAdapter', 'isSupportedAgent']);
      copy(agentCapabilityQuery, ['resolveSkillCapabilityGraph']);
      copy(agentAssetsInternal, ['assertAgentId', 'diagnoseRules', 'runCommandsCheck', 'componentRegistryPath', 'packageComponentsStatus', 'managedRuntimeSkillOrphans', 'listManagedDirectories', 'runtimeImplementation', 'readSkillManifestSchemaVersion', 'skillsManifestPath', 'inspectPackageBuiltins']);
      copy(verificationDeclaration, ['createProjectVerificationDiagnostics']);
      copy(workspaceQuery, ['resolveSourceRoot']);
      copy(installationApplication, ['buildInstallationInventory', 'releaseAwareness']);
      copy(workspaceApplication, ['diagnoseWorkspaceMetadata']);
      registerApplicationDoctor(composition);
      const doctorApplication = registerSystemDoctorApplication({
        discoverDoctorScopes: composition.discoverDoctorScopes,
        diagnoseProjectRegistry: composition.diagnoseProjectRegistry,
        diagnoseWorkspace: composition.diagnoseWorkspace,
        diagnoseLegacyPractices: composition.diagnoseLegacyPractices,
        diagnoseHierarchy: composition.diagnoseHierarchy,
        diagnoseServices: composition.diagnoseServices,
        diagnoseRuntime: composition.diagnoseRuntime,
        detectManagedRuntimeAgents: composition.detectManagedRuntimeAgents,
        diagnoseCommands: composition.diagnoseCommands,
        diagnoseComponents: composition.diagnoseComponents,
        diagnoseSkillsManifestSchemas: composition.diagnoseSkillsManifestSchemas,
        diagnoseSkillCapabilities: composition.diagnoseSkillCapabilities,
        diagnoseProjectVerification: composition.diagnoseProjectVerification,
        inspectPackageBuiltins: composition.inspectPackageBuiltins,
        finalizeDoctorResult: composition.finalizeDoctorResult,
        releaseAwareness: composition.releaseAwareness,
        assertAgentId: composition.assertAgentId,
        addDoctorFinding: composition.addDoctorFinding,
        diagnoseRules: composition.diagnoseRules,
        diagnoseWorkspaceMetadata: composition.diagnoseWorkspaceMetadata,
        diagnoseMutations: composition.diagnoseMutations,
        buildInstallationInventory: composition.buildInstallationInventory,
        inspectWorkspaceStructuredStore: composition.inspectWorkspaceStructuredStore,
        RUNTIME_ADAPTERS: composition.RUNTIME_ADAPTERS,
        SUPPORTED_AGENT_IDS: composition.SUPPORTED_AGENT_IDS,
        isSupportedAgent: composition.isSupportedAgent,
      });
      const diagnostics = Object.freeze([...diagnosticContributions]);
      const application = Object.freeze({
        doctor: (input: import('./application/doctor-application.ts').DoctorInput) => doctorApplication.doctor(input),
        diagnoseWorkspaceStructuredStore: doctorApplication.diagnoseWorkspaceStructuredStore,
        gitignoreLines: (...args: any[]) => composition.gitignoreLines(...args),
        readGitRemote: (...args: any[]) => composition.readGitRemote(...args),
        diagnostics,
      });
      return Object.freeze({
        provides: { [SYSTEM_DOCTOR_APPLICATION]: application },
        contributions: { cli: createDoctorCliContributions(application) },
      });
    },
  });
}
