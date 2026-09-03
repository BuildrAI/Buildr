import fs from 'node:fs';
import path from 'node:path';
import { resolveSourceRoot } from '../workspace/domain/source-root.ts';
import { registerProjectVerificationApplication } from './application/project-verification-application.ts';
import { normalizeProjectVerification, parseProjectVerification, validateProjectVerification } from './domain/project-verification.ts';

export const VERIFICATION_MODULE_ID = 'project-verification';
export const VERIFICATION_APPLICATION = 'project-verification.application';
export const VERIFICATION_DECLARATION = 'project-verification.declaration';

export function createVerificationModule(runtime: any) {
  return Object.freeze({
    id: VERIFICATION_MODULE_ID,
    requires: Object.freeze([]),
    create() {
      registerProjectVerificationApplication(runtime);
      const application = Object.freeze({
        inspectProjectVerification: (...args: any[]) => runtime.inspectProjectVerification(...args),
        validateProjectVerificationCandidate: (...args: any[]) => runtime.validateProjectVerificationCandidate(...args),
        updateProjectVerification: (...args: any[]) => runtime.updateProjectVerification(...args),
        projectVerificationCommand: (...args: any[]) => runtime.projectVerificationCommand(...args),
      });
      const declaration = Object.freeze({
        parseProjectVerification,
        normalizeProjectVerification,
        validateProjectVerification,
        createProjectVerificationDiagnostics: ({ addDoctorFinding }: any) => ({
          diagnoseProjectVerification(result: any, targetRoot: string, registry: any = null) {
            result.projectVerification = [];
            for (const [projectCode, project] of Object.entries<any>(registry?.projects || {})) {
              const projectRoot = resolveSourceRoot(targetRoot, project.source); const file = path.join(projectRoot, 'verification.yml'); if (!fs.existsSync(file)) continue;
              const relative = path.relative(targetRoot, file).split(path.sep).join('/'); const services = Object.keys(runtime.readServiceRegistryPersistence?.(targetRoot, project, project.workspaceId)?.registry?.services || {});
              let value; let errors: string[] = [];
              try { value = parseProjectVerification(fs.readFileSync(file, 'utf8'), relative); errors = validateProjectVerification(value, { projectCode, services }); } catch (error: any) { errors = [error.message]; }
              result.projectVerification.push({ project: projectCode, path: relative, valid: errors.length === 0, testingCount: Array.isArray(value?.testing) ? value.testing.length : 0 });
              for (const message of errors) addDoctorFinding(result, 'error', 'project.verification_invalid', message, { path: relative, userActionRequired: true, suggestion: '使用 Task Verification Skill 探查项目测试体系，并通过 project verification validate/update 修复测试地图。' });
            }
          },
        }),
      });
      return Object.freeze({ provides: { [VERIFICATION_APPLICATION]: application, [VERIFICATION_DECLARATION]: declaration }, contributions: { diagnostics: [Object.freeze({ id: 'project-verification.diagnostics', readModel: declaration })] } });
    },
  });
}
