export class TaskProject {
  readonly taskId: string;
  readonly project: string;

  constructor(taskId: string, project: string) {
    this.taskId = taskId;
    this.project = project;
  }
}
