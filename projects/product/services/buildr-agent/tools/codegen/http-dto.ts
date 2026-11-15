import fs from 'node:fs';
import path from 'node:path';
import {compile} from 'json-schema-to-typescript';
import {AGENT_OPERATION_SCHEMAS} from '../../src/operation-schemas.ts';

/** The protocol owner generates the exact same declarations for every consumer. */
export async function renderAgentHttpDtos():Promise<string> {
  const parts:string[]=[];
  for(const [key,schema] of Object.entries(AGENT_OPERATION_SCHEMAS)){
    const {$schema:_draft,$id:_id,title:_title,...body}=schema;
    const generated=await compile({...body,title:`${schema.title}_${key}`} as any,`${schema.title}_${key}`,{
      bannerComment:'',additionalProperties:false,enableConstEnums:false,strictIndexSignatures:true,unreachableDefinitions:false,
      style:{singleQuote:true,semi:true,tabWidth:2,trailingComma:'all'},
    });
    parts.push(generated.trim());
  }
  return ['/* eslint-disable */','// Generated from agent-service-http JSON Schema. Do not edit.','// Owner: buildr-agent/tools/codegen/http-dto.ts','',...parts,''].join('\n');
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fs.realpathSync(import.meta.filename)){
  const output=path.resolve(process.argv[2]??path.join(import.meta.dirname,'../../build/http-dto.d.ts'));
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const content=await renderAgentHttpDtos();
  if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==content){
    const temporary=output+'.'+process.pid+'.tmp';
    fs.writeFileSync(temporary,content);fs.renameSync(temporary,output);
  }
}
