import fs from 'node:fs';
import path from 'node:path';
import {invalidLauncher as invalid, launcherDigest as digest, launcherFileHash as fileHash, parseLauncherBinding, type HarnessLauncherBinding} from './launcher-binding.ts';
import {installWindowsHarnessLauncher, readWindowsHarnessLauncher, uninstallWindowsHarnessLauncher, windowsBindingPath} from './windows-launcher.ts';
export type {HarnessLauncherBinding} from './launcher-binding.ts';
const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
const bindingPath=(target:string)=>path.join(target,'Contents/Resources/harness-launcher.json');
function script(binding:HarnessLauncherBinding,logging=true){
  const command='exec '+quote(binding.node)+' '+quote(binding.entry)+' web --launcher-binding '+quote(bindingPath(binding.target));
  if(!logging)return '#!/bin/sh\nset -eu\n'+command+'\n';
  const log=quote(path.join(binding.target,'Contents/Resources/harness-launcher.log'));
  return '#!/bin/sh\nset -eu\numask 077\nLOG='+log+'\nif [ -L "$LOG" ] || { [ -e "$LOG" ] && [ ! -f "$LOG" ]; }; then exit 1; fi\n'+command+' >"$LOG" 2>&1\n';
}
export function readHarnessLauncher(target:string):{binding:HarnessLauncherBinding;revision:string}|null {
  if(target.toLowerCase().endsWith('.lnk'))return readWindowsHarnessLauncher(path.resolve(target));
  const marker=bindingPath(target);if(!fs.existsSync(target))return null;
  if(fs.lstatSync(target).isSymbolicLink()||!fs.lstatSync(marker,{throwIfNoEntry:false})?.isFile()||fs.lstatSync(marker).isSymbolicLink())invalid('同名应用不属于 Harness，未覆盖。');
  for(const relative of ['Contents','Contents/Resources','Contents/MacOS']){const file=path.join(target,relative),stat=fs.lstatSync(file);if(!stat.isDirectory()||stat.isSymbolicLink())invalid('启动器目录身份已变化。');}
  const text=fs.readFileSync(marker,'utf8'),binding=parseLauncherBinding(text,target);
  if(binding.platform==='win32')invalid('启动器平台绑定不匹配。');
  const executable=path.join(target,'Contents/MacOS/harness'),executableStat=fs.lstatSync(executable);
  if(!executableStat.isFile()||executableStat.isSymbolicLink())invalid('启动器包装程序身份已变化。');
  const wrapper=fs.readFileSync(executable,'utf8');
  if(wrapper!==script(binding)&&wrapper!==script(binding,false))invalid('启动器包装程序已变化，未覆盖。');
  return {binding,revision:digest(text)};
}
export function installHarnessLauncher(input:{target:string;entry:string;node?:string;dataRoot:string;profile:'released'|'development';platform?:NodeJS.Platform}){
  const platform=input.platform??process.platform;
  if(!['darwin','win32'].includes(platform)||platform==='win32'&&process.platform!=='win32')throw Object.assign(new Error('该平台需要对应系统的原生安装与验收，不能用其他系统代替。'),{code:'harness_launcher_platform_unverified'});
  const target=path.resolve(input.target);if((platform==='darwin'?!target.endsWith('.app'):!target.toLowerCase().endsWith('.lnk'))||[target,input.entry,input.node??process.execPath,input.dataRoot].some(value=>/[\0\r\n]/.test(value)))invalid('请选择准确的平台启动器目标与本机文件。');
  const binding:HarnessLauncherBinding={schemaVersion:1,productId:'buildr-harness',...(platform==='win32'?{platform:'win32' as const}:{}),target,entry:fs.realpathSync(input.entry),node:fs.realpathSync(input.node??process.execPath),entrySha256:fileHash(fs.realpathSync(input.entry)),nodeSha256:fileHash(fs.realpathSync(input.node??process.execPath)),dataRoot:path.resolve(input.dataRoot),profile:input.profile};
  if(platform==='win32')return installWindowsHarnessLauncher(binding);
  const previous=readHarnessLauncher(target);
  fs.mkdirSync(path.dirname(target),{recursive:true});const stage=fs.mkdtempSync(path.join(path.dirname(target),'.harness-launcher-')),backup=stage+'-previous';
  try {
    fs.mkdirSync(path.join(stage,'Contents/MacOS'),{recursive:true});fs.mkdirSync(path.join(stage,'Contents/Resources'),{recursive:true});
    fs.writeFileSync(path.join(stage,'Contents/MacOS/harness'),script(binding),{mode:0o755});fs.writeFileSync(path.join(stage,'Contents/Resources/harness-launcher.json'),JSON.stringify(binding)+'\n',{mode:0o600});
    fs.writeFileSync(path.join(stage,'Contents/Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Buildr Harness</string><key>CFBundleDisplayName</key><string>Buildr Harness</string><key>CFBundleIdentifier</key><string>ai.buildr.harness.'+binding.profile+'.'+digest(target).slice(0,16)+'</string><key>CFBundleExecutable</key><string>harness</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
    const current=readHarnessLauncher(target);if(current?.revision!==previous?.revision)invalid('启动器在准备期间变化，未覆盖。');
    if(previous)fs.renameSync(target,backup);
    try{fs.renameSync(stage,target);}catch(error){if(previous)fs.renameSync(backup,target);throw error;}
    fs.rmSync(backup,{recursive:true,force:true});return {status:'installed',binding};
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
export function verifyHarnessLauncherFile(file:string,entry:string):HarnessLauncherBinding {
  const parent=path.dirname(path.resolve(file)),windows=parent.toLowerCase().endsWith('.lnk.buildr-harness');
  const target=windows?parent.slice(0,-'.buildr-harness'.length):path.resolve(file,'../../..'),current=readHarnessLauncher(target);
  if(!current||path.resolve(file)!==(windows?windowsBindingPath(target):bindingPath(target))||current.binding.entry!==fs.realpathSync(entry)||current.binding.node!==fs.realpathSync(process.execPath)||fileHash(current.binding.entry)!==current.binding.entrySha256||fileHash(current.binding.node)!==current.binding.nodeSha256)invalid('启动器安装或 Node 绑定已漂移，未启动其他入口。');
  return current.binding;
}
export function uninstallHarnessLauncher(target:string){if(target.toLowerCase().endsWith('.lnk'))return uninstallWindowsHarnessLauncher(path.resolve(target));const current=readHarnessLauncher(path.resolve(target));if(!current)return {status:'absent'};const latest=readHarnessLauncher(path.resolve(target));if(latest?.revision!==current.revision)invalid('启动器已变化，未删除。');fs.rmSync(current.binding.target,{recursive:true});return {status:'removed',dataPreserved:true};}
