import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { test, type TestContext } from 'node:test';
import { createSdkRequire } from '../../tools/sdk-require.ts';
import { DSH_SDK_BASELINES, DSH_SDK_DEFAULT_BASELINE } from '../../tools/sdk-baselines.ts';
import { parseReleaseInput, releasePrepareCommands } from '../../tools/release.ts';
import { applySourcePatch, archiveSourceDigests, buildSourceHostArtifacts, mirrorSdkDependencies, newBuildOutput, ownedBuildRoot, parseSourcePatchManifest, parseSourceSdkReceipt, parseSourceHostArtifacts, sdkDeclarationPaths, sha256, SOURCE_EVENT_CONTRACT, sourceRelativePath, trajectoryBundleTool, validatePreparedSourceSdk, verifySourcePatchInput, verifySourceSdkApi } from '../../tools/prepare-source-sdk.ts';
import { clientCompositionPatch, hostCompositionPatch, parseHostConfigurations, stageHostCompositionPatch, trajectoryCompositionDirectory } from '../../tools/build-development-composition.ts';

const service = resolve(import.meta.dirname, '../..');
const trajectory = 'packages/client/ui-trajectory';
const baseline = DSH_SDK_BASELINES.find(item => item.version === '0.2.0-rc.2')!;
function manifest() {
  return {
    schemaVersion: 'buildr.dsh-source-patch/v1', upstream: { ...baseline },
    patch: { path: 'source.patch', sha256: 'a'.repeat(64) },
    files: ['trajectory-extension-contract.ts', 'index.ts', 'trajectory-contract.ts'].map(name => ({ path: `${trajectory}/src/client/${name}`, baseSha256: name === 'trajectory-extension-contract.ts' ? null : 'b'.repeat(64), patchedSha256: 'c'.repeat(64) })),
    api: {
      slots: ['conversation.trajectory.column', 'conversation.trajectory.inspector.objects'],
      recordContext: { type: 'TrajectoryRecordContext', declarationPath: `${trajectory}/src/client/trajectory-extension-contract.ts`, idEncoding: "JSON.stringify(['trajectory-record', internalRecordId])" },
      recordContexts: { property: 'TrajectorySnapshot.recordContexts', declarationPath: `${trajectory}/src/client/trajectory-contract.ts`, scope: 'loaded-session-window' },
      rawrefs: { property: 'TrajectoryRecordContext.eventRefs', declarationPath: `${trajectory}/src/client/trajectory-extension-contract.ts`, sequence: 'non-negative-safe-integer' },
    },
  };
}
function captureManifest() {
  const legacy = manifest();
  return { ...legacy, schemaVersion: 'buildr.dsh-source-patch/v2', hostPackages: ['packages/core/tools', 'packages/core/agent-loop'],
    files: [...legacy.files, { path: 'packages/core/tools/src/index.ts', baseSha256: 'b'.repeat(64), patchedSha256: 'c'.repeat(64) }],
    api: { ...legacy.api, eventSources: { ...SOURCE_EVENT_CONTRACT } },
  };
}
test('a Client substitution is explicit, bounded and independent of the Host package selection', () => {
  const selected = 'packages/client/ui-settings-agent-loop';
  const input = { ...captureManifest(), clientPackages: [selected] };
  input.files.push({ path: `${selected}/src/client/index.ts`, baseSha256: 'b'.repeat(64), patchedSha256: 'c'.repeat(64) });
  const parsed = parseSourcePatchManifest(input);
  assert.deepEqual(parsed.clientPackages, [selected]);
  assert.deepEqual(parsed.hostPackages, captureManifest().hostPackages);
  assert.throws(() => parseSourcePatchManifest({ ...input, clientPackages: ['packages/client/ui-settings'] }), /narrow substitution allowlist/);
  assert.throws(() => parseSourcePatchManifest({ ...input, clientPackages: [selected, selected] }), /distinct/);
  assert.throws(() => parseSourcePatchManifest({ ...input, clientPackages: [] }), /nonempty explicit/);
  assert.throws(() => parseSourcePatchManifest({ ...input, clientPackages: undefined }), /nonempty explicit/);
  assert.throws(() => parseSourcePatchManifest({ ...input, files: [...input.files, { path: `${selected}/lib/client.js`, baseSha256: null, patchedSha256: 'c'.repeat(64) }] }), /outside|generated/);
  assert.throws(() => parseSourcePatchManifest({ ...manifest(), clientPackages: [selected] }), /legacy/);
  assert.equal(parseSourcePatchManifest(captureManifest()).clientPackages, undefined);
});
test('the settings Client patch leaves every Host owner out of its update', () => {
  const patch = clientCompositionPatch({ entryId: 'ui-settings-agent-loop', name: '@deepseek-ai/dsh-client-ui-settings-agent-loop', directory: 'runtime-client-' + 'a'.repeat(16) });
  assert.equal(patch.filter(row => row.startsWith('- id:')).length, 1);
  assert.equal(patch[0], '- id: ui-settings-agent-loop');
  assert.ok(patch.includes('    - id: buildr-dev-ui-settings-agent-loop'));
  assert.ok(!patch.some(row => row.includes('buildr-dev-host-') || /- id: (tools|agent-loop|skill)$/.test(row)));
  assert.throws(() => clientCompositionPatch({ entryId: 'agent-loop', name: '@deepseek-ai/dsh-client-ui-settings-agent-loop', directory: 'runtime-client-' + 'a'.repeat(16) }), /explicit selected/);
  assert.throws(() => clientCompositionPatch({ entryId: 'ui-settings-agent-loop', name: '@deepseek-ai/dsh-client-ui-settings-agent-loop', directory: '../arbitrary' }), /immutable content/);
});
test('graph-only delivery cannot deactivate or instantiate any original root service', () => {
  assert.deepEqual(stageHostCompositionPatch('graph-only', hostArtifacts(), undefined, 'runtime-host-' + 'a'.repeat(16)), []);
  assert.throws(() => stageHostCompositionPatch('root-replacement', hostArtifacts(), undefined, 'runtime-host-' + 'a'.repeat(16)), /observed root declarations/);
});
test('capture trajectory code receives a new module URL when its actual library changes', () => {
  const files = [{ path: 'index.js', sha256: 'a'.repeat(64) }, { path: 'client.js', sha256: 'b'.repeat(64) }];
  const first = trajectoryCompositionDirectory(true, files);
  assert.match(first, /^runtime-trajectory-[a-f0-9]{16}$/);
  assert.equal(first, trajectoryCompositionDirectory(true, files));
  assert.notEqual(first, trajectoryCompositionDirectory(true, [{ ...files[0], sha256: 'c'.repeat(64) }, files[1]]));
  assert.equal(trajectoryCompositionDirectory(false, files), 'runtime-trajectory');
});
function hostArtifacts() {
  const directory = '.buildr-host';
  const entries = [{ packagePath: 'packages/core/tools', name: '@deepseek-ai/dsh-tools', entryId: 'tools', entry: `${directory}/packages/tools/lib/index.js` }];
  return { directory, entries, files: [entries[0].entry, `${directory}/packages/tools/package.json`].map(path => ({ path, sha256: 'a'.repeat(64) })) };
}
function directory(t: TestContext): string {
  const build = ownedBuildRoot(service);
  const target = mkdtempSync(join(build, 'sdk-source-test-'));
  t.after(() => {
    const resolved = realpathSync(target);
    assert.equal(resolved, target);
    assert.ok(resolved.startsWith(`${build}${sep}sdk-source-test-`));
    rmSync(resolved, { recursive: true });
  });
  return target;
}

test('rc.2 source identity is known while the action default stays rc.1', () => {
  assert.equal(DSH_SDK_DEFAULT_BASELINE.version, '0.2.0-rc.1');
  assert.equal(baseline.commit, '639ed015397290b3745d163aafe02ffee4aa3f84');
  assert.deepEqual(parseSourcePatchManifest(manifest()).upstream, baseline);
});
function receipt() {
  return {
    schemaVersion: 'buildr.dsh-source-sdk/v1', status: 'ready', baseline,
    sourceManifest: { path: '/fixture/manifest.json', sha256: 'a'.repeat(64) }, patchSha256: 'b'.repeat(64),
    sourceCheckout: '/fixture/source', upstreamArchiveSha256: 'c'.repeat(64),
    sourceFiles: [{ path: 'source.ts', sha256: 'd'.repeat(64) }], declarations: [{ path: 'lib/source.d.ts', sha256: 'e'.repeat(64) }], artifacts: [{ path: 'lib/client.js', sha256: 'f'.repeat(64) }], remotePackages: ['@fixture/host'],
    contracts: { slots: ['conversation.trajectory.column', 'conversation.trajectory.inspector.objects'], recordContext: 'TrajectoryRecordContext', recordContexts: 'TrajectorySnapshot.recordContexts', rawEventRefs: true, idEncoding: "JSON.stringify(['trajectory-record', internalRecordId])" },
  };
}
test('receipt JSON constructs typed fields and rejects malformed digest lists before file access', () => {
  assert.deepEqual(parseSourceSdkReceipt(receipt()), receipt());
  const short = receipt(); short.declarations[0].sha256 = 'e'.repeat(8);
  assert.throws(() => parseSourceSdkReceipt(short), /receipt.declarations.*full lowercase SHA256/);
  const traversal = receipt(); traversal.artifacts[0].path = '../outside.js';
  assert.throws(() => parseSourceSdkReceipt(traversal), /unsafe relative path/);
  assert.throws(() => parseSourceSdkReceipt({ ...receipt(), sourceFiles: [{ path: 'link', sha256: 'd'.repeat(64), kind: 'directory' }] }), /kind must be symlink/);
});
test('receipt JSON requires actual contributor strings and exact annotation obligations', () => {
  assert.throws(() => parseSourceSdkReceipt({ ...receipt(), remotePackages: [7] }), /remotePackages.*nonempty string/);
  const contract = receipt(); contract.contracts.rawEventRefs = false;
  assert.throws(() => parseSourceSdkReceipt(contract), /required annotation contracts/);
});

test('source metadata refuses a version-only, shortened-hash or different-commit claim', () => {
  const wrongCommit = manifest(); wrongCommit.upstream.commit = '0'.repeat(40);
  assert.throws(() => parseSourcePatchManifest(wrongCommit), /exact verified rc.2/);
  const short = manifest(); short.patch.sha256 = 'a'.repeat(12);
  assert.throws(() => parseSourcePatchManifest(short), /full lowercase SHA256/);
  const noApi = manifest(); delete (noApi as Partial<typeof noApi>).api;
  assert.throws(() => parseSourcePatchManifest(noApi), /api must be an object/);
});
test('all source targets and required declarations are explicit and bounded', () => {
  const allowed = manifest(); allowed.files.push({ path: 'pnpm-lock.yaml', baseSha256: 'b'.repeat(64), patchedSha256: 'c'.repeat(64) });
  assert.equal(parseSourcePatchManifest(allowed).files.length, 4);
  for (const path of ['package.json', '../outside.ts', '/tmp/outside.ts', `${trajectory}/node_modules/evil.js`, `${trajectory}/lib/client.js`]) {
    const input = manifest(); input.files[0].path = path;
    assert.throws(() => parseSourcePatchManifest(input), /outside|unsafe|generated/);
  }
  const missing = manifest(); missing.files.pop();
  assert.throws(() => parseSourcePatchManifest(missing), /missing required API source/);
  const duplicate = manifest(); duplicate.files.push(duplicate.files[0]);
  assert.throws(() => parseSourcePatchManifest(duplicate), /duplicate patch file/);
});
test('a patch manifest must identify both slots, the loaded window and actual raw-event refs', () => {
  const slot = manifest(); slot.api.slots.pop();
  assert.throws(() => parseSourcePatchManifest(slot), /two exact annotation slots/);
  const refs = manifest(); refs.api.rawrefs.sequence = 'layout-index';
  assert.throws(() => parseSourcePatchManifest(refs), /raw event-address API/);
  const window = manifest(); window.api.recordContexts.scope = 'visible-table';
  assert.throws(() => parseSourcePatchManifest(window), /raw event-address API/);
  const id = manifest(); id.api.recordContext.idEncoding = 'raw-nul-delimited-record-id';
  assert.throws(() => parseSourcePatchManifest(id), /raw event-address API/);
});
test('capture v2 admits only selected producers and shared type fields while legacy v1 keeps its boundary', () => {
  const capture = parseSourcePatchManifest(captureManifest());
  assert.deepEqual(capture.hostPackages, ['packages/core/tools', 'packages/core/agent-loop']);
  assert.deepEqual(capture.api.eventSources, SOURCE_EVENT_CONTRACT);
  const legacy = manifest(); legacy.files.push({ path: 'packages/core/tools/src/index.ts', baseSha256: 'b'.repeat(64), patchedSha256: 'c'.repeat(64) });
  assert.throws(() => parseSourcePatchManifest(legacy), /outside the trajectory/);
  for (const path of ['packages/core/session/src/index.ts', 'packages/llm/llm/src/message.ts', 'packages/skill/skill/src/index.ts', 'packages/core/tools/lib/index.js', 'packages/core/tools/scripts/upload.ts']) {
    const input = captureManifest(); input.files.push({ path, baseSha256: null, patchedSha256: 'c'.repeat(64) });
    assert.throws(() => parseSourcePatchManifest(input), /outside|generated/);
  }
  const types = captureManifest(); types.files.push({ path: 'packages/core/session/src/event-sources.ts', baseSha256: null, patchedSha256: 'c'.repeat(64) });
  assert.doesNotThrow(() => parseSourcePatchManifest(types));
});
test('capture manifests refuse arbitrary package selection and changed durable contract locations', () => {
  assert.throws(() => parseSourcePatchManifest({ ...captureManifest(), hostPackages: ['packages/core/session'] }), /capture allowlist/);
  assert.throws(() => parseSourcePatchManifest({ ...captureManifest(), hostPackages: ['packages/core/tools', 'packages/core/tools'] }), /distinct/);
  const input = captureManifest();
  assert.throws(() => parseSourcePatchManifest({ ...input, api: { ...input.api, eventSources: { ...input.api.eventSources, eventProperty: 'data.currentSources' } } }), /durable event source contract/);
});
test('capture v2 admits only reviewed persistence documents and selected producer readmes', () => {
  const paths = [
    'docs/persistence-schema.json', 'docs/persistence-catalog.md', 'docs/persistence-catalog.zh.md', 'docs/persistence-catalog.i18n.yaml',
    'docs/persistence-changes/2026-10-05-event-sources.md', 'docs/persistence-changes/2026-10-05-event-sources.zh.md',
    'docs/persistence-changes/2026-10-05-event-sources.i18n.yaml', 'docs/persistence-changes/2026-10-05-event-sources.schema.json',
    'docs/subsystems/tools.md', 'docs/subsystems/tools.zh.md', 'docs/subsystems/tools.i18n.yaml',
    'docs/subsystems/session.md', 'docs/subsystems/session.zh.md', 'docs/subsystems/session.i18n.yaml',
    'docs/subsystems/skills.md', 'docs/subsystems/skills.zh.md', 'docs/subsystems/skills.i18n.yaml',
    'docs/config-catalog.md', 'docs/config-catalog.zh.md', 'docs/config-catalog.i18n.yaml',
    'scripts/gen-cordis-catalog.ts', 'scripts/type-equiv.manifest.json',
    'packages/extensions/tool-cordis/src/api-catalog.ts',
    'docs/event-producer-consumer.md', 'docs/event-producer-consumer.zh.md',
    'packages/core/scope/src/scoped-events.generated.ts',
    'packages/extensions/cordis-client-runner/src/client/slot-catalog.ts',
    'docs/persistence-changes/historical-formats/README.md', 'docs/persistence-changes/historical-formats/README.zh.md', 'docs/persistence-changes/historical-formats/README.i18n.yaml',
    'packages/core/tools/README.md', 'packages/core/tools/README.zh.md', 'packages/core/tools/README.i18n.yaml',
  ];
  for (const path of paths) {
    const file = { path, baseSha256: null, patchedSha256: 'c'.repeat(64) };
    const capture = captureManifest(); capture.files.push(file);
    assert.doesNotThrow(() => parseSourcePatchManifest(capture));
    const legacy = manifest(); legacy.files.push(file);
    assert.throws(() => parseSourcePatchManifest(legacy), /outside the trajectory/);
  }
  for (const path of ['docs/persistence-changes/old-ack.md', 'docs/persistence-changes/historical-formats/old.schema.json', 'docs/unrelated.schema.json', 'docs/subsystems/unrelated.md', 'scripts/run-upload.ts', 'packages/extensions/tool-cordis/src/index.ts', 'packages/core/scope/src/index.ts', 'packages/extensions/cordis-client-runner/src/index.ts', 'packages/core/session/README.md', 'packages/skill/skill/README.md', 'packages/core/tools/docs/private.md']) {
    const capture = captureManifest(); capture.files.push({ path, baseSha256: null, patchedSha256: 'c'.repeat(64) });
    assert.throws(() => parseSourcePatchManifest(capture), /outside the selected capture/);
  }
});
test('capture receipts require actual producer entries and their package metadata within one owned closure', () => {
  const source = { ...receipt(), schemaVersion: 'buildr.dsh-source-sdk/v2', hostArtifacts: hostArtifacts(), contracts: { ...receipt().contracts, eventSources: SOURCE_EVENT_CONTRACT } };
  assert.deepEqual(parseSourceSdkReceipt(source).hostArtifacts, hostArtifacts());
  assert.throws(() => parseSourceSdkReceipt({ ...source, hostArtifacts: undefined }), /hostArtifacts/);
  const incomplete = hostArtifacts(); incomplete.files.pop();
  assert.throws(() => parseSourceHostArtifacts(incomplete), /missing executable or package metadata/);
  const wrong = hostArtifacts(); wrong.entries[0].name = '@deepseek-ai/dsh-session';
  assert.throws(() => parseSourceHostArtifacts(wrong), /allowed package identity/);
  const escape = hostArtifacts(); escape.files.push({ path: 'packages/core/session/lib/index.js', sha256: 'a'.repeat(64) });
  assert.throws(() => parseSourceHostArtifacts(escape), /owned closure/);
});
test('producer composition preserves raw root declarations and leaves preset modules under their real owner', () => {
  const host = parseSourceHostArtifacts(hostArtifacts());
  const observed = { entryId:'include:tools',moduleName:'@deepseek-ai/dsh-tools',parentTreeEntryId:'include' as const,parentContextEntryId:'include' as const,enabled:true,phase:'active' as const,parsedConfig:{mode:'native'} };
  const config = [{ id:'tools',config:{mode:{__jsExpr:'ctx.runtimeMode'}},disabled:{__jsExpr:'!ctx.isDesktop'},inject:['systemPrompt'],observed }];
  assert.deepEqual(parseHostConfigurations(config, host.entries), config);
  const patch=hostCompositionPatch(host,config,'runtime-host-'+'a'.repeat(16)).join('\n');
  assert.match(patch, /- id: tools\n  name: '@deepseek-ai\/dsh-tools'\n  disabled: true/);
  assert.match(patch, /id: buildr-dev-host-tools/);
  assert.match(patch, /disabled: \{"__jsExpr":"!ctx.isDesktop"\}/);
  assert.match(patch, /inject: \["systemPrompt"\]/);
  assert.match(patch, /config: \{"mode":\{"__jsExpr":"ctx.runtimeMode"\}\}/);
  assert.doesNotMatch(patch, /"mode":"native"/);
  assert.throws(()=>parseHostConfigurations([],host.entries),/every selected active root/);
  assert.throws(()=>parseHostConfigurations([{...config[0],id:'unselected'}],host.entries),/selected root/);
  assert.throws(()=>parseHostConfigurations([{...config[0],condition:false}],host.entries),/selected root/);
  assert.throws(()=>parseHostConfigurations([{...config[0],config:{apiKey:'private'}}],host.entries),/credentials/);
  assert.throws(()=>parseHostConfigurations([{...config[0],observed:{...observed,enabled:false}}],host.entries),/active root/);
  const expanded={...host,entries:[...host.entries,{packagePath:'packages/fs/tool-fs',name:'@deepseek-ai/dsh-tool-fs',entryId:'tool-fs',entry:'.buildr-host/packages/tool-fs/lib/index.js'}]};
  const rootsOnly=hostCompositionPatch(expanded,config,'runtime-host-'+'b'.repeat(16)).join('\n');
  assert.doesNotMatch(rootsOnly,/id: tool-fs|buildr-dev-host-tool-fs/);
  const noDisabled=[{id:'tools',config:{},observed}];
  assert.doesNotMatch(hostCompositionPatch(host,noDisabled,'runtime-host-'+'c'.repeat(16)).join('\n').split('- insert:')[1]!,/disabled:/);
});
test('an explicitly observed missing Host config remains absent in the replacement declaration', () => {
  const host = parseSourceHostArtifacts(hostArtifacts());
  const observed = { entryId:'include:tools',moduleName:'@deepseek-ai/dsh-tools',parentTreeEntryId:'include' as const,parentContextEntryId:'include' as const,enabled:true,phase:'active' as const,parsedConfig:{mode:'native'},configPresent:false };
  const input = [{ id:'tools',observed }];
  const checked = parseHostConfigurations(input,host.entries);
  assert.deepEqual(checked,input);
  assert.equal(Object.hasOwn(checked[0]!, 'config'),false);
  const insert = hostCompositionPatch(host,checked,'runtime-host-'+'a'.repeat(16)).join('\n').split('- insert:')[1]!;
  assert.match(insert,/id: buildr-dev-host-tools/);
  assert.doesNotMatch(insert,/config:/);
  assert.equal(Object.hasOwn(parseHostConfigurations([{id:'tools',config:{},observed:{...observed,configPresent:true}}],host.entries)[0]!, 'config'),true);
});
test('Host config omission requires exact observed presence and never silently invents a default', () => {
  const host = parseSourceHostArtifacts(hostArtifacts());
  const observed = { entryId:'include:tools',moduleName:'@deepseek-ai/dsh-tools',parentTreeEntryId:'include' as const,parentContextEntryId:'include' as const,enabled:true,phase:'active' as const,parsedConfig:{mode:'native'} };
  assert.throws(()=>parseHostConfigurations([{id:'tools',observed}],host.entries),/config.*presence|presence.*config/i);
  assert.throws(()=>parseHostConfigurations([{id:'tools',observed:{...observed,configPresent:true}}],host.entries),/config.*presence|presence.*config/i);
  assert.throws(()=>parseHostConfigurations([{id:'tools',config:{},observed:{...observed,configPresent:false}}],host.entries),/config.*presence|presence.*config/i);
  assert.throws(()=>parseHostConfigurations([{id:'tools',config:undefined,observed:{...observed,configPresent:false}}],host.entries),/config.*presence|presence.*config/i);
  assert.throws(()=>parseHostConfigurations([{id:'tools',config:{},observed:{...observed,configPresent:'false'}}],host.entries),/config.*presence|presence.*config/i);
  for(const config of [null,[],undefined])assert.throws(()=>parseHostConfigurations([{id:'tools',config,observed}],host.entries),/object/);
});
test('relative addresses reject traversal, Windows separators and control characters', () => {
  for (const path of ['../x', 'a/../x', 'a//x', 'a\\x', '/x', 'a\0x', 'a\nx']) assert.throws(() => sourceRelativePath(path), /unsafe/);
  assert.equal(sourceRelativePath('packages/client/ui-trajectory/src/client/index.ts'), `${trajectory}/src/client/index.ts`);
});
test('output selection preserves old artifacts and refuses a symlinked build root or ancestor', t => {
  const root = directory(t); const build = ownedBuildRoot(root);
  mkdirSync(join(build, 'existing')); writeFileSync(join(build, 'existing', 'keep.txt'), 'keep');
  assert.throws(() => newBuildOutput(root, 'build/existing'), /already exists/);
  assert.equal(readFileSync(join(build, 'existing', 'keep.txt'), 'utf8'), 'keep');
  assert.throws(() => newBuildOutput(root, '../outside'), /strictly inside/);
  symlinkSync(root, join(build, 'linked'), 'dir');
  assert.throws(() => newBuildOutput(root, 'build/linked/output'), /not owned/);
  const linkedRoot = join(root, 'other'); mkdirSync(linkedRoot); symlinkSync(build, join(linkedRoot, 'build'), 'dir');
  assert.throws(() => ownedBuildRoot(linkedRoot), /not an owned/);
});
test('a patch is applied to the owned SDK directory rather than skipped inside an ancestor repository', t => {
  const root = directory(t); const sdk = join(root, 'dsh-source-sdk-fixture', 'sdk'); mkdirSync(sdk, { recursive: true });
  writeFileSync(join(sdk, 'content.txt'), 'before\n');
  const patch = join(root, 'source.patch');
  writeFileSync(patch, 'diff --git a/content.txt b/content.txt\n--- a/content.txt\n+++ b/content.txt\n@@ -1 +1 @@\n-before\n+after\n');
  applySourcePatch(sdk, patch);
  assert.equal(readFileSync(join(sdk, 'content.txt'), 'utf8'), 'after\n');
  execFileSync('git', ['init', '--quiet', sdk]);
  assert.throws(() => applySourcePatch(sdk, patch), /non-repository SDK/);
});
test('workspace dependency links resolve the prepared SDK generated files, not the input clone', t => {
  const root = directory(t); const source = join(root, 'source'); const sdk = join(root, 'sdk');
  const packagePath = 'packages/api/fixture';
  for (const base of [source, sdk]) { mkdirSync(join(base, packagePath, 'lib'), { recursive: true }); writeFileSync(join(base, packagePath, 'lib', 'typert.remote-client.d.ts'), base === sdk ? 'prepared' : 'original'); }
  const installed = join(source, 'node_modules'); mkdirSync(join(installed, '@deepseek-ai'), { recursive: true });
  symlinkSync(join(source, packagePath), join(installed, '@deepseek-ai', 'fixture'), 'dir');
  mkdirSync(join(installed, '.pnpm', 'third-party'), { recursive: true });
  symlinkSync(join(installed, '.pnpm', 'third-party'), join(installed, 'third-party'), 'dir');
  mirrorSdkDependencies(source, sdk, installed, join(sdk, 'node_modules'));
  assert.equal(realpathSync(join(sdk, 'node_modules/@deepseek-ai/fixture')), join(sdk, packagePath));
  assert.equal(readFileSync(join(sdk, 'node_modules/@deepseek-ai/fixture/lib/typert.remote-client.d.ts'), 'utf8'), 'prepared');
  assert.equal(realpathSync(join(sdk, 'node_modules/third-party')), join(installed, '.pnpm', 'third-party'));
});
test('a base marker cannot qualify an unprepared SDK, and an unrelated Git checkout is refused', t => {
  const root = directory(t); const sdk = join(root, 'sdk'); mkdirSync(sdk);
  writeFileSync(join(sdk, '.dsh-sdk-commit'), `${baseline.commit}\n`);
  writeFileSync(join(sdk, 'package.json'), JSON.stringify({ version: baseline.version }));
  assert.throws(() => validatePreparedSourceSdk(sdk, service), /buildr-dsh-source-sdk/);
  execFileSync('git', ['init', '--quiet', sdk]);
  execFileSync('git', ['-C', sdk, 'add', '.']);
  execFileSync('git', ['-C', sdk, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const input = join(root, 'manifest.json'); writeFileSync(input, JSON.stringify(manifest()));
  assert.throws(() => verifySourcePatchInput(sdk, input), /Git HEAD/);
});
test('enhanced build and full verification refuse an implicit old SDK before producing artifacts', () => {
  for (const script of ['build-plugin.ts', 'verify-all.ts']) {
    const env = { ...process.env }; delete env.BUILDR_DSH_SOURCE_SDK_ROOT;
    assert.throws(() => execFileSync(process.execPath, [join(service, 'tools', script)], { cwd: service, env, stdio: ['ignore', 'pipe', 'pipe'] }), /候选 SDK|完整验证需要/);
  }
});

test('release preparation requires the same explicit SDK and never falls back to an old positional path', () => {
  const env = { BUILDR_DSH_SDK_ROOT: '/legacy-marker-sdk' };
  assert.throws(() => parseReleaseInput(['prepare'], env), /需要显式/);
  assert.throws(() => parseReleaseInput(['prepare', '/legacy-sdk'], env), /Usage/);
  assert.throws(() => parseReleaseInput(['prepare', '--source-sdk'], env), /Usage/);
  assert.deepEqual(parseReleaseInput(['status'], env), { action: 'status' });
  const sdk = join(service, 'build/prepared-sdk'); const bundle = join(service, 'build/candidate/bundle');
  assert.deepEqual(parseReleaseInput(['prepare', '--source-sdk', sdk], env), { action: 'prepare', sourceSdk: sdk });
  assert.deepEqual(parseReleaseInput(['prepare'], { BUILDR_DSH_SOURCE_SDK_ROOT: sdk }), { action: 'prepare', sourceSdk: sdk });
  const commands = releasePrepareCommands(sdk, bundle);
  assert.deepEqual(commands.build.slice(1), ['--source-sdk', sdk, '--output', bundle]);
  assert.deepEqual(commands.verify.slice(1), ['--source-sdk', sdk, '--bundle', bundle]);
  assert.deepEqual(commands.pack, ['pack', bundle, '--json']);
});
test('missing or marker-only release inputs are refused before release status or registry operations', t => {
  const env = { ...process.env }; delete env.BUILDR_DSH_SOURCE_SDK_ROOT;
  assert.throws(() => execFileSync(process.execPath, [join(service, 'tools/release.ts'), 'prepare'], { cwd: service, env, stdio: ['ignore', 'pipe', 'pipe'] }), /发布准备需要显式/);
  const root = directory(t); const sdk = join(root, 'sdk'); mkdirSync(sdk); writeFileSync(join(sdk, '.dsh-sdk-commit'), baseline.commit);
  assert.throws(() => execFileSync(process.execPath, [join(service, 'tools/release.ts'), 'prepare', '--source-sdk', sdk], { cwd: service, env, stdio: ['ignore', 'pipe', 'pipe'] }), /buildr-dsh-source-sdk/);
});

const toolchain = process.env.BUILDR_DSH_SDK_ROOT ?? join(service, 'build/upstream-research/dsh-v0.2.0-rc.2');
const compilerPresent = existsSync(join(toolchain, 'node_modules/typescript'));
test('producer build shares selected runtime state across entries and preserves package identities', { skip: !compilerPresent }, async t => {
  const root = directory(t); const req = createSdkRequire(toolchain);
  writeFileSync(join(root, 'package.json'), '{"type":"module"}'); mkdirSync(join(root, 'node_modules'));
  symlinkSync(dirname(req.resolve('esbuild/package.json')), join(root, 'node_modules/esbuild'), 'dir');
  mkdirSync(join(root, 'node_modules/fixture-runtime'));
  writeFileSync(join(root, 'node_modules/fixture-runtime/package.json'), '{"main":"index.cjs"}');
  writeFileSync(join(root, 'node_modules/fixture-runtime/index.cjs'), "module.exports=function(){return require('node:path').basename('/tmp/capture')};");
  for (const [path, name, code] of [
    ['packages/core/tools', '@deepseek-ai/dsh-tools', "import name from 'fixture-runtime';export const runtimeName=name();let count=0;export function next(){return ++count}export default function tools(){return next()}"],
    ['packages/core/agent-loop', '@deepseek-ai/dsh-agent-loop', "import {next} from '@deepseek-ai/dsh-tools';export default function loop(){return next()}"],
  ]) {
    mkdirSync(join(root, path, 'lib/types'), { recursive: true });
    writeFileSync(join(root, path, 'package.json'), JSON.stringify({ name, version: baseline.version, exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' } } }));
    writeFileSync(join(root, path, 'lib/types/index.js'), code); writeFileSync(join(root, path, 'lib/types/index.d.ts'), 'export default function run():number;');
  }
  const artifacts = await buildSourceHostArtifacts(root, parseSourcePatchManifest(captureManifest()));
  assert.equal(artifacts.entries.length, 2);
  assert.ok(artifacts.files.some(file => file.path.includes('/chunks/')));
  const tools = await import(join(root, artifacts.entries[0].entry));
  const loop = await import(join(root, artifacts.entries[1].entry));
  assert.equal(tools.runtimeName, 'capture');
  assert.equal(tools.default(), 1); assert.equal(loop.default(), 2); assert.equal(tools.default(), 3);
  for (const entry of artifacts.entries) assert.equal(JSON.parse(readFileSync(join(root, artifacts.directory, 'packages', entry.entryId, 'package.json'), 'utf8')).name, entry.name);
});
test('archive source hashes preserve declared CRLF bytes and symlink contents', { skip: !compilerPresent }, t => {
  const root = directory(t); writeFileSync(join(root, 'package.json'), '{}'); mkdirSync(join(root, 'node_modules'));
  symlinkSync(dirname(createSdkRequire(toolchain).resolve('tar/package.json')), join(root, 'node_modules/tar'), 'dir');
  const input = join(root, 'input'); mkdirSync(input);
  writeFileSync(join(input, 'script.cmd'), 'echo source\r\n'); symlinkSync('script.cmd', join(input, 'link'));
  const archive = join(root, 'source.tar'); execFileSync('tar', ['-cf', archive, '-C', input, 'script.cmd', 'link']);
  const files = archiveSourceDigests(root, archive);
  assert.equal(files.find(file => file.path === 'script.cmd')?.sha256, sha256('echo source\r\n'));
  assert.notEqual(files.find(file => file.path === 'script.cmd')?.sha256, sha256('echo source\n'));
  assert.deepEqual(files.find(file => file.path === 'link'), { path: 'link', sha256: sha256('script.cmd'), kind: 'symlink' });
});
test('bundle preparation cannot run a modified script or a package-manager installation command', t => {
  const root = directory(t); const packageRoot = join(root, trajectory); mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ scripts: { bundle: 'pnpm install && tsdown' } }));
  assert.throws(() => trajectoryBundleTool(root), /verified tsdown build tool/);
});
test('the actual TypeScript probe distinguishes missing slots and missing recordContexts from supported declarations', { skip: !compilerPresent }, t => {
  const root = directory(t);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  mkdirSync(join(root, 'node_modules'));
  const req = createSdkRequire(toolchain);
  symlinkSync(dirname(req.resolve('typescript/package.json')), join(root, 'node_modules/typescript'), 'dir');
  symlinkSync(join(toolchain, 'node_modules/@types'), join(root, 'node_modules/@types'), 'dir');
  const paths = {
    '@deepseek-ai/dsh-client-ui-slots': ['packages/client/ui-slots/src/index.ts'],
    '@deepseek-ai/dsh-client-ui-trajectory/client': [`${trajectory}/src/client/index.ts`],
    '@deepseek-ai/dsh-session/types': ['packages/core/session/src/types.ts'],
  };
  writeFileSync(join(root, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', noUnusedLocals: true, paths } }));
  writeFileSync(join(root, 'tsconfig.base.client.json'), JSON.stringify({ extends: './tsconfig.base.json' }));
  const write = (path: string, content: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
  const context = 'export interface TrajectoryRecordContext { recordId:string;kind:string;transient:boolean;eventRefs:readonly {sessionId:string;seq:number}[] }';
  write('packages/core/session/lib/types/types.d.ts', 'export type SessionId = string;');
  const vendor = join(root, 'vendor/cordis'); mkdirSync(join(vendor, 'lib'), { recursive: true });
  writeFileSync(join(vendor, 'package.json'), JSON.stringify({ types: './lib/index.d.ts' }));
  writeFileSync(join(vendor, 'lib/index.d.ts'), 'export interface Context {}');
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8'));
  config.compilerOptions.paths['@deepseek-ai/cordis'] = ['vendor/cordis/src'];
  writeFileSync(join(root, 'tsconfig.base.json'), JSON.stringify(config));
  assert.deepEqual(sdkDeclarationPaths(root)['@deepseek-ai/cordis'], [join(vendor, 'lib/index.d.ts')]);
  const slotsFile = 'packages/client/ui-slots/lib/types/index.d.ts';
  const trajectoryFile = `${trajectory}/lib/types/client/index.d.ts`;
  write(slotsFile, 'export interface SlotMap {}');
  write(trajectoryFile, `${context}\nexport interface TrajectorySnapshot {recordContexts?:readonly TrajectoryRecordContext[]}`);
  assert.throws(() => verifySourceSdkApi(root), /conversation.trajectory.column|conversation.trajectory.inspector.objects/);
  write(slotsFile, `import type {TrajectoryRecordContext} from '@deepseek-ai/dsh-client-ui-trajectory/client'; export interface SlotMap { 'conversation.trajectory.column':{kind:'list';scope:'session';owner:{record:TrajectoryRecordContext}}; 'conversation.trajectory.inspector.objects':{kind:'list';scope:'session';owner:{record:TrajectoryRecordContext}} }`);
  write(trajectoryFile, `${context}\nexport interface TrajectorySnapshot {}`);
  assert.throws(() => verifySourceSdkApi(root), /recordContexts/);
  write(trajectoryFile, `${context}\nexport interface TrajectorySnapshot {recordContexts?:readonly TrajectoryRecordContext[]}`);
  assert.doesNotThrow(() => verifySourceSdkApi(root));
  assert.throws(() => verifySourceSdkApi(root, true), /eventSources|EventSources|SessionEventMap/);
  write('packages/core/session/lib/types/types.d.ts', `export type SessionId = string; export interface EventSources {schemaVersion:'dsh.event-sources/v1';status:'confirmed'|'unknown'|'not-applicable';matches:readonly unknown[]};export interface SessionEventMap {'tool/result':{eventSources?:EventSources}}`);
  const captureContext = context.replace('eventRefs:', "eventSources?:readonly {seq:number;sources:import('@deepseek-ai/dsh-session/types').EventSources}[];eventRefs:");
  write(trajectoryFile, `${captureContext}\nexport interface TrajectorySnapshot {recordContexts?:readonly TrajectoryRecordContext[]}`);
  assert.doesNotThrow(() => verifySourceSdkApi(root, true));
  write(trajectoryFile, `${context.replace('eventRefs:', 'eventSources?:readonly any[];eventRefs:')}\nexport interface TrajectorySnapshot {recordContexts?:readonly TrajectoryRecordContext[]}`);
  assert.throws(() => verifySourceSdkApi(root, true), /constraint 'true'/);
  assert.equal(sha256(Buffer.from('source')), sha256('source'));
});
