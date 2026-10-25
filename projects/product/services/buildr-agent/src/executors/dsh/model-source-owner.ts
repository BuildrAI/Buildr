import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountObservation, LoginObservation } from '../../contracts.ts';
import { privateDirectories, bounded } from '../native-process.ts';
import { DshRuntime } from './index.ts';

export interface DeepSeekAccountOwner {
  inspect(): Promise<AccountObservation>;
  beginLogin(update: (observation: LoginObservation) => void): Promise<void>;
  cancelLogin(): Promise<void>;
  request(url: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}
/** Only an explicitly supplied Buildr private profile can own a model account. */
export function createDeepSeekAccountOwner(options: { configRoot: string; executable?: string; environment: Readonly<Record<string, string>> }): DeepSeekAccountOwner {
  let opening: Promise<DshRuntime> | undefined; let closing = false; let origin: string | undefined;
  const key = randomUUID();
  const addressFile = join(options.configRoot, `model-owner-${randomUUID()}.json`);
  const patchFile = join(options.configRoot, 'buildr-model-owner-patch.json');
  async function runtime() {
    if (closing) throw new Error('dsh_owner_closed');
    opening ??= (async () => {
      await privateDirectories(options.configRoot);
      await writeFile(patchFile, JSON.stringify([{ insert: [{ id: 'buildr-deepseek-model-owner', name: fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './model-source-plugin.ts' : './model-source-plugin.js', import.meta.url)), config: { addressFile } }] }]), { mode: 0o600 });
      const native = await DshRuntime.open({ connectionId: 'deepseek-model-account', ...options, environment: { ...options.environment, BUILDR_DSH_OWNER_KEY: key } }, patchFile);
      try {
        await bounded((async () => {
          const deadline = Date.now() + 9500;
          while (!closing && Date.now() < deadline) {
            const address = await readFile(addressFile, 'utf8').then(value => JSON.parse(value)).catch(() => undefined);
            if (Number.isInteger(address?.port) && address.port > 0 && address.port < 65536) { origin = `http://127.0.0.1:${address.port}`; return; }
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error('dsh_owner_bridge_unavailable');
        })(), 10000, 'dsh_owner_bridge_unavailable');
        return native;
      } catch (error) { await native.close(); throw error; }
    })().catch(error => { opening = undefined; throw error; });
    return await opening;
  }
  return {
    async inspect() { return await (await runtime()).inspectAccount(); },
    async beginLogin(update) { await (await runtime()).beginLogin(update); },
    async cancelLogin() { if (opening) await (await opening).cancelLogin(); },
    async request(value, init = {}) {
      const url = new URL(value), method = (init.method ?? 'GET').toUpperCase();
      if (url.origin !== 'https://api.deepseek.com' || url.search || url.hash || url.username || url.password || !(method === 'GET' && url.pathname === '/models' || method === 'POST' && url.pathname === '/anthropic/v1/messages')) throw new Error('dsh_owner_target_invalid');
      await runtime();
      const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${key}`);
      return await fetch(`${origin}${url.pathname}`, { ...init, method, headers, redirect: 'manual' });
    },
    async close() { closing = true; try { if (opening) await (await opening).close(); } finally { await rm(addressFile, { force: true }); } },
  };
}
