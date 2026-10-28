import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { controlRoot, privateDirectory, readPrivate, writePrivate } from './ownership.ts';

function files(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), info = fs.lstatSync(file);
      if (info.isSymbolicLink()) throw new AgentServiceError('agent_runtime_symlink', '执行运行单元不能包含未物化的链接。', 409);
      if (info.isDirectory()) visit(file);
      else if (info.isFile()) result.push(path.relative(root, file));
      else throw new AgentServiceError('agent_runtime_file_invalid', '执行运行单元包含无效文件。', 409);
    }
  }; visit(root); return result;
}
function digestTree(root: string, names: string[], node: string, entry: string): string {
  const digest = createHash('sha256'); digest.update(JSON.stringify({ entry, node: createHash('sha256').update(fs.readFileSync(node)).digest('hex') }));
  for (const name of names) { const file = path.join(root, name); digest.update(JSON.stringify([name, fs.statSync(file).mode & 0o111])); digest.update(fs.readFileSync(file)); }
  return digest.digest('hex');
}
/** Materialize the already prepared private package; no source or global installation fallback. */
export function prepareAgentRuntime(input: { dataRoot: string; packageRoot?: string; entry?: string; node?: string }): AgentRuntimeUnit {
  const packageRoot = fs.realpathSync(input.packageRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const entry = input.entry ?? 'build/process/entry.js';
  const node = fs.realpathSync(input.node ?? process.execPath);
  if (!entry.startsWith('build/') || entry.includes('..') || !fs.statSync(path.join(packageRoot, entry), { throwIfNoEntry: false })?.isFile()) throw new AgentServiceError('agent_runtime_entry_missing', '执行运行单元尚未构建。', 409);
  const names = files(path.join(packageRoot, 'build')).map(name => path.join('build', name));
  if (fs.existsSync(path.join(packageRoot, 'node_modules'))) names.push(...files(path.join(packageRoot, 'node_modules')).map(name => path.join('node_modules', name)));
  names.push('package.json');
  const digest = digestTree(packageRoot, names.sort(), node, entry);
  const units = path.join(controlRoot(input.dataRoot), 'runtimes'); privateDirectory(units);
  const directory = path.join(units, digest);
  const descriptor: AgentRuntimeUnit = { schemaVersion: 1, digest, directory, entry: path.join(directory, entry), node: path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node') };
  if (fs.existsSync(directory)) { validateAgentRuntime(input.dataRoot, descriptor); return descriptor; }
  const stage = path.join(units, '.stage-' + randomUUID()); privateDirectory(stage);
  try {
    for (const name of names) { const target = path.join(stage, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(packageRoot, name), target); }
    fs.copyFileSync(node, path.join(stage, path.basename(descriptor.node))); fs.chmodSync(path.join(stage, path.basename(descriptor.node)), 0o700);
    writePrivate(path.join(stage, 'runtime.json'), { ...descriptor, files: names });
    try { fs.renameSync(stage, directory); } catch (error) { if (!fs.existsSync(directory)) throw error; }
    validateAgentRuntime(input.dataRoot, descriptor); return descriptor;
  } finally { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true }); }
}
export function validateAgentRuntime(dataRoot: string, runtime: AgentRuntimeUnit): void {
  const expected = path.join(controlRoot(dataRoot), 'runtimes', runtime.digest);
  if (runtime.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(runtime.digest) || runtime.directory !== expected || fs.lstatSync(expected).isSymbolicLink() || runtime.node !== path.join(expected, process.platform === 'win32' ? 'node.exe' : 'node') || !runtime.entry.startsWith(expected + path.sep + 'build' + path.sep) || path.relative(expected, runtime.entry).split(path.sep).includes('..')) throw new AgentServiceError('agent_runtime_identity_invalid', '执行运行单元身份不匹配。', 409);
  const manifest = readPrivate<AgentRuntimeUnit & { files: string[] }>(path.join(expected, 'runtime.json'));
  if (!manifest || !Array.isArray(manifest.files) || manifest.entry !== runtime.entry || manifest.digest !== runtime.digest || manifest.files.some(name => path.isAbsolute(name) || name.split(/[\\/]/).includes('..'))) throw new AgentServiceError('agent_runtime_manifest_invalid', '执行运行单元清单无效。', 409);
  if (digestTree(expected, manifest.files, runtime.node, path.relative(expected, runtime.entry)) !== runtime.digest) throw new AgentServiceError('agent_runtime_changed', '执行运行单元内容已变化。', 409);
  const compatibility = readPrivate<{ contracts: typeof AGENT_EXECUTION_CONTRACTS; storageVersion: number }>(path.join(expected, 'build/runtime-contracts.json'));
  if (!compatibility || Object.entries(AGENT_EXECUTION_CONTRACTS).some(([key,value]) => compatibility.contracts?.[key as keyof typeof AGENT_EXECUTION_CONTRACTS] !== value)) throw new AgentServiceError('agent_runtime_contract_incompatible', '新版执行契约不兼容，旧后台继续保留。', 409);
  const database = path.join(dataRoot, 'agent-service/conversations.sqlite');
  if (fs.existsSync(database)) {
    const db = new DatabaseSync(database, { readOnly: true });
    try { if ((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version > compatibility.storageVersion) throw new AgentServiceError('agent_storage_newer', '当前资料版本较新，未采用不兼容的执行后台。', 409); }
    finally { db.close(); }
  }
}
