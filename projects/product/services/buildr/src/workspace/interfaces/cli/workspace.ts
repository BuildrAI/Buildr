export type WorkspaceCliApplication = {
  initBuildr(args: string[]): any;
  bootstrapGuide(): any;
  mutationRecover(args: string[]): any;
};

export type WorkspaceCliOperation = 'init' | 'bootstrap-guide' | 'mutation-recover';

export function workspaceCommand(application: WorkspaceCliApplication, operation: WorkspaceCliOperation, args: string[] = []) {
  if (operation === 'init') return application.initBuildr(args);
  if (operation === 'bootstrap-guide') return application.bootstrapGuide();
  return application.mutationRecover(args);
}
