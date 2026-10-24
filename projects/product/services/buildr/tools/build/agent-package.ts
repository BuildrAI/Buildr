import fs from 'node:fs';
import path from 'node:path';
import { withExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

export const AGENT_PACKAGE_NAME = '@buildr-ai/buildr-agent';
export const AGENT_PACKAGE_PATH = `node_modules/${AGENT_PACKAGE_NAME}`;

/** Copy only the prepared public runtime unit. No neighbouring source fallback. */
export function copyAgentRuntimePackage(from: string, destination: string): string {
  if (fs.existsSync(path.join(from, 'tools/development/prepare-development-agent.ts'))) {
    return withExclusiveFileLock(path.join(from, 'node_modules/.buildr-agent-preparation.lock'), path.join(from, AGENT_PACKAGE_PATH),
      () => copyRuntimePackage(from, destination), { timeoutMs: 30_000 });
  }
  return copyRuntimePackage(from, destination);
}

function copyRuntimePackage(from: string, destination: string): string {
  const source = path.join(path.resolve(from), AGENT_PACKAGE_PATH);
  const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (metadata.name !== AGENT_PACKAGE_NAME || metadata.private !== true || metadata.exports?.['.']?.import !== './build/index.js') throw new Error('agent_runtime_package_invalid');
  if (!fs.statSync(path.join(source, 'build/index.js'), { throwIfNoEntry: false })?.isFile()) throw new Error('agent_runtime_entry_missing');
  if (!fs.statSync(path.join(source, 'node_modules'), { throwIfNoEntry: false })?.isDirectory()) throw new Error('agent_runtime_dependencies_missing');
  const target = path.join(path.resolve(destination), AGENT_PACKAGE_PATH);
  if (fs.existsSync(target)) throw new Error('agent_runtime_destination_exists');
  const visit = (file: string) => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`agent_runtime_symlink: ${path.relative(source, file)}`);
    if (stat.isDirectory()) for (const child of fs.readdirSync(file)) visit(path.join(file, child));
    else if (!stat.isFile()) throw new Error('agent_runtime_file_invalid');
  };
  visit(source);
  fs.cpSync(source, target, { recursive: true });
  return target;
}
