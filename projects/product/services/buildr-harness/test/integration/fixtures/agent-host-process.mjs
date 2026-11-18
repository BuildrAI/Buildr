import { pathToFileURL } from 'node:url';
const {connectAgentProcess,executionScopeKey}=await import(pathToFileURL(process.argv[2]).href);
const options=JSON.parse(process.argv[3]),ref={sourceId:'minimal',id:'directory'};
const host={resolveExecutionScope:async({ref})=>({ref,revision:'one',rootPath:options.workspace}),verifyWorkObject:async({ref})=>({ref,revision:'one'}),listExecutionScopes:async()=>({refs:[ref],revision:'one'})};
const connection=await connectAgentProcess({...options,sourceId:'minimal',host});
const scope=executionScopeKey(ref);
process.on('message',async command=>{
  try{
    if(command.action==='close'){await connection.disconnect();process.send?.({id:command.id,result:true},()=>process.exit(0));return;}
    const parts=command.operation.split('.'),method=parts.pop();let target=connection.operations;for(const part of parts)target=target[part];
    process.send?.({id:command.id,result:await target[method](...command.args)});
  }catch(error){process.send?.({id:command.id,error:{code:error.code,message:error.message}});}
});
process.send?.({ready:true,scope,identity:await connection.lifecycle.identity()});
