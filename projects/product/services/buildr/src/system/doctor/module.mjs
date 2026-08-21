import { registerApplicationDoctor } from './application/diagnostics.mjs';
import { registerSystemDoctorApplication } from './application/doctor-application.mjs';

export const SYSTEM_DOCTOR_MODULE_ID = 'system-doctor';
export const SYSTEM_DOCTOR_APPLICATION = 'system.doctor.application';

function createDoctorCliContributions(application) {
  return Object.freeze([Object.freeze({
    key: 'doctor',
    surface: 'primary',
    summary: '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。',
    help: [
      'Usage: buildr doctor [--agent <agent>] [--target <dir>] [--scope <.|projects/project[/services/service[/path...]]>] [--json] [--detail <compact|full>] [--include-info] [--verbose]',
      '',
      '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。JSON 默认输出 compact；完整 inventory 使用 --detail full。',
    ],
    match: ({ domain }) => domain === 'doctor',
    run: (_runtime, context) => application.doctor(context.argv.slice(3)),
  })]);
}

export function createSystemDoctorModule(runtime, { diagnosticContributions = [] } = {}) {
  return Object.freeze({
    id: SYSTEM_DOCTOR_MODULE_ID,
    requires: Object.freeze([]),
    create() {
      registerApplicationDoctor(runtime);
      registerSystemDoctorApplication(runtime);
      const diagnostics = Object.freeze([...diagnosticContributions]);
      const application = Object.freeze({
        doctor: (...args) => runtime.doctor(...args),
        diagnoseWorkspaceStructuredStore: (...args) => runtime.diagnoseWorkspaceStructuredStore(...args),
        diagnostics,
      });
      return Object.freeze({
        provides: { [SYSTEM_DOCTOR_APPLICATION]: application },
        contributions: { cli: createDoctorCliContributions(application) },
      });
    },
  });
}
