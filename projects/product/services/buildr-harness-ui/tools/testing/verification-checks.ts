import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const node=(file:string,...args:string[])=>({file:process.execPath,args:[path.join(root,file),...args],cwd:'.'});
export const serviceVerificationChecks=[
  {id:'harness-ui-logic',type:'Unit',name:'Harness complete shared conversation and settings behavior',sourcePaths:['src/**','tools/**','package.json'],testFiles:['test/*.test.mjs'],command:node('tools/run-logic-tests.mjs')},
  {id:'harness-ui-boundaries',type:'Static',name:'Harness UI host boundaries and independent ownership',sourcePaths:['src/**','package.json'],testFiles:['test/static/*.test.mjs'],command:{file:process.execPath,args:['--test',path.join(root,'test/static/host-boundaries.test.mjs')],cwd:'.'}},
  {id:'harness-ui-typecheck',type:'Static',name:'Harness shared UI production types and public declaration build',sourcePaths:['src/**','tools/**','tsconfig.json','package.json','services/buildr-agent/src/operation-schemas.ts'],command:node('tools/build.ts')},
] as const;
