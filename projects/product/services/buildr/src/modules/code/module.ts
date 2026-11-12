import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../task/module.ts';
import { createCodeApplication } from './application/code-application.ts';
import { createCodeDependencies } from './application/code-dependencies.ts';
import { createCodeHttpContribution } from './interfaces/http/code-http.ts';
import { createCodeCliContributions } from './interfaces/cli/code-cli.ts';
import { AGENT_SERVICE_APPLICATION } from '../agent-service/module.ts';
import { CodeGeneration, type GenerateModel } from './application/code-generation.ts';
import { AGENT_ASSETS_SOURCE_READ } from '../agent-assets/module.ts';
import { createCodeCommitMessageApplication, type CodeCommitMessageDependencies } from './application/code-commit-message-application.ts';
import { createCodeGenerationHttpContribution } from './interfaces/http/code-generation-http.ts';
import { readCodeCommitGuidance } from './infrastructure/code-commit-guidance.ts';
import { createCodeCommitMaterialReader } from './infrastructure/code-commit-material.ts';
import { SourceControlObservations } from './application/source-control-observations.ts';
export { reclaimCodeGitOperationFile } from './infrastructure/code-git-operation-lock.ts';
export const CODE_APPLICATION='code.application';
export const CODE_GENERATION_APPLICATION='code.generation.application';
export const CODE_SOURCE_CONTROL_OBSERVATIONS='code.source-control-observations';
export const CODE_MODULE=Object.freeze({id:'code',requires:Object.freeze([WORKSPACE_APPLICATION,WORKSPACE_QUERY,TASK_QUERY_APPLICATION,TASK_WORKTREE_PROVIDER,AGENT_SERVICE_APPLICATION,AGENT_ASSETS_SOURCE_READ]),create(requires:Record<string,any>){
  const readTask=requires[TASK_QUERY_APPLICATION].readTask;
  const dependencies = createCodeDependencies(
    requires[WORKSPACE_APPLICATION], requires[WORKSPACE_QUERY],
    readTask, requires[TASK_WORKTREE_PROVIDER],
    requires[AGENT_ASSETS_SOURCE_READ].builtinManagedFiles,
  );
  const application=createCodeApplication(dependencies);
  const observations=new SourceControlObservations();
  const models=requires[AGENT_SERVICE_APPLICATION] as {generate:GenerateModel};
  const runs=new CodeGeneration(input=>models.generate(input));
  const commitMaterial=createCodeCommitMaterialReader();
  const generation=createCodeCommitMessageApplication({commitSnapshot:application.commitSnapshot,commitGuidance:(root,snapshot)=>readCodeCommitGuidance(root,snapshot,{...dependencies,taskContext:(root,id)=>{const record=readTask(root,id).record;return {taskId:record.taskId,title:record.title,intent:record.intent,scope:record.scope};}}),commitMaterial,startGeneration:input=>runs.start(input)});
  return Object.freeze({provides:{[CODE_APPLICATION]:application,[CODE_GENERATION_APPLICATION]:{...generation,close:()=>runs.close()},[CODE_SOURCE_CONTROL_OBSERVATIONS]:observations},contributions:{http:[createCodeHttpContribution(application,observations),createCodeGenerationHttpContribution(generation,runs)],cli:createCodeCliContributions(application)},lifecycle:{start(){},stop(){runs.close();observations.close();}}});
}});

export { runCodeGitMutation } from './infrastructure/code-git-mutation-runner.ts';
