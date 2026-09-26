import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertCatalogFile, readAssetCatalog } from './asset-catalog-repository.ts';
import { parseProjectsManifest } from './project-manifest-repository.ts';
import { createBusinessService, createRepositoryInstance, object } from '../domain/asset-relationships.ts';

type Source = 'projects' | 'services' | 'repositories';
type Status = 'complete' | 'partial' | 'unavailable';
type Item = { id:string; code:string; name:string; description?:string; serviceIds?:string[]; repositoryId?:string };

/** Read-only projection: no Git observation, recovery, migration or write revision. */
export function readAssetComposition(root:string,workspaceId:string) {
  const sources:Record<Source,Status>={projects:'complete',services:'complete',repositories:'complete'};
  const diagnostics:Array<{source:Source;message:string}>=[];
  const data:Record<Source,Item[]>={projects:[],services:[],repositories:[]};
  const issue=(source:Source,error:unknown,status:Status='unavailable')=>{
    sources[source]=status;
    diagnostics.push({source,message:error instanceof Error?error.message:String(error)});
  };
  const accept=(source:Source,items:Item[])=>{
    const ids=new Set(data[source].map(item => item.id));
    for(const item of items){
      if(ids.has(item.id)){issue(source,`重复的登记身份：${item.id}`,'partial');continue;}
      ids.add(item.id);
      data[source].push({id:item.id,code:item.code,name:item.name,description:item.description||'',
        ...(source==='projects'?{serviceIds:item.serviceIds||[]}:{}),
        ...(source==='services'?{repositoryId:item.repositoryId}:{}),
      });
    }
  };
  try {
    const {catalog}=readAssetCatalog(root,workspaceId);
    for(const source of Object.keys(data) as Source[])accept(source,catalog[source]);
  } catch {
    // The write catalog must stay strict. Only this display projection isolates
    // failures by source and retains valid entries from partially damaged lists.
    const read=(source:Source)=>{
      const file=`${source}/manifest.yml`;
      assertCatalogFile(root,file);
      return fs.readFileSync(path.join(root,file),'utf8');
    };
    try {
      const document = YAML.parseDocument(read('projects'), { uniqueKeys: true });
      if (document.errors.length) throw document.errors[0];
      const raw = document.toJS();
      object(raw, ['schemaVersion', 'projects'], 'projects 清单');
      if (!['buildr.projects/v2', 'buildr.projects/v3'].includes(raw.schemaVersion)) throw Error('项目清单需要完成迁移后才能读取组成。');
      if (!raw.projects || typeof raw.projects !== 'object' || Array.isArray(raw.projects)) throw Error('项目登记内容必须是对象集合。');
      for (const [code, input] of Object.entries(raw.projects)) {
        try {
          const registry = parseProjectsManifest(YAML.stringify({ schemaVersion: raw.schemaVersion, projects: { [code]: input } }), { workspaceId });
          accept('projects', Object.values(registry.entities));
        } catch (error) { issue('projects', error, 'partial'); }
      }
      if (raw.schemaVersion === 'buildr.projects/v2') issue('projects', '旧登记中的服务引用尚未完整读取。', 'partial');
    } catch (error) { issue('projects', error); }
    for(const source of ['services','repositories'] as const){
      try {
        const document=YAML.parseDocument(read(source),{uniqueKeys:true});
        if(document.errors.length)throw document.errors[0];
        const raw=document.toJS();object(raw,['schemaVersion',source],`${source} 清单`);
        if(raw.schemaVersion!==(source==='services'?'buildr.services/v3':'buildr.repositories/v1'))throw Error('此清单版本尚不能独立读取，请先完成迁移。');
        if(!raw[source]||typeof raw[source]!=='object'||Array.isArray(raw[source]))throw Error('登记内容必须是对象集合。');
        const valid:Item[]=[];
        for(const [code,input] of Object.entries(raw[source])){
          try {
            const item=source==='services'?createBusinessService(input):createRepositoryInstance(input);
            if(item.code!==code||item.workspaceId!==workspaceId)throw Error(`登记 ${code} 的身份与工作空间不匹配。`);
            valid.push(item);
          }catch(error){issue(source,error,'partial');}
        }
        accept(source,valid);
      } catch(error){issue(source,error);}
    }
  }
  return {schemaVersion:'buildr.workspace-composition/v1',workspaceId,...data,sources,diagnostics};
}
