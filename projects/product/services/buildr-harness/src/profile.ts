import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AgentServiceError} from './domain/service-error.ts';
export type HarnessProductId='buildr-harness'|'buildr-development';
export type HarnessProfileName='released'|'development';
const digest=(value:unknown)=>'sha256-'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Shared data-domain compatibility paths, not a product/launcher identity. */
export function defaultHarnessDataRoot(profile:HarnessProfileName,options:{platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;home?:string}={}):string{
  if(!['released','development'].includes(profile))throw new AgentServiceError('agent_profile_identity_invalid','不支持的运行配置域。',409);
  const platform=options.platform??process.platform,env=options.env??process.env,home=options.home??os.homedir();
  if(platform==='darwin')return path.join(home,'Library','Application Support',profile==='released'?'Buildr':'Buildr Dev');
  if(platform==='win32')return path.win32.join(env.LOCALAPPDATA??path.win32.join(home,'AppData','Local'),profile==='released'?'Buildr':'Buildr Dev');
  return path.posix.join(env.XDG_STATE_HOME??path.posix.join(home,'.local','state'),profile==='released'?'buildr':'buildr-dev');
}
export function resolveHarnessProfile(identity:{productId:HarnessProductId;channel:'npm'|'development';runtimeRole:'host'|'development'},options:{dataRoot?:string;platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;home?:string}={}){
  if(!['buildr-harness','buildr-development'].includes(identity.productId)||!(identity.channel==='npm'&&identity.runtimeRole==='host'||identity.channel==='development'&&identity.runtimeRole==='development'))throw new AgentServiceError('agent_profile_identity_invalid','产品、渠道或运行角色不受支持，未采用数据域。',409);
  const profile:HarnessProfileName=identity.channel==='npm'?'released':'development',env=options.env??process.env,platform=options.platform??process.platform;
  const resolve=platform==='win32'?path.win32.resolve:path.resolve;
  const dataRoot=resolve(options.dataRoot??env.BUILDR_APP_DATA_DIR??defaultHarnessDataRoot(profile,options));
  const domainIdentity=digest({profile,dataRoot});
  return Object.freeze({schemaVersion:'buildr.harness-profile/v1',...identity,profile,dataRoot,domainIdentity,entryIdentity:digest({...identity,domainIdentity}),overridden:!!(options.dataRoot||env.BUILDR_APP_DATA_DIR)});
}

/** 独立 Harness 网页端口，不参与 Development 宿主的端口选择。 */
export function harnessWebPort(profile: 'released' | 'development', override?: number): number {
  const port=override ?? (profile==='development'?9519:9518);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('网页端口无效。');
  return port;
}

export function defaultHarnessWorkspaceRoot(dataRoot:string,options:{platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;home?:string}={}):string{
  const env=options.env??process.env,home=options.home??os.homedir();
  const resolve=(options.platform??process.platform)==='win32'?path.win32.resolve:path.resolve;
  const resolvedRoot=resolve(dataRoot);
  const standardRoots=(['released','development'] as const).map(profile=>resolve(defaultHarnessDataRoot(profile,options)));
  if(env.BUILDR_APP_DATA_DIR||!standardRoots.includes(resolvedRoot))return resolve(resolvedRoot,'default-workspace');
  const productRoot=env.BUILDR_PRODUCT_DATA_DIR||path.join(home,'.buildr');
  return resolve(productRoot,'default-workspace');
}
