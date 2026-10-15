import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connectionFailure, inputObject } from './errors.mjs';
import { xxlJobScope } from './configuration.mjs';

const execute = promisify(execFile);
export const digest = value => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function serviceIdentity(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw connectionFailure('xxl_job_service_invalid', '请明确指定已登记服务（Service）的 UUID。');
  return value.toLowerCase();
}
export async function inspectService(workspace, id) {
  let catalog;
  try {
    const output = await execute('buildr', ['assets', 'inspect', '--target', workspace.root, '--json'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    catalog = JSON.parse(output.stdout);
  } catch (error) {
    if (error.code === 'ENOENT') throw connectionFailure('xxl_job_buildr_dependency_missing', '服务核对需要已安装的 buildr 命令，请先检查该技能声明的依赖；未操作远端任务。', 409);
    throw connectionFailure('xxl_job_service_registry_unavailable', '无法通过 buildr assets inspect 读取当前工作空间服务登记；未操作远端任务。', 409);
  }
  if (catalog?.schemaVersion !== 'buildr.asset-catalog/v1' || catalog.migrationRequired || !Array.isArray(catalog.services)) throw connectionFailure('xxl_job_service_registry_unavailable', '服务登记输出不受支持或待迁移；未操作远端任务。', 409);
  const matches = catalog.services.filter(item => item?.id === id && item.workspaceId === workspace.id);
  if (matches.length !== 1) throw connectionFailure('xxl_job_service_missing', '该服务编号未在当前工作空间唯一登记；未操作远端任务。', 409);
  return { service: matches[0], revision: catalog.revision };
}
function directory(root, name) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw connectionFailure('xxl_job_private_state_invalid', '本机专业状态目录无效。', 409);
  for (const current of [root, path.join(root, name)]) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw connectionFailure('xxl_job_private_state_invalid', '本机专业状态目录被替换，未写入。', 409);
    fs.mkdirSync(current, { recursive: true, mode: 0o700 }); fs.chmodSync(current, 0o700);
  }
  return path.join(root, name);
}
export function createBindingStore(context, connection, consoleUrl) {
  const identity = [context.workspace.id, connection.id, consoleUrl];
  const location = () => directory(context.privateStateRoot, 'instance-' + digest(identity).slice(7));
  function read() {
    const file = path.join(location(), 'service-bindings.json');
    let bytes;
    try {
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('invalid state');
        bytes = fs.readFileSync(fd); if (bytes.length > 1024 * 1024) throw new Error('large state');
      } finally { fs.closeSync(fd); }
    } catch (error) {
      if (error.code === 'ENOENT') return { revision: 'absent', bindings: [] };
      throw connectionFailure('xxl_job_binding_state_invalid', '本机服务关联无法安全读取，已保留现场。', 409);
    }
    try {
      const value = inputObject(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), ['schemaVersion', 'identity', 'generation', 'bindings']);
      if (value.schemaVersion !== 'xxl-job.service-bindings/v1' || JSON.stringify(value.identity) !== JSON.stringify(identity) || !Number.isSafeInteger(value.generation) || value.generation < 1 || !Array.isArray(value.bindings) || value.bindings.length > 1000) throw new Error('invalid state');
      const bindings = value.bindings.map(raw => { const item = inputObject(raw, ['serviceId', 'executorId', 'appName']); return { serviceId: serviceIdentity(item.serviceId), ...xxlJobScope({ executorId: item.executorId, appName: item.appName }) }; });
      if (new Set(bindings.map(item => item.serviceId)).size !== bindings.length || new Set(bindings.map(item => item.executorId)).size !== bindings.length) throw new Error('duplicate state');
      return { revision: digest(value), generation: value.generation, bindings };
    } catch { throw connectionFailure('xxl_job_binding_state_invalid', '本机服务关联内容无效，已保留现场。', 409); }
  }
  function bind(binding, expectedRevision) {
    const root = location(), lock = path.join(root, 'bindings.lock');
    try { fs.mkdirSync(lock, { mode: 0o700 }); }
    catch { throw connectionFailure('xxl_job_binding_busy', '另一入口正在修改本机服务关联；请重新读取后再试。', 409); }
    let temporary;
    try {
      const observed = read();
      if (observed.revision !== expectedRevision) throw connectionFailure('xxl_job_binding_revision_conflict', '服务关联已变化，请重新定位并核对当前关联。', 409);
      if (observed.bindings.some(item => item.serviceId !== binding.serviceId && item.executorId === binding.executorId)) throw connectionFailure('xxl_job_executor_already_bound', '该执行器已关联另一服务，请核对服务边界。', 409);
      const previous = observed.bindings.find(item => item.serviceId === binding.serviceId);
      if (previous?.executorId === binding.executorId && previous.appName === binding.appName) return { ...observed, unchanged: true };
      const value = { schemaVersion: 'xxl-job.service-bindings/v1', identity, generation: (observed.generation ?? 0) + 1, bindings: [...observed.bindings.filter(item => item.serviceId !== binding.serviceId), binding] };
      temporary = path.join(root, crypto.randomUUID() + '.tmp');
      fs.writeFileSync(temporary, JSON.stringify(value) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, path.join(root, 'service-bindings.json'));
      return { revision: digest(value), bindings: value.bindings, unchanged: false };
    } finally { if (temporary) fs.rmSync(temporary, { force: true }); fs.rmdirSync(lock); }
  }
  return { read, bind };
}
export function consumeAuthorization(context, connectionId, evidence) {
  try {
    const root = directory(context.privateStateRoot, 'operation-authorizations');
    const key = digest([context.workspace.id, connectionId, evidence.source.trim(), evidence.statement.trim()]).slice(7);
    fs.writeFileSync(path.join(root, key + '.json'), JSON.stringify({ schemaVersion: 'xxl-job.authorization-use/v1', usedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw connectionFailure('xxl_job_production_authorization_used', '这份用户授权依据已用于一次生产操作尝试；请先调查结果，再取得新的具体授权。', 403);
    throw connectionFailure('xxl_job_production_authorization_store_failed', '无法安全记录此次生产授权使用，未发起外部操作。', 409);
  }
}
