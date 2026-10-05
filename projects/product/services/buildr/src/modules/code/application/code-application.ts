import fs from 'node:fs';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { codeFailure, codeGit, gitCommonDirectory, readCodeDirectory, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { readCodeFile } from '../infrastructure/code-file-content.ts';
import { searchCode } from '../infrastructure/code-search.ts';
import { taskActionId } from '../../task/application/task-validation.ts';
import { createGitCommitReader } from '../../task/commits/infrastructure/git-commit-reader.ts';
import { gitCheckoutReadId } from '../../../infrastructure/git/checkout-read-identity.ts';
import { readCodeWorktreeCatalog, readSourceControlTaskAssociations } from '../infrastructure/code-worktree-catalog.ts';
import { createSourceControlApplication } from './source-control-application.ts';
import { enumerateCodeWorktrees, resolveCodeWorktree } from '../infrastructure/code-worktree-reader.ts';
type Repository = { id:string; code:string; name:string; source: {type:string;path:string;root?:string}; location?:string };
type Service = {id:string;code:string;repositoryId:string;legacyRefs?:string[]};
type Project = {id:string;code:string;serviceIds:string[]};
type Catalog = { repositories:Repository[];services:Service[];projects:Project[] };
type Task = {scope:{projects:string[];services:Array<{project:string;service:string}>}};
export type CodeInput = {repositoryId:string;checkoutId?:string;worktreeId?:string;path?:string;taskId?:string;commitHash?:string;query?:string;mode?:'name'|'content';showIgnored?:boolean;page?:number;line?:number;matchQuery?:string;expectedRevision?:string};
export type CodeDependencies = {
  assetCatalog(root:string):Catalog;
  resolveSourceRoot(root:string,source:Repository['source']):string;
  readTaskScope(root:string,id:string):Task['scope'];
  readTask?(root:string,id:string):{taskId:string;title:string};
  gitWorktreeEvidencePath?(root:string,id:string):string;
  gitWorktreeEvidenceDirectories?(root:string,options?:{requireComplete?:boolean}):string[];
  readGitWorktreeEvidence(root:string,id:string,options:{optional:boolean}):{evidence:{repositories:Array<{sourceRepository:string;checkoutPath:string;branch?:string}>}}|null;
};
export function createCodeApplication(dependencies:CodeDependencies) {
  function repositoryScope(root:string,taskId?:string) {
    const catalog=dependencies.assetCatalog(root);
    const diagnostics:Array<{code:string;message:string;repositoryId:string|null}>=[];
    const items=catalog.repositories.map(repo=>{
      let location='',available=false,gitId:string|null=null;
      try { location=dependencies.resolveSourceRoot(root,repo.source);available=fs.statSync(location).isDirectory();const gitRepository=createGitCommitReader().repository(location);gitId=gitRepository.id;location=gitRepository.root; } catch { available=false;diagnostics.push({code:'code_repository_unavailable',message:repo.name+' 的本机目录或 Git 身份当前不可读取。',repositoryId:repo.id}); }
      return {id:repo.id,code:repo.code,name:repo.name,location,available,gitId};
    });
    const selected=new Set<string>();let scopeReason='显示全部代码库';
    if(taskId) {
      const task={scope:dependencies.readTaskScope(root,taskActionId(taskId,'taskId'))};
      let services:Service[]=[];
      if(task.scope.services.length) {
        for(const ref of task.scope.services){
          const project=catalog.projects.find(p=>p.code===ref.project);
          const candidates=catalog.services.filter(s=>s.legacyRefs?.includes(ref.project+'/'+ref.service)||(s.code===ref.service&&project?.serviceIds.includes(s.id)));
          if(candidates.length===1)services.push(candidates[0]);
          else diagnostics.push({code:'code_task_service_unresolved',message:'任务服务 '+ref.project+'/'+ref.service+' 的代码库引用未能确定。',repositoryId:null});
        }
      } else {
        for(const code of task.scope.projects)if(!catalog.projects.some(p=>p.code===code))diagnostics.push({code:'code_task_project_unresolved',message:'任务项目 '+code+' 的服务组成当前未登记。',repositoryId:null});
        const ids=new Set(catalog.projects.filter(p=>task.scope.projects.includes(p.code)).flatMap(p=>p.serviceIds));
        services=catalog.services.filter(s=>ids.has(s.id));
      }
      for(const service of services){if(catalog.repositories.some(r=>r.id===service.repositoryId))selected.add(service.repositoryId);else diagnostics.push({code:'code_task_repository_unresolved',message:service.code+' 引用的代码库当前未登记。',repositoryId:service.repositoryId});}
      scopeReason=selected.size?'由任务服务预选 '+selected.size+' 个代码库，已去重':'任务没有可确定的服务代码库范围，显示全部代码库';
    }
    return {repositories:items,selectedRepositoryIds:[...selected],scopeReason,diagnostics};
  }
  function repositories(root:string,taskId?:string) {
    const scope=repositoryScope(root,taskId);
    const worktreeCatalog=readCodeWorktreeCatalog(root,scope.repositories,dependencies,taskId);
    return {...scope,...worktreeCatalog,diagnostics:[...scope.diagnostics,...worktreeCatalog.diagnostics]};
  }
  function source(root:string,input:CodeInput):CodeSource {
    const catalog=dependencies.assetCatalog(root),repo=catalog.repositories.find(r=>r.id===input.repositoryId);
    if(!repo)throw codeFailure('code_repository_not_registered','代码库不在当前工作空间的登记范围内。',404);
    let location=dependencies.resolveSourceRoot(root,repo.source),kind:CodeSource['kind']='default';
    let sourceTaskId=input.taskId||null,checkoutId:string|null=null,worktreeGroupId:string|null=null;
    try { location=fs.realpathSync(location); } catch { throw codeFailure('code_repository_unavailable','代码库本机目录当前不可读取。',404); }
    location=createGitCommitReader().repository(location).root;
    const registeredLocation=location,common=gitCommonDirectory(location);
    if(input.worktreeId!==undefined&&input.checkoutId!==undefined&&input.worktreeId!==input.checkoutId)throw codeFailure('code_checkout_conflict','检出目录与工作树身份必须指向同一来源。',409);
    if(input.worktreeId!==undefined){
      if(input.taskId)dependencies.readTaskScope(root,taskActionId(input.taskId,'taskId'));
      const member=resolveCodeWorktree(registeredLocation,repo.id,input.worktreeId);
      location=member.location;kind=member.isMain?'default':'worktree';
      checkoutId=member.worktreeId;worktreeGroupId=member.isRegistered?'main':'worktree:'+member.worktreeId;sourceTaskId=null;
    }else if(input.checkoutId!==undefined&&!input.commitHash){
      if(!/^checkout-[a-f0-9]{64}$/.test(input.checkoutId))throw codeFailure('code_checkout_invalid','检出目录身份无效。');
      const catalog=readCodeWorktreeCatalog(root,[{id:repo.id,name:repo.name,location,available:true}],dependencies,input.taskId);
      const member=catalog.worktrees.find(item=>item.id===input.checkoutId);
      if(!member?.available){
        const incomplete=catalog.diagnostics.some(item=>['code_worktrees_truncated','code_worktrees_unavailable','code_worktree_unavailable','code_worktree_identity_changed'].includes(item.code));
        if(incomplete)throw codeFailure('code_checkout_unconfirmed','本次目录观察未完成或达到上限，尚未确认所选检出目录；请重试后再判断目录是否存在。',503);
        throw codeFailure('code_checkout_unavailable','所选检出目录已不存在或身份已变化，请重新选择目录。',404);
      }
      location=member.path;kind=member.kind==='main'?'default':member.kind;
      checkoutId=member.id;worktreeGroupId=member.groupId;sourceTaskId=member.taskId;
    }else if(input.taskId){
      dependencies.readTaskScope(root,taskActionId(input.taskId,'taskId'));
      // A pinned commit belongs to the registered Git object store; a retired task checkout cannot invalidate it.
      const evidence=input.commitHash?null:dependencies.readGitWorktreeEvidence(root,input.taskId,{optional:true});
      if(evidence){
        const candidates=evidence.evidence.repositories.filter(member=>sameFilesystemPath(gitCommonDirectory(member.sourceRepository),common));
        const locations=[...new Set(candidates.map(c=>c.checkoutPath))];
        if(locations.length>1)throw codeFailure('code_task_location_ambiguous','该代码库有多个任务目录，尚未确定查看位置。',409);
        if(locations.length===1){
          let checkout:string;try{checkout=fs.realpathSync(locations[0]);}catch{throw codeFailure('code_task_location_unavailable','任务工作目录当前不可读取，请选择默认目录或历史版本。',404);}
          const registered=codeGit(location,['worktree','list','--porcelain','-z']).toString().split('\0').filter(v=>v.startsWith('worktree ')).map(v=>v.slice(9));
          if(!sameFilesystemPath(gitCommonDirectory(checkout),common)||!registered.some(p=>sameFilesystemPath(p,checkout)))throw codeFailure('code_task_location_changed','任务工作目录身份已变化，请重新核对。',409);
          location=checkout;kind='task';
        }
      }
    }
    let version='当前文件';try{version=codeGit(location,['symbolic-ref','--short','HEAD']).toString().trim()+' · 当前文件';}catch{try{version=codeGit(location,['rev-parse','--short','HEAD']).toString().trim()+' · 当前文件';}catch{/* empty git repo remains readable */}}
    let commitHash:string|null=null;
    if(input.commitHash){
      if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(input.commitHash))throw codeFailure('code_commit_invalid','历史文件必须指定完整提交标识。');
      const observed=codeGit(location,['rev-parse','--verify',input.commitHash+'^{commit}']).toString().trim();
      if(observed!==input.commitHash)throw codeFailure('code_commit_invalid','提交标识与实际对象不同。');
      commitHash=observed;version=observed+' · 历史文件';kind='commit';
    }
    if(!commitHash&&!checkoutId){checkoutId=gitCheckoutReadId(location);worktreeGroupId=kind==='task'?'task:'+input.taskId:'main';}
    return {repositoryId:repo.id,taskId:sourceTaskId,commitHash,checkoutId,worktreeId:checkoutId,worktreeGroupId,location,version,kind};
  }
  function assertReadSource(current:CodeSource) {
    if(current.commitHash)return;
    let observed:string;try{observed=gitCheckoutReadId(current.location);}catch{throw codeFailure('code_checkout_unavailable','读取期间所选检出目录已不存在，请重新核对。',404);}
    if(observed!==current.checkoutId)throw codeFailure('code_checkout_changed','读取期间检出目录身份已变化，请重新选择目录。',409);
  }
  const sourceControlApplication=createSourceControlApplication({repositories:repositoryScope,source:(root,input)=>source(root,input as CodeInput),worktrees:(root,id)=>{const registered=source(root,{repositoryId:id});return enumerateCodeWorktrees(registered.location,id).worktrees;},taskAssociations:(root,repositories,taskId,deadline)=>readSourceControlTaskAssociations(root,repositories,dependencies,taskId,deadline),readTask:dependencies.readTask});
  return Object.freeze({
    ...sourceControlApplication,
    repositories,
    directory:(root:string,input:CodeInput)=>{const current=source(root,input),result=readCodeDirectory(current,input.path||'',Boolean(input.showIgnored));assertReadSource(current);return result;},
    file:async(root:string,input:CodeInput)=>{const current=source(root,input),result=await readCodeFile(current,input.path||'',input);assertReadSource(current);return result;},
    search:(root:string,input:CodeInput)=>{const current=source(root,input),result=searchCode(current,input.query||'',input.mode||'name',Boolean(input.showIgnored));assertReadSource(current);return result;},
  });
}
export type CodeApplication = ReturnType<typeof createCodeApplication>;
