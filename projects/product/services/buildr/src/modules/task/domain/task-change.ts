export class TaskChange {
  readonly taskId: string;
  readonly project: string;
  readonly change: string;

  constructor(taskId: string, project: string, change: string) {
    this.taskId = taskId;
    this.project = project;
    this.change = change;
  }
}
