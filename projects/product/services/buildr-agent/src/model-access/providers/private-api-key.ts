import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** A source-owned API key file; never part of public account metadata. */
export class PrivateApiKey {
  private readonly filename: string;
  private readonly root: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(root: string) {
    this.root = root;
    this.filename = join(root, 'model-api-key.json');
  }
  async read(): Promise<string | undefined> {
    try {
      const info = await lstat(this.filename);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('model_api_key_path_invalid');
      const data: unknown = JSON.parse(await readFile(this.filename, 'utf8'));
      if (!data || typeof data !== 'object') throw new Error('model_api_key_invalid');
      const key = (data as Record<string, unknown>).apiKey;
      if (typeof key !== 'string' || !key.trim() || key.length > 4096) throw new Error('model_api_key_invalid');
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async save(apiKey: string): Promise<void> {
    let work!: Promise<void>;
    work = this.queue.then(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const directory = await lstat(this.root);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('model_api_key_storage_unsafe');
      await chmod(this.root, 0o700);
      const temporary = join(this.root, `.api-key-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify({ apiKey }) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.filename);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    });
    this.queue = work.catch(() => {});
    await work;
  }
}
