import { readSharedResourceSet, readResourceAdoption, adoptPackageResources } from '../../../infrastructure/product-resources/shared-resources.ts';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnCommand } from '../../../infrastructure/process.ts';
import { currentProductInvocation } from '../../../infrastructure/product-invocation/index.ts';
import { detectManagedRuntimeAdapters } from '../../agent-assets/application/runtime-selection.ts';
import { ephemeralWorkspaceRootReason } from './workspace-command-application.ts';

export type { WorkspacePreparation } from '../persistence/workspace-preparation-store.ts';
import { createWorkspacePreparationStore, type WorkspacePreparation } from '../persistence/workspace-preparation-store.ts';
const fail = (code: string, message: string) => Object.assign(new Error(message), { code, status: 409 });
export function createWorkspacePreparation(runtime: any) {
  const running = new Set<string>();
  const alive = (pid: number) => { if (!Number.isSafeInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
  const store=createWorkspacePreparationStore(path.join(path.dirname(runtime.registryRepository.workspaceRegistryPath()),'workspace-preparations'));
  const write=store.write;
  function read(id:string):WorkspacePreparation {
    const value=store.read(id);
    if(value.status==='preparing'&&!running.has(id)&&!alive(value.ownerPid!))return {...value,status:'failed',error:'上次准备已中断，可以重试。'};
    return value;
  }
  function identity(root: string) { const stat = fs.statSync(root); if (!stat.isDirectory()) throw fail('workspace_directory_invalid', '请选择本机目录。'); return `${stat.dev}:${stat.ino}`; }
  function select(root: string) {
    root = fs.realpathSync(root);
    if (runtime.registryRepository.isSharedRegistryScope() && ephemeralWorkspaceRootReason(root)) throw fail('workspace_registry_ephemeral_root', '请选择需要长期保留的本机目录。');
    const registered = runtime.listRegisteredWorkspaces().workspaces.find((entry: any) => entry.rootPath === root);
    const known = store.list().find(entry=>entry.rootPath===root&&entry.directoryIdentity===identity(root));
    if (known) {
      const observed = read(known.id);
      if (observed.status === 'preparing') return observed;
      // Completed preparation is not proof of a current registry entry.
      return write({ ...observed, status: 'selected', error: null, details: undefined, customizations: undefined, ownerPid: undefined }, observed.revision);
    }
    return write({ id: randomUUID(), revision: 0, rootPath: root, directoryIdentity: identity(root), name: registered?.workspace?.name || path.basename(root), workspaceId: registered?.workspace?.id || null, status: 'selected', error: null, updatedAt: '' }, null);
  }
  // Shared resources are capability inputs, not the authority for opening a Workspace.
  // Refresh only generated local entries; source updates remain with their existing owner.
  function refreshResourceProjection(root: string) {
    try {
      const resources = readSharedResourceSet();
      const adopted = readResourceAdoption(root);
      if (adopted?.resourceSet === resources.id && adopted.ready) return { status: 'current' };
      for (const adapter of detectManagedRuntimeAdapters(root)) {
        runtime.renderRuntime(null, ['--adapter', adapter, '--target', root, '--product-skill'], { productSkill: true });
      }
      adoptPackageResources(root, true, resources.id);
      return { status: 'refreshed' };
    } catch (error: any) {
      return { status: 'failed', message: error.message };
    }
  }
  async function prepareRoot(root: string, expectedWorkspaceId: string | null, name: string, keep: Array<{id:string;integrity:string}> = [], reuseReady = false) {
    if (fs.realpathSync(root) !== root) throw fail('workspace_directory_changed', '工作目录路径已变化，请重新选择。');
    for (const relative of ['.buildr', '.buildr/local', 'skills', 'rules', 'components', 'commands', 'projects']) {
      const stat = fs.lstatSync(path.join(root, relative), { throwIfNoEntry: false });
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw fail('workspace_directory_invalid', `目录 ${relative} 无法安全使用，已有内容已保留。`);
    }
    for (const relative of ['AGENTS.md','.buildr/workspace.yml','skills/manifest.yml','rules/manifest.yml','components/manifest.yml','commands/manifest.yml']) { const stat=fs.lstatSync(path.join(root,relative),{throwIfNoEntry:false}); if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw fail('workspace_directory_invalid',`文件 ${relative} 无法安全使用，已有内容已保留。`); }
    const lock=store.acquire(root);
    try { return await prepareRootUnlocked(root, expectedWorkspaceId, name, keep, reuseReady); }
    finally { store.release(lock); }
  }
  async function prepareRootUnlocked(root: string, expectedWorkspaceId: string | null, name: string, keep: Array<{id:string;integrity:string}> = [], reuseReady = false) {
    const metadata = path.join(root, '.buildr/workspace.yml');
    let initialized = false;
    if (fs.existsSync(metadata)) {
      const record = runtime.readWorkspaceRecord(root);
      if (expectedWorkspaceId && record.workspace.id !== expectedWorkspaceId) throw fail('workspace_identity_conflict', '目录中的工作空间身份已变化。');
      runtime.canonicalWorkspaceManagementIdentity(root);
      runtime.ensureRegisteredTarget(root);
      const selfBootstrap=runtime.readComponentsManifestForWrite(root).components.some((entry:any)=>entry.id==='buildr-self-bootstrap'&&entry.enabled!==false&&entry.state!=='uninstalled');
      if(selfBootstrap) {
        const adopted=readResourceAdoption(root);
        if(adopted?.ready) { const refresh=refreshResourceProjection(root); if(refresh.status==='failed')throw fail('workspace_resource_projection_failed',`本机技能入口尚未刷新，其他工作可继续。${refresh.message}`); return {workspaceId:record.workspace.id,name:record.workspace.name}; }
        throw fail('workspace_self_bootstrap_owned','此 Buildr 开发工作空间需要由自身维护程序更新，当前目录已保留。');
      }
      // Re-adding a ready directory is registration, not an explicit full update.
      // Keep the existing recovery path if current assets need repair or adoption.
      const adopted = readResourceAdoption(root);
      if (reuseReady && !keep.length && adopted?.ready && adopted.resourceSet === readSharedResourceSet().id) {
        const findings = runtime.syncPackageBuiltins(root, { checkOnly: true }).findings;
        const needsRecovery = findings.some((item: any) => item.converge || ['modified', 'missing', 'blocked', 'invalid'].includes(item.status))
          || runtime.packageComponentsStatus(root).components.some((item: any) => ['modified', 'missing', 'blocked', 'invalid'].includes(item.status));
        if (!needsRecovery) {
          const registered = runtime.listRegisteredWorkspaces().workspaces.some((entry: any) => entry.rootPath === root && entry.workspace?.id === record.workspace.id && entry.registryScope !== 'shared');
          return { workspaceId: record.workspace.id, name: record.workspace.name, ...(registered ? {} : { status: 'removed' }) };
        }
      }
      initialized = true;
    } else if (expectedWorkspaceId) throw fail('workspace_identity_conflict', '已登记工作空间的身份文件已不存在，未重新初始化。');
    if (keep.length) runtime.keepPackageCustomizations(root,keep);
    const invocation = currentProductInvocation();
    const run = async (args: string[]) => {
      const result = await spawnCommand(invocation.command, [...invocation.argsPrefix, ...args], { cwd: root });
      if (!result.ok) {
        const diagnostic=String(result.stderr || result.stdout || result.error || '').slice(-6000);
        const message=/EACCES|EPERM|permission denied/i.test(diagnostic)?'目录暂时无法写入，请确认目录权限后重试。':/ENOSPC/.test(diagnostic)?'磁盘空间不足，释放空间后重试。':/projection.*(?:conflict|modified)|owned.*modified/i.test(diagnostic)?'发现本地修改，已有内容已保留。检查差异后重试。':'工作空间尚未准备完成。已完成的内容会保留，可以重试。';
        throw Object.assign(fail('workspace_preparation_failed',message),{diagnostic});
      }
    };
    if (!initialized) await run(['init', '--target', root, '--name', name, '--description', '与智能体共同工作的本机目录。']);
    else {
      const adapters = detectManagedRuntimeAdapters(root);
      for (const adapter of adapters.length ? adapters : ['agents-standard']) await run(['sync', '--adapter', adapter, '--target', root]);
    }
    const conflicts = runtime.syncPackageBuiltins(root,{checkOnly:true}).findings.filter((item:any)=>['skill','contract'].includes(item.type)&&!item.component&&item.status==='modified');
    if (conflicts.length) throw Object.assign(fail('workspace_customizations_pending','工作空间保留了本地定制，请确认保留当前定制后继续。'), {customizations:conflicts.map((item:any)=>({id:item.id,integrity:item.liveIntegrity}))});
    const components = runtime.packageComponentsStatus(root).components.filter((item:any)=>['modified','missing','blocked','invalid'].includes(item.status));
    if (components.length) throw fail('workspace_components_pending',`部分工作内容尚未准备完成：${components.map((item:any)=>item.id).join('、')}。已有内容已保留，恢复后重试。`);
    const record = runtime.readWorkspaceRecord(root);
    const registered=runtime.listRegisteredWorkspaces().workspaces.some((entry:any)=>entry.rootPath===root&&entry.workspace?.id===record.workspace.id&&entry.registryScope!=='shared');
    return { workspaceId: record.workspace.id, name: record.workspace.name, ...(registered?{}:{status:'removed'}) };
  }
  function start(input: any) {
    if (!input || Object.keys(input).some(key => !['id','revision','name','keepCustomizations'].includes(key)) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 160) throw fail('workspace_preparation_input_invalid', '请确认工作空间名称和目录。');
    const before = read(input.id);
    if (before.revision !== input.revision || before.status === 'preparing' || running.has(before.id)) throw fail('workspace_preparation_conflict', '准备正在进行或状态已变化。');
    if (identity(before.rootPath) !== before.directoryIdentity) throw fail('workspace_directory_changed', '所选目录已被替换，请重新选择。');
    const value = write({ ...before, name: input.name.trim(), ownerPid: process.pid, status: 'preparing', error: null }, before.revision);
    running.add(value.id);
    setImmediate(() => { void (async () => {
      try { const result = await prepareRoot(value.rootPath, value.workspaceId, value.name, input.keepCustomizations === true ? value.customizations || [] : [], true); if(result.status==='removed')throw fail('workspace_unregistered','此目录已从列表移除，已准备的内容会保留。'); write({ ...value, ...result, status: 'ready' }, value.revision); }
      catch (error: any) { try { write({ ...value, status: 'failed', error: error.message, details: error.diagnostic || '', customizations: error.customizations || [] }, value.revision); } catch {} }
      finally { running.delete(value.id); }
    })(); });
    return value;
  }
  function prepareWorkspaceForOpen(id: string) {
    const resolved = runtime.resolveRegisteredWorkspace(id);
    const local = runtime.listRegisteredWorkspaces().workspaces.find((entry: any) => entry.workspace?.id === id && entry.registryScope !== 'shared');
    if (!local) throw fail('workspace_management_channel_conflict', '此目录属于其他管理来源，不能从当前页面更新。');
    runtime.assertWorkspaceManagementAccess(resolved.rootPath);
    try {
      const adopted = readResourceAdoption(resolved.rootPath);
      if (adopted?.ready) {
        const refresh = refreshResourceProjection(resolved.rootPath);
        if (refresh.status !== 'failed') return {ready:true, workspaceId:id, resourceRefresh:refresh};
        // A stale manifest can reference shared sources that no longer exist;
        // only a full preparation converges it, so opening falls through there.
      }
    } catch { /* Explicit opening can recover local, rebuildable preparation state. */ }
    const selected = select(resolved.rootPath);
    const launched = selected.status === 'preparing' ? selected : start({id:selected.id,revision:selected.revision,name:selected.name});
    const { ownerPid, directoryIdentity, ...preparation } = launched;
    return preparation;
  }
  return { prepareWorkspaceForOpen, selectWorkspaceDirectory: select, workspacePreparation: read, prepareSelectedWorkspace: start,
    prepareRegisteredWorkspace: async (entry: {rootPath: string; workspaceId: string | null}, options: {keepCustomizations?:Array<{id:string;integrity:string}>} = {}) => {
      const registry = runtime.listRegisteredWorkspaces();
      const current = registry.workspaces.find((item: any) => item.rootPath === entry.rootPath && item.registryScope !== 'shared');
      if(!current)return {status:'removed'};
      if (current?.status === 'unavailable') throw fail('workspace_directory_unavailable','目录当前不可访问，恢复目录后重试。');
      if (!current || !current.workspace?.id || (entry.workspaceId && current.workspace.id !== entry.workspaceId)) throw fail('workspace_identity_conflict', '登记目录或工作空间身份已变化。');
      const access = runtime.assertWorkspaceManagementAccess(entry.rootPath);
      if (!entry.workspaceId && !access.claimed) throw fail('workspace_identity_conflict', '此前不可用的目录缺少可核实的管理归属。');
      return prepareRoot(entry.rootPath, current.workspace.id, current.workspace.name, options.keepCustomizations);
    } };
}
