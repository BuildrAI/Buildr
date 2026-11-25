import { released } from './channel.ts';

export const OPEN_PATH = released ? '/dsh-buildr/open' : '/buildr-development-desktop/open';
export const DESKTOP_HEADER = 'x-buildr-development-desktop';

export type OpenCode =
  | 'desktop-required'
  | 'binding-missing'
  | 'development-unavailable'
  | 'development-not-installed'
  | 'development-installation-invalid'
  | 'development-incompatible'
  | 'development-platform'
  | 'development-timeout'
  | 'development-navigation';

export interface Handoff {
  origin: string;
  endpointId: string;
  url: string;
}

export function handoff(value: unknown): Handoff {
  const input = value as Partial<Handoff> | null;
  if (!input || typeof input.origin !== 'string' || typeof input.endpointId !== 'string' || typeof input.url !== 'string') {
    throw Error('invalid-handoff');
  }
  const origin = new URL(input.origin);
  const url = new URL(input.url);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port
      || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw Error('invalid-handoff');
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.endpointId)) {
    throw Error('invalid-handoff');
  }
  if (url.origin !== origin.origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('invalid-handoff');
  }
  return { origin: origin.origin, endpointId: input.endpointId, url: url.href };
}
