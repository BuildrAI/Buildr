import { registerApplicationDoctor } from './application/diagnostics.ts';
import { registerSystemDoctorApplication } from './application/doctor-application.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_DIAGNOSTICS } from '../workspace/module.ts';

export const SYSTEM_DOCTOR_MODULE_ID = 'system-doctor';
export const SYSTEM_DOCTOR_APPLICATION = 'system.doctor.application';

function createDoctorCliContributions(application: any) {
  return Object.freeze([Object.freeze({
    key: 'doctor',
    surface: 'primary',
    summary: '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。',
    help: [
      'Usage: buildr doctor [--agent <agent>] [--target <dir>] [--scope <.|projects/project[/services/service[/path...]]>] [--json] [--detail <compact|full>] [--include-info] [--verbose]',
      '',
      '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。JSON 默认输出 compact；完整 inventory 使用 --detail full。',
    ],
    match: ({ domain }: any) => domain === 'doctor',
    run: (_runtime: any, context: any) => application.doctor(context.argv.slice(3)),
  })]);
}

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
      registerSystemDoctorApplication(composition);
      const diagnostics = Object.freeze([...diagnosticContributions]);
      const application = Object.freeze({
        doctor: (...args: any[]) => composition.doctor(...args),
        diagnoseWorkspaceStructuredStore: (...args: any[]) => composition.diagnoseWorkspaceStructuredStore(...args),
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
