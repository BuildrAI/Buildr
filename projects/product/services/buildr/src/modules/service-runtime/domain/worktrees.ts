export type ServiceWorktree = {
  id: string;
  path: string;
  label: string;
  main: boolean;
  branch: string | null;
  head: string | null;
  dirty: boolean | null;
  taskId: string | null;
  taskTitle: string | null;
};
