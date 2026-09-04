import { taskProfessionalApi } from '../../../api';
import { taskRecordApi } from '../api/task-record-api';

export function useTaskMutations() {
  return {
    update: taskRecordApi.update,
    complete: taskRecordApi.complete,
    abandon: taskRecordApi.abandon,
    coordination: taskProfessionalApi.coordination,
  };
}
