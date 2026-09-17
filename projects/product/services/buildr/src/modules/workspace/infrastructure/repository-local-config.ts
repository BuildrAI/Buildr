import fs from 'node:fs';
import { spawnSync } from '../../../infrastructure/process.ts';

/** Read the actual checkout configuration without status scans or remote network access. */
export function readRepositoryLocalConfig(location: string, declaredRemote?: string) {
  const git = (...args: string[]) => spawnSync('git', args, { cwd: location, encoding: 'utf8', timeout: 5000 });
  const remotes: { name: string; url: string }[] = [];
  const unavailable = (diagnostic: string) => ({ available: false, remotes, selectedRemote: null, currentBranch: null, diagnostic });
  try { if (!fs.statSync(location).isDirectory()) return unavailable('代码库目录不是文件夹。'); }
  catch { return unavailable('本地代码库目录不存在或无法访问。'); }
  const root = git('rev-parse', '--show-toplevel');
  if (root.status !== 0) return unavailable('无法读取本地 Git 仓库。');
  try { if (fs.realpathSync(root.stdout.trim()) !== fs.realpathSync(location)) return unavailable('该目录不是独立 Git 仓库根目录。'); }
  catch { return unavailable('无法核对本地 Git 仓库根目录。'); }
  const names = git('remote');
  if (names.status !== 0) return unavailable('读取本地远端配置失败。');
  for (const name of names.stdout.trim().split('\n').filter(Boolean)) {
    const address = git('remote', 'get-url', '--', name);
    if (address.status !== 0 || !address.stdout.trim()) return unavailable(`读取远端 ${name} 的实际地址失败。`);
    remotes.push({ name, url: address.stdout.trim() });
  }
  const branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
  if (branch.status !== 0 && branch.status !== 1) return unavailable('读取当前分支失败。');
  const currentBranch = branch.status === 0 ? branch.stdout.trim() : null;
  const tracking = currentBranch ? git('config', '--get', `branch.${currentBranch}.remote`) : null;
  if (tracking && tracking.status !== 0 && tracking.status !== 1) return unavailable('读取当前分支跟踪配置失败。');
  const trackedRemote = tracking?.status === 0 ? tracking.stdout.trim() : null;
  const selectedRemote = declaredRemote
    ? remotes.find(r => r.name === declaredRemote)?.name || null
    : remotes.find(r => r.name === trackedRemote)?.name || remotes.find(r => r.name === 'origin')?.name || (remotes.length === 1 ? remotes[0].name : null);
  const diagnostic = declaredRemote && !selectedRemote ? `声明的远端 ${declaredRemote} 在本地不存在。`
    : remotes.length > 1 && !selectedRemote ? '本地存在多个远端，请选择要使用的配置。' : null;
  return { available: true, remotes, selectedRemote, currentBranch, diagnostic };
}
