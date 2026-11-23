import { released } from './channel.ts';

/** The exact Desktop request and bounded data exchanged between Host and panel. */
export const OPEN_PATH = released ? '/dsh-buildr-harness/open' : '/buildr-harness-desktop/open';
export const DESKTOP_HEADER = 'x-buildr-harness-desktop';
export interface Handoff { origin: string; endpointId: string; url: string; expiresAt: number }
export type OpenCode = 'binding-missing' | 'harness-unavailable' | 'desktop-required' | 'harness-not-installed' | 'harness-installation-invalid' | 'harness-incompatible' | 'harness-platform';

export function handoff(value: unknown, now = Date.now()): Handoff {
  const v = value as Partial<Handoff> | null;
  if (typeof v?.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(v.origin)
      || typeof v.url !== 'string' || typeof v.endpointId !== 'string' || !/^[\w-]{1,128}$/.test(v.endpointId)
      || typeof v.expiresAt !== 'number' || !Number.isFinite(v.expiresAt) || v.expiresAt <= now) throw Error('invalid-handoff');
  const origin = new URL(v.origin);
  const url = new URL(v.url);
  if (origin.origin !== v.origin || url.origin !== v.origin || url.pathname !== '/' || url.search
      || !/^#ticket=[\w-]{20,128}$/.test(url.hash) || url.username || url.password) throw Error('invalid-handoff');
  return { origin: v.origin, endpointId: v.endpointId, url: url.href, expiresAt: v.expiresAt };
}
