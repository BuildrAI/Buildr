import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export interface HarnessLauncherBinding {
  schemaVersion: 1; productId: 'buildr-harness'; platform?: 'darwin' | 'win32';
  target: string; entry: string; node: string; entrySha256: string; nodeSha256: string;
  dataRoot: string; profile: 'released' | 'development';
}
export const launcherDigest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
export function invalidLauncher(message: string): never {
  throw Object.assign(new Error(message), {code: 'harness_launcher_identity_invalid'});
}
export function launcherFileHash(file: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) invalidLauncher('启动器依赖文件身份不安全。');
  return launcherDigest(fs.readFileSync(file));
}
export function parseLauncherBinding(text: string, target: string): HarnessLauncherBinding {
  const binding = JSON.parse(text) as HarnessLauncherBinding;
  if (binding.schemaVersion !== 1 || binding.productId !== 'buildr-harness' || binding.target !== path.resolve(target)
    || !['darwin', 'win32'].includes(binding.platform ?? 'darwin')
    || !['entry', 'node', 'dataRoot'].every(key => typeof binding[key as keyof HarnessLauncherBinding] === 'string' && path.isAbsolute(binding[key as keyof HarnessLauncherBinding] as string))
    || !['released', 'development'].includes(binding.profile)
    || !/^[a-f0-9]{64}$/u.test(binding.entrySha256) || !/^[a-f0-9]{64}$/u.test(binding.nodeSha256)) invalidLauncher('启动器绑定不可识别，未采用。');
  return binding;
}
