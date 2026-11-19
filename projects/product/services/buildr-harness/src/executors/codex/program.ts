import type { NativeProgramPolicy } from '../program-policy.ts';

const codexEntry = 'node_modules/@openai/codex/bin/codex.js';

export const codexProgramPolicy: NativeProgramPolicy = {
  id: 'codex',
  major: 0,
  bindingSeries: '0.163',
  compatibility: '0.x.x',
  version: '0.163.0',
  package: '@openai/codex@0.163.0',
  entry: codexEntry,
  names: ['codex', 'codex.exe'],
  url: 'https://developers.openai.com/codex/cli',
  label: 'Codex 独立程序',
  guidance: 'Buildr 会准备独立 Codex 程序，不依赖或修改桌面应用。',
  distribution: {
    kind: 'npm',
    package: '@openai/codex@0.163.0',
    entry: codexEntry,
  },
  versionDisplay: 'program',
};

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;

export const CODEX_CLIENT_VERSION = '0.169.1';

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  pre?: string[];
  normalized: string;
}

function parseCodexClientVersion(value: unknown): ParsedVersion | undefined {
  if (typeof value !== 'string') return undefined;
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return undefined;
  const pre = match[4]?.split('.');
  if (pre?.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major !== codexProgramPolicy.major || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) return undefined;
  return {
    major,
    minor,
    patch,
    ...(pre ? { pre } : {}),
    normalized: `${major}.${minor}.${patch}${pre ? `-${pre.join('.')}` : ''}`,
  };
}

function compareParsedVersions(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index++) {
    const a = left.pre[index];
    const b = right.pre[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const numericA = /^\d+$/.test(a);
    const numericB = /^\d+$/.test(b);
    if (numericA && numericB) return Number(a) - Number(b);
    if (numericA !== numericB) return numericA ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function isValidCodexClientVersion(value: string): boolean {
  return parseCodexClientVersion(value) !== undefined;
}

export function resolveCodexClientVersion(...candidates: Array<string | undefined>): string {
  let best = parseCodexClientVersion(CODEX_CLIENT_VERSION)!;
  for (const candidate of candidates) {
    const parsed = parseCodexClientVersion(candidate);
    if (parsed && compareParsedVersions(parsed, best) > 0) best = parsed;
  }
  return best.normalized;
}
