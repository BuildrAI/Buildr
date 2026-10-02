import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../task/module.ts';
import { createCodeApplication, type CodeDependencies } from './application/code-application.ts';
import { createCodeHttpContribution } from './interfaces/http/code-http.ts';
import { createCodeCliContributions } from './interfaces/cli/code-cli.ts';
export const CODE_APPLICATION='code.application';
export const CODE_MODULE=Object.freeze({id:'code',requires:Object.freeze([WORKSPACE_APPLICATION,WORKSPACE_QUERY,TASK_QUERY_APPLICATION,TASK_WORKTREE_PROVIDER]),create(requires:Record<string,any>){
  const readTask=requires[TASK_QUERY_APPLICATION].readTask;
  const dependencies:CodeDependencies={assetCatalog:requires[WORKSPACE_APPLICATION].assetCatalog,resolveSourceRoot:requires[WORKSPACE_QUERY].resolveSourceRoot,readTaskScope:(root,id)=>readTask(root,id).record.scope,readGitWorktreeEvidence:requires[TASK_WORKTREE_PROVIDER].readGitWorktreeEvidence};
  const application=createCodeApplication(dependencies);
  return Object.freeze({provides:{[CODE_APPLICATION]:application},contributions:{http:[createCodeHttpContribution(application)],cli:createCodeCliContributions(application)}});
}});
