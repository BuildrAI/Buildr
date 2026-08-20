import { registerTaskRecordApplication } from './application/record/task-record-application.mjs';
import { registerTaskRecordRepository } from './persistence/record/task-record-repository.mjs';

export function registerTaskRecordModule(runtime) {
  registerTaskRecordRepository(runtime);
  registerTaskRecordApplication(runtime);
  return runtime;
}
