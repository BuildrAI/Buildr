import fs from 'node:fs';
import path from 'node:path';

export function isGitUrl(value: string) {
  return /^(https?:\/\/|ssh:\/\/|git@)/.test(value) || /\.git$/.test(value);
}

export function createGitIdentity(classifyGitUrl: (value: string) => boolean = isGitUrl) {
  function normalizedGitIdentity(value: unknown): string | null {
    if (!value) return null;
    const trimmed = String(value).trim().replace(/\/$/, '').replace(/\.git$/, '');
    if (trimmed.startsWith('file://')) {
      try { return path.resolve(new URL(trimmed).pathname).replace(/\.git$/, ''); } catch {}
    }
    if (!classifyGitUrl(trimmed) && fs.existsSync(trimmed)) return path.resolve(trimmed).replace(/\.git$/, '');
    return trimmed;
  }
  const sameGitIdentity = (left: unknown, right: unknown) => normalizedGitIdentity(left) === normalizedGitIdentity(right);
  return Object.freeze({ normalizedGitIdentity, sameGitIdentity });
}
