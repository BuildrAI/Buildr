import { createProjectVerificationApplication, type ProjectTestingWorkspaceQuery } from './application/project-verification-application.ts';
import { normalizeProjectVerification, parseProjectVerification, validateProjectVerification } from './domain/project-verification.ts';
import { projectVerificationCommand } from './interfaces/cli/project-verification.ts';
import { WORKSPACE_QUERY } from '../workspace/module.ts';

export const VERIFICATION_MODULE_ID = 'project-verification';
export const VERIFICATION_APPLICATION = 'project-verification.application';
export const VERIFICATION_DECLARATION = 'project-verification.declaration';

export function createProjectVerificationCliContributions(application: any = null) {
  return Object.freeze(['inspect', 'validate', 'update'].map((operation) => Object.freeze({
    key: `project verification ${operation}`,
    surface: 'agent-machine',
    summary: operation === 'inspect' ? '读取 Project 测试地图。' : operation === 'validate' ? '校验 Agent 形成的 verification.yml 候选。' : '按已观察版本更新 Project 测试地图。',
    help: [operation === 'inspect'
      ? 'Usage: buildr project verification inspect <project> [--target <workspace>] [--json]'
      : operation === 'validate'
        ? 'Usage: buildr project verification validate <project> --file <candidate.yml> [--target <workspace>] [--json]'
        : 'Usage: buildr project verification update <project> --file <candidate.yml> --expected-identity <identity|absent> [--target <workspace>] [--json]',
    '',
    'Task Verification Skill 指导 Agent 从真实测试代码、构建脚本、CI 与说明形成候选；Application 只校验和维护测试地图。'],
    match: ({ domain, action, runtimeId }: any) => domain === 'project' && action === 'verification' && runtimeId === operation,
    run: (runtime: any, context: any) => projectVerificationCommand(application || runtime, operation, context.argv.slice(5)),
  })));
}

export function createVerificationModule(runtime: { atomicWriteFile(file: string, content: string): void }) {
  return Object.freeze({
    id: VERIFICATION_MODULE_ID,
    requires: Object.freeze([WORKSPACE_QUERY]),
    create(requires: Record<string, ProjectTestingWorkspaceQuery>) {
      const workspaceQuery = requires[WORKSPACE_QUERY];
      const application = createProjectVerificationApplication(workspaceQuery, {
        atomicWriteFile: (file, content) => runtime.atomicWriteFile(file, content),
      });
      const cliApplication = Object.freeze({
        ...application,
        projectVerificationCommand: (operation: string, args: string[]) => projectVerificationCommand(application, operation, args),
      });
      const declaration = Object.freeze({
        parseProjectVerification,
        normalizeProjectVerification,
        validateProjectVerification,
        createProjectVerificationDiagnostics: application.createProjectVerificationDiagnostics,
      });
      return Object.freeze({
        provides: { [VERIFICATION_APPLICATION]: cliApplication, [VERIFICATION_DECLARATION]: declaration },
        contributions: {
          cli: createProjectVerificationCliContributions(cliApplication),
          diagnostics: [Object.freeze({ id: 'project-verification.diagnostics', readModel: declaration })],
        },
      });
    },
  });
}
