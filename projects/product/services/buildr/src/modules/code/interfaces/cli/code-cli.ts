import path from 'node:path';
import process from 'node:process';
import type { CodeApplication, CodeInput } from '../../application/code-application.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';
const operations=['repositories','directory','file','search'] as const;
export function createCodeCliContributions(application:CodeApplication) {
  return operations.map(operation=>Object.freeze({key:'code '+operation,surface:'agent-machine',summary:'按明确代码库、检出目录身份、任务目录或版本只读查看代码，不执行 Git 或文件写入。',help:['Usage: buildr code '+operation+' [--repository <id>] [--checkout <id>] [--path <relative>] [--task <id>] [--commit <full-sha>] [--query <text>] [--mode name|content] [--show-ignored] [--page <index> | --line <number>] [--match-query <text>] [--expected-revision <value>] [--target <workspace>] [--json]'],match:({domain,action}:{domain?:string;action?:string})=>domain==='code'&&action===operation,run:async(_runtime:unknown,context:{argv:string[]})=>{
    const args=context.argv.slice(4),input:Partial<CodeInput>={};let target=process.cwd();const seen=new Set<string>();
    const flags:Record<string,keyof CodeInput>={'--repository':'repositoryId','--checkout':'checkoutId','--path':'path','--task':'taskId','--commit':'commitHash','--query':'query','--mode':'mode','--page':'page','--line':'line','--match-query':'matchQuery','--expected-revision':'expectedRevision'};
    for(let i=0;i<args.length;i++){const flag=args[i];if(seen.has(flag))throw codeFailure('code_cli_invalid','不能重复参数：'+flag);seen.add(flag);if(operation==='repositories'&&!['--task','--target','--json'].includes(flag))throw codeFailure('code_cli_invalid','代码库清单不接受参数：'+flag);if(operation==='file'&&['--query','--mode','--show-ignored'].includes(flag))throw codeFailure('code_cli_invalid','文件读取不接受搜索参数。');if(operation!=='file'&&['--page','--line','--match-query','--expected-revision'].includes(flag))throw codeFailure('code_cli_invalid','只有文件读取接受分段参数。');if(operation==='directory'&&['--query','--mode'].includes(flag))throw codeFailure('code_cli_invalid','目录读取不接受搜索参数。');if(flag==='--json')continue;if(flag==='--show-ignored'){input.showIgnored=true;continue;}const key=flags[flag];if(flag==='--target'||key){const value=args[++i];if(!value||value.startsWith('--'))throw codeFailure('code_cli_invalid','参数缺少值。');if(flag==='--target')target=path.resolve(value);else if(key==='page'||key==='line'){if(!/^(?:0|[1-9][0-9]*)$/.test(value))throw codeFailure('code_cli_invalid','文件段编号或行号必须是十进制整数。');input[key]=Number(value);}else (input as Record<string,unknown>)[key]=value;}else throw codeFailure('code_cli_invalid','未知代码读取参数：'+flag);}
    if(operation!=='repositories'&&!input.repositoryId)throw codeFailure('code_cli_invalid','必须提供 --repository。');
    if(input.mode&&!['name','content'].includes(input.mode))throw codeFailure('code_cli_invalid','搜索模式无效。');
    const result=await(operation==='repositories'?application.repositories(target,input.taskId):application[operation](target,input as CodeInput));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
  }}));
}
