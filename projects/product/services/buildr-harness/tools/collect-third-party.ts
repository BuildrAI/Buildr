import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
export function collectThirdParty(output=path.join(root,'build/third-party'),packageRoots=[root,path.resolve(root,'../buildr-harness-ui'),path.resolve(root,'../buildr-harness-web')]){
  const components=new Map<string,{name:string;version:string;license:string;evidence:Array<{file:string;sha256:string}>}>(),seen=new Set<string>();
  fs.mkdirSync(output,{recursive:true});
  const visit=(directory:string)=>{
    directory=fs.realpathSync(directory);if(seen.has(directory))return;seen.add(directory);
    const metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')),id=metadata.name+'@'+metadata.version;
    if(!components.has(id)){
      const evidence=[];
      for(const name of fs.readdirSync(directory).filter(name=>/^(?:licen[sc]e(?:\..*)?|copying(?:\..*)?|notice(?:\..*)?)$/i.test(name))){
        const source=path.join(directory,name);if(!fs.statSync(source).isFile())continue;
        const bytes=fs.readFileSync(source),relative=id.replaceAll('/','_')+'/'+name;fs.mkdirSync(path.dirname(path.join(output,relative)),{recursive:true});fs.writeFileSync(path.join(output,relative),bytes);evidence.push({file:relative,sha256:createHash('sha256').update(bytes).digest('hex')});
      }
      // Some proprietary SDKs explicitly identify their README as the license.
      if(String(metadata.license).includes('README')&&fs.existsSync(path.join(directory,'README.md'))){const bytes=fs.readFileSync(path.join(directory,'README.md')),relative=id.replaceAll('/','_')+'/README.md';fs.mkdirSync(path.dirname(path.join(output,relative)),{recursive:true});fs.writeFileSync(path.join(output,relative),bytes);evidence.push({file:relative,sha256:createHash('sha256').update(bytes).digest('hex')});}
      components.set(id,{name:metadata.name,version:metadata.version,license:typeof metadata.license==='string'?metadata.license:'UNKNOWN',evidence});
    }
    const require=createRequire(path.join(directory,'package.json'));
    for(const name of new Set([...Object.keys(metadata.dependencies??{}),...Object.keys(metadata.optionalDependencies??{}),...Object.keys(metadata.peerDependencies??{})])){
      const dependency=(require.resolve.paths(name)??[]).map(base=>path.join(base,name)).find(candidate=>fs.statSync(path.join(candidate,'package.json'),{throwIfNoEntry:false})?.isFile());
      if(dependency)visit(dependency);else if(!metadata.optionalDependencies?.[name]&&!metadata.peerDependenciesMeta?.[name]?.optional)throw new Error('third_party_dependency_missing: '+name);
    }
  };
  for(const directory of packageRoots)visit(directory);
  const result={schemaVersion:1,scope:'Runtime and production-static dependency closure; not a legal approval',components:[...components.values()].sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version))};
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){const result=collectThirdParty(process.argv[2]);console.log(JSON.stringify({status:'collected',components:result.components.length,unresolved:result.components.filter(value=>value.license==='UNKNOWN'||!value.evidence.length).map(value=>({name:value.name,version:value.version}))}));}
