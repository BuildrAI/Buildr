#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import {createCandidatePreparationReuse,preparationContentDigest} from '../../tools/verification/candidate-preparation-reuse.ts';
import {withExclusiveFileLock} from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { inspectLocalWebToolchain, buildWebDist, resolveAdjacentNpmCli } from '../../tools/build/web-dist.ts';
import { assertGeneratedArtifactManifest, createGeneratedArtifactManifest, createOwnedArtifactStaging, inventoryGeneratedArtifact } from '../../tools/build/generated-artifacts.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot: any = path.resolve(productRoot, '../buildr-web');

export { inspectLocalWebToolchain, buildWebDist, resolveAdjacentNpmCli };

export function describeWebDistTree(root: any): any  {
  return inventoryGeneratedArtifact(root);
}

function defaultBuild(stagingRoot: any): any  {
  buildWebDist(stagingRoot, webRoot);
}

/** Reuse the existing preparation receipt and generated-artifact inventories.
 * The cache is checkout-local build output; it never reads the online web-dist. */
function cachedWebDist(outputRoot: string, build: any, cacheRoot: string, options: any): any {
  const started=performance.now();
  fs.mkdirSync(cacheRoot,{recursive:true});
  const stat=fs.lstatSync(cacheRoot);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('web_dist_cache_root_invalid');
  const cachedRoot=path.join(cacheRoot,'dist');
  if(path.resolve(outputRoot)===path.resolve(cacheRoot)||path.resolve(outputRoot).startsWith(path.resolve(cacheRoot)+path.sep))throw new Error('web_dist_cache_output_overlap');
  return withExclusiveFileLock(path.join(cacheRoot,'.lock'),cacheRoot,()=>{
    const sourcePaths=options.inputPaths??[
      ...['src','tools','index.html','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','package.json','package-lock.json','build/generated'].map(file=>path.join(webRoot,file)),
      ...['test/verification/web-dist.ts','tools/build/web-dist.ts','tools/build/generated-artifacts.ts','tools/verification/candidate-preparation-reuse.ts','tools/testing/run-types.ts','tools/development/run-development-npm.ts'].map(file=>path.join(productRoot,file)),
    ];
    const input=()=>{
      const source=preparationContentDigest(sourcePaths);
      const optional=preparationContentDigest(options.optionalPaths??['public','.npmrc','.env','.env.local','.env.production','.env.production.local'].map(file=>path.join(webRoot,file)),{optional:true});
      const dependencies=options.inputPaths?'fixture-owned-inputs':preparationContentDigest([path.join(webRoot,'node_modules')],{webDependencyCache:true});
      const npmCli=options.inputPaths?null:resolveAdjacentNpmCli(process.execPath,options.env??process.env);
      const npm=npmCli?preparationContentDigest([npmCli,path.resolve(path.dirname(npmCli),'../package.json')]):'fixture-owned-npm';
      if(!source||!optional||!dependencies||!npm)return null;
      const environment=Object.entries(options.env??process.env).filter(([key])=>/^VITE_/u.test(key)).sort(([a],[b])=>a.localeCompare(b));
      return 'sha256-'+crypto.createHash('sha256').update(JSON.stringify({source,optional,dependencies,environment,npm,node:{executable:process.execPath,version:process.version,platform:process.platform,arch:process.arch}})).digest('hex');
    };
    const recipe={id:'verification-web-dist',version:1};
    // Download caches and logging settings do not affect a build using the
    // already fingerprinted installed dependencies and exact npm executable.
    const buildEnvironment=Object.fromEntries(Object.entries(options.env??process.env).filter(([key])=>
      ['PATH','NODE_ENV','NODE_OPTIONS','TZ','LANG','LC_ALL','LC_CTYPE'].includes(key)
      || (/^npm_config_/iu.test(key)&&!/^npm_config_(?:cache|logs_max|logs_dir|loglevel|progress|timing)$/iu.test(key))));
    const reuse=createCandidatePreparationReuse({serviceRoot:productRoot,webRoot},{executable:process.execPath,version:process.version},{receiptRoot:cacheRoot,env:buildEnvironment,npmIdentity:'bound-by-source-and-dependency-bytes',fingerprint:(_item:any,role:string)=>role==='input'?input():preparationContentDigest([cachedRoot])});
    const before=reuse.inspect(recipe);
    if(!before.reusable){
      reuse.invalidate(recipe);
      verifyGeneratedWebDist({outputRoot:cachedRoot,build,cacheRoot:null});
      reuse.complete(recipe,before,new Date().toISOString());
    }
    const manifest=createGeneratedArtifactManifest({inputs:{source:before.input??'uncacheable-current-input'},artifacts:[{id:'web-dist',root:cachedRoot}]});
    // A caller-owned existing destination follows the normal build path instead.
    fs.cpSync(cachedRoot,outputRoot,{recursive:true,errorOnExist:true,force:false});
    assertGeneratedArtifactManifest(manifest,{'web-dist':outputRoot});
    const after=reuse.inspect(recipe);
    if(before.input&&after.input!==before.input)throw new Error('web_dist_inputs_changed_during_preparation');
    return {status:'passed',root:outputRoot,fileCount:manifest.artifacts[0].files.length,manifest,preparation:{status:before.reusable?'reused':'rebuilt',inputIdentity:before.input,durationMs:Math.round(performance.now()-started)}};
  });
}

export function verifyGeneratedWebDist({ outputRoot = null, build = defaultBuild, temporaryParent = os.tmpdir(), cacheRoot = build===defaultBuild?path.join(productRoot,'build/verification-web-dist-cache'):null, ...cacheOptions }: any = {}): any  {
  if(cacheRoot&&outputRoot&&!fs.existsSync(outputRoot))return cachedWebDist(path.resolve(outputRoot),build,path.resolve(cacheRoot),cacheOptions);
  const owned: any = outputRoot ? null : createOwnedArtifactStaging(temporaryParent, 'buildr-web-dist-verification-');
  const stagingRoot: any = path.resolve(outputRoot || path.join(owned.root, 'web-dist'));
  try {
    build(stagingRoot);
    const files: any = inventoryGeneratedArtifact(stagingRoot);
    if (!files.some((entry: any) => entry.path === 'index.html')) throw Object.assign(new Error('Buildr Web staging dist is missing index.html.'), { code: 'web_dist_inventory_invalid' });
    if (!files.some((entry: any) => entry.path.endsWith('.js')) || !files.some((entry: any) => entry.path.endsWith('.css'))) throw Object.assign(new Error('Buildr Web staging dist must contain JavaScript and CSS assets.'), { code: 'web_dist_inventory_invalid' });
    const manifest: any = createGeneratedArtifactManifest({ inputs: { source: 'current-buildr-web' }, artifacts: [{ id: 'web-dist', root: stagingRoot }] });
    return { status: 'passed', root: stagingRoot, fileCount: files.length, manifest };
  } finally {
    owned?.cleanup();
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const outputIndex: any = process.argv.indexOf('--output');
    const outputRoot: any = outputIndex < 0 ? null : process.argv[outputIndex + 1];
    if (outputIndex >= 0 && (!outputRoot || outputRoot.startsWith('--'))) throw new Error('--output requires a directory.');
    const result: any = verifyGeneratedWebDist({ outputRoot });
    process.stdout.write(`${JSON.stringify({ status: result.status, root: outputRoot ? result.root : null, fileCount: result.fileCount, manifest: result.manifest, preparation: result.preparation }, null, 2)}\n`);
  } catch (error: any) {
    process.stderr.write(`${error.code || 'web_dist_build_failed'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
