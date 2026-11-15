import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installHarnessLauncher,readHarnessLauncher,uninstallHarnessLauncher,verifyHarnessLauncherFile} from '../src/launcher.ts';
test('Harness app ownership is product-specific; updates and uninstall preserve unrelated apps and shared data',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-app-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry=path.join(root,'entry.mjs'),target=path.join(root,'Buildr Harness.app'),dataRoot=path.join(root,'data');fs.writeFileSync(entry,'console.log("entry")');fs.mkdirSync(dataRoot);fs.writeFileSync(path.join(dataRoot,'history'),'preserved');
  const foreign=path.join(root,'Buildr.app');fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'owned-by-development'),'do not replace');
  assert.throws(()=>installHarnessLauncher({target:foreign,entry,dataRoot,profile:'released',platform:'darwin'}),{code:'harness_launcher_identity_invalid'});
  const first=installHarnessLauncher({target,entry,dataRoot,profile:'released',platform:'darwin'});assert.equal(first.binding.productId,'buildr-harness');
  const binding=path.join(target,'Contents/Resources/harness-launcher.json');assert.equal(verifyHarnessLauncherFile(binding,entry).dataRoot,dataRoot);
  const before=readHarnessLauncher(target)!;installHarnessLauncher({target,entry,dataRoot,profile:'released',platform:'darwin'});assert.equal(readHarnessLauncher(target)!.revision,before.revision,'same installation is stable');
  fs.appendFileSync(entry,'\n// updated');assert.throws(()=>verifyHarnessLauncherFile(binding,entry),{code:'harness_launcher_identity_invalid'});
  installHarnessLauncher({target,entry,dataRoot,profile:'released',platform:'darwin'});assert.notEqual(readHarnessLauncher(target)!.revision,before.revision);
  assert.equal(uninstallHarnessLauncher(target).status,'removed');assert.equal(fs.readFileSync(path.join(dataRoot,'history'),'utf8'),'preserved');assert.equal(fs.readFileSync(path.join(foreign,'owned-by-development'),'utf8'),'do not replace');assert.equal(uninstallHarnessLauncher(target).status,'absent');
  assert.throws(()=>installHarnessLauncher({target,entry,dataRoot,profile:'released',platform:process.platform==='win32'?'linux':'win32'}),{code:'harness_launcher_platform_unverified'});
});
