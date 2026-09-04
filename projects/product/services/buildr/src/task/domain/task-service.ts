export class TaskService {
  readonly taskId: string;
  readonly project: string;
  readonly service: string;

  constructor(taskId: string, project: string, service: string) {
    this.taskId = taskId;
    this.project = project;
    this.service = service;
  }
}
