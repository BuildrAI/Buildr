import os from 'node:os';
import {harnessWebPort} from './profile.ts';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {connectHarnessProcess,resolveHarnessProfile,prepareAgentRuntimeAsync,activateAgentRuntime} from './index.ts';
import {installHarnessLauncher,readHarnessLauncher,uninstallHarnessLauncher,verifyHarnessLauncherFile} from './launcher.ts';
import {inspectDistributionEvidence} from './distribution-evidence.ts';
const execute=promisify(execFile);
function findLiveHarnessWebRoot(fromDir:string):string|undefined{
  let current=path.resolve(fromDir);
  for(let depth=0;depth<6;depth+=1){
    const candidate=path.join(current,'buildr-harness-web');
    try{
      const pkg=JSON.parse(fs.readFileSync(path.join(candidate,'package.json'),'utf8')) as {name?:unknown};
      if(pkg?.name==='@buildr-ai/buildr-harness-web'&&fs.existsSync(path.join(candidate,'src'))&&fs.existsSync(path.join(candidate,'tools/dev-server.mjs')))return fs.realpathSync(candidate);
    }catch{}
    const parent=path.dirname(current);
    if(parent===current)break;
    current=parent;
  }
  return undefined;
}
export async function main(args:string[]){
  if(['--help','-h','help'].includes(args[0]??'')){
    console.log('Buildr Harness\n用法：buildr-harness web|activate|launcher install|status|uninstall|distribution-check\n--profile released|development  --data-root <绝对目录>  --port <端口>  --no-open  --live（仅开发源码网页）\n独立网页默认端口：development 9519，released 9518；Development入口不变。\n普通 web 复用已有后台；activate 才显式采用候选。关闭或卸载入口不删除共享历史与账号。\nlauncher 使用 macOS .app 或 Windows .lnk；支持状态与许可需分别验收。\ndistribution-check --json 只读核对当前安装包，不授予发布或模型使用权。');
    return;
  }
  if(args[0]==='--version'){
    console.log(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../package.json'),'utf8')).version);
    return;
  }
  const command=args.shift()??'web',flags=new Map<string,string|boolean>();
  const action=command==='launcher'?args.shift():undefined;
  for(let index=0;index<args.length;index++){const name=args[index]!;if(['--no-open','--json','--live'].includes(name)){flags.set(name,true);continue;}if(!['--data-root','--profile','--port','--target','--launcher-binding'].includes(name)||!args[index+1]||args[index+1]!.startsWith('--'))throw new Error('参数无效：'+name);flags.set(name,args[++index]!);}
  if(!['web','activate','launcher','distribution-check'].includes(command))throw new Error('用法：buildr-harness web|activate|launcher install|status|uninstall|distribution-check [--profile released|development] [--data-root <目录>] [--no-open]');
  if(command==='distribution-check'){
    if([...flags.keys()].some(key=>key!=='--json'))throw new Error('发行检查只读取当前安装包，不接受其他产品或数据域参数。');
    const root=path.resolve(import.meta.dirname,'..');
    const decisions=JSON.parse(fs.readFileSync(path.join(root,'resources/distribution-decisions.json'),'utf8')).decisions;
    const result=inspectDistributionEvidence(path.join(root,'build/third-party'),decisions);
    const platformSupport=JSON.parse(fs.readFileSync(path.join(root,'resources/platform-support.json'),'utf8'));
    console.log(JSON.stringify({...result,platformSupport,modelUsageApproved:false}));
    if(result.status!=='eligible')process.exitCode=1;
    return;
  }
  let profile=flags.get('--profile')??'released',dataRoot=flags.get('--data-root') as string|undefined;
  if(flags.has('--launcher-binding')){if(command!=='web'||flags.size!==1)throw new Error('启动器绑定不能混入目标覆盖参数。');const binding=verifyHarnessLauncherFile(String(flags.get('--launcher-binding')),process.argv[1]!);profile=binding.profile;dataRoot=binding.dataRoot;}
  if(!['released','development'].includes(String(profile)))throw new Error('配置域必须为 released 或 development。');
  if(flags.has('--live')&&(command!=='web'||profile!=='development'))throw new Error('--live 只用于 development profile 的源码网页入口。');
  const domain=resolveHarnessProfile({productId:'buildr-harness',channel:profile==='development'?'development':'npm',runtimeRole:profile==='development'?'development':'host'},{dataRoot});
  if(command==='launcher'){
    const defaultTarget=process.platform==='win32'
      ?path.join(process.env.APPDATA??path.join(os.homedir(),'AppData','Roaming'),'Microsoft/Windows/Start Menu/Programs',domain.profile==='development'?'Buildr Harness Dev.lnk':'Buildr Harness.lnk')
      :path.join(os.homedir(),'Applications',domain.profile==='development'?'Buildr Harness Dev.app':'Buildr Harness.app');
    const target=String(flags.get('--target')??defaultTarget);
    const result=action==='install'?installHarnessLauncher({target,entry:process.argv[1]!,dataRoot:domain.dataRoot,profile:domain.profile}):action==='status'?readHarnessLauncher(target):action==='uninstall'?uninstallHarnessLauncher(target):undefined;
    if(result===undefined)throw new Error('用法：buildr-harness launcher install|status|uninstall [--target <应用路径>]');console.log(JSON.stringify(result));return;
  }
  if(command==='activate'){const runtime=await prepareAgentRuntimeAsync({dataRoot:domain.dataRoot});console.log(JSON.stringify(await activateAgentRuntime({dataRoot:domain.dataRoot,profileId:domain.profile,runtime})));return;}
  const port=harnessWebPort(profile as 'released'|'development',flags.has('--port')?Number(flags.get('--port')):undefined);
  let developmentRoot:string|undefined;
  if(flags.has('--live')){
    developmentRoot=findLiveHarnessWebRoot(import.meta.dirname);
    if(!developmentRoot||!fs.existsSync(path.resolve(import.meta.dirname,'../build/harness-web-dist/index.html')))
      throw new Error('源码网页需要已准备的产品检出目录和静态回退产物，请先执行项目准备。');
    // Explicit source mode must not silently reuse an older core that cannot
    // install its renderer. Adopt compatibly; existing executions keep their owner.
    const runtime=await prepareAgentRuntimeAsync({dataRoot:domain.dataRoot});
    await activateAgentRuntime({dataRoot:domain.dataRoot,profileId:domain.profile,runtime});
  }
  const connection=await connectHarnessProcess({dataRoot:domain.dataRoot,profileId:domain.profile,sourceId:'harness-local',caller:{kind:'first-party-user',product:'buildr-harness'}});
  try {
    const current=await connection.web.status();
    const currentPort=current.origin?Number(new URL(current.origin).port):undefined;
    const ready=current.ready&&current.endpointId&&currentPort&&currentPort!==port
      ?await connection.web.rebind({expectedEndpointId:current.endpointId,expectedPort:currentPort,expectedGeneration:current.generation,port})
      :await connection.web.enable({port,...(flags.has('--live')?{developmentRoot}: {})});
    if(flags.has('--live')&&currentPort&&currentPort!==port)await connection.web.enable({developmentRoot});
    if(!ready.ready)throw new Error('Harness 独立网页尚未就绪。');
    if(flags.has('--live')&&(await connection.web.status()).mode!=='live')throw new Error('Harness 开发网页未确认启用；静态页面与原执行保留。');
    if(!flags.has('--no-open')&&process.env.BUILDR_LAUNCHER_NO_OPEN!=='1'){
      const login=await connection.web.login();
      try{
        if(process.platform==='darwin')await execute('/usr/bin/open',[login.url],{timeout:15000});
        else if(process.platform==='win32')await execute('rundll32.exe',['url.dll,FileProtocolHandler',login.url],{timeout:15000});
        else await execute('xdg-open',[login.url],{timeout:15000});
      }catch{throw Object.assign(new Error('网页已准备，但浏览器打开未确认；请重新从 Harness 启动器打开。'),{code:'harness_browser_open_failed'});}
    }
    const identity=await connection.lifecycle.identity();console.log(JSON.stringify({status:'ready',productId:domain.productId,entryPid:process.pid,profile:domain.profile,domainIdentity:domain.domainIdentity,entryIdentity:domain.entryIdentity,web:ready,runtimeDigest:identity.runtime.digest,instanceId:identity.instanceId,generation:identity.generation}));
  } finally {await connection.disconnect();}
}
