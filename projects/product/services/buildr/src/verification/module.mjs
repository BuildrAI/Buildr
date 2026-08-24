import { registerVerificationApplication } from './application/verification-application.mjs';
import {
  createProjectVerificationDiagnostics,
  parseProjectVerification,
  validateProjectVerification,
} from './application/project-verification-diagnostics.mjs';
import {
  cleanupAbsentVerificationEvidence,
  cleanupVerificationEvidence,
  createVerificationEvidenceLifecycle,
  normalizeVerificationEvidenceLifecycle,
} from './infrastructure/evidence-lifecycle.mjs';
import {
  createAuthorizedUnknownExecutionRecordFiles,
  loadVerificationExecutionRecordRecovery,
} from './infrastructure/execution-record-recovery.mjs';

export const VERIFICATION_MODULE_ID = 'project-verification';
export const VERIFICATION_APPLICATION = 'project-verification.application';
export const VERIFICATION_DECLARATION = 'project-verification.declaration';
export const VERIFICATION_EXECUTION_SUPPORT = 'project-verification.execution-support';

export function createVerificationModule(runtime, { taskEnvironmentDeclarationCapability } = {}) {
  if (!taskEnvironmentDeclarationCapability) throw new Error('Verification Module requires a Task Environment Declaration capability identity.');
  return Object.freeze({
    id: VERIFICATION_MODULE_ID,
    requires: Object.freeze([taskEnvironmentDeclarationCapability]),
    create(requires) {
      const projectEnvironmentPreparation = requires[taskEnvironmentDeclarationCapability];
      registerVerificationApplication(runtime, { projectEnvironmentPreparation });
      const application = Object.freeze({
        verificationRun: (...args) => runtime.verificationRun(...args),
        verificationCleanup: (...args) => runtime.verificationCleanup(...args),
      });
      const declaration = Object.freeze({
        parseProjectVerification,
        validateProjectVerification: (value, context = {}) => validateProjectVerification(value, {
          ...context,
          projectEnvironmentPreparationScopeSelector: projectEnvironmentPreparation.projectEnvironmentPreparationScopeSelector,
        }),
        createProjectVerificationDiagnostics: ({ addDoctorFinding, resolveSourceRoot }) => createProjectVerificationDiagnostics({
          addDoctorFinding,
          projectEnvironmentPreparation,
          resolveSourceRoot,
        }),
      });
      const executionSupport = Object.freeze({
        cleanupAbsentVerificationEvidence,
        cleanupVerificationEvidence,
        createVerificationEvidenceLifecycle,
        normalizeVerificationEvidenceLifecycle,
        createAuthorizedUnknownExecutionRecordFiles,
        loadVerificationExecutionRecordRecovery,
      });
      return Object.freeze({
        provides: {
          [VERIFICATION_APPLICATION]: application,
          [VERIFICATION_DECLARATION]: declaration,
          [VERIFICATION_EXECUTION_SUPPORT]: executionSupport,
        },
        contributions: {
          diagnostics: [Object.freeze({ id: 'project-verification.diagnostics', readModel: declaration })],
        },
      });
    },
  });
}
