import { registerApplicationDoctor } from './application/diagnostics.ts';
import { registerSystemDoctorApplication } from './application/doctor-application.ts';

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
  verificationDeclaration = null,
  workspaceQuery = null,
}: any = {}) {
  const requiredCapabilities = [agentRuntimeCapability, agentCapabilityQuery, verificationDeclaration, workspaceQuery].filter(Boolean);
  return Object.freeze({
    id: SYSTEM_DOCTOR_MODULE_ID,
    requires: Object.freeze(requiredCapabilities),
    create(requires: any) {
      const composition = Object.create(runtime);
      for (const capability of requiredCapabilities) Object.assign(composition, requires[capability]);
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
