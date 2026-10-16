import { createRuntime, runtimeProvide } from '../../../projects/product/services/buildr/src/bootstrap/runtime.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../../../projects/product/services/buildr/src/modules/task/module.ts';

export function createReleaseToolRuntime(): any {
  const runtime = createRuntime();
  return Object.freeze({
    ...runtimeProvide(runtime, TASK_QUERY_APPLICATION),
    ...runtimeProvide(runtime, TASK_WORKTREE_PROVIDER),
  });
}
