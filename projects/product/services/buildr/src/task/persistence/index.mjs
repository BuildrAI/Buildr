import { registerParentCoordinationRepository } from './coordination/parent-coordination-repository.mjs';
import { registerTaskDevelopmentRepository } from './development/task-development-repository.mjs';
import { registerTaskEnvironmentRepository } from './environment/task-environment-repository.mjs';
import { registerTaskExecutionRecordBodyStore } from './execution-record/task-execution-record-body-store.mjs';
import { registerTaskExecutionRecordRepository } from './execution-record/task-execution-record-repository.mjs';
import { registerTaskFinishRepository } from './finish/task-finish-repository.mjs';
import { registerTaskOverviewRepository } from './overview/task-overview-repository.mjs';
import { registerTaskVerificationRepository } from './verification/task-verification-repository.mjs';

const TASK_PERSISTENCE_REGISTRATIONS = Object.freeze([
  registerTaskVerificationRepository,
  registerTaskDevelopmentRepository,
  registerTaskOverviewRepository,
  registerParentCoordinationRepository,
  registerTaskFinishRepository,
  registerTaskExecutionRecordRepository,
  registerTaskExecutionRecordBodyStore,
  registerTaskEnvironmentRepository,
]);

export function registerTaskPersistence(runtime) {
  for (const register of TASK_PERSISTENCE_REGISTRATIONS) register(runtime);
  return runtime;
}
