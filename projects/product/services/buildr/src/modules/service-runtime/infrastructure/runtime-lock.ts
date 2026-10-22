import path from 'node:path';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { ServiceRuntimeError } from '../domain/errors.ts';

/** 同一工作空间的实例与端口共享锁；异步等候允许本进程的持锁请求继续完成。 */
export async function withRuntimeLock<T>(root: string, action: () => T | Promise<T>): Promise<T> {
  const file = path.join(root, '.buildr', 'local', 'service-runtime', 'runtime.lock');
  const deadline = Date.now() + 15_000;
  let lock: ReturnType<typeof acquireExclusiveFileLock>;
  while (true) {
    try { lock = acquireExclusiveFileLock(file, root, { timeoutMs: 0 }); break; }
    catch (error) {
      if ((error as { code?: string }).code !== 'buildr_exclusive_file_lock_timeout') throw error;
      if (Date.now() >= deadline) throw new ServiceRuntimeError('service_runtime_busy', '本地运行正在处理另一个操作，请稍后重试。');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return await action(); }
  finally { releaseExclusiveFileLock(lock); }
}
